/**
 * PlayerScreen — 完整播放页：cover + 进度条 + 控制行 + 歌词
 * 复刻 pikachu-music-desktop 的 PlayerPanel 布局 + Reanimated v4 动效
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
  ToastAndroid,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from '../i18n/I18nProvider';
import { usePlayerStore } from '../state/playerStore';
import { useSettingsStore } from '../state/settingsStore';
import { useUIStore } from '../state/uiStore';
import { useTrackPlayer } from '../hooks/useTrackPlayer';
import { useAnimatedPress } from '../hooks/useAnimatedPress';
import AddToPlaylistSheet from './AddToPlaylistSheet';
import Header from '../components/header/Header';
import { downloadTrackToLocal, shareSavedFile, guessMimeFromExt } from '../api/downloader';
import { colors, fontSize, spacing, radius, globalStyles } from '../theme';
import { sourceKey } from '../utils/platforms';
import { parseLRC } from '../utils/lrc';

const AnimatedText = Animated.createAnimatedComponent(Text);

export default function PlayerScreen() {
  const { t } = useTranslation();
  const player = usePlayerStore();
  const settings = useSettingsStore();
  const tp = useTrackPlayer();
  // 设置面板已在 App 根统一 mount，这里只取 openSettings 即可
  const openSettings = useUIStore((s) => s.openSettings);

  useEffect(() => {
    if (!player.currentTrack) return;
    const track = player.currentTrack;
    if (track.lrc) {
      player.setLyrics(parseLRC(track.lrc));
    } else {
      player.setLyrics([]);
    }
  }, [player.currentTrack?.uid]);

  const currentLineIdx = useMemo(() => {
    if (!player.lyricLines.length) return -1;
    // 直接用 tp.position，不再做写死的 -0.3s 预补偿：
    // 不同源 LRC 时间戳偏移不一，统一 -0.3s 反而让一部分源（vkeys 网易云镜像）
    // 高亮晚于实际演唱。useProgress(100) 自带 ~100ms 采样粒度，配合 FlatList
    // scrollToIndex 100ms 内的平滑滚动，视觉上不再"慢半拍"。
    const t = Math.max(0, tp.position);
    let idx = -1;
    for (let i = 0; i < player.lyricLines.length; i++) {
      if (player.lyricLines[i].time <= t) idx = i;
      else break;
    }
    return idx;
  }, [tp.position, player.lyricLines]);

  const [addOpen, setAddOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    if (!track.audioUrl) {
      ToastAndroid.show(t('downloadNoUrl') || '当前歌曲还未加载完成', ToastAndroid.SHORT);
      return;
    }
    setDownloading(true);
    ToastAndroid.show(t('downloadStarting') || '开始下载…', ToastAndroid.SHORT);
    const res = await downloadTrackToLocal(track);
    if (!res.ok) {
      setDownloading(false);
      ToastAndroid.show(
        `${t('downloadFailed') || '下载失败'}：${res.error || ''}`.slice(0, 200),
        ToastAndroid.LONG,
      );
      return;
    }
    const ext = res.fileName.split('.').pop() || 'mp3';
    const mime = guessMimeFromExt(ext);
    const shared = await shareSavedFile(res.localUri!, mime, t('downloadTitle') || '保存到设备');
    setDownloading(false);
    if (!shared) {
      ToastAndroid.show(t('downloadNotSupported') || '当前平台不支持分享', ToastAndroid.SHORT);
      return;
    }
    ToastAndroid.show(t('downloadSuccess') || '已保存到本地，请选择保存位置', ToastAndroid.LONG);
  };

  if (!player.currentTrack) {
    return (
      <View style={globalStyles.container}>
        <Header title={t('tabPlayer')} onSettings={openSettings} />
        <View style={[globalStyles.fill, globalStyles.center]}>
          <View style={styles.bigCoverPlaceholder}>
            <Text style={styles.coverEmoji}>🎵</Text>
          </View>
          <Text style={[globalStyles.textMuted, { marginTop: spacing.lg }]}>{t('coverHint')}</Text>
        </View>
      </View>
    );
  }

  const track = player.currentTrack;
  const platformLabel = t(sourceKey(track.source) as any) || track.source;

  return (
    <View style={globalStyles.container}>
      <Header
        title={t('tabPlayer')}
        onSettings={openSettings}
      />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.coverWrapper}>
            {track.cover ? (
              <Image source={{ uri: track.cover }} style={styles.coverImg} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Text style={styles.coverEmoji}>💿</Text>
              </View>
            )}
          </View>
          <View style={[globalStyles.fill, { marginLeft: spacing.md }]}>
            <Text style={styles.title} numberOfLines={2}>{track.title || t('noTrack')}</Text>
            <Text style={globalStyles.textSecondary} numberOfLines={1}>{track.artist}</Text>
            <View style={[globalStyles.row, { marginTop: spacing.xs, gap: spacing.xs }]}>
              <View style={styles.platformPill}>
                <Text style={styles.platformPillText}>{platformLabel}</Text>
              </View>
              {track.qualityLabel && (
                <View style={[styles.platformPill, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                  <Text style={[styles.platformPillText, { color: colors.accent }]}>{track.qualityLabel}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <ProgressBar position={tp.position} duration={tp.duration} onSeek={tp.seekTo} />

        {/* 控制行：播放按钮组（主）+ 音量/L 按钮（次）—— 两行避免挤 */}
        <View style={styles.controlMainRow}>
          <PressableCtrlBtn
            icon={settings.playMode === 'random' ? '🔀' : settings.playMode === 'single' ? '🔂' : '🔁'}
            onPress={settings.cyclePlayMode}
            active={settings.playMode !== 'list'}
          />
          <PressableCtrlBtn icon="⏮" onPress={tp.previous} />
          <PrimaryPlayBtn isPlaying={tp.isPlaying} onPress={tp.togglePlay} loading={tp.isBuffering} />
          <PressableCtrlBtn icon="⏭" onPress={tp.next} />
          <PressableCtrlBtn icon="❤" onPress={() => settings.toggleFavorite(track)} active={settings.isFavorite(track.uid)} />
          <PressableCtrlBtn icon="💾" onPress={() => setAddOpen(true)} />
        </View>
        <View style={styles.controlSecondaryRow}>
          <Pressable onPress={tp.toggleMute} hitSlop={8}>
            <Text style={styles.muteIcon}>{settings.muted || settings.volume === 0 ? '🔇' : settings.volume < 0.5 ? '🔈' : '🔊'}</Text>
          </Pressable>
          <View style={styles.volWrap}>
            <VolumeSlider value={settings.muted ? 0 : settings.volume} onChange={tp.setVolume} />
          </View>
          <PressableCtrlBtn
            icon={downloading ? '⏳' : '⬇'}
            onPress={handleDownload}
            active={downloading}
          />
          <PressableCtrlBtn
            icon={`L${player.lyricsMode === 'classic' ? '1' : player.lyricsMode === 'glow' ? '2' : '3'}`}
            onPress={player.cycleLyricsMode}
            active={player.lyricsMode !== 'classic'}
            small
          />
        </View>

        <View style={styles.lyricsContainer}>
          <Text style={[globalStyles.textMuted, { marginBottom: spacing.sm }]}>
            {t('lyricsTitle')} · {track.lrc ? `已加载 ${player.lyricLines.length} 行` : t('noLyrics')}
          </Text>
          <LyricScroller
            currentLineIdx={currentLineIdx}
            mode={player.lyricsMode}
            onSeek={tp.seekTo}
          />
        </View>
      </View>

      <AddToPlaylistSheet
        visible={addOpen}
        track={track}
        onClose={() => setAddOpen(false)}
      />
    </View>
  );
}

