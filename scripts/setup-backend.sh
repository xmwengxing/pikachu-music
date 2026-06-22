#!/usr/bin/env bash
# setup-backend.sh —— go-music-api 后端一键部署脚本
#
# 功能：
#   1. 装 Go（如未装）
#   2. clone / 编译 github.com/guohuiyuan/go-music-api
#   3. 准备 cookies.json
#   4. 用 pm2 守护进程
#   5. 验证本地可访问
#
# 使用：
#   chmod +x setup-backend.sh
#   sudo ./setup-backend.sh
#
# 文档：../docs/GOMUSIC-API-DEPLOY.md

set -euo pipefail

# ============================================================
# 占位符（请按需修改）
# ============================================================
# INSTALL_DIR   —— go-music-api 安装目录（脚本会自动 clone）
# BIND_ADDR     —— 监听地址（127.0.0.1 = 仅本机；0.0.0.0 = 局域网/外网可访问）
# BIND_PORT     —— 监听端口（默认 18900，避开常见端口）
# USE_FORK      —— true = 从维护者 fork 仓库拉（已改监听 0.0.0.0 + env）；
#                  false = 从官方仓库拉（默认 127.0.0.1:18080）
# ============================================================
INSTALL_DIR="/opt/pikachu-music-api"
BIND_ADDR="0.0.0.0"
BIND_PORT="18900"
USE_FORK="true"
REPO_OFFICIAL="https://github.com/guohuiyuan/go-music-api.git"
# 维护者 fork（如果你有自己的 fork，改这里）
REPO_FORK="https://github.com/guohuiyuan/go-music-api.git"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log() { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err() { echo -e "${RED}[-]${NC} $*" >&2; }

# ============================================================
# 0. 权限检查
# ============================================================
if [[ $EUID -ne 0 ]]; then
  err "请用 sudo 运行本脚本（需要安装系统包、写 /opt、装 pm2）"
  exit 1
fi

# ============================================================
# 1. 装 Go（如未装）
# ============================================================
if ! command -v go >/dev/null 2>&1; then
  warn "未检测到 Go，开始安装"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y golang-go
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y golang
  elif command -v yum >/dev/null 2>&1; then
    yum install -y golang
  else
    err "无法自动装 Go，请先手动安装 Go 1.21+: https://go.dev/dl/"
    exit 1
  fi
fi
log "Go 版本: $(go version)"

# ============================================================
# 2. 装 pm2（如未装）
# ============================================================
if ! command -v pm2 >/dev/null 2>&1; then
  warn "未检测到 pm2，开始安装"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs npm
  fi
  npm install -g pm2
fi
log "pm2 版本: $(pm2 --version)"

# ============================================================
# 3. 选 repo + clone
# ============================================================
if [[ "$USE_FORK" == "true" ]]; then
  REPO="$REPO_FORK"
  log "使用维护者 fork: $REPO"
else
  REPO="$REPO_OFFICIAL"
  log "使用官方仓库: $REPO（默认监听 127.0.0.1:18080，需要自己改源码）"
fi

if [[ -d "$INSTALL_DIR" ]]; then
  warn "$INSTALL_DIR 已存在，跳过 clone（如果你想重新拉，请先 rm -rf）"
else
  log "克隆仓库到 $INSTALL_DIR"
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 编译
log "编译（约 1 分钟）"
go build -o pikachu-music-api .
log "二进制已生成: $INSTALL_DIR/pikachu-music-api ($(du -h pikachu-music-api | cut -f1))"

# ============================================================
# 4. 准备 cookies.json
# ============================================================
if [[ ! -f cookies.json ]]; then
  log "创建空 cookies.json"
  touch cookies.json
fi

# ============================================================
# 5. pm2 守护
# ============================================================
pm2 delete pikachu-music 2>/dev/null || true
PIKACHU_ADDR="$BIND_ADDR:$BIND_PORT" \
  pm2 start "$INSTALL_DIR/pikachu-music-api" --name pikachu-music
pm2 save

read -rp "是否设置 pm2 开机自启？[y/N] " ENABLE_STARTUP
if [[ "$ENABLE_STARTUP" =~ ^[Yy]$ ]]; then
  pm2 startup
  echo
  log "请复制粘贴上面输出的命令（带 sudo）执行"
fi

# ============================================================
# 6. 验证
# ============================================================
echo
log "等 3 秒让服务起来..."
sleep 3

if curl -sf -m 5 "http://127.0.0.1:$BIND_PORT/api/v1/system/cookies" >/dev/null; then
  log "✅ 本地后端跑通："
  log "   curl http://127.0.0.1:$BIND_PORT/api/v1/system/cookies"
  log "   （从局域网访问：http://$(hostname -I | awk '{print $1}'):$BIND_PORT/api/v1/system/cookies）"
else
  warn "本地验证失败，看日志："
  warn "  pm2 logs pikachu-music --lines 50"
fi

echo
log "下一步："
log "  - 想暴露到公网？运行 ../scripts/setup-tunnel.sh 配 Cloudflare Tunnel"
log "  - 想直接用 Render？访问 https://github.com/guohuiyuan/go-music-api 看 README"
log ""
log "管理命令："
log "  pm2 logs pikachu-music        # 实时日志"
log "  pm2 restart pikachu-music    # 重启"
log "  pm2 stop pikachu-music       # 停止"
log "  pm2 delete pikachu-music     # 彻底删除"
