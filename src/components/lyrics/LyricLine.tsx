// src/components/lyrics/LyricLine.tsx
// 单行歌词 —— 按 mode 分支：classic / glow / particles
//
// 设计：
// - classic: 颜色 + opacity + scale 平滑过渡（150ms）
// - glow: 在 classic 基础上加 textShadow* + 呼吸（textShadowRadius 周期 2s）
// - particles: 与 glow 视觉一致（外部 LyricsParticleFx 加粒子背景）
//
// 用 Reanimated 4.x + React Native Text 原生 textShadow* 属性做发光
// （Android 需要 RN 0.76+ 支持 textShadowColor/Radius/Offset）
import React, { useEffect } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { colors, fontSize, spacing } from '../../theme';

const AnimatedText = Animated.createAnimatedComponent(Text);

export type LyricsMode = 'classic' | 'glow' | 'particles';

interface Props {
  text: string;
  active: boolean;
  mode?: LyricsMode;
  onPress?: () => void;
}

export function LyricLine({ text, active, mode = 'classic', onPress }: Props) {
  const progress = useSharedValue(active ? 1 : 0);
  const breath = useSharedValue(0);

  // 行激活/失活的颜色/透明度/scale 过渡
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: mode === 'classic' ? 150 : 280,
    });
  }, [active, mode, progress]);

  // glow/particles 模式：呼吸效果（高亮时持续，低亮时归零）
  useEffect(() => {
    if ((mode === 'glow' || mode === 'particles') && active) {
      breath.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      breath.value = withTiming(0, { duration: 300 });
    }
  }, [mode, active, breath]);

  const isFx = mode === 'glow' || mode === 'particles';
  const targetColor = isFx ? colors.accentAlt : colors.accent;

  // 颜色（行激活时插值）
  const animatedStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, [0, 1], [colors.textMuted, targetColor]);
    const baseScale = 0.95 + 0.1 * progress.value;
    const fxScale = baseScale * (1 + breath.value * 0.04);
    return {
      color,
      opacity: 0.5 + 0.5 * progress.value,
      transform: [{ scale: isFx ? fxScale : baseScale }],
    };
  });

  // glow/particles 的发光阴影（动态 textShadowRadius）
  const shadowStyle = useAnimatedStyle(() => {
    if (!isFx) return {};
    const radius = 6 + breath.value * 14;
    return {
      textShadowRadius: radius,
      textShadowColor: colors.accentAlt,
      textShadowOffset: { width: 0, height: 0 },
    };
  });

  // 字号放大（glow/particles 时略大）
  const fontSizeActive = isFx ? fontSize.lg : fontSize.md;

  const Content = (
    <AnimatedText
      style={[
        styles.line,
        { fontSize: active ? fontSizeActive : fontSize.md },
        shadowStyle,
        animatedStyle,
      ]}
    >
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

const styles = StyleSheet.create({
  line: {
    textAlign: 'center',
    paddingVertical: 4,
    fontWeight: '400',
  },
});