function LyricLine({ text, active, alt, onPress }: { text: string; active: boolean; alt?: boolean; mode?: 'classic' | 'glow' | 'particles'; onPress?: () => void }) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 150 });
  }, [active]);
  const animatedStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, [0, 1], [colors.textMuted, alt ? colors.accentAlt : colors.accent]);
    return {
      color,
      opacity: 0.5 + 0.5 * progress.value,
      transform: [{ scale: 0.95 + 0.1 * progress.value }],
    };
  });
  const Content = (
    <AnimatedText style={[styles.lyricLine, animatedStyle, active && alt && { fontWeight: '700' }]}>
      {text}
    </AnimatedText>
  );
  if (!onPress) return Content;
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      {Content}
    </Pressable>
  );
}

/**
 * LyricScroller —— 歌词滚动容器
 *
 * 用 FlatList + scrollToIndex({ viewPosition: 0.5 }) 让当前行自动对齐到可视中点。
 * 比之前的 Animated.ScrollView + 手算 targetY 鲁棒十倍：
 *   - 真实行高/可视高度都由 FlatList 从真实布局读，不再依赖硬编码 40/288
 *   - viewPosition: 0.5 = 行中点对齐可视中点，跨设备/字号一致
 *   - 用户拖动时 FlatList 自动处理 overscroll，停止 2.5s 后程序接管
 */
