// 播放器状态 store
// RN 端扩展：playOnLoad（自动播放）、notifyTrackEnded（结束回调）、volume/muted（直接管理）
import { create } from 'zustand';
import type { Track, PlayContext } from '../api/types';
import type { LyricLine } from '../utils/lrc';

interface PlayerState {
  currentTrack: Track | null;
  playContext: PlayContext;
  isPlaying: boolean;
  lyricLines: LyricLine[];
  lyricsAlt: boolean;       // L 键切换的歌词效果
  volume: number;
  muted: boolean;
  playOnLoad: boolean;      // 新歌曲载入后是否自动播放
  onTrackEnded?: () => void; // 一首歌播完时的回调（由 useTrackPlayer 注册）

  setCurrent: (track: Track, ctx: PlayContext) => void;
  setIsPlaying: (b: boolean) => void;
  setLyrics: (lines: LyricLine[]) => void;
  toggleLyricsAlt: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPlayOnLoad: (b: boolean) => void;
  registerEndedHandler: (fn: () => void) => void;
  notifyTrackEnded: () => void;
  next: () => void;
  prev: () => void;
  jumpToIndex: (idx: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  playContext: { type: 'results', index: -1 },
  isPlaying: false,
  lyricLines: [],
  lyricsAlt: false,
  volume: 1,
  muted: false,
  playOnLoad: true,

  setCurrent: (track, ctx) => set({
    currentTrack: track,
    playContext: ctx,
    isPlaying: true,
    lyricLines: [],
    playOnLoad: true, // 默认自动播放
  }),
  setIsPlaying: (b) => set({ isPlaying: b }),
  setLyrics: (lines) => set({ lyricLines: lines }),
  toggleLyricsAlt: () => set(s => ({ lyricsAlt: !s.lyricsAlt })),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: v === 0 }),
  toggleMute: () => set(s => ({ muted: !s.muted, volume: s.muted ? s.volume || 0.5 : s.volume })),
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
}));