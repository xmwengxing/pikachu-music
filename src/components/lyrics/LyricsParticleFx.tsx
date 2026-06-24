// src/components/lyrics/LyricsParticleFx.tsx
// Particles 模式背景：Skia Canvas 绘制跟随 currentLineIdx 的粒子背景
//
// 设计要点：
// - 用 Skia 2.6+ 的 Canvas + Circle + Group（不依赖 BlurMask，避免 API 兼容问题）
// - 24 个粒子，位置按 currentLineIdx 做正弦偏移（每帧轻动）
// - 双层圆叠加模拟"发光"：外圈大半径低 opacity + 内圈小半径高 opacity
// - absoluteFill + pointerEvents="none"，歌词 FlatList 在上层 (zIndex 更高)
//
// 性能：
// - 每个粒子的 cx/cy/opacity 都是 useDerivedValue（worklet 端算），
//   Skia 内部订阅 SharedValue 变化，不触发 React re-render。
// - 24 粒子 × 双圆 = 48 Circle 节点，Skia 渲染开销可忽略。
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors } from '../../theme';

interface Props {
  currentLineIdx: number;
  /** 容器尺寸（LyricsScroller 父布局） */
  width?: number;
  height?: number;
}

interface ParticleConfig {
  baseAngle: number;
  radius: number;
  baseR: number;
  phaseOffset: number;
  speedMult: number;
}

const PARTICLE_COUNT = 24;

export function LyricsParticleFx({ currentLineIdx, width, height }: Props) {
  const particles = useMemo<ParticleConfig[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      baseAngle: (i / PARTICLE_COUNT) * Math.PI * 2,
      radius: 60 + (i % 5) * 18,
      baseR: 1.5 + (i % 3) * 0.8,
      phaseOffset: i * 0.37,
      speedMult: 0.6 + (i % 4) * 0.2,
    }));
  }, []);

  // 跟随 currentLineIdx 变化：从 0 平滑过渡到目标值
  const tick = useSharedValue(currentLineIdx);

  useEffect(() => {
    tick.value = withTiming(currentLineIdx, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [currentLineIdx, tick]);

  // 容器中心：优先用 prop 提供的实际尺寸，没有就 fallback 320×300
  const cx = width ? width / 2 : 160;
  const cy = height ? height / 2 : 150;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group>
        {particles.map((p, i) => (
          <Particle key={i} p={p} tick={tick} cx={cx} cy={cy} />
        ))}
      </Group>
    </Canvas>
  );
}

function Particle({
  p,
  tick,
  cx,
  cy,
}: {
  p: ParticleConfig;
  tick: ReturnType<typeof useSharedValue<number>>;
  cx: number;
  cy: number;
}) {
  // 位置和大小用 useDerivedValue 在 worklet 端算，Skia 订阅 SharedValue 变化
  // 不触发 React re-render，也不报"Reading from value during component render"
  const cxD = useDerivedValue(() => {
    'worklet';
    const angle = p.baseAngle + tick.value * 0.04 * p.speedMult + p.phaseOffset;
    const r = p.radius + Math.sin(tick.value * 0.15 + p.phaseOffset) * 8;
    return cx + Math.cos(angle) * r;
  });
  const cyD = useDerivedValue(() => {
    'worklet';
    const angle = p.baseAngle + tick.value * 0.04 * p.speedMult + p.phaseOffset;
    const r = p.radius + Math.sin(tick.value * 0.15 + p.phaseOffset) * 8;
    return cy + Math.sin(angle) * r * 0.7; // 椭圆分布（横向更扁）
  });
  const opacity = useDerivedValue(() => {
    'worklet';
    return 0.55 + 0.25 * Math.sin(tick.value * 0.2 + p.phaseOffset);
  });

  return (
    <Group>
      {/* 外圈低 opacity 大半径 — 模拟发光晕 */}
      <Circle cx={cxD} cy={cyD} r={p.baseR * 2.5} color={colors.accentAlt} opacity={opacity} />
      {/* 内圈高 opacity 小半径 — 粒子本体 */}
      <Circle cx={cxD} cy={cyD} r={p.baseR} color={colors.accentAlt} opacity={1} />
    </Group>
  );
}
