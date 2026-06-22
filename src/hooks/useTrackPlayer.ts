/**
 * useTrackPlayer — 替代 Web 版的 useAudioElement
 * 基于 react-native-track-player 4.x，提供 play/pause/seek/volume 状态
 * 后台播放 / 锁屏控件由 track-player 服务自动处理
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import TrackPlayer, {
  Event,
  State,
  useTrackPlayerEvents,
  useProgress,
  Capability,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { usePlayerStore } from '../state/playerStore';
import type { Track } from '../api/types';

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

  const setVolume = useCallback(async (v: number) => {
    const value = Math.max(0, Math.min(1, v));
    await TrackPlayer.setVolume(value);
    playerStore.setVolume(value);
  }, [playerStore]);

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
    // 暴露给外部按需调用
    _setReady: setIsReady,
  };
}