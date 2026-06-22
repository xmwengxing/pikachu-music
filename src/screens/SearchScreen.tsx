/**
 * SearchScreen — 搜索 + 平台切换 + 结果列表
 * 复刻 pikachu-music-desktop 的 SearchPanel，但用 RN 组件 + TouchableOpacity
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useTranslation } from '../i18n/I18nProvider';
import { useSettingsStore } from '../state/settingsStore';
import { useSearchStore } from '../state/searchStore';
import { useAnimatedPress } from '../hooks/useAnimatedPress';
import Header from '../components/header/Header';
import { colors, fontSize, spacing, radius, globalStyles } from '../theme';
import { PLATFORMS, sourceKey } from '../utils/platforms';
import { searchByTag as gomusicSearch, searchLocalAggregate, fetchDetails as gomusicDetails } from '../api/gomusic';
import type { Track } from '../api/types';
import PlatformMultiSelect from '../components/PlatformMultiSelect';
import { useUIStore } from '../state/uiStore';

const LEGACY_TAGS = new Set(['migu', 'netease', 'qq', 'kuwo']);
const LEGACY_SEARCH: Record<string, (kw: string, limit: number) => Promise<Track[]>> = {
  migu: (kw, l) => import('../api/legacySources').then(m => m.searchMigu(kw, l)),
  netease: (kw, l) => import('../api/legacySources').then(m => m.searchNetease(kw, l)),
  qq: (kw, l) => import('../api/legacySources').then(m => m.searchQQ(kw, l)),
  kuwo: (kw, l) => import('../api/legacySources').then(m => m.searchKuwo(kw, l)),
};
const LEGACY_DETAIL: Record<string, (track: Track) => Promise<Track>> = {
  migu: (t) => import('../api/legacySources').then(m => m.fetchMiguDetails(t)),
  netease: (t) => import('../api/legacySources').then(m => m.fetchNeteaseDetails(t)),
  qq: (t) => import('../api/legacySources').then(m => m.fetchQQDetails(t)),
  kuwo: (t) => import('../api/legacySources').then(m => m.fetchKuwoDetails(t)),
};

export default function SearchScreen() {
  const { t } = useTranslation();
  const { language, enabledSources, perSourceLimit, pushSearchHistory, setPerSourceLimit } = useSettingsStore();
  const searchStore = useSearchStore();
  const [keyword, setKeyword] = useState('');
  const [activeSource, setActiveSource] = useState<string>('all');
  const [appended, setAppended] = useState(0); // 已追加页数（每页 perSourceLimit 个）
  const [loading, setLoading] = useState(false);
  // 歌手筛选：null = 全部；非空 = 只显示该歌手的歌曲
  const [artistFilter, setArtistFilter] = useState<string | null>(null);

  const visiblePlatforms = PLATFORMS.filter(p => enabledSources[p.id] !== false && !p.hidden);

  const doSearch = useCallback(async (kw: string, source: string, page = 0) => {
    if (!kw.trim()) return;
    setLoading(true);
    const isFirstPage = page === 0;
    if (isFirstPage) {
      searchStore.clear();
      searchStore.setNoMore(false);
      setAppended(0);
      setArtistFilter(null); // 新搜索：清掉歌手筛选
      searchStore.setStatus(`${t('searchStatusSearching')}: ${kw}`);
      searchStore.setKeyword(kw);
    } else {
      searchStore.setStatus(`${t('searchStatusSearching')}: ${kw} (第${page + 1}页)`);
    }
    try {
      const sources = source === 'all'
        ? visiblePlatforms.map(p => p.id)
        : [source];
      const limit = perSourceLimit * (page + 1);
      await Promise.allSettled(sources.map(async (src) => {
        try {
          let tracks: Track[] = [];
          if (src === 'gomusic') {
            // 聚合模式：用 settings.localBackendSources 中所有子源并发搜索
            tracks = await searchLocalAggregate(kw, limit);
          } else if (LEGACY_TAGS.has(src)) {
            const fn = LEGACY_SEARCH[src];
            tracks = await fn(kw, limit);
          } else {
            tracks = await gomusicSearch(src, kw, limit);
          }
          if (isFirstPage) {
            searchStore.addResults(tracks);
          } else {
            // 追加模式：去重
            const existing = new Set(searchStore.results.map(t => t.uid));
            const newTracks = tracks.filter(t => !existing.has(t.uid));
            searchStore.addResults(newTracks);
          }
        } catch (e) {
          console.warn(`[SearchScreen] ${src} failed:`, e);
        }
      }));
      const totalLoaded = searchStore.results.length;
      // 简单判断是否还有更多：每个源返回数 < 期望的 limit 才视为到末尾
      if (totalLoaded > 0 && totalLoaded < perSourceLimit * sources.length * (page + 1) * 0.5) {
        searchStore.setNoMore(true);
      }
      searchStore.setStatus(`${t('searchStatusDone')}: ${totalLoaded}`);
      if (isFirstPage) pushSearchHistory(kw);
    } catch (e) {
      searchStore.setStatus(t('searchStatusFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, visiblePlatforms, perSourceLimit, searchStore, pushSearchHistory]);

  const handleLoadMore = () => {
    const nextPage = appended + 1;
    setAppended(nextPage);
    doSearch(searchStore.keyword, activeSource, nextPage);
  };

  // 歌手筛选派生数据 —— 不污染 searchStore.results
  // 1) artists：去重的歌手列表（trim 后原样比对，避免 "周杰伦" / "周杰伦 " 算两个）
  // 2) visibleResults：按 artistFilter 过滤后的结果数组
  const artists = useMemo(() => {
    const set = new Set<string>();
    for (const t of searchStore.results) {
      const a = (t.artist || '').trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [searchStore.results]);

  const visibleResults = useMemo(() => {
    if (!artistFilter) return searchStore.results;
    return searchStore.results.filter(t => (t.artist || '').trim() === artistFilter);
  }, [searchStore.results, artistFilter]);

  const handlePlay = useCallback(async (track: Track) => {
    try {
      let detail = track;
      if (!track.detailsLoaded) {
        const fn = LEGACY_DETAIL[track.source] || (track.source === 'gomusic' || !LEGACY_TAGS.has(track.source)
          ? (t: Track) => gomusicDetails(t)
          : null);
        if (fn) detail = await fn(track);
        else throw new Error('no detail fetcher for ' + track.source);
      }
      // 二次校验：audioUrl 必须有，否则视为失败
      if (!detail.audioUrl) {
        throw new Error(
          t('playFailedNoUrl') || `无法获取播放链接（${detail.title}）。\n可能原因：\n• 网络/CORS 限制\n• 平台 API 暂未返回该曲目的播放地址\n• 平台需要登录（vip / 会员曲目）`
        );
      }
      // 通过 playerStore 切换
      const { usePlayerStore } = await import('../state/playerStore');
      const idx = searchStore.results.findIndex(t => t.uid === detail.uid);
      usePlayerStore.getState().setCurrent(detail, { type: 'results', index: idx >= 0 ? idx : 0 });
      // 切到 Player tab
      const { navigateToPlayer } = await import('../navigation/navRef');
      navigateToPlayer();
    } catch (e: any) {
      // 失败：只弹 alert，**不切到 Player 页**（避免"切过去却播不出"的错位体验）
      // 同时把当前 track 从 playerStore 里清掉，避免脏数据
      try {
        const { usePlayerStore } = await import('../state/playerStore');
        // 如果失败的是当前正在播放的歌曲 → 退回上首有效歌曲；否则只重置 isPlaying
        const cur = usePlayerStore.getState().currentTrack;
        if (cur && cur.uid === track.uid) {
          // 调用 useTrackPlayer 的自动 next/prev 逻辑
          usePlayerStore.setState({ isPlaying: false });
        }
      } catch {}
      // QQPlayError 带 code 字段，提示里加上错误码便于排查
      const code = e?.code ? `[${e.code}] ` : '';
      const cause = e?.cause ? `\n\n诊断：${e.cause}` : '';
      const msg = `${code}${e?.message || String(e)}${cause}`;
      Alert.alert(t('playFailed') || '播放失败', msg);
    }
  }, [searchStore.results, t]);

  return (
    <View style={globalStyles.container}>
      <Header title={t('tabSearch')} onSettings={() => useUIStore.getState().openSettings()} />
      {/* 顶部搜索框：输入框全宽，按钮固定宽度 */}
      <View style={styles.searchBar}>
        <TextInput
          style={[globalStyles.input, { flex: 1 }]}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={() => doSearch(keyword, activeSource)}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[globalStyles.buttonPrimary, { marginLeft: spacing.sm }]}
          onPress={() => doSearch(keyword, activeSource)}
        >
          <Text style={{ color: colors.bg, fontWeight: '700' }}>{t('searchButton')}</Text>
        </TouchableOpacity>
      </View>

      {/* 平台选择 chips：用普通 flex wrap 行，不用 ScrollView（避免水平 ScrollView 高度计算异常） */}
      <View style={styles.chipsRow}>
        <Chip
          label={t('searchSourceAll')}
          active={activeSource === 'all'}
          onPress={() => setActiveSource('all')}
        />
        {/* 主平台（legacy 独立 API）：从 PLATFORMS.primary 派生，自动跟随 platforms.ts 变更 */}
        {PLATFORMS
          .filter(p => p.primary && p.id !== 'gomusic')
          .map(p => (
            <Chip
              key={p.id}
              label={t(sourceKey(p.id) as any) || p.label}
              active={activeSource === p.id}
              onPress={() => setActiveSource(p.id)}
            />
          ))}
        {/* 聚合 (go-music-api) 折叠多选：始终显示，不管 enabledSources */}
        <PlatformMultiSelect
          label={t('sourceGomusic')}
          active={activeSource === 'gomusic'}
          onPress={() => setActiveSource('gomusic')}
        />
      </View>

      {/* 每页数量 + 加载更多 */}
      {searchStore.results.length > 0 && (
        <View style={styles.controlsRow}>
          <Text style={globalStyles.textMuted}>
            {t('searchStatusDone')}: {searchStore.results.length}
          </Text>
          <View style={[globalStyles.row, { gap: spacing.xs }]}>
            <Text style={globalStyles.textMuted}>{t('perSourceCount')}</Text>
            {[5, 10, 20, 30].map(n => (
              <LimitBtn key={n} n={n} active={perSourceLimit === n} onPress={() => {
                setPerSourceLimit(n);
                doSearch(keyword, activeSource, 0);
              }} />
            ))}
          </View>
        </View>
      )}

      {/* 歌手筛选 chips：横向滚动，单选 + "全部" 第一个 */}
      {artists.length > 0 && (
        <View style={styles.artistChipsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.md }}
          >
            <Chip
              label={'全部'}
              active={artistFilter === null}
              onPress={() => setArtistFilter(null)}
            />
            {artists.map(a => (
              <Chip
                key={a}
                label={a}
                active={artistFilter === a}
                onPress={() => setArtistFilter(artistFilter === a ? null : a)}
              />
            ))}
          </ScrollView>
          {artistFilter && (
            <Text style={styles.artistCount}>
              {visibleResults.length}/{searchStore.results.length}
            </Text>
          )}
        </View>
      )}

      {/* 结果列表：从顶部开始，不垂直居中 */}
      <FlatList
        data={visibleResults}
        keyExtractor={(item) => item.uid}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.delay(Math.min(index, 8) * 30).duration(260).springify()}
          >
            <TrackRow
              track={item}
              index={index}
              onPlay={() => handlePlay(item)}
            />
          </Animated.View>
        )}
        contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 80 }}
        ListFooterComponent={
          !loading && searchStore.results.length > 0 && !searchStore.noMore ? (
            <Pressable
              style={styles.loadMoreBtn}
              onPress={handleLoadMore}
            >
              <Text style={styles.loadMoreText}>{t('loadMore') || '加载更多'}</Text>
            </Pressable>
          ) : !loading && searchStore.noMore && searchStore.results.length > 0 ? (
            <Text style={[globalStyles.textMuted, { textAlign: 'center', padding: spacing.md }]}>
              {t('noMore') || '已显示全部结果'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : artistFilter ? (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text style={globalStyles.textMuted}>{artistFilter} · 暂无结果</Text>
              <Pressable onPress={() => setArtistFilter(null)} hitSlop={8}>
                <Text style={{ color: colors.accent, marginTop: spacing.sm }}>{t('clearAll')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <Text style={globalStyles.textMuted}>{t('searchStatusIdle')}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableChip label={label} active={active} onPress={onPress} />
  );
}

function LimitBtn({ n, active, onPress }: { n: number; active: boolean; onPress: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={4}>
      <Animated.View style={[styles.limitBtn, active && styles.limitBtnActive, animatedStyle]}>
        <Text style={[styles.limitText, active && styles.limitTextActive]}>{n}</Text>
      </Animated.View>
    </Pressable>
  );
}

function PressableChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          globalStyles.chip,
          active && globalStyles.chipActive,
          animatedStyle,
        ]}
      >
        <Text style={[globalStyles.chipText, active && globalStyles.chipTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function TrackRow({ track, index, onPlay }: { track: Track; index: number; onPlay: () => void }) {
  const { t } = useTranslation();
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ pressScale: 0.98 });
  return (
    <Pressable onPress={onPlay} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.row, animatedStyle]}>
        <Text style={styles.index}>{index + 1}</Text>
        <View style={globalStyles.fill}>
          <Text style={globalStyles.textPrimary} numberOfLines={1}>{track.title}</Text>
          <Text style={globalStyles.textSecondary} numberOfLines={1}>
            {track.artist} · {t(sourceKey(track.source) as any) || track.source}
            {track.qualityLabel ? ` · ${track.qualityLabel}` : ''}
          </Text>
        </View>
        <Text style={styles.playIcon}>▶</Text>
    </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  artistChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  artistCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    paddingRight: spacing.md,
    paddingLeft: spacing.xs,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  limitBtn: {
    minWidth: 32,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  limitBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  limitText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  limitTextActive: {
    color: colors.bg,
  },
  loadMoreBtn: {
    margin: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  loadMoreText: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  index: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    width: 28,
    textAlign: 'center',
  },
  playIcon: {
    color: colors.accent,
    fontSize: 16,
    paddingHorizontal: spacing.sm,
  },
});