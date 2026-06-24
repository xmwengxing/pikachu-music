// 播放器状态 store
// RN 端扩展：playOnLoad（自动播放）、notifyTrackEnded（结束回调）、volume/muted（直接管理）
// v1.0.26+: lyricsAlt:boolean → lyricsMode:'classic'|'glow'|'particles'，L 键循环 3 模式
import { create } from 'zustand';
import type { Track, PlayContext } from '../api/types';
import { parseLRC, type LyricLine } from '../utils/lrc';

export type LyricsMode = 'classic' | 'glow' | 'particles';
const LYRICS_MODE_ORDER: LyricsMode[] = ['classic', 'glow', 'particles'];

interface PlayerState {
  currentTrack: Track | null;
  playContext: PlayContext;
  isPlaying: boolean;
  lyricLines: LyricLine[];
  lyricsMode: LyricsMode;    // L 键循环切换的歌词视觉模式
  /** 原播放队列快照（random 模式洗牌前缓存，切回 list 时恢复） */
  queueSnapshot: Track[] | null;
  volume: number;
  muted: boolean;
  playOnLoad: boolean;      // 新歌曲载入后是否自动播放
  onTrackEnded?: () => void; // 一首歌播完时的回调（由 useTrackPlayer 注册）

  setCurrent: (track: Track, ctx: PlayContext) => void;
  setIsPlaying: (b: boolean) => void;
  setLyrics: (lines: LyricLine[]) => void;
  cycleLyricsMode: () => void;
  setVolume: (v: number) => void;
  setMuted: (b: boolean) => void;
  setPlayOnLoad: (b: boolean) => void;
  registerEndedHandler: (fn: () => void) => void;
  notifyTrackEnded: () => void;
  next: () => void;
  prev: () => void;
  jumpToIndex: (idx: number) => void;
  setQueueSnapshot: (q: Track[] | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  playContext: { type: 'results', index: -1 },
  isPlaying: false,
  lyricLines: [],
  lyricsMode: 'classic',
  queueSnapshot: null,
  volume: 1,
  muted: false,
  playOnLoad: true,

  setCurrent: (track, ctx) => set({
    currentTrack: track,
    playContext: ctx,
    isPlaying: true,
    lyricLines: track.lrc ? parseLRC(track.lrc) : [],
    playOnLoad: true, // 默认自动播放
  }),
  setIsPlaying: (b) => set({ isPlaying: b }),
  setLyrics: (lines) => set({ lyricLines: lines }),
  cycleLyricsMode: () => set(s => {
    const idx = LYRICS_MODE_ORDER.indexOf(s.lyricsMode);
    return { lyricsMode: LYRICS_MODE_ORDER[(idx + 1) % LYRICS_MODE_ORDER.length] };
  }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  setMuted: (b) => set({ muted: b }),
  setPlayOnLoad: (b) => set({ playOnLoad: b }),
  registerEndedHandler: (fn) => set({ onTrackEnded: fn }),
  notifyTrackEnded: () => {
    const fn = get().onTrackEnded;
    if (fn) fn();
  },

  next: () => set(s => ({ playContext: { ...s.playContext, index: s.playContext.index + 1 } })),
  prev: () => set(s => {
    const newIdx = Math.max(0, s.playContext.index - 1);
    return { playContext: { ...s.playContext, index: newIdx } };
  }),
  jumpToIndex: (idx) => set(s => ({
    playContext: { ...s.playContext, index: idx } as PlayContext,
  })),
  setQueueSnapshot: (q) => set({ queueSnapshot: q }),
}));