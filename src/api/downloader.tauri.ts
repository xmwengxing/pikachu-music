// src/api/downloader.tauri.ts
// Tauri 桌面壳里的下载流：
// 1. 调 tauri-plugin-dialog 的 save() 让用户选保存位置
// 2. invoke('download_track_to_path', { url, destPath }) 让 Rust 端拉远端音频并写到用户选的路径
// 3. 文件已经在用户选的位置了，不需要再走系统分享面板
//
// 跟 .web.ts 共用同一个 DownloadResult 形状，PlayerScreen.handleDownload 无需改。
//
// 仅当 downloader.web.ts 检测到 window.__TAURI_INTERNALS__ 时才会 dynamic import 此文件。

import type { Track } from './types';

export interface DownloadResult {
  ok: boolean;
  localUri?: string;
  fileName: string;
  size?: number;
  error?: string;
}

const TAURI_INTERNAL = '__TAURI_INTERNALS__';

function isTauri(): boolean {
  return typeof window !== 'undefined' && TAURI_INTERNAL in window;
}

function guessExtFromUrl(url: string): string {
  const u = url.split('?')[0].split('#')[0].toLowerCase();
  const m = u.match(/\.(mp3|m4a|aac|flac|ogg|oga|wav|opus)(?:$|\?)/);
  return m ? m[1] : 'mp3';
}

export async function downloadTrackToLocal(track: Track): Promise<DownloadResult> {
  if (!isTauri()) {
    return { ok: false, fileName: '', error: 'Not in Tauri runtime' };
  }
  if (!track.audioUrl) {
    return { ok: false, fileName: '', error: 'no audioUrl' };
  }

  const safeTitle = (track.title || 'song').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').slice(0, 60);
  const safeArtist = (track.artist || '').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').slice(0, 40);
  const ext = guessExtFromUrl(track.audioUrl);
  const fileName = `${safeArtist ? safeArtist + ' - ' : ''}${safeTitle}.${ext}`;

  // 动态 import：纯 web 环境（dev server / 浏览器直接打开）不会加载这两个包
  const [{ save }, { invoke }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/api/core'),
  ]);

  let filePath: string | null = null;
  try {
    filePath = await save({
      title: '保存音乐',
      defaultPath: fileName,
      filters: [{ name: 'Audio', extensions: [ext] }],
    });
  } catch (e: any) {
    return { ok: false, fileName, error: `dialog failed: ${e?.message || String(e)}` };
  }

  if (!filePath) {
    // 用户取消
    return { ok: false, fileName, error: '用户取消保存' };
  }

  try {
    const size = await invoke<number>('download_track_to_path', {
      url: track.audioUrl,
      destPath: filePath,
    });
    return { ok: true, localUri: filePath, fileName, size };
  } catch (e: any) {
    return { ok: false, fileName, error: e?.message || String(e) };
  }
}

/**
 * Tauri 端：文件已经被 Rust 直接写到用户选的位置。
 * PlayerScreen.handleDownload 接下来会调 shareSavedFile。
 * 桌面壳里"已保存"就是终态，不再触发系统分享面板。
 */
export async function shareSavedFile(
  _localUri: string,
  _mime: string,
  _dialogTitle = '保存音乐',
): Promise<boolean> {
  return isTauri();
}

/**
 * Tauri 端依然要暴露这个函数给 re-export，但桌面壳里只查扩展名。
 * Rust 端写文件时按 Content-Type 决定是否需要补 magic bytes，不依赖 mime。
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
