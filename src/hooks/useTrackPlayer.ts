/**
 * useTrackPlayer — 替代 Web 版的 useAudioElement
 * 基于 react-native-track-player 5.x，提供 play/pause/seek/volume 状态
 * 后台播放 / 锁屏控件由 track-player 服务自动处理
 * v1.0.26+: 接入 PlayMode（list/random/single）和 toggleMute（真正设 TrackPlayer.setVolume(0)）
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import TrackPlayer, {
  Event,
  State,
  useTrackPlayerEvents,
  useProgress,
  Capability,
  AppKilledPlaybackBehavior,
  RepeatMode,
} from 'react-native-track-player';
import { usePlayerStore } from '../state/playerStore';
import { useSettingsStore } from '../state/settingsStore';
import type { Track, PlayMode } from '../api/types';

// ----- track-player 服务注册（App 启动时调一次） -----
let setupPromise: Promise<void> | null = null;
export async function setupTrackPlayer(): Promise<void> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    try {
      await TrackPlayer.setupPlayer();
    } catch (e: any) {
      // 已经 setup 过会抛 "The player has already been initialized"，忽略
      if (!String(e?.message || '').includes('already been initialized')) {
        throw e;
      }
    }
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior:
          AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      progressUpdateEventInterval: 0.1, // 秒。100ms 更新一次 = 歌词同步精度 ±0.1s
    });
  })();
  return setupPromise;
}

// ----- 主 hook -----
export function useTrackPlayer() {
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const progress = useProgress(100); // 100ms 更新一次（与 track-player 同步事件对齐）
  const playerStore = usePlayerStore();
  const settingsStore = useSettingsStore();

  // 把 store 中的当前 track 同步给 track-player
  const lastUidRef = useRef<string | null>(null);
  useEffect(() => {
    const track = playerStore.currentTrack;
    if (!track || !track.audioUrl) return;
    if (lastUidRef.current === track.uid) return;
    lastUidRef.current = track.uid;
    (async () => {
      try {
        await setupTrackPlayer();
        await TrackPlayer.reset();
        await TrackPlayer.add({
          id: track.uid,
          url: track.audioUrl!,
          title: track.title,
          artist: track.artist,
          artwork: track.cover || undefined,
          duration: track.duration || undefined,
        });
        setIsReady(true);
        // 自动播放
        if (playerStore.playOnLoad) {
          await TrackPlayer.play();
          playerStore.setPlayOnLoad(false);
        }
      } catch (e) {
        console.warn('[useTrackPlayer] load failed', e);
      }
    })();
  }, [playerStore.currentTrack, playerStore.playOnLoad]);

  // 监听播放/暂停状态
  useTrackPlayerEvents([Event.PlaybackState], async (event) => {
    const state = (event as any).state as State | undefined;
    if (state === State.Playing) {
      setIsPlaying(true);
      setIsBuffering(false);
    } else if (state === State.Paused) {
      setIsPlaying(false);
    } else if (state === State.Buffering) {
      setIsBuffering(true);
    } else if (state === State.Ready) {
      setIsBuffering(false);
    } else if (state === State.Ended) {
      // 通知 store 切下一首
      playerStore.notifyTrackEnded?.();
    }
  });

  const play = useCallback(async () => {
    await setupTrackPlayer();
    await TrackPlayer.play();
  }, []);

  const pause = useCallback(async () => {
    await TrackPlayer.pause();
  }, []);

  const togglePlay = useCallback(async () => {
    if (isPlaying) await pause();
    else await play();
  }, [isPlaying, play, pause]);

  const seekTo = useCallback(async (sec: number) => {
    await TrackPlayer.seekTo(sec);
  }, []);

  const next = useCallback(async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch {
      // 列表只有一首时 skipToNext 会抛错，调用方用 store 自己的 next 处理
      playerStore.next();
    }
  }, [playerStore]);

  const previous = useCallback(async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch {
      playerStore.prev();
    }
  }, [playerStore]);

  /**
   * 设置音量 + 自动同步 muted 状态
   * v > 0 → 写入 volume，自动 unmuted（拖滑块恢复声音）
   * v === 0 → 写入 volume + 自动 muted
   */
  const setVolume = useCallback(async (v: number) => {
    const value = Math.max(0, Math.min(1, v));
    await TrackPlayer.setVolume(value);
    playerStore.setVolume(value);
    if (value > 0 && playerStore.muted) playerStore.setMuted(false);
    else if (value === 0 && !playerStore.muted) playerStore.setMuted(true);
  }, [playerStore]);

  /**
   * 真正切换静音（v1.0.26: 之前只改 settings.muted 不调 TrackPlayer）
   * muted=true → TrackPlayer.setVolume(0)
   * muted=false → TrackPlayer.setVolume(savedVol || 0.5)
   */
  const toggleMute = useCallback(async () => {
    const s = useSettingsStore.getState();
    const newMuted = !s.muted;
    if (newMuted) {
      // 静音：记下当前音量（>0 才记，否则记 0.5 兜底），写 0
      s.setMuted(true);
      await TrackPlayer.setVolume(0);
    } else {
      const restore = s.volume > 0 ? s.volume : 0.5;
      s.setMuted(false);
      await TrackPlayer.setVolume(restore);
    }
  }, []);

  /**
   * 把 settings.playMode 应用到 track-player（v1.0.26 接入）
   * - 'single' → RepeatMode.Track
   * - 'list'   → RepeatMode.Queue，且恢复 queueSnapshot 到原顺序
   * - 'random' → RepeatMode.Queue + 应用层洗牌（保留当前 track 首位）
   */
  const applyPlayMode = useCallback(async (mode: PlayMode) => {
    try {
      await setupTrackPlayer();
      if (mode === 'single') {
        await TrackPlayer.setRepeatMode(RepeatMode.Track);
        return;
      }
      // list / random 都用 Queue repeat；随机性靠应用层队列洗牌
      await TrackPlayer.setRepeatMode(RepeatMode.Queue);

      const ps = usePlayerStore.getState();
      const cur = ps.currentTrack;
      const ctx = ps.playContext;
      // ctx.queue 是 PlayContext 内的队列；取 snapshot 优先
      const original = ps.queueSnapshot
        ?? (ctx.type === 'results' ? null : null); // 其他 PlayContext 类型暂不洗
      // 没有 snapshot：当前 list 状态下不动；random 时用当前播放列表作为新 snapshot
      if (mode === 'random') {
        // 优先用 queueSnapshot 作为"原顺序"，否则用 ctx 的列表
        const baseList = ps.queueSnapshot;
        if (!baseList || baseList.length < 2) return;
        const shuffled = [...baseList];
        // 当前 track 移到首位
        if (cur) {
          const curIdx = shuffled.findIndex(t => t.uid === cur.uid);
          if (curIdx > 0) [shuffled[0], shuffled[curIdx]] = [shuffled[curIdx], shuffled[0]];
        }
        // 洗剩余
        for (let i = shuffled.length - 1; i > 1; i--) {
          const j = 1 + Math.floor(Math.random() * i);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        await TrackPlayer.reset();
        await TrackPlayer.add(shuffled.map(t => ({
          id: t.uid,
          url: t.audioUrl || '',
          title: t.title,
          artist: t.artist,
          artwork: t.cover || undefined,
        })));
        if (cur) {
          const idx = shuffled.findIndex(t => t.uid === cur.uid);
          if (idx >= 0) {
            try { await TrackPlayer.skip(idx); } catch {}
          }
          await TrackPlayer.play();
        }
      } else if (mode === 'list' && ps.queueSnapshot) {
        // 恢复原顺序
        const snap = ps.queueSnapshot;
        await TrackPlayer.reset();
        await TrackPlayer.add(snap.map(t => ({
          id: t.uid,
          url: t.audioUrl || '',
          title: t.title,
          artist: t.artist,
          artwork: t.cover || undefined,
        })));
        if (cur) {
          const idx = snap.findIndex(t => t.uid === cur.uid);
          if (idx >= 0) {
            try { await TrackPlayer.skip(idx); } catch {}
          }
          await TrackPlayer.play();
        }
      }
    } catch (e) {
      console.warn('[useTrackPlayer] applyPlayMode failed', mode, e);
    }
  }, []);

  /**
   * 监听 settings.playMode 变化自动应用
   */
  const playMode = useSettingsStore(s => s.playMode);
  useEffect(() => {
    applyPlayMode(playMode);
  }, [playMode, applyPlayMode]);

  return {
    isReady,
    isPlaying,
    isBuffering,
    // 进度（秒）
    position: progress.position,
    duration: progress.duration,
    bufferedPosition: progress.buffered,
    // 动作
    play,
    pause,
    togglePlay,
    seekTo,
    next,
    previous,
    setVolume,
    toggleMute,
    applyPlayMode,
    // 暴露给外部按需调用
    _setReady: setIsReady,
  };
}