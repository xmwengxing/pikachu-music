# 皮卡丘音乐 · Pikachu Music

> Android 端的音乐聚合搜索播放器。**12 个音乐源**一键搜索，支持扫码登录、本地缓存、后端地址灵活切换。
>
> 📥 **下载 APK**：本仓库 [Releases](../../releases) 页面

---

## ✨ 功能特性

- **多源聚合**：网易云 / QQ / 酷狗 / 酷我 / 咪咕 / 千千 / 汽水 / 5sing / Jamendo / JOOX / B 站
- **扫码登录**：网易云、QQ、QQ 微信扫码、酷狗、B 站共 **5 个源**支持扫码
- **多后端管理**：设置里可添加/测试/删除多个后端 URL，一键切换激活
- **零冷启动**：按文档部署自有后端 + Cloudflare Tunnel 后，无 15s 等待
- **歌词高亮**：FlatList + scrollToIndex 居中，跨设备字号一致
- **歌手筛选**：搜索结果按歌手 chip 过滤
- **下载分享**：把歌曲保存到设备本地相册/文件
- **快捷键 + 中英双语**

---

## 📱 快速开始

### 用户（只装 APK）

1. 去 [Releases](../../releases) 下载最新 APK
2. 安装到 Android 手机（arm64-v8a）
3. 打开 → 默认使用 **Render 公共后端**（首次搜索可能 15s 冷启动）
4. 想更快？→ 按 [docs/TUNNEL-SETUP.md](./docs/TUNNEL-SETUP.md) 自建后端

### 自托管（部署自己的后端 + 域名）

完整 30 分钟教程：[docs/TUNNEL-SETUP.md](./docs/TUNNEL-SETUP.md)

简要步骤：

```bash
# 1. 部署 go-music-api 后端（你家里的 Linux / VPS 都行）
sudo ./scripts/setup-backend.sh

# 2. 把后端暴露到公网（Cloudflare Tunnel，免费，无需公网 IP）
sudo ./scripts/setup-tunnel.sh

# 3. APK 设置里加你的域名后端 URL，激活即可
```

两条一键脚本都内置占位符提示，按提示填好域名和端口即可。

---

## 📁 仓库结构

```
pikachu-music/
├── App.tsx                       # React Native 根组件
├── src/                          # 客户端源码
│   ├── api/
│   │   ├── gomusic.ts            # 后端 API 封装
│   │   ├── backendHealth.ts      # 后端连通性测试
│   │   └── legacySources.ts      # 4 个老 API 源
│   ├── components/accounts/      # 扫码登录 + Cookie 管理 UI
│   ├── screens/                  # Player / Search / Playlist / Settings
│   ├── state/                    # zustand stores
│   └── ...
├── android/                      # 原生 Android 工程
├── docs/                         # 部署文档
│   ├── TUNNEL-SETUP.md           # Cloudflare Tunnel 完整教程
│   └── GOMUSIC-API-DEPLOY.md     # go-music-api 部署指南
├── scripts/                      # 一键脚本
│   ├── setup-backend.sh          # 装 + 编译 + pm2 启动 go-music-api
│   └── setup-tunnel.sh           # 装 cloudflared + 创建 tunnel + pm2 守护
├── app.json                      # Expo 配置
└── package.json
```

> 开发相关细节（技术栈对比、构建命令、已知问题）见 [DEV.md](./DEV.md)。

---

## 🔧 技术栈

- **客户端**：React Native + Expo SDK 54 + TypeScript
- **状态管理**：Zustand + AsyncStorage 持久化
- **音频播放**：`react-native-track-player`
- **歌词高亮**：FlatList + scrollToIndex
- **后端**：Go ([go-music-api](https://github.com/guohuiyuan/go-music-api)) — 聚合 12 个音乐平台 API
- **隧道**：Cloudflare Tunnel（用户自建）

---

## 🎵 支持的音乐源

| 源 | ID | 搜索 | 扫码 |
|---|---|---|---|
| 网易云音乐 | `netease` | ✅ | ✅ |
| QQ 音乐 | `qq` | ✅ | ✅ |
| QQ 微信扫码 | `qq_wx` | ❌ | ✅ |
| 酷狗音乐 | `kugou` | ✅ | ✅ |
| 酷我音乐 | `kuwo` | ✅（legacy） | ❌ |
| 咪咕音乐 | `migu` | ✅（legacy） | ❌ |
| 千千音乐 | `qianqian` | ✅ | ❌ |
| 汽水音乐 | `soda` | ✅ | ❌ |
| 5sing | `fivesing` | ✅ | ❌ |
| Jamendo (CC) | `jamendo` | ✅ | ❌ |
| JOOX | `joox` | ✅ | ❌ |
| Bilibili | `bilibili` | ✅ | ✅ |

---

## 🔒 隐私

- **本应用不上传任何数据**到第三方服务器
- 扫码登录的 cookie 存储：
  - **后端 `cookies.json`**（用户自托管）或 **Render 免费实例**（公共，可能被实例重启清空）
  - **手机 AsyncStorage**（用户手动备份用，扫码成功时自动复制）
- 默认激活的 Render 后端 URL `https://pikachu-music-api.onrender.com/api/v1` **是公开服务**，所有用户共享
- 自建后端完全私有

---

## 📄 License

MIT. 详见 [LICENSE](./LICENSE)。

音乐版权归各平台和原作者所有。本项目仅作为学习演示。

---

## 🔗 相关链接

- 上游后端：<https://github.com/guohuiyuan/go-music-api>
- Cloudflare Tunnel 文档：<https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/>
- 部署文档：[docs/TUNNEL-SETUP.md](./docs/TUNNEL-SETUP.md)
