# Cloudflare Tunnel 搭建教程

> 把你在自家 / VPS 上跑的后端，通过 Cloudflare Tunnel 暴露成 `https://你的域名`。
> 手机上的 Pikachu Music APK 就能用自定义域名搜歌，**完全无冷启动、零成本、无需公网 IP**。

---

## 目录

1. [前置条件](#1-前置条件)
2. [架构说明](#2-架构说明)
3. [部署 go-music-api 后端](#3-部署-go-music-api-后端)
4. [安装并登录 cloudflared](#4-安装并登录-cloudflared)
5. [创建 Named Tunnel](#5-创建-named-tunnel)
6. [配置 config.yml](#6-配置-configyml)
7. [Cloudflare DNS + Public Hostname](#7-cloudflare-dns--public-hostname)
8. [用 pm2 守护 tunnel](#8-用-pm2-守护-tunnel)
9. [国内网络环境：绕过透明代理](#9-国内网络环境绕过透明代理-v2rayaxray)
10. [验证端到端](#10-验证端到端)
11. [在 Pikachu Music APK 中添加后端](#11-在-pikachu-music-apk-中添加后端)
12. [常见问题](#12-常见问题)
13. [一键脚本](#13-一键脚本)

---

## 1. 前置条件

- 一台 Linux 服务器（Debian/Ubuntu 推荐），**有公网 IPv4 或仅 NAT 1:1 都行**
  - 不需要 80/443 端口开放
  - 不需要固定 IP（Cloudflare Tunnel 是出站长连接）
- 一个**已托管在 Cloudflare 上的域名**（免费版即可）
- Cloudflare 账号（免费版即可）
- `go` ≥ 1.21（编译后端）
- `pm2`（Node.js ≥ 18，自带 npm）

> 💡 阿里云/腾讯云/AWS/Hetzner/家宽 NAT 后的家用服务器 都行 —— Cloudflare Tunnel 是出站连接，不依赖入站端口。

---

## 2. 架构说明

```
┌─────────────────┐    公网 HTTPS     ┌─────────────────────┐
│  📱 手机 APK    │ ────────────────→ │  Cloudflare edge    │
│  (你的域名)     │                   │  (全球 300+ 节点)   │
└─────────────────┘                   └──────────┬──────────┘
                                                 │ Tunnel (出站)
                                                 ▼
                                  ┌──────────────────────────┐
                                  │  你的服务器 (G2 / VPS)   │
                                  │  ┌────────────────────┐ │
                                  │  │ cloudflared        │ │
                                  │  │ tunnel run          │ │
                                  │  └────────┬───────────┘ │
                                  │           │ localhost   │
                                  │           ▼             │
                                  │  ┌────────────────────┐ │
                                  │  │ go-music-api       │ │
                                  │  │ 0.0.0.0:18900       │ │
                                  │  └────────────────────┘ │
                                  └──────────────────────────┘
```

- **cloudflared** 主动出站连到 Cloudflare edge（QUIC 或 HTTP/2，TCP 7844 端口）
- Cloudflare 把 `https://api.你的域名.com` 的请求转发到你的 cloudflared
- cloudflared 通过 `config.yml` 里 `ingress` 规则，把请求转发到本地 `http://127.0.0.1:18900`
- 整个链路 Cloudflare 自动 HTTPS（你不用管证书）

---

## 3. 部署 go-music-api 后端

详见 [GOMUSIC-API-DEPLOY.md](./GOMUSIC-API-DEPLOY.md)。**先完成这步**确认本地 `curl http://127.0.0.1:18900/api/v1/system/cookies` 返回 200 再继续。

---

## 4. 安装并登录 cloudflared

```bash
# 下载 cloudflared（最新版 ~30MB 单文件）
curl -L -o /usr/local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/local/bin/cloudflared

# 验证
cloudflared --version
# 应输出类似：cloudflared version 2026.x.x (built ...)

# 登录（浏览器跳转 Cloudflare 授权）
cloudflared tunnel login
```

执行 `tunnel login` 后：
1. 终端会打印一个 URL（形如 `https://...trycloudflare.com/...`）
2. 浏览器打开该 URL，**登录你的 Cloudflare 账号**，**选择你要绑定的域名**
3. 授权成功后，证书保存到 `~/.cloudflared/cert.pem`

> ⚠️ **ARM 服务器**（树莓派 / Oracle ARM / AWS Graviton）把上面 URL 的 `cloudflared-linux-amd64` 改成 `cloudflared-linux-arm64` 或 `cloudflared-linux-arm`。

---

## 5. 创建 Named Tunnel

```bash
# 创建命名 tunnel（一次性，会打印 UUID）
cloudflared tunnel create pikachu-music

# 输出示例：
# Tunnel credentials written to /home/youruser/.cloudflared/<UUID>.json
# Created tunnel pikachu-music with id a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**记下 UUID**（例如 `a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx`），下一步要用。

生成的文件：
- `~/.cloudflared/cert.pem` —— 你的 Cloudflare 账号凭据
- `~/.cloudflared/<UUID>.json` —— tunnel 私钥

---

## 6. 配置 config.yml

创建 `~/.cloudflared/config.yml`：

```yaml
# 你的 tunnel UUID（替换成上一步输出的）
tunnel: <YOUR_TUNNEL_UUID>
credentials-file: /home/<YOUR_USER>/.cloudflared/<YOUR_TUNNEL_UUID>.json

# 协议：HTTP/2（兼容国内 NAT；QUIC 在部分网络下被阻）
protocol: http2

# 路由规则：什么域名转发到什么本地服务
ingress:
  # 把 api.你的域名.com 的请求转发到本地 18900 端口（go-music-api）
  - hostname: api.your-domain.com
    service: http://127.0.0.1:18900
  # 兜底规则（必须保留，否则 cloudflared 拒绝启动）
  - service: http_status:404
```

**注意**：把 `<YOUR_TUNNEL_UUID>`、`<YOUR_USER>`、`api.your-domain.com` 替换成你的实际值。

---

## 7. Cloudflare DNS + Public Hostname

在 Cloudflare 控制台：

1. 进入你的域名 → **DNS** → **Records** → **Add record**

   | Type | Name | Target | Proxy status |
   |---|---|---|---|
   | CNAME | `api` | `<YOUR_TUNNEL_UUID>.cfargotunnel.com` | **Proxied**（橙色云朵） |

   保存后 DNS 几秒内生效。

2. （可选但推荐）Zero Trust → **Networks** → **Tunnels** → 看到 `pikachu-music` → 点 **Configure** → **Public Hostname**：
   - **不要**勾"迁移入站规则到控制面板"（保持本地管理）
   - 这里能看到 Public Hostname 列表，跟 DNS CNAME 对应

---

## 8. 用 pm2 守护 tunnel

```bash
# 安装 pm2（如果没有）
npm install -g pm2

# 启动 tunnel
pm2 start /usr/local/bin/cloudflared \
  --name pikachu-tunnel \
  -- tunnel --config /home/<YOUR_USER>/.cloudflared/config.yml run

# 看日志
pm2 logs pikachu-tunnel --lines 30

# 应该看到类似：
#   INF Registered tunnel connection ... location=lax07 protocol=http2
#   INF Registered tunnel connection ... location=sjc10 protocol=http2

# 开机自启
pm2 save
pm2 startup  # 会输出一个 sudo 命令，复制粘贴执行
```

---

## 9. 国内网络环境：绕过透明代理 (v2raya/xray)

**如果你在国内且机器上跑了 v2raya / xray / clash 等透明代理**，需要把 Cloudflare 的 IP 段加到 bypass 列表，否则 cloudflared 的 TLS 握手会被 MITM（v2raya 用 2020 年的旧伪造证书，cloudflared 内置 CA 不认）。

### v2raya (nftables TPROXY) 加 bypass

```bash
# IPv4 段（Cloudflare 公开 IP）
sudo nft add element inet v2raya whitelist { \
  173.245.48.0/20, \
  103.21.244.0/22, \
  103.22.200.0/22, \
  103.31.4.0/22, \
  141.101.64.0/18, \
  108.162.192.0/18, \
  190.93.240.0/20, \
  188.114.96.0/20, \
  197.234.240.0/22, \
  198.41.128.0/17, \
  162.158.0.0/15, \
  104.16.0.0/13, \
  104.24.0.0/14, \
  172.64.0.0/13, \
  131.0.72.0/22 \
}

# IPv6 段
sudo nft add element inet v2raya whitelist6 { \
  2400:cb00::/32, \
  2606:4700::/32, \
  2803:f800::/32, \
  2405:b500::/32, \
  2405:8100::/32, \
  2a06:98c0::/29, \
  2c0f:f248::/32 \
}

# 验证
sudo nft list set inet v2raya whitelist | grep -E "173\.|198\.|2606" | head -5
```

> 💡 **重启 v2raya 后这些规则会丢**（v2raya 会覆盖 nft）。要持久化，可以在 v2raya UI → 系统设置 → 关闭 "nftables 模式"，或写个 systemd 脚本在 `v2raya.service` 之后追加这些规则。

### clash / mihomo 加 bypass

`config.yaml`：
```yaml
rules:
  - DOMAIN-SUFFIX,argotunnel.com,DIRECT
  - DOMAIN-SUFFIX,cloudflare.com,DIRECT
  - DOMAIN-KEYWORD,cloudflare,DIRECT
  - IP-CIDR,173.245.48.0/20,DIRECT
  - IP-CIDR,198.41.128.0/17,DIRECT
  # ... 其他 Cloudflare IP 段同理
  - MATCH,你的代理节点
```

---

## 10. 验证端到端

```bash
# 应该返回 {}（cookies.json 初始空文件）或 {"code":200,"data":{...}}
curl -m 10 -w "\nHTTP %{http_code} · %{time_total}s\n" \
  https://api.your-domain.com/api/v1/system/cookies

# 测试搜索（应返回网易云/酷狗等歌曲列表）
curl -m 10 -w "\nHTTP %{http_code}\n" \
  "https://api.your-domain.com/api/v1/music/search?q=test&type=song&n=2"
```

首次可能 1~3 秒（Cloudflare 边缘节点首次建立隧道），后续 < 500ms。

---

## 11. 在 Pikachu Music APK 中添加后端

打开 APK → 顶部 ⚙ 按钮 → 在"后端地址"区域：

1. 点 **"+ 添加后端"**
2. 名称：`我的 Cloudflare`（任意）
3. URL：`https://api.your-domain.com/api/v1`（**末尾必须带 `/api/v1`**）
4. 点 **"测试"** → 弹框显示 `✓ 连接成功 · xxx ms · N cookies`
5. 保存后会自动激活该后端

之后搜索直接走你的隧道，**无冷启动、秒开**。

---

## 12. 常见问题

### Q1: `cloudflared` 报 "Provided Tunnel token is not valid"
**A**: 用 `--config config.yml` 模式而非 `--token <token>` 模式（参考第 6 步）。Named Tunnel 优先用 UUID + credentials-file。

### Q2: `cloudflared` 启动后报 "TLS handshake cert expired 2020-10-17"
**A**: v2raya/xray 透明代理 MITM 了 Cloudflare edge 的证书。按第 9 步把 Cloudflare IP 段加 bypass。

### Q3: 报 "TCP Connectivity HTTP/2 connection is blocked or unreachable"
**A**: 国内 ISP 屏蔽了 cloudflared 用的 TCP 7844（HTTP/2）。需要绕过：
- 选项 A：配置 v2raya bypass 让 Cloudflare IP 段直连（不走代理）
- 选项 B：换 frp 自建 VPS 中转（不依赖 Cloudflare）
- 选项 C：用 `tailscale` / `zerotier` 自建组网

### Q4: pm2 启动 cloudflared 后进程立刻 errored 重启 30+ 次
**A**: `config.yml` 路径错，或 `--config` 位置错。正确命令：
```bash
pm2 start /usr/local/bin/cloudflared --name pikachu-tunnel -- \
  tunnel --config /home/youruser/.cloudflared/config.yml run
```
**注意 `--config` 必须在 `run` 子命令前面**（是 `tunnel` 命令的 option，不是 `run` 的 option）。

### Q5: tunnel 已连接但 curl 返回 404
**A**: config.yml 里 `hostname` 字段跟你 Cloudflare DNS CNAME 指向的域名**不一致**。两者必须完全相同（含 subdomain）。

### Q6: tunnel 跑一段时间断连
**A**: 默认会自动重连。如果是 pm2 守护，看 `pm2 logs pikachu-tunnel`。如果是 `protocol: http2` 长时间断连，临时换 `protocol: quic`（部分网络环境 QUIC 更稳定）。

### Q7: Render 免费档冷启动 15s 等待
**A**: 按本文部署自有后端后，APK 设置里切换到你的后端 URL。首次启动后端会被 Cloudflare 节点"暖机"，搜索秒开。

---

## 13. 一键脚本

- [`scripts/setup-tunnel.sh`](../scripts/setup-tunnel.sh) —— 交互式创建 tunnel + 写 config.yml + pm2 启动
- [`scripts/setup-backend.sh`](../scripts/setup-backend.sh) —— 交互式编译 + 启动 go-music-api

两个脚本都用 `<<PLACEHOLDER>>` 占位符提醒你需要填什么。下载后 `chmod +x` 然后 `sudo ./xxx.sh` 即可。
