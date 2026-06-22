// 通用 API / 业务类型
export type PlatformId =
  | 'migu' | 'netease' | 'qq' | 'kuwo'
  | 'bilibili' | 'qianqian' | 'soda' | 'fivesing'
  | 'jamendo' | 'joox' | 'gomusic';

// 单曲
export interface Track {
  uid: string;
  source: PlatformId;
  platform?: string;     // gomusic 后端实际命中的 platform
  /** 透传到后端 lyric 接口的元数据（migu 的 content_id 等）。v24 加 */
  extra?: Record<string, string>;
  songid?: string;
  displayIndex?: number;
  keyword?: string;

  title: string;
  artist: string;
  album?: string;

  cover?: string | null;
  audioUrl?: string | null;
  lrc?: string | null;
  lrcUrl?: string | null;

  detailsLoaded?: boolean;

  bitrate?: number | null;
  duration?: number;
  quality?: string | null;
  qualityLabel?: string | null;
}

// gomusic API 响应（共用）
export interface GOMusicResponse<T = unknown> {
  code: number;
  msg?: string;
  data?: T;
}

export interface GOMusicSong {
  id: string;
  name: string;
  artist: string;
  album?: string;
  album_id?: string;
  duration?: number;
  size?: number;
  bitrate?: number;
  source: string;          // gomusic 后端实际平台
  url?: string;
  ext?: string;
  cover?: string;
  link?: string;
  /** 平台特定元数据（如 migu 的 content_id）。后端 lyric 接口需要这个。
   *  v24 起从 string 修正为 Record<string,string>（后端实际返的是 JSON object） */
  extra?: Record<string, string>;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

export interface SearchHistoryItem {
  kw: string;
  at: number;
}

export type PlayMode = 'list' | 'random' | 'single';

export type PlayContext =
  | { type: 'results' | 'favorites'; index: number }
  | { type: 'playlist'; playlistId: string; index: number };
