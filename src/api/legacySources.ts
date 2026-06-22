// 4 个第三方公开音乐 API（不依赖 gomusic 后端）
// 原站 pikachu-music.github.io 接入的来源
//
// 端点 + 响应格式参考：
//   migu    api.xcvts.cn/api/music/migu        → {code, data:[{n, title, singer, cover, lrc_url, music_url, link}]}
//   netease api.vkeys.cn/v2/music/netease      → {code, data:[{id, song, singer, album, time, quality, cover}]} 详情: /v2/music/netease/lyric?id=
//   qq      tang.api.s01s.cn/music_open_api.php → [{song_title, pay, song_mid, singer_name, album_name, album_mid, singer_mid, ...}] 详情: ?msg=&mid=&type=json
//   kuwo    kw-api.cenguigui.cn/?name=&page=&limit= → {code, data:[{rid, name, artist, album, pic, ...}]} 详情: ?id=&type=song
import type { Track } from './types';

// 通用 HTTP helper（带超时 + 静默降级）
async function getJSON<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) {
      // 4xx/5xx 不弹错——search 失败返回空数组就行
      return null;
    }
    return (await r.json()) as T;
  } catch (e) {
    // AbortError / Failed to fetch (CORS / 502 / 网络) — 全部静默
    return null;
  }
}

// ===== 咪咕 =====
interface MiguSong {
  n: number;
  title: string;
  singer: string;
  cover?: string;
  lrc_url?: string;
  music_url?: string;
  link?: string;
}
interface MiguResp { code: number; data?: MiguSong[] }

export async function searchMigu(kw: string, limit = 10): Promise<Track[]> {
  const url = `https://api.xcvts.cn/api/music/migu?gm=${encodeURIComponent(kw)}&n=&num=${limit}&type=json`;
  const r = await getJSON<MiguResp>(url);
  if (!r || r.code !== 200 || !Array.isArray(r.data)) return [];
  return r.data.map((s, idx) => ({
    uid: `migu-${kw}-${s.n}-${s.title}-${s.singer}-${idx}`,
    source: 'migu',
    songid: String(s.n),
    displayIndex: s.n,
    keyword: kw,
    title: s.title || '',
    artist: s.singer || '',
    cover: s.cover || null,
    audioUrl: (s.music_url && s.music_url.length > 0) ? s.music_url : null,
    lrc: null,
    lrcUrl: s.lrc_url || null,
    detailsLoaded: false,
    quality: null, qualityLabel: null,
  }));
}

/**
 * v24 修复：从 gomusic 后端拿歌词（替代老 API 的 lyric 接口，后者对 gomusic 返回的 id 不完全兼容）
 * - 成功就覆盖 track.lrc；失败保持原状让 legacy 兜底
 * - 静默失败（不抛异常）
 */
async function tryGomusicLyric(track: Track, source: string): Promise<void> {
  const sid = track.songid;
  if (!sid) return;
  try {
    const gomusicBase = (await import('./gomusic')).getGomusicBase();
    if (!gomusicBase) return;
    const extraParam = track.extra
      ? `&extra=${encodeURIComponent(JSON.stringify(track.extra))}`
      : '';
    const r = await getJSON<{ code: number; data?: { lyric?: string } }>(
      `${gomusicBase}/music/lyric?id=${encodeURIComponent(sid)}&source=${source}${extraParam}`,
    );
    if (r && r.code === 200 && r.data?.lyric) {
      track.lrc = r.data.lyric;
    }
  } catch {
    // 静默
  }
}

export async function fetchMiguDetails(track: Track): Promise<Track> {
  const n = track.songid || '';
  // 1) gomusic 优先
  if (n) {
    const gomusicBase = (await import('./gomusic')).getGomusicBase();
    if (gomusicBase) {
      try {
        const r1 = await getJSON<{ code: number; data?: { url?: string } }>(`${gomusicBase}/music/url?id=${encodeURIComponent(n)}&source=migu`);
        if (r1 && r1.code === 200 && r1.data?.url) {
          track.audioUrl = r1.data.url;
          track.platform = 'migu';
          track.detailsLoaded = true;
          // v24 修复：gomusic lyric 作为主路径
          await tryGomusicLyric(track, 'migu');
          return track;
        }
      } catch {}
    }
  }
  // 2) Fallback: xcvts.cn 咪咕
  try {
    const url = `https://api.xcvts.cn/api/music/migu?gm=${encodeURIComponent(track.keyword || '')}&n=${encodeURIComponent(n)}&num=10&type=json`;
    const r = await getJSON<MiguResp>(url);
    if (r && r.code === 200 && r.data && r.data[0]) {
      const s = r.data[0];
      track.title = s.title || track.title;
      track.artist = s.singer || track.artist;
      track.cover = s.cover || track.cover;
      if (s.music_url) track.audioUrl = s.music_url;
      if (s.lrc_url) track.lrcUrl = s.lrc_url;
    }
    // 抓歌词（LRC）
    if (track.lrcUrl) {
      try {
        const lr = await fetch(track.lrcUrl);
        if (lr.ok) track.lrc = await lr.text();
      } catch {}
    }
    // v24 兜底：gomusic 后端没拿到的，legacy 老 API 也试一遍
    if (!track.lrc) await tryGomusicLyric(track, 'migu');
  } catch {
    // 咪咕 server 可能挂或 CORS——静默
  }
  track.detailsLoaded = true;
  return track;
}

