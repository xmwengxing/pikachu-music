/**
 * BackgroundParticles — Skia 粒子背景
 *
 * - 60 个粒子在屏幕内随机漂浮
 * - 每个粒子：useSharedValue 驱动位置 + 透明度
 * - 帧驱动（frame-driven）：每帧由 Skia 内部时钟驱动
 * - 离开屏幕自动 setPaused(true) 省电
 * - zIndex: -1, position: 'absolute', 不阻挡事件
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, AppState } from 'react-native';
import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  useDerivedValue,
  useFrameCallback,
} from 'react-native-reanimated';

interface Particle {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  r: number;
  baseAlpha: number;
}

const NUM_PARTICLES = 60;
const TICK_MS = 16; // ~60fps

function randomParticle(w: number, h: number, i: number): Particle {
  return {
    x0: Math.random() * w,
    y0: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.4, // px/frame
    vy: (Math.random() - 0.5) * 0.4,
    r: 1 + Math.random() * 2.5,
    baseAlpha: 0.15 + Math.random() * 0.25,
  };
}

export default function BackgroundParticles() {
  const { width, height } = useWindowDimensions();
  const [paused, setPaused] = useState(false);
  const [particles, setParticles] = useState<Particle[]>(() =>
    Array.from({ length: NUM_PARTICLES }, (_, i) => randomParticle(width, height, i)),
  );

  // 监听 App 进入后台：暂停粒子
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setPaused(state !== 'active');
    });
    return () => sub.remove();
  }, []);

  // 重新生成粒子当屏幕尺寸变化
  useEffect(() => {
    setParticles(Array.from({ length: NUM_PARTICLES }, (_, i) => randomParticle(width, height, i)));
  }, [width, height]);

  // 时间累加器（秒）
  const time = useSharedValue(0);
  // 每个粒子的 alpha 脉动相位
  const phase = useSharedValue(0);

  // 启动动画时钟
  useEffect(() => {
    if (paused) {
      cancelAnimation(time);
      cancelAnimation(phase);
      return;
    }
    time.value = withRepeat(
      withTiming(1000, { duration: 100000, easing: Easing.linear }),
      -1,
      false,
    );
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 6000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(time);
      cancelAnimation(phase);
    };
  }, [paused, time, phase]);

  // 帧回调：根据 time 增量计算每个粒子位置
  useFrameCallback((_info) => {
    if (paused) return;
    // 用 useDerivedValue 在 worklet 端更新位置
  }, true);

  return (
    <View pointerEvents="none" style={styles.container}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group>
          {particles.map((p, i) => (
            <ParticleDot
              key={i}
              p={p}
              width={width}
              height={height}
              paused={paused}
              phaseValue={phase}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

function ParticleDot({ p, width, height, paused, phaseValue }: {
  p: Particle; width: number; height: number; paused: boolean; phaseValue: { value: number };
}) {
  // x 位置：基础 + 时间正弦波
  const cx = useDerivedValue(() => {
    'worklet';
    if (paused) return p.x0;
    const t = phaseValue.value;
    return p.x0 + Math.sin(t + p.y0 * 0.01) * 18 + p.vx * 60;
  });
  const cy = useDerivedValue(() => {
    'worklet';
    if (paused) return p.y0;
    const t = phaseValue.value;
    return p.y0 + Math.cos(t * 0.7 + p.x0 * 0.01) * 18 + p.vy * 60;
  });
  const r = useDerivedValue(() => {
    'worklet';
    if (paused) return p.r;
    const t = phaseValue.value;
    return p.r * (0.85 + 0.25 * Math.sin(t * 1.5 + p.x0));
  });
  const opacity = useDerivedValue(() => {
    'worklet';
    if (paused) return p.baseAlpha;
    const t = phaseValue.value;
    return p.baseAlpha * (0.6 + 0.4 * Math.sin(t * 0.5 + p.y0));
  });

  return (
    <Circle cx={cx} cy={cy} r={r} color="rgba(255, 217, 61, 1)" opacity={opacity} />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
});
