/**
 * AddToPlaylistSheet — 把当前播放歌曲加入已有歌单 / 新建歌单
 *
 * 用法（来自 PlayerScreen）：
 *   <AddToPlaylistSheet visible={addOpen} track={currentTrack} onClose={...} />
 */
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn, ZoomIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n/I18nProvider';
import { useSettingsStore } from '../state/settingsStore';
import { useAnimatedPress } from '../hooks/useAnimatedPress';
import { colors, fontSize, spacing, radius, globalStyles } from '../theme';
import type { Track } from '../api/types';

interface Props {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
}

export default function AddToPlaylistSheet({ visible, track, onClose }: Props) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const insets = useSafeAreaInsets();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  if (!track) return null;

  const handleAdd = (playlistId: string) => {
    settings.addTrackToPlaylist(playlistId, track);
    Alert.alert(
      t('added') || '已添加',
      t('addedToPlaylist') || `已加入「${settings.playlists.find(p => p.id === playlistId)?.name}」`,
      [{ text: t('ok') || '好', onPress: onClose }],
    );
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert(t('nameRequired') || '请输入名称');
      return;
    }
    const p = settings.addPlaylist(name);
    settings.addTrackToPlaylist(p.id, track);
    setNewName('');
    setCreating(false);
    Alert.alert(
      t('added') || '已添加',
      t('addedToPlaylist') || `已加入「${name}」`,
      [{ text: t('ok') || '好', onPress: onClose }],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={ZoomIn.springify().damping(15)}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          {/* 顶部条 */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('addToPlaylist') || '加入歌单'}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {track.title} — {track.artist}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            {/* 新建歌单入口 */}
            <Animated.View entering={FadeInDown.duration(200)}>
              <Pressable
                onPress={() => setCreating(c => !c)}
                style={styles.newItem}
              >
                <Text style={styles.newItemIcon}>{creating ? '▼' : '＋'}</Text>
                <Text style={styles.newItemText}>{t('newPlaylist') || '新建歌单'}</Text>
              </Pressable>
            </Animated.View>

            {creating && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.createBox}>
                <TextInput
                  style={[globalStyles.input, { fontSize: fontSize.sm }]}
                  placeholder={t('playlistNamePlaceholder') || '歌单名'}
                  placeholderTextColor={colors.textMuted}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                />
                <View style={[styles.row, { marginTop: spacing.sm, gap: spacing.sm }]}>
                  <SmallButton label={t('cancel') || '取消'} onPress={() => { setCreating(false); setNewName(''); }} />
                  <SmallButton label={t('confirm') || '创建并添加'} onPress={handleCreate} primary />
                </View>
              </Animated.View>
            )}

            {/* 已有歌单列表 */}
            {settings.playlists.length === 0 ? (
              <View style={styles.empty}>
                <Text style={globalStyles.textMuted}>
                  {t('emptyList') || '空空如也 — 先创建一个歌单吧'}
                </Text>
              </View>
            ) : (
              settings.playlists.map((p, i) => {
                const alreadyIn = p.tracks.some(t => t.uid === track.uid);
                return (
                  <Animated.View
                    key={p.id}
                    entering={FadeInDown.delay(50 + i * 40).duration(220).springify()}
                  >
                    <PlaylistRow
                      name={p.name}
                      count={p.tracks.length}
                      alreadyIn={alreadyIn}
                      onPress={() => handleAdd(p.id)}
                    />
                  </Animated.View>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function PlaylistRow({ name, count, alreadyIn, onPress }: {
  name: string; count: number; alreadyIn: boolean; onPress: () => void;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={alreadyIn ? undefined : onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.item, animatedStyle, alreadyIn && styles.itemDone]}>
        <View style={{ flex: 1 }}>
          <Text style={globalStyles.textPrimary} numberOfLines={1}>{name}</Text>
          <Text style={globalStyles.textMuted}>{count} 首</Text>
        </View>
        {alreadyIn ? (
          <Text style={styles.itemOk}>✓ {t_safe('alreadyAdded') || '已添加'}</Text>
        ) : (
          <Text style={styles.itemAdd}>＋</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

function SmallButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.btn,
          primary && styles.btnPrimary,
          animatedStyle,
        ]}
      >
        <Text style={[styles.btnText, primary && { color: colors.bg }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// i18n 缺失 key 的兜底（不抛错）
function t_safe(key: string): string {
  return key;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  close: {
    color: colors.textMuted,
    fontSize: 24,
    padding: 4,
  },
  newItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  newItemIcon: {
    fontSize: 18,
    color: colors.accent,
    marginRight: spacing.sm,
    fontWeight: '700',
  },
  newItemText: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  createBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  itemDone: {
    opacity: 0.5,
  },
  itemAdd: {
    fontSize: 20,
    color: colors.accent,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  itemOk: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '600',
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  btnText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