// ===== 网易云 =====
interface NeteaseSong {
  id: number | string;
  song: string;
  singer: string;
  album: string;
  time: string;
  quality?: string;
  cover?: string;
}
interface NeteaseResp { code: number; data?: NeteaseSong[] }

export async function searchNetease(kw: string, page = 1, limit = 10): Promise<Track[]> {
  const url = `https://api.vkeys.cn/v2/music/netease?word=${encodeURIComponent(kw)}&page=${page}&num=${limit}`;
  const r = await getJSON<NeteaseResp>(url);
  if (!r || r.code !== 200 || !Array.isArray(r.data)) return [];
  return r.data.map((s, idx) => ({
    uid: `netease-${s.id}`,
    source: 'netease',
    songid: String(s.id),
    displayIndex: (page - 1) * limit + idx + 1,
    keyword: kw,
    title: s.song || '',
    artist: s.singer || '',
    album: s.album || '',
    cover: s.cover || null,
    audioUrl: null,
    lrc: null,
    lrcUrl: null,
    detailsLoaded: false,
    quality: s.quality || null,
    qualityLabel: null,
  }));
}

export async function fetchNeteaseDetails(track: Track): Promise<Track> {
  const sid = track.songid || '';
  // 1) gomusic 优先
  if (sid) {
    const gomusicBase = (await import('./gomusic')).getGomusicBase();
    if (gomusicBase) {
      try {
        const r1 = await getJSON<{ code: number; data?: { url?: string } }>(`${gomusicBase}/music/url?id=${encodeURIComponent(sid)}&source=netease`);
        if (r1 && r1.code === 200 && r1.data?.url) {
          track.audioUrl = r1.data.url;
          track.platform = 'netease';
          track.detailsLoaded = true;
          // v24：主路径优先用 gomusic lyric
          await tryGomusicLyric(track, 'netease');
          return track;
        }
      } catch {}
    }
  }
  // 2) Fallback: meting API
  try {
    const r = await fetch(`https://api.qijieya.cn/meting/?server=netease&type=song&id=${encodeURIComponent(track.songid || '')}`);
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr[0]) {
        const d = arr[0];
        if (d.url) {
          track.audioUrl = d.url;
          if (d.pic) track.cover = d.pic;
          if (d.name) track.title = d.name;
          if (d.artist) track.artist = d.artist;
        }
      }
    }
  } catch {
    // CORS / 503 — 静默
  }
  // 歌词：vkeys API
  try {
    const r = await fetch(`https://api.vkeys.cn/v2/music/netease/lyric?id=${encodeURIComponent(track.songid || '')}`);
    if (r.ok) {
      const j = await r.json();
      if (j && j.code === 200 && j.data && j.data.lrc) {
        track.lrc = j.data.lrc;
      }
    }
  } catch {
    // 静默
  }
  // v24：legacy 没拿到，gomusic 兜底
  if (!track.lrc) await tryGomusicLyric(track, 'netease');
  track.detailsLoaded = true;
  return track;
}

// ===== QQ =====
interface QQSong {
  song_title: string;
  pay: number | string;
  song_mid: string;
  singer_name: string;
  album_name?: string;
  album_mid?: string;
  singer_mid?: string;
  album_pic?: string;
  kbps?: string;
  interval?: number;
  // 详情接口返回
  song_play_url_sq?: string;
  song_play_url_hq?: string;
  song_play_url_standard?: string;
  song_lyric?: string;
  [key: string]: unknown;
}
interface QQResp { code: number; data?: QQSong[]; }

/**
 * 带错误码的 QQ 播放失败异常，便于上层 toast 显示具体原因。
 * code: QQ_NO_URL  / QQ_API_FAIL / QQ_GOMUSIC_FAIL
 */
export class QQPlayError extends Error {
  code: string;
  cause?: string;
  constructor(code: string, message: string, cause?: string) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'QQPlayError';
  }
}

