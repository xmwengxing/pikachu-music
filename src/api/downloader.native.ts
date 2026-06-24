// 下载工具：把远端音频 URL 缓存到本地，再用 expo-sharing 触发 Android 系统分享面板
// 用户可以在分享面板里选 "保存到下载文件夹" / 文件管理器 / 网盘等
//
// Expo SDK 56 用新的 File / Directory / Paths API：
//   - File.downloadFileAsync(url, destination)
//   - Paths.document / Paths.cache
//
// 注意：expo-file-system 56 仍支持 legacy FileSystem.downloadAsync（标 deprecated，
// 但仍可工作），为了稳定我们用新 API。
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Track } from './types';

export interface DownloadResult {
  ok: boolean;
  localUri?: string;
  fileName: string;
  size?: number;
  error?: string;
}

/**
 * 从 URL 推断扩展名（默认 mp3）。支持 mp3 / m4a / flac / ogg / wav / aac。
 */
function guessExtFromUrl(url: string): string {
  const u = url.split('?')[0].split('#')[0].toLowerCase();
  const m = u.match(/\.(mp3|m4a|aac|flac|ogg|oga|wav|opus)(?:$|\?)/);
  return m ? m[1] : 'mp3';
}

function guessMimeFromExt(ext: string): string {
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

/**
 * 把歌曲保存到本地缓存目录，返回本地路径。
 * 不抛错——失败时返回 ok=false。
 */
export async function downloadTrackToLocal(track: Track): Promise<DownloadResult> {
  if (!track.audioUrl) {
    return { ok: false, fileName: '', error: 'no audioUrl' };
  }
  const safeTitle = (track.title || 'song').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').slice(0, 60);
  const safeArtist = (track.artist || '').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').slice(0, 40);
  const ext = guessExtFromUrl(track.audioUrl);
  const fileName = `${safeArtist ? safeArtist + ' - ' : ''}${safeTitle}.${ext}`;
  const mime = guessMimeFromExt(ext);

  try {
    // 把文件存到 document/audio/<fileName>（document 目录比 cache 更安全）
    const dir = new Directory(Paths.document, 'audio');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, fileName);
    // 如果已存在同名文件，直接复用（避免重复下载）
    if (dest.exists) {
      return { ok: true, localUri: dest.uri, fileName, size: dest.size ?? undefined };
    }
    const out = await File.downloadFileAsync(track.audioUrl, dest);
    return { ok: true, localUri: out.uri, fileName, size: out.size ?? undefined };
  } catch (e: any) {
    return {
      ok: false,
      fileName,
      error: e?.message || String(e),
    };
  }
}

/**
 * 保存后弹出 Android 系统分享面板（用户可在此选"保存到下载"、"发送到电脑"、微信收藏等）。
 * 必须在成功 downloadTrackToLocal 之后调用。
 */
export async function shareSavedFile(localUri: string, mime: string, dialogTitle = '保存音乐'): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return false;
    }
    await Sharing.shareAsync(localUri, { mimeType: mime, dialogTitle });
    return true;
  } catch {
    return false;
  }
}

export { guessMimeFromExt };