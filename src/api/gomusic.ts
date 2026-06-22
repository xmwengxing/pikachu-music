// go-music-api 后端客户端（React Native 版）
// 改动要点：
// - BASE 改为从 settings store 动态读取（v21+ 走 backends[]）
// - 兼容旧版 gomusicBaseUrl 字段：迁移期间会做一次 lazy migration
// - 默认为空 → 不会发起请求，调用方需先设置 baseUrl 或回落到 legacy
// - 网络层用全局 fetch（RN 内置）
import type { Track, GOMusicSong, GOMusicResponse } from './types';
// 后端统一信封（{code, msg, data}）；用别名保持可读性
type GOMusicEnvelope<T> = GOMusicResponse<T>;
import { inferQualityFromUrl, qualityFromBitrate } from '../utils/quality';
import { useSettingsStore } from '../state/settingsStore';

/**
 * 解析聚合后端地址（v21+ 走 backends[]）
 * - 优先读 activeBackendId 对应的 url
 * - 否则回落到 backends[0]
 * - 兼容旧版 gomusicBaseUrl：如果 backends 为空但 gomusicBaseUrl 非空，懒迁移
 * - 为空 → 关闭 gomusic 聚合，回落到 legacy
 */
export function getGomusicBase(): string {
  const s = useSettingsStore.getState();
  // 1) 优先 backends[]
  const backends = s.backends || [];
  if (backends.length > 0) {
    const activeId = s.activeBackendId;
    const active = backends.find(b => b.id === activeId) || backends[0];
    return active?.url || '';
  }
  // 2) 兼容旧版 gomusicBaseUrl（首次启动老用户）
  return s.gomusicBaseUrl || '';
}

const TAG_TO_GOMUSIC: Record<string, string> = {
  migu: 'migu',
  netease: 'netease',
  qq: 'qq',
  kuwo: 'kugou',
  bilibili: 'bilibili',
  qianqian: 'qianqian',
  soda: 'soda',
  fivesing: 'fivesing',
  jamendo: 'jamendo',
  joox: 'joox',
  gomusic: '',
};

