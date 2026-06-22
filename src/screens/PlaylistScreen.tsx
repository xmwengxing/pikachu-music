/**
 * PlaylistScreen — 我的收藏 + 自建歌单 + 平台登录
 * 复刻 pikachu-music-desktop 的 PlaylistPanel，但用列表式布局（移动端默认单列）
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useTranslation } from '../i18n/I18nProvider';
import { useSettingsStore } from '../state/settingsStore';
import { usePlayerStore } from '../state/playerStore';
import { colors, fontSize, spacing, radius, globalStyles } from '../theme';
import Animated, { FadeIn, ZoomIn, FadeInDown } from 'react-native-reanimated';
import { useAnimatedPress } from '../hooks/useAnimatedPress';
import Header from '../components/header/Header';
import { useUIStore } from '../state/uiStore';

export default function PlaylistScreen() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const player = usePlayerStore();
  const [tab, setTab] = useState<'favorites' | 'playlists'>('playlists');
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // 根据当前状态决定数据
  const data = tab === 'favorites'
    ? settings.favorites
    : openPlaylistId
      ? settings.playlists.find(p => p.id === openPlaylistId)?.tracks || []
      : []; // 在 playlists tab 未进入具体歌单前显示列表

  return (
    <View style={[globalStyles.container, { flex: 1 }]}>
      <Header title={t('tabPlaylist')} onSettings={() => useUIStore.getState().openSettings()} />
      {/* 顶部 tab 切换：收藏 / 自建歌单 */}
      <View style={styles.tabBar}>
        <TabBtn label={t('tabFavorites')} active={tab === 'favorites'} onPress={() => { setTab('favorites'); setOpenPlaylistId(null); }} />
        <TabBtn label={t('tabCustomLists')} active={tab === 'playlists'} onPress={() => { setTab('playlists'); setOpenPlaylistId(null); }} />
      </View>

      {/* 操作栏 */}
      {tab === 'favorites' && settings.favorites.length > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity onPress={() => settings.clearFavorites()}>
            <Text style={globalStyles.textMuted}>{t('clearAll')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'playlists' && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={globalStyles.buttonPrimary}
            onPress={() => setCreating(true)}
          >
            <Text style={{ color: colors.bg, fontWeight: '700' }}>{t('newPlaylist')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* playlists tab 二级：进入具体歌单时显示「返回」+ 歌单名 */}
      {tab === 'playlists' && openPlaylistId && (
        <View style={styles.actionBar}>
          <TouchableOpacity onPress={() => setOpenPlaylistId(null)}>
            <Text style={globalStyles.textMuted}>← {t('back') || '返回歌单列表'}</Text>
          </TouchableOpacity>
          <Text style={globalStyles.textTitle}>
            {settings.playlists.find(p => p.id === openPlaylistId)?.name}
          </Text>
        </View>
      )}

      {/* 列表：favorites = 歌曲；playlists 未进入 = 歌单列表；playlists 进入 = 歌单歌曲 */}
      {tab === 'playlists' && !openPlaylistId ? (
        // 显示所有自建歌单
        <FlatList
          data={settings.playlists}
          keyExtractor={(p) => p.id}
          style={{ flex: 1 }}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 25).duration(240).springify()}>
              <PlaylistRow
                name={item.name}
                count={item.tracks.length}
                onPress={() => setOpenPlaylistId(item.id)}
                onDelete={() => settings.removePlaylist(item.id)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <View style={globalStyles.center}>
              <Text style={globalStyles.textMuted}>{t('emptyList')}</Text>
            </View>
          }
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}
        />
      ) : (
        // 歌曲列表
        <FlatList
          data={data}
          keyExtractor={(item, idx) => (item as any).uid || `pl-${idx}`}
          style={{ flex: 1 }}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 25).duration(240).springify()}>
              <TrackItem
                track={item as any}
                source={tab === 'favorites' ? 'favorites' : 'playlist'}
                onRemove={() => {
                  if (tab === 'favorites') {
                    settings.toggleFavorite(item as any);
                  } else {
                    // 在 playlist tab，从所属歌单移除
                    const pl = settings.playlists.find(p => p.tracks.some(x => x.uid === (item as any).uid));
                    if (pl) settings.removeTrackFromPlaylist(pl.id, (item as any).uid);
                  }
                }}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <View style={globalStyles.center}>
              <Text style={globalStyles.textMuted}>{t('emptyList')}</Text>
            </View>
          }
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 80 }}
        />
      )}

      {/* 新建歌单弹窗 — Reanimated 动效 */}
      <Modal visible={creating} transparent animationType="none" onRequestClose={() => setCreating(false)}>
        <Animated.View
          entering={FadeIn.duration(180)}
          style={styles.modalBackdrop}
        >
          <Animated.View
            entering={ZoomIn.springify().damping(15)}
            style={styles.modalCard}
          >
            <Text style={globalStyles.textTitle}>{t('newPlaylist')}</Text>
            <TextInput
              style={[globalStyles.input, { marginTop: spacing.md }]}
              placeholder={t('playlistNamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <View style={[globalStyles.row, { marginTop: spacing.md, gap: spacing.sm, justifyContent: 'flex-end' }]}>
              <TouchableOpacity style={globalStyles.buttonSecondary} onPress={() => { setCreating(false); setNewName(''); }}>
                <Text style={{ color: colors.textPrimary }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={globalStyles.buttonPrimary}
                onPress={() => {
                  const name = newName.trim();
                  if (name) {
                    settings.addPlaylist(name);
                    setNewName('');
                    setCreating(false);
                  } else {
                    Alert.alert(t('nameRequired'));
                  }
                }}
              >
                <Text style={{ color: colors.bg, fontWeight: '700' }}>{t('confirm')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlaylistRow({ name, count, onPress, onDelete }: { name: string; count: number; onPress: () => void; onDelete: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Animated.View style={[styles.row, animatedStyle]}>
      <Pressable
        style={[globalStyles.fill, { flexDirection: 'row', alignItems: 'center' }]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <View style={styles.playlistIconBox}>
          <Text style={styles.playlistIconText}>♪</Text>
        </View>
        <View style={[globalStyles.fill, { marginLeft: spacing.sm }]}>
          <Text style={globalStyles.textPrimary} numberOfLines={1}>{name}</Text>
          <Text style={globalStyles.textMuted}>{count} 首</Text>
        </View>
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={8} style={{ padding: spacing.sm }}>
        <Text style={{ color: colors.error, fontSize: 16 }}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

function TrackItem({ track, onRemove, source }: { track: any; onRemove: () => void; source: 'favorites' | 'playlist' }) {
  const { t } = useTranslation();
  const player = usePlayerStore();
  const settings = useSettingsStore();
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  const isFav = settings.isFavorite(track.uid);

  const handlePlay = async () => {
    let detail = track;
    if (!track.detailsLoaded && !track.audioUrl) {
      try {
        const { fetchDetails: gomusicDetails } = await import('../api/gomusic');
        const { fetchMiguDetails, fetchNeteaseDetails, fetchQQDetails, fetchKuwoDetails } = await import('../api/legacySources');
        const fn: Record<string, (t: any) => Promise<any>> = {
          migu: fetchMiguDetails,
          netease: fetchNeteaseDetails,
          qq: fetchQQDetails,
          kuwo: fetchKuwoDetails,
        };
        const detailFn = fn[track.source] || gomusicDetails;
        detail = await detailFn(track);
      } catch (e: any) {
        const code = e?.code ? `[${e.code}] ` : '';
        const cause = e?.cause ? `\n\n诊断：${e.cause}` : '';
        Alert.alert(
          t('playFailed') || '播放失败',
          `${code}${e?.message || String(e)}${cause}`,
        );
        return; // 失败不切 Player
      }
    }
    if (!detail.audioUrl) {
      Alert.alert(
        t('playFailed') || '播放失败',
        t('playFailedNoUrl') || `无法获取播放链接（${detail.title}）。\n可能原因：\n• 网络/CORS 限制\n• 平台 API 暂未返回该曲目的播放地址\n• 平台需要登录（vip / 会员曲目）`,
      );
      return;
    }
    player.setCurrent(detail, { type: source, index: 0, playlistId: source === 'playlist' ? '' : '' } as any);
    import('../navigation/navRef').then(m => m.navigateToPlayer());
  };

  return (
    <Animated.View style={[styles.row, animatedStyle]}>
      <Pressable
        style={[globalStyles.fill, { flexDirection: 'row', alignItems: 'center' }]}
        onPress={handlePlay}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <View style={globalStyles.fill}>
          <Text style={globalStyles.textPrimary} numberOfLines={1}>{track.title}</Text>
          <Text style={globalStyles.textSecondary} numberOfLines={1}>{track.artist}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => settings.toggleFavorite(track)}
        hitSlop={8}
        style={{ padding: spacing.sm }}
      >
        <Text style={{ fontSize: 18, color: isFav ? colors.error : colors.textMuted }}>
          {isFav ? '❤️' : '❤'}
        </Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} style={{ padding: spacing.sm }}>
        <Text style={{ color: colors.error, fontSize: 16 }}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  tabBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  tabBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  tabBtnTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  playlistCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playlistIconBox: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent,
  },
  playlistIconText: {
    color: colors.accent,
    fontSize: 24, fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
  },
  modalBackdrop: {
    flex: 1, backgroundColor: colors.overlay,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
});