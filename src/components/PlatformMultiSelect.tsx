/**
 * PlatformMultiSelect — 聚合源多选下拉弹窗
 * - 替代原 chip 行的"聚合 (go-music-api)"标签
 * - 点击展开弹窗，列出 settings.localBackendSources 涉及的子源
 * - 支持单选切换、全选、清空
 * - 改动直接写入 useSettingsStore.setLocalBackendSources / toggleLocalBackendSource
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useTranslation } from '../i18n/I18nProvider';
import { useSettingsStore } from '../state/settingsStore';
import { PLATFORMS, sourceKey } from '../utils/platforms';
import { useAnimatedPress } from '../hooks/useAnimatedPress';
import { colors, fontSize, spacing, radius, globalStyles } from '../theme';

interface PlatformMultiSelectProps {
  /** chip 显示文字（默认 "聚合 ▾"） */
  label?: string;
  /** 是否高亮（activeSource === 'gomusic' 时为 true） */
  active?: boolean;
  /** 点击 chip 时触发，用于切换 activeSource */
  onPress?: () => void;
}

// 可作为"聚合子源"的所有 gomusic source id
const AGGREGATE_SOURCES = PLATFORMS
  .filter(p => p.gomusicId && p.gomusicId !== '')
  .map(p => p.gomusicId);

export default function PlatformMultiSelect({ label, active = false, onPress }: PlatformMultiSelectProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [open, setOpen] = useState(false);
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();

  const selected = settings.localBackendSources;
  const count = selected.length;

  const handlePress = () => {
    onPress?.();
    setOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={4}
      >
        <Animated.View
          style={[
            globalStyles.chip,
            active && globalStyles.chipActive,
            animatedStyle,
          ]}
        >
          <Text style={[globalStyles.chipText, active && globalStyles.chipTextActive]}>
            {label || t('sourceGomusic')} ▾ {count > 0 && `(${count})`}
          </Text>
        </Animated.View>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Animated.View entering={FadeIn.duration(150)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <Animated.View
            entering={ZoomIn.springify().damping(15)}
            style={styles.sheet}
          >
            <View style={styles.header}>
              <Text style={styles.title}>{t('platformMultiSelectTitle') || '选择聚合源（多选）'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <View style={styles.grid}>
                {AGGREGATE_SOURCES.map((id) => {
                  const checked = selected.includes(id);
                  // 找 platform 元信息用于 i18n label
                  const p = PLATFORMS.find(pp => pp.gomusicId === id);
                  const i18nKey = p ? sourceKey(p.id) : sourceKey(id);
                  const displayName = p ? (t(i18nKey as any) || p.label) : id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => settings.toggleLocalBackendSource(id)}
                      style={[
                        styles.item,
                        checked && styles.itemChecked,
                      ]}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={[styles.itemText, checked && styles.itemTextChecked]}>
                        {displayName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={[styles.row, { marginTop: spacing.sm, gap: spacing.sm }]}>
              <SmallBtn
                label={t('selectAll') || '全选'}
                onPress={() => settings.setLocalBackendSources([...AGGREGATE_SOURCES])}
              />
              <SmallBtn
                label={t('deselectAll') || '清空'}
                onPress={() => settings.setLocalBackendSources([])}
              />
              <SmallBtn
                label={t('close') || '关闭'}
                onPress={() => setOpen(false)}
                primary
              />
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

function SmallBtn({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.btn,
          primary ? styles.btnPrimary : styles.btnGhost,
          animatedStyle,
        ]}
      >
        <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  close: {
    color: colors.textMuted,
    fontSize: 20,
    paddingHorizontal: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: '47%',
    flexGrow: 1,
  },
  itemChecked: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    marginRight: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '900',
  },
  itemText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
  itemTextChecked: {
    color: colors.accent,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhost: {
    backgroundColor: 'transparent',
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  btnText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  btnTextPrimary: {
    color: colors.bg,
    fontWeight: '700',
  },
});