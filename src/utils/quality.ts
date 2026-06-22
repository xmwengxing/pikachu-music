// 根据音频 URL 后缀推断音质
export function inferQualityFromUrl(url: string | null | undefined): { tag: string | null; label: string } {
  if (!url) return { tag: null, label: '' };
  const base = url.split('?')[0].toLowerCase();
  const m = base.match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : '';
  const losslessExts = ['flac', 'wav', 'ape', 'alac', 'aiff'];
  if (losslessExts.includes(ext)) return { tag: 'lossless', label: 'LOSSLESS' };
  return { tag: '320k', label: '320K' };
}

export function qualityFromBitrate(bitrate: number | null | undefined): { tag: string; label: string } | null {
  if (!bitrate) return null;
  if (bitrate >= 900) return { tag: 'lossless', label: 'LOSSLESS' };
  if (bitrate >= 320) return { tag: 'flac', label: 'FLAC' };
  if (bitrate >= 192) return { tag: 'hq', label: 'HQ' };
  return { tag: 'standard', label: 'STD' };
}
