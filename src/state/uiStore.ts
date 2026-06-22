// UI 状态：高频更新（歌词当前行、audio level）独立 store，
// 避免触发 playerStore 其他组件 re-render
import { create } from 'zustand';

interface UIState {
  currentLyricIndex: number;
  audioLevel: number;
  toast: string;
  /** 设置面板是否打开（App 根唯一 mount，三 Tab 共享） */
  settingsOpen: boolean;
  setCurrentLyricIndex: (i: number) => void;
  setAudioLevel: (v: number) => void;
  setToast: (msg: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentLyricIndex: -1,
  audioLevel: 0,
  toast: '',
  settingsOpen: false,
  setCurrentLyricIndex: (i) => set({ currentLyricIndex: i }),
  setAudioLevel: (v) => set({ audioLevel: v }),
  setToast: (msg) => set({ toast: msg }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
