/**
 * App 根组件
 * - 初始化 track-player 服务
 * - NavigationContainer + RootNavigator
 * - SafeAreaProvider
 * - GestureHandlerRootView
 */
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { setupTrackPlayer } from './src/hooks/useTrackPlayer';
import { navigationRef } from './src/navigation/navRef';
import RootNavigator from './src/navigation/RootNavigator';
import { I18nProvider } from './src/i18n/I18nProvider';
import BackgroundParticles from './src/components/ui/BackgroundParticles';
import { colors } from './src/theme';
import { ensureLocalBackend, addBackendListener } from './src/api/backend';
import SettingsPanel from './src/screens/SettingsPanel';
import { useUIStore } from './src/state/uiStore';
import { useSettingsStore } from './src/state/settingsStore';
import { getGomusicBase } from './src/api/gomusic';

export default function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await setupTrackPlayer();
      } catch (e: any) {
        console.warn('[App] setupTrackPlayer failed', e);
        setErr(e?.message || String(e));
      }
      setReady(true);
    })();
  }, []);

  /**
   * 后端预热（v21+）
   * - App 启动 3 秒后：后台 ping 当前激活后端，避免首次搜索时的冷启动等待
   * - activeBackendId 变化时（用户在设置里切换后端）：立即预热
   * - 失败不弹错（用户可能没填后端，正常）
   */
  useEffect(() => {
    const warmup = () => {
      const base = getGomusicBase();
      if (!base) return;
      // GET /system/cookies 是轻量端点；同时也起到"暖机"目的
      fetch(base.replace(/\/+$/, '') + '/system/cookies')
        .catch(() => { /* 静默失败，不影响 UI */ });
    };
    // 首次：3 秒后（避开启动初期的网络初始化）
    const t = setTimeout(warmup, 3000);
    return () => clearTimeout(t);
  }, []);

  // 监听后端切换：activeBackendId 变化 → 立即预热
  const activeId = useSettingsStore((s) => s.activeBackendId);
  useEffect(() => {
    if (!activeId) return;
    const base = getGomusicBase();
    if (!base) return;
    fetch(base.replace(/\/+$/, '') + '/system/cookies')
      .catch(() => {});
  }, [activeId]);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.text, { marginTop: 12 }]}>皮卡丘音乐加载中…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Skia 粒子背景：zIndex -1 不阻挡事件 */}
        <BackgroundParticles />
        <SafeAreaProvider>
          <I18nProvider>
            <NavigationContainer
              ref={navigationRef as any}
              theme={{
                ...NavDarkTheme,
                colors: {
                  ...NavDarkTheme.colors,
                  background: colors.bg,
                  card: colors.bgElevated,
                  border: colors.border,
                  primary: colors.accent,
                  text: colors.textPrimary,
                },
              }}
            >
              <RootNavigator />
              <StatusBar style="light" />
              {err && <ErrorToast msg={err} />}
            </NavigationContainer>
          </I18nProvider>
        </SafeAreaProvider>
        {/* SettingsPanel 全局唯一 mount（状态在 uiStore），三 Tab 共享打开/关闭 */}
        <SettingsPanelRoot />
      </View>
    </GestureHandlerRootView>
  );
}

/** 全局唯一一份 SettingsPanel，避免三 Tab 各自 mount 造成动画/状态错位 */
function SettingsPanelRoot() {
  const open = useUIStore((s) => s.settingsOpen);
  const close = useUIStore((s) => s.closeSettings);
  return <SettingsPanel visible={open} onClose={close} />;
}

function ErrorToast({ msg }: { msg: string }) {
  return (
    <View style={styles.errToast}>
      <Text style={{ color: '#fff' }} numberOfLines={2}>音频服务初始化失败：{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.textPrimary,
  },
  errToast: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    padding: 12,
    borderRadius: 8,
  },
});