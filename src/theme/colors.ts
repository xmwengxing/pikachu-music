/**
 * 主题色板：从 pikachu-music-desktop/src/index.css 提取 CSS 变量
 * CSS Grid / backdrop-filter / conic-gradient 等不支持的特性已删除
 */

export const colors = {
  // 基础
  bg: '#0a0a14',
  bgElevated: '#1a1a2e',
  bgPanel: 'rgba(20, 20, 35, 0.95)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.16)',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textMuted: 'rgba(255, 255, 255, 0.4)',

  // 皮卡丘主题
  accent: '#FFD93D',          // 皮卡丘黄
  accentAlt: '#FFA500',       // 橙
  accentSoft: 'rgba(255, 217, 61, 0.12)',

  // 平台色
  sourceMigu: '#FF6B9D',
  sourceNetease: '#C20C0C',
  sourceQq: '#1296DB',
  sourceKuwo: '#8B5CF6',

  // 状态
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',

  // 透明
  overlay: 'rgba(0, 0, 0, 0.5)',
  scrim: 'rgba(0, 0, 0, 0.7)',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof colors;