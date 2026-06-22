// src/components/lyrics/LyricsParticleFx.tsx
// Particles 模式背景：Skia Canvas 绘制跟随 currentLineIdx 的粒子背景
//
// 设计要点：
// - 用 Skia 2.6+ 的 Canvas + Circle + Group（不依赖 BlurMask，避免 API 兼容问题）
// - 24 个粒子，位置按 currentLineIdx 做正弦偏移（每帧轻动）
// - 双层圆叠加模拟"发光"：外圈大半径低 opacity + 内圈小半径高 opacity
// - absoluteFill + pointerEvents="none"，歌词 FlatList 在上层 (zIndex 更高)
//
// 性能：24 粒子 + 双圆 = 48 Circle 节点，Skia 渲染开销可忽略；
// currentLineIdx 100ms 采样一次（与 useProgress 对齐），Skia 重新计算但无 React rerender。
import React, { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../../theme';

interface Props {
  currentLineIdx: number;
  /** 容器尺寸（默认填满父容器） */
  height?: number;
  width?: number;
}

interface ParticleConfig {
  baseAngle: number;       // 基础角度
  radius: number;         // 距离中心半径
  baseR: number;           // 粒子基础半径
  phaseOffset: number;     // 相位偏移（让粒子错开运动）
  speedMult: number;       // 速度倍数
}

// 24 个粒子环形分布，每粒子带独立参数 → 视觉上不会同步运动
const PARTICLE_COUNT = 24;

export function LyricsParticleFx({ currentLineIdx, height, width }: Props) {
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

  // 容器中心 (LyricScroller 内嵌区域大概 320x300，可被父布局调整)
  const cx = width ? width / 2 : 160;
  const cy = height ? height / 2 : 140;

  // 注：粒子位置不能用 useDerivedValue 算 JSX props
  // Skia 的 Circle cx/cy 是直接渲染值，每个粒子在 render 时算一次
  // tick 变化时整个组件 rerender（currentLineIdx 触发），频率 ≈ 100ms 一次 = 可接受

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group>
        {particles.map((p, i) => {
          // tick.value 是 reanimated SharedValue，render 时直接读快照值
          // 每帧（100ms）tick 变化，圆位置随之更新
          const angle = p.baseAngle + tick.value * 0.04 * p.speedMult + p.phaseOffset;
          const r = p.radius + Math.sin(tick.value * 0.15 + p.phaseOffset) * 8;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r * 0.7; // 椭圆分布（横向更扁）
          // 双层圆：外圈低 opacity 大半径 + 内圈高 opacity 小半径，模拟发光
          return (
            <Group key={i}>
              <Circle
                cx={px}
                cy={py}
                r={p.baseR * 2.5}
                color={colors.accentAlt}
                opacity={0.15}
              />
              <Circle
                cx={px}
                cy={py}
                r={p.baseR}
                color={colors.accentAlt}
                opacity={0.55}
              />
            </Group>
          );
        })}
      </Group>
    </Canvas>
  );
}