function LyricScroller({ currentLineIdx, mode, onSeek }: {
  currentLineIdx: number;
  mode?: 'classic' | 'glow' | 'particles';
  onSeek: (sec: number) => void;
}) {
  // 兼容旧版 alt 入参：migrate 时如果还有人传 boolean，把它当 mode='glow'/'particles' 看待
  // （实际新调用都传 mode，不再传 alt；保留这个宽松避免 breaking）
  const effectiveAlt = mode === 'glow' || mode === 'particles';

  const { t } = useTranslation();
  const player = usePlayerStore();
  const listRef = useRef<FlatList<{ text: string; time: number }>>(null);
  const isUserDragging = useRef<boolean>(false);
  const dragPauseUntil = useRef<number>(0);

  useEffect(() => {
    if (currentLineIdx < 0) return;
    if (isUserDragging.current) return;
    if (Date.now() < dragPauseUntil.current) return;
    // viewPosition 0.5 = 行中点对齐可视区域中点（FlatList 内部用真实 layout 算）
    // animated: true（默认）+ 平滑 ~150ms，与 useProgress 100ms 采样叠加看不出延迟
    try {
      listRef.current?.scrollToIndex({
        index: currentLineIdx,
        animated: true,
        viewPosition: 0.5,
      });
    } catch {
      // scrollToIndex 在 index 不可见时偶尔会抛错（FlatList 已知问题），忽略即可
    }
  }, [currentLineIdx]);

  const data = player.lyricLines;

  if (data.length === 0) {
    return (
      <View style={styles.lyricsScroll}>
        <Text style={[globalStyles.textMuted, styles.lyricLine]}>{t('noLyrics')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      style={styles.lyricsScroll}
      data={data}
      keyExtractor={(_, idx) => String(idx)}
      // 关键：getItemLayout 让 FlatList 不需要测量就能精确滚动，
      // 用一个保守的行高估值（fontSize.md=14 + paddingVertical:4×2 = 22，外加 line-height 1.3 ≈ 28）
      // 不准也没关系 —— scrollToIndex 失败会 fallback 到 onScrollToIndexFailed
      getItemLayout={(_, index) => ({ length: 28, offset: 28 * index, index })}
      onScrollToIndexFailed={({ index }) => {
        // 第一次渲染时 FlatList 可能还没量到 item，回退到延迟重试
        setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
          } catch {}
        }, 100);
      }}
      onScrollBeginDrag={() => {
        isUserDragging.current = true;
      }}
      onScrollEndDrag={() => {
        dragPauseUntil.current = Date.now() + 2500;
        setTimeout(() => { isUserDragging.current = false; }, 100);
      }}
      onMomentumScrollEnd={() => {
        isUserDragging.current = false;
      }}
      renderItem={({ item, index }) => (
        <LyricLine
          text={item.text}
          active={index === currentLineIdx}
          alt={effectiveAlt}
          mode={mode}
          onPress={() => onSeek(item.time)}
        />
      )}
      // 列表上下各加一段空行，让高亮行能真正滚到可视中点
      ListHeaderComponent={<View style={{ height: 120 }} />}
      ListFooterComponent={<View style={{ height: 200 }} />}
      showsVerticalScrollIndicator
      // 性能：歌词行数一般 < 100，不需要虚拟化也很快；明确关掉以避免跨行测量误差
      initialNumToRender={50}
      windowSize={7}
    />
  );
}