export async function searchQQ(kw: string, limit = 10): Promise<Track[]> {
  const url = `https://tang.api.s01s.cn/music_open_api.php?msg=${encodeURIComponent(kw)}&type=json`;
  const r = await getJSON<QQResp | QQSong[]>(url);
  let list: QQSong[] = [];
  if (Array.isArray(r)) list = r;
  else if (r && Array.isArray(r.data)) list = r.data;
  return list.slice(0, limit).map((s, idx) => ({
    uid: `qq-${s.song_mid}`,
    source: 'qq',
    songid: s.song_mid,
    displayIndex: idx + 1,
    keyword: kw,
    title: s.song_title || '',
    artist: s.singer_name || '',
    album: s.album_name || '',
    cover: s.album_pic || null,
    audioUrl: null,
    lrc: null,
    detailsLoaded: false,
    quality: null,
    qualityLabel: null,
  }));
}

export async function fetchQQDetails(track: Track): Promise<Track> {
  // QQ 详情加载顺序：
  //   1) 优先 gomusic 后端（最稳，CORS 通；未部署则跳过）
  //   2) Fallback 到 tang API —— **与原网站一致**：用 ?msg=&type=json&mid= 一步式拿详情
  //   3) 仍失败 → 抛出 QQPlayError（带 code + cause），调用方负责 toast 提示
  const mid = track.songid || '';
  if (!mid) {
    track.detailsLoaded = true;
    return track;
  }

  // ---------- 1) gomusic 优先 ----------
  const gomusicBase = (await import('./gomusic')).getGomusicBase();
  if (gomusicBase) {
    try {
      const urlApi = `${gomusicBase}/music/url?id=${encodeURIComponent(mid)}&source=qq`;
      const r1 = await getJSON<{ code: number; data?: { url?: string } }>(urlApi);
if (r1 && r1.code === 200 && r1.data && r1.data.url) {
          track.audioUrl = r1.data.url;
          track.platform = 'qq';
          if (!track.lrc) {
            // v24：改用 helper（带 extra 透传）
            await tryGomusicLyric(track, 'qq');
          }
          track.detailsLoaded = true;
          if (track.audioUrl) return track;
        }
    } catch (e: any) {
      // gomusic 调用本身失败（连不上 / 5xx），不阻断，继续走 tang
      console.warn('[QQ] gomusic path failed:', e?.message || e);
    }
  }

  // ---------- 2) tang fallback（与原网站 yd() 等价）----------
  // 原网站约定：msg + mid 双重定位，tang 在收到 mid 时会直接返回 song_play_url_* 字段
  const primaryKeyword = track.keyword || '';
  const preciseKeyword = (track.title && track.artist)
    ? `${track.title} - ${track.artist}`
    : primaryKeyword;

  let found: QQSong | null = null;

  // 2a) 用 preciseKeyword + mid 一步拿详情（首选，与原网站一致）
  if (preciseKeyword) {
    found = await qqFetchByMid(preciseKeyword, mid);
  }

  // 2b) 兜底：用原始 keyword + mid 一步拿详情
  if (!found && primaryKeyword && primaryKeyword !== preciseKeyword) {
    found = await qqFetchByMid(primaryKeyword, mid);
  }

  // 2c) 极端兜底：完全 keyword 搜索，从结果里挑 mid 匹配项（保留向后兼容）
  if (!found && preciseKeyword) {
    const arr = await qqSearchRaw(preciseKeyword);
    found = arr.find(x => x.song_mid === mid) || null;
  }
  if (!found && primaryKeyword && primaryKeyword !== preciseKeyword) {
    const arr = await qqSearchRaw(primaryKeyword);
    found = arr.find(x => x.song_mid === mid) || null;
  }

  if (found) {
    if (found.song_play_url_sq) track.audioUrl = found.song_play_url_sq;
    else if (found.song_play_url_hq) track.audioUrl = found.song_play_url_hq;
    else if (found.song_play_url_standard) track.audioUrl = found.song_play_url_standard;
    if (found.song_lyric) track.lrc = found.song_lyric;
    // v24：tang 没拿到，gomusic 兜底
    if (!track.lrc) await tryGomusicLyric(track, 'qq');
    if (found.album_pic) track.cover = found.album_pic;
    if (found.kbps) {
      const kbps = parseInt(found.kbps);
      track.qualityLabel = kbps + 'kbps';
      if (kbps >= 900) track.quality = 'lossless';
      else if (kbps >= 320) track.quality = 'flac';
      else if (kbps >= 192) track.quality = 'hq';
      else track.quality = 'standard';
    }
  }

  track.detailsLoaded = true;

  // ---------- 3) 失败抛带码错误 ----------
  if (!track.audioUrl) {
    const triedKeywords = [preciseKeyword, primaryKeyword].filter(Boolean);
    throw new QQPlayError(
      'QQ_NO_URL',
      `QQ 歌曲无法播放：${track.title} - ${track.artist}\n` +
      `mid=${mid}，已尝试关键词：${triedKeywords.join(' / ') || '(无)'}\n` +
      `可能原因：\n` +
      `• tang.api.s01s.cn 暂未收录此曲\n` +
      `• 试听权限 / VIP 限制\n` +
      `• 网络/CORS 临时故障`,
      `tang API 在 mid=${mid} 下未返回 song_play_url_* 字段。请尝试切换音源或在设置里启用 go-music-api 后端。`,
    );
  }
  return track;
}

