#!/usr/bin/env bash
# setup-tunnel.sh —— Cloudflare Tunnel 一键搭建脚本
#
# 功能：
#   1. 装 cloudflared
#   2. 引导你登录 Cloudflare（输出一次性 URL，浏览器完成认证）
#   3. 创建一个 Named Tunnel
#   4. 写 ~/.cloudflared/config.yml（你填 hostname 和本地端口）
#   5. 用 pm2 守护启动
#
# 使用：
#   chmod +x setup-tunnel.sh
#   sudo ./setup-tunnel.sh
#
# 文档：../docs/TUNNEL-SETUP.md

set -euo pipefail

# ============================================================
# 占位符（请按需修改）
# ============================================================
# TUNNEL_NAME        —— tunnel 名字（可改，但全局唯一）
# TUNNEL_HOSTNAME    —— 你要绑定的完整域名（结尾不加 /）
# BACKEND_PORT       —— go-music-api 监听的本地端口
# ============================================================
TUNNEL_NAME="pikachu-music"
TUNNEL_HOSTNAME="<<YOUR-DOMAIN-FOR-TUNNEL>>"   # 例如 api.your-domain.com
BACKEND_PORT="<<YOUR-BACKEND-PORT>>"           # 例如 18900

CF_BIN="/usr/local/bin/cloudflared"
CF_DIR="$HOME/.cloudflared"

# ============================================================
# 颜色
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err() { echo -e "${RED}[-]${NC} $*" >&2; }

# ============================================================
# 1. 检测占位符
# ============================================================
if [[ "$TUNNEL_HOSTNAME" == *"<<"* || "$BACKEND_PORT" == *"<<"* ]]; then
  err "请先编辑本脚本顶部，把 <<YOUR-DOMAIN-FOR-TUNNEL>> 和 <<YOUR-BACKEND-PORT>> 替换成实际值"
  err "例如："
  err "  TUNNEL_HOSTNAME=\"api.pikachu.com\""
  err "  BACKEND_PORT=\"18900\""
  exit 1
fi

# ============================================================
# 2. 检测 / 安装 cloudflared
# ============================================================
if [[ ! -x "$CF_BIN" ]]; then
  warn "未找到 $CF_BIN，开始下载 cloudflared 最新版"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  CF_ARCH="amd64" ;;
    aarch64) CF_ARCH="arm64" ;;
    armv7l)  CF_ARCH="arm" ;;
    *)
      err "未知架构 $ARCH，请到 https://github.com/cloudflare/cloudflared/releases 手动下载"
      exit 1
      ;;
  esac

  URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
  log "下载 $URL"
  curl -L -o "$CF_BIN" "$URL"
  chmod +x "$CF_BIN"
fi
log "cloudflared 版本: $($CF_BIN --version 2>&1 | head -1)"

# ============================================================
# 3. 登录 Cloudflare
# ============================================================
if [[ ! -f "$CF_DIR/cert.pem" ]]; then
  warn "未检测到 cert.pem，开始 cloudflared tunnel login"
  warn "终端会打印一个 URL，请在浏览器打开并登录 Cloudflare 授权"
  warn "选择你的域名后，证书会自动保存到 $CF_DIR/cert.pem"
  "$CF_BIN" tunnel login
fi
log "cert.pem 已就绪: $CF_DIR/cert.pem"

# ============================================================
# 4. 创建 Named Tunnel
# ============================================================
CRED_FILE=$(ls "$CF_DIR"/*.json 2>/dev/null | head -1)
if [[ -z "$CRED_FILE" ]]; then
  log "创建 Named Tunnel: $TUNNEL_NAME"
  "$CF_BIN" tunnel create "$TUNNEL_NAME"
  CRED_FILE=$(ls "$CF_DIR"/*.json | head -1)
fi
TUNNEL_ID=$(basename "$CRED_FILE" .json)
log "Tunnel ID: $TUNNEL_ID"

# ============================================================
# 5. 写 config.yml
# ============================================================
cat > "$CF_DIR/config.yml" <<EOF
# Cloudflare Tunnel 本地配置（脚本生成于 $(date -Iseconds)）
tunnel: $TUNNEL_ID
credentials-file: $CRED_FILE

# 用 HTTP/2 协议（国内 NAT 友好；QUIC 在部分网络下被阻）
protocol: http2

ingress:
  # 你的域名 → 本地后端
  - hostname: $TUNNEL_HOSTNAME
    service: http://127.0.0.1:$BACKEND_PORT
  # 兜底
  - service: http_status:404
EOF
log "config.yml 已写入: $CF_DIR/config.yml"

# ============================================================
# 6. 提示用户加 DNS 记录
# ============================================================
cat <<EOF

${YELLOW}================================================================${NC}
${GREEN}下一步：${NC}登录 Cloudflare 控制台 → DNS → Records → 添加：

  Type:   CNAME
  Name:   $TUNNEL_HOSTNAME 的子域部分（不含主域）
  Target: $TUNNEL_ID.cfargotunnel.com
  Proxy:  Proxied（橙色云朵）

例如 TUNNEL_HOSTNAME=api.pikachu.com，则 Name=api，Target 同上。

${YELLOW}================================================================${NC}

EOF

read -rp "DNS 记录添加好后按 Enter 继续..."

# ============================================================
# 7. pm2 守护
# ============================================================
if ! command -v pm2 >/dev/null 2>&1; then
  warn "未安装 pm2，开始安装"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm
  fi
  sudo npm install -g pm2
fi

pm2 delete "$TUNNEL_NAME" 2>/dev/null || true
pm2 start "$CF_BIN" --name "$TUNNEL_NAME" -- tunnel --config "$CF_DIR/config.yml" run
pm2 save

# 询问是否设置开机自启
read -rp "是否设置 pm2 开机自启？[y/N] " ENABLE_STARTUP
if [[ "$ENABLE_STARTUP" =~ ^[Yy]$ ]]; then
  pm2 startup
  echo
  log "请复制粘贴上面输出的 sudo 命令执行"
fi

# ============================================================
# 8. 验证
# ============================================================
echo
log "等 5 秒让 tunnel 连接..."
sleep 5

if curl -sf -m 10 "https://$TUNNEL_HOSTNAME/api/v1/system/cookies" >/dev/null; then
  log "✅ 端到端验证成功！"
  log "   curl https://$TUNNEL_HOSTNAME/api/v1/system/cookies"
else
  warn "端到端验证失败，可能原因："
  warn "  1. Cloudflare DNS 记录还没生效（等几分钟）"
  warn "  2. 本地后端 (端口 $BACKEND_PORT) 没跑：curl http://127.0.0.1:$BACKEND_PORT/api/v1/system/cookies"
  warn "  3. 防火墙：sudo ufw allow $BACKEND_PORT/tcp"
  warn "查看 tunnel 日志: pm2 logs $TUNNEL_NAME --lines 50"
fi

log "管理命令："
log "  pm2 logs $TUNNEL_NAME       # 实时日志"
log "  pm2 restart $TUNNEL_NAME   # 重启"
log "  pm2 stop $TUNNEL_NAME      # 停止"
