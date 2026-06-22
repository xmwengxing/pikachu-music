# go-music-api 部署指南

> 把后端 API 部署到你自己的服务器，**摆脱 Render 冷启动**、**支持自定义扫码登录 cookie**。
> 完整代码来自 GitHub: <https://github.com/guohuiyuan/go-music-api>
>
> 本指南聚焦于"Pikachu Music 安卓客户端后端"的最简自托管部署。

---

## 目录

1. [什么是 go-music-api](#1-什么是-go-music-api)
2. [前置条件](#2-前置条件)
3. [方式 A：编译运行（推荐）](#3-方式-a编译运行推荐)
4. [方式 B：Render 一键部署](#4-方式-brender-一键部署)
5. [方式 C：Docker](#5-方式-cdocker)
6. [pm2 守护进程 + 开机自启](#6-pm2-守护进程--开机自启)
7. [配置文件位置](#7-配置文件位置)
8. [二维码扫码登录](#8-二维码扫码登录)
9. [API 接口一览](#9-api-接口一览)
10. [常见问题](#10-常见问题)

---

## 1. 什么是 go-music-api

`go-music-api` 是 Go 写的多平台音乐 API 聚合服务，封装了 12 个音乐源（网易云/QQ/酷狗/酷我/咪咕/汽水/B站/千千/5sing/Jamendo/JOOX）的搜索和播放链接解析。

它**不是**流媒体代理 —— 它只是：
- 接受搜索关键词 → 返回歌曲元数据（标题/歌手/封面/专辑）
- 接受 song ID → 返回**可直接播放的 mp3/m4a 链接**（来自音乐平台 CDN）

**支持的源**（按 README）：

| 源 | ID | 搜索 | 扫码 |
|---|---|---|---|
| 网易云音乐 | `netease` | ✅ | ✅ |
| QQ 音乐 | `qq` | ✅ | ✅ |
| QQ 微信扫码 | `qq_wx` | ❌ | ✅ |
| 酷狗音乐 | `kugou` | ✅ | ✅ |
| 酷我音乐 | `kuwo` | ✅ | ❌ |
| 咪咕音乐 | `migu` | ✅ | ❌ |
| 千千音乐 | `qianqian` | ✅ | ❌ |
| 汽水音乐 | `soda` | ✅ | ❌ |
| 5sing | `fivesing` | ✅ | ❌ |
| Jamendo (CC) | `jamendo` | ✅ | ❌ |
| JOOX | `joox` | ✅ | ❌ |
| Bilibili | `bilibili` | ✅ | ✅ |

---

## 2. 前置条件

| 组件 | 最低版本 | 备注 |
|---|---|---|
| Linux | Ubuntu 20.04+ / Debian 11+ | macOS/Windows 也可，命令略不同 |
| Go | 1.21+ | 仅"方式 A"需要 |
| 磁盘 | 200MB | 二进制 ~30MB + 依赖 |
| 内存 | 256MB | 运行约占用 30MB |
| 端口 | 任意一个**非 80/443/22/3306 等常用端口** | 默认 18900，避免冲突 |

不需要数据库（cookies 存本地文件）。

---

## 3. 方式 A：编译运行（推荐）

```bash
# 1. 安装 Go（如果还没装）
# Ubuntu/Debian:
sudo apt update && sudo apt install -y golang-go
# 或从官方下载最新版: https://go.dev/dl/

# 2. 克隆代码
git clone https://github.com/guohuiyuan/go-music-api.git
cd go-music-api

# 3. 编译（约 1 分钟，产出 ~30MB 二进制）
go build -o pikachu-music-api .

# 4. 准备空 cookies.json（go-music-api 启动时需要它存在）
touch cookies.json

# 5. 启动（前台）
./pikachu-music-api
# 输出: Cookies 已加载 / Music API Server is running on http://127.0.0.1:18900

# 6. 验证
curl http://127.0.0.1:18900/api/v1/system/cookies
# 应返回: {}
```

### 3.1 改成监听 0.0.0.0（让 cloudflared 或局域网能访问）

默认 `main.go` 绑 `127.0.0.1:18080`，你需要：

**方法 1**：改源码
```go
// main.go 第 22 行附近
- if err := r.Run("127.0.0.1:18080"); err != nil {
+ if err := r.Run("0.0.0.0:18900"); err != nil {
```

**方法 2**：用环境变量（已支持 `PIKACHU_ADDR`）
```bash
PIKACHU_ADDR=0.0.0.0:18900 ./pikachu-music-api
```

> 💡 Pikachu Music 维护者已经 fork 一份改过的版本（监听 `0.0.0.0:18900`，支持 `PIKACHU_ADDR` 环境变量），见仓库 [README](../README.md)。

### 3.2 选择端口建议

避免冲突的端口段：
- `18900`（推荐，pikachu-music 默认）
- `18080`（go-music-api 默认，但很多教程都用了，容易冲突）
- `28800`、`29000`、`38080` 等冷门端口
- **避免**：80/443/22/3000/5000/8000/8080/3306/5432/6379/27017（系统/常见服务占用）

---

## 4. 方式 B：Render 一键部署

> 不推荐 —— Render 免费版 15 分钟无流量冷启动，体验差。仅做参考。

1. Fork `https://github.com/guohuiyuan/go-music-api` 到你的 GitHub
2. Render 控制台 → **New +** → **Web Service** → 选你的 fork
3. 配置：
   - **Runtime**: Docker（自动检测 `Dockerfile`，如果没有则选 `Go`）
   - **Build Command**: `go build -o pikachu-music-api .`
   - **Start Command**: `./pikachu-music-api`
4. 部署完成 → Render 给你 `*.onrender.com` 域名
5. 把这个 URL 填到 Pikachu Music 设置 → 后端地址 → 添加（结尾加 `/api/v1`）

⚠️ 冷启动：15 分钟没人用 → 下次访问要等 15~30 秒启动进程。

---

## 5. 方式 C：Docker

如果有 `Dockerfile`（在 GitHub 仓库根目录）：

```bash
docker build -t pikachu-music-api .
docker run -d --name pikachu-music -p 18900:18900 \
  -v $(pwd)/cookies.json:/app/cookies.json \
  pikachu-music-api
```

或者用 `docker-compose.yml`：

```yaml
version: '3.8'
services:
  pikachu-music:
    build: .
    ports:
      - "18900:18900"
    volumes:
      - ./cookies.json:/app/cookies.json
    restart: unless-stopped
```

⚠️ Docker 容器内 cookies.json 容器重启会丢（除非 mount）。生产建议 mount 到主机目录。

---

## 6. pm2 守护进程 + 开机自启

pm2 是 Node.js 生态的进程管理器，专门解决"程序退出自动拉起"。

```bash
# 1. 安装 Node.js 和 pm2（如果还没装）
# Ubuntu/Debian:
sudo apt install -y nodejs npm
sudo npm install -g pm2

# 2. 用 pm2 启动 go-music-api
pm2 start /path/to/pikachu-music-api \
  --name pikachu-music

# 3. 看状态
pm2 list
pm2 logs pikachu-music --lines 30

# 4. 开机自启（pm2 会输出一行 sudo 命令，复制粘贴执行）
pm2 save
pm2 startup
# 例: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u youruser --hp /home/youruser

# 5. 常用命令
pm2 restart pikachu-music   # 重启
pm2 stop pikachu-music      # 停止
pm2 delete pikachu-music    # 删除
pm2 monit                   # 实时监控
```

### pm2 用环境变量指定监听地址

```bash
PIKACHU_ADDR=0.0.0.0:18900 pm2 start ./pikachu-music-api --name pikachu-music
# 或者用 ecosystem 配置文件：
```

`ecosystem.config.js`：
```js
module.exports = {
  apps: [{
    name: 'pikachu-music',
    script: '/path/to/pikachu-music-api',
    env: { PIKACHU_ADDR: '0.0.0.0:18900' },
  }]
};
```
```bash
pm2 start ecosystem.config.js
```

---

## 7. 配置文件位置

go-music-api 主要有两个本地文件：

| 文件 | 作用 | 路径（默认） |
|---|---|---|
| `cookies.json` | 存储各平台登录后的 cookie | 工作目录 `/path/to/go-music-api/cookies.json` |

⚠️ **没数据库，没其他配置**。所有逻辑靠环境变量 + 启动参数。

**备份 cookies.json**：建议你定期 cp 一份到 `/backup/`，因为：
- pm2 删除进程、rm 二进制都可能误删
- 磁盘损坏
- 想迁移到另一台服务器

---

## 8. 二维码扫码登录

Pikachu Music APK v18+ 内置了扫码 UI（设置 → 账号登录）。

### 8.1 后端 API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/system/qr_login/sources` | 列出可扫码的平台 |
| `POST` | `/api/v1/system/qr_login/:source` | 创建扫码会话，返回 QR code URL + image |
| `GET` | `/api/v1/system/qr_login/:source?key=xxx` | 轮询状态，成功时自动写入 `cookies.json` |
| `GET` | `/api/v1/system/cookies` | 查看当前后端持有的 cookie map |
| `POST` | `/api/v1/system/cookies?source=xxx` | 手动覆盖某平台 cookie（高级用户） |

### 8.2 手动调用（不用 APK UI）

```bash
# 1. 列平台
curl http://127.0.0.1:18900/api/v1/system/qr_login/sources
# 返回: {"data":[{"name":"网易云音乐","source":"netease"}, ...]}

# 2. 创建扫码会话（netease 为例）
curl -X POST http://127.0.0.1:18900/api/v1/system/qr_login/netease
# 返回: {"data":{"key":"abc123","url":"https://music.163.com/...", "image_url":"https://..."}}

# 3. 打开 image_url 用对应 App 扫码
# 4. 轮询状态
curl "http://127.0.0.1:18900/api/v1/system/qr_login/netease?key=abc123"
# 返回: {"data":{"status":"waiting"}}
# 扫码成功后: {"data":{"status":"success","extra":{"cookie_saved":"true",...}}}
```

### 8.3 cookie 持久化

- 写入：`cookies.json`（工作目录）
- ⚠️ **Render 免费版磁盘不持久**（实例重启 = cookie 丢）
- 自托管则永久保存，**除非你手动 `rm cookies.json` 或 pm2 误删工作目录**

---

## 9. API 接口一览

完整文档：<https://github.com/guohuiyuan/go-music-api/blob/main/README.md>

常用端点：

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/v1/music/search?q=&type=song&n=10&sources=&page=1` | GET | 搜索歌曲/歌单/专辑 |
| `/api/v1/music/url?id=&source=` | GET | 获取歌曲直链 |
| `/api/v1/music/lyric?id=&source=` | GET | 获取 LRC 歌词 |
| `/api/v1/system/cookies` | GET/POST | 查看/写入 cookie |
| `/api/v1/system/qr_login/*` | GET/POST | 扫码登录 |

---

## 10. 常见问题

### Q1: `cookies.json: no such file or directory`
**A**: 工作目录下没这个文件。`touch cookies.json` 创建空文件即可。

### Q2: `bind: address already in use`
**A**: 端口被占用。换端口（`PIKACHU_ADDR=0.0.0.0:28800 ./pikachu-music-api`），或 `lsof -i :18900` 找占用进程。

### Q3: 搜不到某些歌
**A**: 部分平台需要登录（VIP 曲目）。用 APK 设置 → 账号登录 → 扫码登录网易云/QQ。

### Q4: B 站/汽水音乐链接播放失败
**A**: 这两个平台音频来自视频流，需要特定解密逻辑。如果后端报错，更新到最新代码（`git pull && go build`）。

### Q5: 想限制只能我家人用
**A**: 反代加 Basic Auth（caddy/nginx），或 go-music-api 上游加 IP 白名单。**注意**：本项目没内置鉴权。

### Q6: 想要更详细的日志
**A**: 改 `service/factory.go` 加日志，或在反代（caddy）层看 access log。

---

## 相关链接

- go-music-api GitHub: <https://github.com/guohuiyuan/go-music-api>
- Pikachu Music APK: [本仓库 release 页面](../)
- Cloudflare Tunnel 教程：[TUNNEL-SETUP.md](./TUNNEL-SETUP.md)
