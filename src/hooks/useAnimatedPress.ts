/**
 * useAnimatedPress — 通用按压反馈 hook
 * 用 Reanimated v4 在 UI 工作线程（worklet）做 scale + opacity 插值
 * 避免 JS 线程 setState 抖动
 */
import { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

export interface PressOptions {
  /** 按下时缩放比例，默认 0.92 */
  pressScale?: number;
  /** 弹回动画类型 */
  type?: 'spring' | 'timing';
}

export function useAnimatedPress(opts: PressOptions = {}) {
  const { pressScale = 0.92, type = 'spring' } = opts;
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const onPressIn = () => {
    'worklet';
    if (type === 'timing') {
      scale.value = withTiming(pressScale, { duration: 80 });
      opacity.value = withTiming(0.7, { duration: 80 });
    } else {
      scale.value = withSpring(pressScale, { mass: 0.3, stiffness: 300, damping: 20 });
      opacity.value = withTiming(0.7, { duration: 80 });
    }
  };

  const onPressOut = () => {
    'worklet';
    if (type === 'timing') {
      scale.value = withTiming(1, { duration: 120 });
      opacity.value = withTiming(1, { duration: 120 });
    } else {
      scale.value = withSpring(1, { mass: 0.3, stiffness: 200, damping: 15 });
      opacity.value = withTiming(1, { duration: 120 });
    }
  };

  return { animatedStyle, onPressIn, onPressOut };
}
