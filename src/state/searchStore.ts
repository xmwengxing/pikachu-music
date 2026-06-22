// 搜索状态 store
import { create } from 'zustand';
import type { Track } from '../api/types';

interface SearchState {
  keyword: string;
  results: Track[];           // 全部结果（按插入顺序）
  trackMap: Map<string, Track>;  // uid -> Track 快速查重
  inProgress: boolean;
  noMore: boolean;
  status: string;             // 当前状态文案（用于 UI 提示）
  perSourcePage: Record<string, number>;
  perSourceCurrentLimit: Record<string, number>;

  setKeyword: (kw: string) => void;
  addResults: (tracks: Track[]) => void;
  clear: () => void;
  setInProgress: (b: boolean) => void;
  setNoMore: (b: boolean) => void;
  setStatus: (s: string) => void;
  nextPage: (source: string) => void;
  bumpLimit: (source: string, by: number) => void;
  resetPerSource: (limit: number) => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  keyword: '',
  results: [],
  trackMap: new Map(),
  inProgress: false,
  noMore: false,
  status: '',
  perSourcePage: {},
  perSourceCurrentLimit: {},

  setKeyword: (kw) => set({ keyword: kw }),
  addResults: (tracks) => {
    if (!tracks.length) return;
    const map = new Map(get().trackMap);
    const existing = new Set(map.keys());
    const newOnes = tracks.filter(t => !existing.has(t.uid));
    newOnes.forEach(t => map.set(t.uid, t));
    set({
      results: [...get().results, ...newOnes],
      trackMap: map,
    });
  },
  clear: () => set({
    results: [],
    trackMap: new Map(),
    noMore: false,
    perSourcePage: {},
    perSourceCurrentLimit: {},
  }),
  setInProgress: (b) => set({ inProgress: b }),
  setNoMore: (b) => set({ noMore: b }),
  setStatus: (s) => set({ status: s }),
  nextPage: (source) => set(s => ({
    perSourcePage: { ...s.perSourcePage, [source]: (s.perSourcePage[source] || 1) + 1 },
  })),
  bumpLimit: (source, by) => set(s => ({
    perSourceCurrentLimit: {
      ...s.perSourceCurrentLimit,
      [source]: (s.perSourceCurrentLimit[source] || 0) + by,
    },
  })),
  resetPerSource: (limit) => set({
    perSourceCurrentLimit: {},
    perSourcePage: {},
  }),
}));