async function qqSearchRaw(keyword: string): Promise<QQSong[]> {
  const url = `https://tang.api.s01s.cn/music_open_api.php?msg=${encodeURIComponent(keyword)}&type=json`;
  const r = await getJSON<QQResp | QQSong[]>(url);
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.data)) return r.data;
  return [];
}

/**
 * 与原网站 yd() 等价：用 keyword + song_mid 一步拿详情。
 * 原站关键差异：URL 末尾带 `&mid=<song_mid>`，触发 tang 服务端返回 song_play_url_* 字段。
 */
async function qqFetchByMid(keyword: string, mid: string): Promise<QQSong | null> {
  if (!keyword || !mid) return null;
  const url = `https://tang.api.s01s.cn/music_open_api.php?msg=${encodeURIComponent(keyword)}&type=json&mid=${encodeURIComponent(mid)}`;
  const r = await getJSON<QQResp | QQSong[]>(url);
  let arr: QQSong[] = [];
  if (Array.isArray(r)) arr = r;
  else if (r && Array.isArray(r.data)) arr = r.data;
  return arr.find(x => x.song_mid === mid) || null;
}

// ===== 酷我（cenguigui） =====
interface KuwoSong {
  rid: string;
  pic?: string;
  vid?: string;
  name: string;
  artist: string;
  artistid?: number | string;
  album?: string;
  albumid?: number | string;
  duration?: number;
  releaseDate?: string;
}
interface KuwoResp { code: number; data?: KuwoSong[] }

// ===== 酷我（cenguigui，老 API，与 gomusic 后端无关） =====
export async function searchKuwo(kw: string, limit = 10): Promise<Track[]> {
  const url = `https://kw-api.cenguigui.cn/?name=${encodeURIComponent(kw)}&page=1&limit=${limit}`;
  const r = await getJSON<KuwoResp>(url);
  if (!r || r.code !== 200 || !Array.isArray(r.data)) return [];
  return r.data.map((s, idx) => ({
    // UID 用 kuwo-legacy 前缀（老的 cenguigui API 来源）
    uid: `kuwo-legacy-${s.rid}`,
    source: 'kuwo',
    songid: s.rid,
    displayIndex: idx + 1,
    keyword: kw,
    title: s.name || '',
    artist: s.artist || '',
    album: s.album || '',
    cover: s.pic || null,
    audioUrl: null,
    lrc: null,
    detailsLoaded: false,
    quality: null, qualityLabel: null,
  }));
}

export async function fetchKuwoDetails(track: Track): Promise<Track> {
  const rid = track.songid || '';
  // 1) gomusic 优先（gomusic 内部把 kuwo 当 kugou 处理）
  if (rid) {
    const gomusicBase = (await import('./gomusic')).getGomusicBase();
    if (gomusicBase) {
      try {
        const r1 = await getJSON<{ code: number; data?: { url?: string } }>(`${gomusicBase}/music/url?id=${encodeURIComponent(rid)}&source=kugou`);
        if (r1 && r1.code === 200 && r1.data?.url) {
          track.audioUrl = r1.data.url;
          track.platform = 'kugou';
          track.detailsLoaded = true;
          // v24：主路径优先 gomusic lyric
          await tryGomusicLyric(track, 'kugou');
          return track;
        }
      } catch {}
    }
  }
  // 2) Fallback: cenguigui 酷我
  const url = `https://kw-api.cenguigui.cn/?id=${encodeURIComponent(track.songid || '')}&type=song&level=zp&format=json`;
  const r = await getJSON<KuwoResp & { msg?: string; data?: any }>(url);
  if (r && r.code === 200 && r.data) {
    const d = r.data;
    track.title = d.name || track.title;
    track.artist = d.artist || track.artist;
    track.album = d.album || track.album;
    track.cover = d.pic || track.cover;
    if (d.url) track.audioUrl = d.url;
    // 歌词嵌在 detail 响应里（d.lyric 是完整 LRC 字符串）
    if (d.lyric) track.lrc = d.lyric;
    // v24：legacy 没拿到，gomusic 兜底
    if (!track.lrc) await tryGomusicLyric(track, 'kugou');
    // 音质
    if (d.bitrate) {
      const kbps = parseInt(String(d.bitrate));
      track.qualityLabel = d.quality || (kbps + 'kbps');
      track.quality = kbps >= 900 ? 'lossless' : kbps >= 320 ? 'flac' : 'standard';
    }
  }
  track.detailsLoaded = true;
  return track;
}
