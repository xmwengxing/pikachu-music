// 设置 / 持久化 store
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Playlist, SearchHistoryItem, Track, PlayMode } from '../api/types';
import type { Lang } from '../i18n/translations';
import { PLATFORMS } from '../utils/platforms';

// React Native 端用 AsyncStorage 替代 localStorage
const asyncStorageZustand: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name).then((v) => v ?? null),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};

const DEFAULT_ENABLED: Record<string, boolean> = PLATFORMS
  .filter(p => !p.hidden && !p.loginOnly)
  .reduce((acc, p) => {
    // v1.0.26: 默认开启主平台（聚合源默认关，新装用户需在设置里填入后端地址后手动开启）
    acc[p.id] = ['migu', 'netease', 'qq', 'kugou', 'kuwo'].includes(p.id);
    return acc;
  }, {} as Record<string, boolean>);

/** 本地后端默认启用哪些子源（gomusic 后端的 sources= 参数可取值）
 *  从 PLATFORMS 自动派生：所有有 gomusicId 且不是 loginOnly 的源
 */
const DEFAULT_LOCAL_SOURCES: string[] = PLATFORMS
  .filter(p => p.gomusicId && p.gomusicId !== '' && !p.loginOnly)
  .map(p => p.gomusicId);

export const STORAGE_KEY = 'pikachu-music-state';
const STORAGE_VERSION = 3;

// 一个后端条目
export interface Backend {
  id: string;
  name: string;
  url: string;
  isDefault?: boolean;
  createdAt: number;
}

// v1.0.26：移除 Render 默认后端。
// 新装用户拿到的 backends 是空数组，必须在设置里自行添加/填写后端地址。
// 升级用户的旧值通过 persist 的 partialize 字段保留，不写新 migrate。
const DEFAULT_BACKENDS: Backend[] = [];
const DEFAULT_ACTIVE_ID: string | null = null;

interface SettingsState {
  language: Lang;
  enabledSources: Record<string, boolean>;
  perSourceLimit: number;
  playMode: PlayMode;
  favorites: Track[];
  playlists: Playlist[];
  searchHistory: SearchHistoryItem[];
  volume: number;
  muted: boolean;
  // gomusic 后端地址（云端部署地址，留空 = 关闭聚合回落到 legacy）
  // v21 起标记为 deprecated，但保留读路径做兼容（迁移期内部转 backends[]）
  gomusicBaseUrl: string;
  // 多后端管理（v21+）
  backends: Backend[];
  /** 当前激活后端 id；null = 回落到 backends[0] */
  activeBackendId: string | null;
  // 本地后端（打包进 APK 的 go-music-api）：是否启用 + 启用哪些子源
  localBackendEnabled: boolean;
  localBackendSources: string[];
  // 各平台登录 cookie 的本地备份
  // （Render 免费档磁盘不持久，本地 AsyncStorage 缓存一份供实例重启后恢复）
  cookieBackup: Record<string, string>;

  // actions
  setLanguage: (lang: Lang) => void;
  toggleSource: (id: string, enabled: boolean) => void;
  setPerSourceLimit: (n: number) => void;
  setPlayMode: (m: PlayMode) => void;
  toggleFavorite: (track: Track) => void;
  isFavorite: (uid: string) => boolean;
  addPlaylist: (name: string) => Playlist;
  removePlaylist: (id: string) => void;
  addTrackToPlaylist: (id: string, track: Track) => void;
  removeTrackFromPlaylist: (id: string, uid: string) => void;
  pushSearchHistory: (kw: string) => void;
  clearSearchHistory: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setMuted: (b: boolean) => void;
  cyclePlayMode: () => void;
  setGomusicBaseUrl: (url: string) => void;
  /** 添加一个后端（自动 dedupe by url） */
  addBackend: (b: Omit<Backend, 'id' | 'createdAt'>) => string | null;
  /** 删除一个后端（默认项不可删） */
  removeBackend: (id: string) => void;
  /** 切换激活后端 */
  setActiveBackend: (id: string) => void;
  setLocalBackendEnabled: (b: boolean) => void;
  setLocalBackendSources: (ids: string[]) => void;
  toggleLocalBackendSource: (id: string) => void;
  /** 设置某个平台的本地 cookie 备份（值传空串 = 删除） */
  setCookieBackup: (source: string, cookie: string) => void;
  /** 清空所有平台的本地 cookie 备份 */
  clearCookieBackup: () => void;
  clearFavorites: () => void;
  clearAll: () => void;
  loadFromObject: (data: Partial<SettingsState>) => void;
}

