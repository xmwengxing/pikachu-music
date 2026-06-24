// Web 平台的下载/分享桩实现（含 Tauri webview 分支）
//
// expo-file-system 56 仅支持 Android / iOS / tvOS，在 web 上 import 会抛错。
//
// 浏览器两种模式：
// 1. 纯浏览器（http://localhost:8091 这种开发模式）：
//    - 暂不支持下载。返回明确"不支持"错误，不引入 Tauri 包。
// 2. Tauri 桌面壳（用户从 pikachu-music.exe 启动）：
//    - window.__TAURI_INTERNALS__ 存在 → 走 .tauri.ts 的真保存流程
//    - 调 tauri-plugin-dialog 的 save() 选位置
//    - invoke('download_track_to_path', ...) 让 Rust 拉远端 + 写用户选的位置
//
// 运行时检测 window.__TAURI_INTERNALS__（Tauri 2 标准做法）。
// 命中后才 dynamic import @tauri-apps/* —— 纯 web 不下载这些包，bundle 不背 dead code。

import type { Track } from './types';

export interface DownloadResult {
  ok: boolean;
  localUri?: string;
  fileName: string;
  size?: number;
  error?: string;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 浏览器非 Tauri：返回"不支持"。Tauri webview：分发到 .tauri.ts 走真保存。
 */
export async function downloadTrackToLocal(track: Track): Promise<DownloadResult> {
  if (isTauri()) {
    const tauriModule = await import('./downloader.tauri');
    return tauriModule.downloadTrackToLocal(track);
  }
  return {
    ok: false,
    fileName: '',
    error: 'Web 版本暂不支持下载到本地，桌面壳（Tauri）版可保存到任意位置',
  };
}

/**
 * 浏览器非 Tauri：始终 false。Tauri webview：true（文件已直接落到用户选的位置）。
 */
export async function shareSavedFile(
  localUri: string,
  mime: string,
  dialogTitle = '保存音乐',
): Promise<boolean> {
  if (isTauri()) {
    const tauriModule = await import('./downloader.tauri');
    return tauriModule.shareSavedFile(localUri, mime, dialogTitle);
  }
  return false;
}

/**
 * 简单 mime 查表（与 native / tauri 版保持一致）。
 * PlayerScreen 会用这个给 shareSavedFile 喂 mime，但 Tauri 路径下其实不用。
 */
export function guessMimeFromExt(ext: string): string {
  switch (ext) {
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'ogg':
    case 'oga':
    case 'opus': return 'audio/ogg';
    case 'wav': return 'audio/wav';
    default: return 'audio/mpeg';
  }
}