async function jget<T>(base: string, url: string): Promise<T | null> {
  try {
    const r = await fetch(base + url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch (e) {
    console.warn('GET', base + url, e);
    return null;
  }
}

async function jpost<T = unknown>(base: string, url: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(base + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch (e) {
    console.warn('POST', base + url, e);
    return null;
  }
}

// QR 扫码登录相关类型（与后端 music-lib/model/login.go 对齐）
export type QRLoginStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'failed';

export interface QRLoginSession {
  source: string;
  key: string;            // 轮询 key（GET 时作为 ?key=）
  url: string;            // 二维码内容 URL
  image_url?: string;     // 二维码图片 URL（后端 image_url 字段）
  state?: string;
  expires_at?: number;    // 过期时间戳（ms）
  extra?: Record<string, string>;
}

export interface QRLoginResult {
  source: string;
  key: string;
  status: QRLoginStatus;
  message?: string;
  cookie?: string;        // 平台库直接返回的 cookie 字符串
  cookies?: Record<string, string>; // 拆分后的 key→value
  extra?: Record<string, string>;  // 成功时含 cookie_saved/cookie_source/cookie_length
}

export async function searchByTag(
  tag: string,
  keyword: string,
  limit = 10,
  page = 1,
): Promise<Track[]> {
  const base = getGomusicBase();
  if (!base) return [];
  const goSources = TAG_TO_GOMUSIC[tag] ?? tag;
  const params = new URLSearchParams({ q: keyword, type: 'song', n: String(limit) });
  if (goSources) params.append('sources', goSources);
  if (tag === 'netease') params.set('page', String(page));

  const resp = await jget<GOMusicResponse<{ songs: GOMusicSong[] }>>(
    base,
    `/music/search?${params.toString()}`,
  );
  if (!resp || resp.code !== 200 || !resp.data?.songs) return [];
  return resp.data.songs.map((s, idx) => gomusicSongToTrack(s, tag, keyword, idx));
}

/**
 * 用 settings.localBackendSources 中每个子源并发搜索，合并去重
 * （用于 SearchScreen 选 "聚合" 时的真正聚合搜索）
 */
export async function searchLocalAggregate(
  keyword: string,
  limit = 10,
): Promise<Track[]> {
  const base = getGomusicBase();
  if (!base) return [];
  const ids = useSettingsStore.getState().localBackendSources || [];
  if (ids.length === 0) return [];

  const tasks = ids.map(async (id) => {
    const params = new URLSearchParams({ q: keyword, type: 'song', n: String(limit) });
    params.append('sources', id);
    if (id === 'netease') params.set('page', '1');
    try {
      const resp = await jget<GOMusicResponse<{ songs: GOMusicSong[] }>>(
        base,
        `/music/search?${params.toString()}`,
      );
      if (!resp || resp.code !== 200 || !resp.data?.songs) return [];
      return resp.data.songs.map((s, idx) => gomusicSongToTrack(s, id, keyword, idx));
    } catch {
      return [];
    }
  });
  const results = await Promise.all(tasks);
  // 合并去重（用 uid）
  const seen = new Set<string>();
  const merged: Track[] = [];
  for (const arr of results) {
    for (const t of arr) {
      if (!seen.has(t.uid)) {
        seen.add(t.uid);
        merged.push(t);
      }
    }
  }
  return merged;
}

function gomusicSongToTrack(s: GOMusicSong, tag: string, keyword: string, idx: number): Track {
  const sid = String(s.id || '');
  const platform = s.source || TAG_TO_GOMUSIC[tag] || tag;
  const uid = `${tag}-${platform}-${sid}`;
  const hasUrl = !!(s.url && s.url.length > 0);
  const q = qualityFromBitrate(s.bitrate);
  return {
    uid,
    source: tag as Track['source'],
    platform,
    songid: sid,
    displayIndex: idx + 1,
    keyword,
    title: s.name || '',
    artist: s.artist || '',
    album: s.album || '',
    cover: s.cover || null,
    audioUrl: hasUrl ? s.url : null,
    lrc: null,
    lrcUrl: null,
    detailsLoaded: hasUrl,
    bitrate: s.bitrate || null,
    duration: s.duration || 0,
    quality: q?.tag || null,
    qualityLabel: q?.label || (s.bitrate ? `${s.bitrate}kbps` : null),
  };
}

export async function fetchDetails(track: Track, platformOverride?: string): Promise<Track> {
  const base = getGomusicBase();
  if (!base) throw new Error('gomusic disabled');
  const platform = platformOverride || track.platform || (TAG_TO_GOMUSIC[track.source] ?? track.source);
  const sid = track.songid || '';
  if (!sid) throw new Error(track.source + ' no songid');

  const urlR = await jget<GOMusicResponse<{ url: string }>>(
    base,
    `/music/url?id=${encodeURIComponent(sid)}&source=${encodeURIComponent(platform)}`,
  );
  if (!urlR || urlR.code !== 200 || !urlR.data?.url) {
    throw new Error(`${track.source} url fetch failed`);
  }
  track.audioUrl = urlR.data.url;
  track.platform = platform;
  track.detailsLoaded = true;

  if (!track.lrc) {
    const lrcR = await jget<GOMusicResponse<{ lyric: string }>>(
      base,
      `/music/lyric?id=${encodeURIComponent(sid)}&source=${encodeURIComponent(platform)}`,
    );
    if (lrcR?.code === 200 && lrcR.data?.lyric) {
      track.lrc = lrcR.data.lyric;
    }
  }

  if (track.audioUrl) {
    const q = inferQualityFromUrl(track.audioUrl);
    if (q.tag) {
      track.quality = q.tag;
      track.qualityLabel = q.label;
    }
  }
  return track;
}

export async function waitForApi(timeoutMs = 15000): Promise<boolean> {
  const base = getGomusicBase();
  if (!base) return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${base}/music/search?q=test&type=song&n=1`);
      if (r.ok) return true;
    } catch {}
    await new Promise<void>((r) => setTimeout(r, 300));
  }
  return false;
}

export async function listCookies(): Promise<Record<string, string> | null> {
  const base = getGomusicBase();
  if (!base) return null;
  const r = await jget<GOMusicEnvelope<Record<string, string>>>(base, '/system/cookies');
  return r?.code === 200 ? r.data ?? {} : null;
}

export async function setCookie(source: string, cookie: string): Promise<boolean> {
  const base = getGomusicBase();
  if (!base) return false;
  const r = await jpost<GOMusicEnvelope<unknown>>(
    base,
    `/system/cookies?source=${encodeURIComponent(source)}`,
    { cookie },
  );
  return r?.code === 200;
}

export async function createQRSession(source: string): Promise<QRLoginSession | null> {
  const base = getGomusicBase();
  if (!base) return null;
  const r = await jget<GOMusicEnvelope<QRLoginSession>>(
    base,
    `/system/qr_login/${encodeURIComponent(source)}`,
  );
  return r?.code === 200 ? r.data ?? null : null;
}

export async function pollQRStatus(source: string, key: string): Promise<QRLoginResult | null> {
  const base = getGomusicBase();
  if (!base) return null;
  // 后端 CheckQRLogin 用 ?key= query，不是 path 参数
  const r = await jget<GOMusicEnvelope<QRLoginResult>>(
    base,
    `/system/qr_login/${encodeURIComponent(source)}?key=${encodeURIComponent(key)}`,
  );
  return r?.code === 200 ? r.data ?? null : null;
}