function makePlaylistId(): string {
  return 'pl_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      language: 'zh',
      enabledSources: DEFAULT_ENABLED,
      perSourceLimit: 10,
      playMode: 'list',
      favorites: [],
      playlists: [],
      searchHistory: [],
      volume: 1,
      muted: false,
      gomusicBaseUrl: '',           // v1.0.26: 新装用户无默认 Render 地址
      backends: DEFAULT_BACKENDS,   // []
      activeBackendId: DEFAULT_ACTIVE_ID, // null
      localBackendEnabled: false, // 本地后端已禁用，仅保留 UI 占位
      localBackendSources: DEFAULT_LOCAL_SOURCES,
      cookieBackup: {},

      setLanguage: (lang) => set({ language: lang }),
      toggleSource: (id, enabled) =>
        set(s => ({ enabledSources: { ...s.enabledSources, [id]: enabled } })),
      setPerSourceLimit: (n) => set({ perSourceLimit: n }),
      setPlayMode: (m) => set({ playMode: m }),

      toggleFavorite: (track) => {
        const cur = get().favorites;
        const idx = cur.findIndex(t => t.uid === track.uid);
        set({
          favorites: idx >= 0
            ? cur.filter(t => t.uid !== track.uid)
            : [...cur, track],
        });
      },
      isFavorite: (uid) => get().favorites.some(t => t.uid === uid),

      addPlaylist: (name) => {
        const p: Playlist = { id: makePlaylistId(), name, tracks: [], createdAt: Date.now() };
        set(s => ({ playlists: [...s.playlists, p] }));
        console.log('[settings] playlist created:', p);
        return p;
      },
      removePlaylist: (id) => set(s => ({
        playlists: s.playlists.filter(p => p.id !== id),
      })),
      addTrackToPlaylist: (id, track) => set(s => ({
        playlists: s.playlists.map(p =>
          p.id === id
            ? p.tracks.some(t => t.uid === track.uid)
              ? p
              : { ...p, tracks: [...p.tracks, track] }
            : p),
      })),
      removeTrackFromPlaylist: (id, uid) => set(s => ({
        playlists: s.playlists.map(p =>
          p.id === id ? { ...p, tracks: p.tracks.filter(t => t.uid !== uid) } : p),
      })),

      pushSearchHistory: (kw) => {
        if (!kw) return;
        const list = get().searchHistory.filter(x => x.kw !== kw);
        list.unshift({ kw, at: Date.now() });
        set({ searchHistory: list.slice(0, 50) });
      },
      clearSearchHistory: () => set({ searchHistory: [] }),

      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
      toggleMute: () => set(s => ({ muted: !s.muted })),
      setMuted: (b) => set({ muted: b }),
      cyclePlayMode: () => set(s => {
        const order: PlayMode[] = ['list', 'random', 'single'];
        const idx = order.indexOf(s.playMode);
        return { playMode: order[(idx + 1) % order.length] };
      }),
      setGomusicBaseUrl: (url) => set({ gomusicBaseUrl: url.trim() }),
      addBackend: (b) => {
        const url = b.url.trim().replace(/\/+$/, '');
        if (!url) return null;
        const cur = get().backends;
        // dedupe by url
        if (cur.some(x => x.url.toLowerCase() === url.toLowerCase())) return null;
        const id = 'be_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        const next: Backend = { ...b, id, url, createdAt: Date.now() };
        set({ backends: [...cur, next] });
        return id;
      },
      removeBackend: (id) => set(s => {
        const target = s.backends.find(b => b.id === id);
        if (!target || target.isDefault) return s; // 默认项不可删
        const next = s.backends.filter(b => b.id !== id);
        return {
          backends: next,
          // 如果删的是激活项，回落到第一个
          activeBackendId: s.activeBackendId === id ? (next[0]?.id ?? null) : s.activeBackendId,
        };
      }),
      setActiveBackend: (id) => set(s => {
        if (!s.backends.some(b => b.id === id)) return s;
        return { activeBackendId: id };
      }),
      setLocalBackendEnabled: (b) => set({ localBackendEnabled: b }),
      setLocalBackendSources: (ids) => set({ localBackendSources: ids }),
      toggleLocalBackendSource: (id) => set(s => {
        const cur = s.localBackendSources;
        return {
          localBackendSources: cur.includes(id)
            ? cur.filter(x => x !== id)
            : [...cur, id],
        };
      }),
      setCookieBackup: (source, cookie) => set(s => {
        const next = { ...s.cookieBackup };
        if (!cookie) delete next[source];
        else next[source] = cookie;
        return { cookieBackup: next };
      }),
      clearCookieBackup: () => set({ cookieBackup: {} }),

      clearFavorites: () => set({ favorites: [] }),
      clearAll: () => set({
        favorites: [],
        playlists: [],
        searchHistory: [],
        language: 'zh',
        enabledSources: DEFAULT_ENABLED,
        perSourceLimit: 10,
        playMode: 'list',
        localBackendSources: DEFAULT_LOCAL_SOURCES,
        cookieBackup: {},
      }),

      loadFromObject: (data) => set(s => ({ ...s, ...data })),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => asyncStorageZustand),
      // v21→v22 迁移：旧用户的 activeBackendId 可能为空
      // - backends 缺失则补全为默认列表（Render + G2 维护者参考条目）
      // - activeBackendId 为空时 → 设为 Render 默认（**不要切到 G2**，避免把维护者私有部署暴露给所有人）
      // - 不主动追加 G2，避免污染公开 APK 用户的私货
      migrate: (persisted: any, fromVersion: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted;
        const next: any = { ...persisted };
        if (!Array.isArray(next.backends) || next.backends.length === 0) {
          // v1.0.26: 数据残缺时不再 fallback 到 Render 默认（已删除），新装/兜底均给空
          next.backends = DEFAULT_BACKENDS;
        }
        if (!next.activeBackendId) {
          next.activeBackendId = DEFAULT_ACTIVE_ID;
        }
        return next;
      },
      // 重水化后兜底：用户数据残缺时补默认（不影响已激活条目）
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.backends) || state.backends.length === 0) {
          state.backends = DEFAULT_BACKENDS;
        }
        if (!state.activeBackendId) {
          state.activeBackendId = DEFAULT_ACTIVE_ID;
        }
      },
      partialize: (s) => ({
        language: s.language,
        enabledSources: s.enabledSources,
        perSourceLimit: s.perSourceLimit,
        playMode: s.playMode,
        favorites: s.favorites,
        playlists: s.playlists,
        searchHistory: s.searchHistory.slice(0, 50),
        volume: s.volume,
        muted: s.muted,
        gomusicBaseUrl: s.gomusicBaseUrl,
        backends: s.backends,
        activeBackendId: s.activeBackendId,
        localBackendEnabled: s.localBackendEnabled,
        localBackendSources: s.localBackendSources,
        cookieBackup: s.cookieBackup,
      }),
    },
  ),
);
