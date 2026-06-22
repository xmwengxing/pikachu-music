/**
 * Header — 顶部栏
 *
 * - 左侧：皮卡丘动画图标 + 标题（点击可滚动到顶）
 * - 右侧：中/EN 切换 + 快捷键按钮 + 设置按钮
 *
 * 用法：放在每个 Screen 顶部（替代普通空白）
 *   <Header title="搜索" onShortcuts={...} onSettings={...} />
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n/I18nProvider';
import { useSettingsStore } from '../../state/settingsStore';
import { useAnimatedPress } from '../../hooks/useAnimatedPress';
import { colors, fontSize, spacing, radius } from '../../theme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface HeaderProps {
  title?: string;     // 可选副标题（默认 'appTitle'）
  onShortcuts?: () => void;
  onSettings?: () => void;
}

export default function Header({ title, onShortcuts, onSettings }: HeaderProps) {
  const { t } = useTranslation();
  const lang = useSettingsStore(s => s.language);
  const setLang = useSettingsStore(s => s.setLanguage);
  const insets = useSafeAreaInsets();

  // 皮卡丘图标呼吸动画
  const breath = useSharedValue(1);
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));
  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath]);

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      {/* 左侧：logo + 标题 */}
      <View style={styles.left}>
        <Animated.View style={[styles.logoBox, breathStyle]}>
          <Image
            source={require('../../../assets/pikachu.gif')}
            style={styles.pikachu}
            resizeMode="contain"
          />
        </Animated.View>
        <View>
          <Text style={styles.title}>{t('appTitle')}</Text>
          {title ? <Text style={styles.subtitle}>{title}</Text> : null}
        </View>
      </View>

      {/* 右侧：语言切换 + 快捷键 + 设置 */}
      <View style={styles.right}>
        <View style={styles.langSwitch}>
          <LangBtn label="中" active={lang === 'zh'} onPress={() => setLang('zh')} />
          <LangBtn label="EN" active={lang === 'en'} onPress={() => setLang('en')} />
        </View>
        {onShortcuts && (
          <IconBtn icon="⌨️" onPress={onShortcuts} />
        )}
        {onSettings && (
          <IconBtn icon="⚙" onPress={onSettings} />
        )}
      </View>
    </View>
  );
}

function LangBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={4}>
      <Animated.View style={[styles.langBtn, active && styles.langBtnActive, animatedStyle]}>
        <Text style={[styles.langText, active && styles.langTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function IconBtn({ icon, onPress }: { icon: string; onPress: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={4}>
      <Animated.View style={[styles.iconBtn, animatedStyle]}>
        <Text style={styles.iconText}>{icon}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  logoBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  pikachu: {
    width: 32, height: 32,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  langSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    minWidth: 28,
    alignItems: 'center',
  },
  langBtnActive: {
    backgroundColor: colors.accent,
  },
  langText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  langTextActive: {
    color: colors.bg,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent,
  },
  iconText: {
    // v25 修复：原本没设 color，在深色背景下 emoji 默认黑色看不清
    fontSize: 18,
    color: colors.accent,
  },
});