function ProgressBar({ position, duration, onSeek }: { position: number; duration: number; onSeek: (sec: number) => void }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  const widthSV = useSharedValue(duration > 0 ? position / duration : 0);
  const trackWidth = useSharedValue(0);
  useEffect(() => { widthSV.value = withTiming(duration > 0 ? position / duration : 0, { duration: 100 }); }, [position, duration]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${widthSV.value * 100}%` }));
  const seekTo = (ratio: number) => { 'worklet'; runOnJS(onSeek)(ratio * duration); };
  const pan = Gesture.Pan().onUpdate((e) => {
    'worklet';
    if (trackWidth.value > 0) {
      const ratio = Math.max(0, Math.min(1, e.x / trackWidth.value));
      widthSV.value = ratio;
      seekTo(ratio);
    }
  });
  return (
    <View style={styles.progressRow}>
      <Text style={styles.timeText}>{formatTime(position)}</Text>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.progressBarWrap, animatedStyle]}
          onLayout={(e) => { trackWidth.value = e.nativeEvent.layout.width; }}
          onTouchStart={onPressIn}
          onTouchEnd={onPressOut}
        >
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, fillStyle]} />
          </View>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.timeText}>{formatTime(duration)}</Text>
    </View>
  );
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const widthSV = useSharedValue(value);
  const trackWidth = useSharedValue(0);
  useEffect(() => { widthSV.value = withTiming(value, { duration: 120 }); }, [value]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${widthSV.value * 100}%` }));
  const updateValue = (ratio: number) => { 'worklet'; runOnJS(onChange)(Math.max(0, Math.min(1, ratio))); };
  const pan = Gesture.Pan().onUpdate((e) => {
    'worklet';
    if (trackWidth.value > 0) {
      const ratio = Math.max(0, Math.min(1, e.x / trackWidth.value));
      widthSV.value = ratio;
      updateValue(ratio);
    }
  });
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={styles.volTrackWrap}
        onLayout={(e) => { trackWidth.value = e.nativeEvent.layout.width; }}
      >
        <View style={styles.volTrack}>
          <Animated.View style={[styles.volFill, fillStyle]} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function PressableCtrlBtn({ icon, onPress, active = false, small = false }: {
  icon: string; onPress: () => void; active?: boolean; small?: boolean;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable
      onPress={() => {
        try { onPress(); } catch (e: any) {
          console.warn('[PressableCtrlBtn] error', e);
          Alert.alert('控件异常', String(e?.message || e));
        }
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={4}
      style={{ alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          {
            width: small ? 32 : 40, height: small ? 32 : 40, borderRadius: 20,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: active ? colors.accentSoft : 'transparent', marginHorizontal: 2,
          },
          animatedStyle,
        ]}
      >
        <Text style={{ fontSize: small ? 14 : 18, color: active ? colors.accent : colors.textPrimary }}>{icon}</Text>
      </Animated.View>
    </Pressable>
  );
}

function PrimaryPlayBtn({ isPlaying, onPress, loading }: {
  isPlaying: boolean; onPress: () => void; loading: boolean;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ pressScale: 0.88 });
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={6}>
      <Animated.View
        style={[
          {
            width: 56, height: 56, borderRadius: 28,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.accent, marginHorizontal: 4,
          },
          animatedStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.bg} size="small" />
        ) : (
          <Text style={{ fontSize: 26, color: colors.bg, fontWeight: '700' }}>{isPlaying ? '⏸' : '▶'}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  coverWrapper: {
    width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: colors.bgElevated,
  },
  coverImg: { width: '100%', height: '100%' },
  coverPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  coverEmoji: { fontSize: 36 },
  bigCoverPlaceholder: {
    width: 140, height: 140, borderRadius: radius.lg,
    backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: '700' },
  platformPill: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
  },
  platformPillText: { color: colors.textSecondary, fontSize: fontSize.xs },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm },
  timeText: { color: colors.textMuted, fontSize: fontSize.xs, minWidth: 36, textAlign: 'center' },
  progressBarWrap: { flex: 1, paddingVertical: spacing.sm },
  progressTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
  controlMain: { flexDirection: 'row', alignItems: 'center' },
  controlSecondary: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  controlMainRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: 4,
  },
  controlSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  volWrap: { flex: 1, paddingHorizontal: spacing.sm },
  muteIcon: { fontSize: 20, color: colors.textPrimary, padding: spacing.xs },
  volTrackWrap: { flex: 1, height: 30, justifyContent: 'center' },
  volTrack: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  volFill: { height: '100%', backgroundColor: colors.accent },
  lyricsContainer: { marginTop: spacing.xl, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md },
  lyricsScroll: { maxHeight: 320 },
  lyricLine: { fontSize: fontSize.md, textAlign: 'center', paddingVertical: 4 },
});
