/**
 * SettingsPanel — 设置面板（v21: 多后端地址管理）
 *
 * 结构：
 *   - 顶部条（标题 + ✕）
 *   - 后端地址列表（基础设置，永远显示）
 *     - 每个后端一行：单选 / 名称 / URL / 测试 / 删除
 *     - "+ 添加后端" 按钮弹出 Modal
 *   - Tab 切换条: [账号登录] [Cookie 管理] [数据管理]
 *   - ScrollView 渲染当前 Tab 的内容
 *
 * Tab 内容：
 *   - accounts: AccountsTab
 *   - cookies:  CookiesTab
 *   - data:     原数据管理 + 语言切换
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, ZoomIn, FadeInDown } from 'react-native-reanimated';
import { useTranslation } from '../i18n/I18nProvider';
import { useSettingsStore, type Backend } from '../state/settingsStore';
import { useAnimatedPress } from '../hooks/useAnimatedPress';
import { colors, fontSize, spacing, radius, globalStyles } from '../theme';
import AccountsTab from '../components/accounts/AccountsTab';
import CookiesTab from '../components/accounts/CookiesTab';
import { testBackend, type BackendTestResult } from '../api/backendHealth';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

type TabKey = 'accounts' | 'cookies' | 'data';

export default function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [tab, setTab] = useState<TabKey>('accounts');

  const handleClear = (what: 'favorites' | 'history' | 'all') => {
    Alert.alert(
      t('confirm'),
      t('clearConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('confirm'), style: 'destructive', onPress: () => {
            if (what === 'favorites') settings.clearFavorites();
            else if (what === 'history') settings.clearSearchHistory();
            else settings.clearAll();
          } },
      ],
    );
  };

  const handleExport = async () => {
    try {
      const data = {
        version: 1,
        language: settings.language,
        enabledSources: settings.enabledSources,
        favorites: settings.favorites,
        playlists: settings.playlists,
        searchHistory: settings.searchHistory,
        gomusicBaseUrl: settings.gomusicBaseUrl,
      };
      await Share.share({
        title: 'Pikachu Music Backup',
        message: JSON.stringify(data, null, 2),
      });
    } catch (e: any) {
      Alert.alert(t('exportFailed') || '导出失败', e?.message || String(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={ZoomIn.springify().damping(15)}
          style={styles.sheet}
        >
          {/* 顶部条 */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('settingsTitle') || '设置'}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            {/* v21: 多后端地址管理（替代原单一输入框） */}
            <BackendSection />

            {/* Tab 切换条 */}
            <View style={styles.tabBar}>
              <TabBtn
                label={t('settingsTabAccounts') || '账号登录'}
                active={tab === 'accounts'}
                onPress={() => setTab('accounts')}
              />
              <TabBtn
                label={t('settingsTabCookies') || 'Cookie 管理'}
                active={tab === 'cookies'}
                onPress={() => setTab('cookies')}
              />
              <TabBtn
                label={t('settingsTabData') || '数据管理'}
                active={tab === 'data'}
                onPress={() => setTab('data')}
              />
            </View>

            {/* Tab 内容 */}
            {tab === 'accounts' && <AccountsTab />}
            {tab === 'cookies' && <CookiesTab />}
            {tab === 'data' && (
              <>
                {/* 数据管理 */}
                <Section title={t('settingsData') || '数据管理'}>
                  <SmallButton
                    label={t('exportData') || '导出数据（JSON）'}
                    onPress={handleExport}
                    block
                  />
                  <View style={{ height: spacing.sm }} />
                  <SmallButton
                    label={t('clearFavorites') || '清空收藏'}
                    onPress={() => handleClear('favorites')}
                    block
                    danger
                  />
                  <View style={{ height: spacing.sm }} />
                  <SmallButton
                    label={t('clearHistory') || '清空搜索历史'}
                    onPress={() => handleClear('history')}
                    block
                    danger
                  />
                  <View style={{ height: spacing.sm }} />
                  <SmallButton
                    label={t('clearAll') || '清空全部数据'}
                    onPress={() => handleClear('all')}
                    block
                    danger
                  />
                </Section>

                {/* 语言 */}
                <Section title={t('settingsLanguage') || '语言'}>
                  <View style={[styles.row, { gap: spacing.sm }]}>
                    <SmallButton
                      label="中文"
                      active={settings.language === 'zh'}
                      onPress={() => settings.setLanguage('zh')}
                    />
                    <SmallButton
                      label="English"
                      active={settings.language === 'en'}
                      onPress={() => settings.setLanguage('en')}
                    />
                  </View>
                </Section>
              </>
            )}

            <Text style={styles.footer}>Pikachu Music v1.0.0 · Made with ❤️</Text>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Animated.View>
  );
}

/**
 * BackendSection — 多后端地址列表
 * - 单选 + 测试 + 删除
 * - 添加按钮 → 弹 Modal
 * - 默认项不可删
 */
function BackendSection() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [addOpen, setAddOpen] = useState(false);
  /** id → 最近一次测试结果缓存（避免重复测试） */
  const [lastTest, setLastTest] = useState<Record<string, BackendTestResult | undefined>>({});
  /** 正在测试中的 id */
  const [testingId, setTestingId] = useState<string | null>(null);

  // v1.0.26: 新装用户 backends=[]，baseUrl='' → 显式提示。
  // 这里同时考虑 gomusicBaseUrl（旧字段，兼容老用户）。
  const hasAnyBackend =
    (settings.backends && settings.backends.length > 0) ||
    !!(settings.gomusicBaseUrl && settings.gomusicBaseUrl.trim());

  const handleTest = async (b: Backend) => {
    setTestingId(b.id);
    const r = await testBackend(b.url);
    setLastTest(prev => ({ ...prev, [b.id]: r }));
    setTestingId(null);
    Alert.alert(
      r.ok ? '✓ 连接成功' : '✗ 连接失败',
      [
        r.ok
          ? `${b.name}\n${r.message}${r.latencyMs != null ? ` · ${r.latencyMs}ms` : ''}`
          : `${b.name}\n${r.message}`,
      ].join('\n'),
      [{ text: t('close') || '关闭' }],
    );
  };

  const handleDelete = (b: Backend) => {
    if (b.isDefault) return;
    Alert.alert(
      t('confirm'),
      `${b.name}\n${b.url}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          style: 'destructive',
          onPress: () => settings.removeBackend(b.id),
        },
      ],
    );
  };

  return (
    <Section title={t('backendTitle') || '后端地址'}>
      <Text style={styles.hint}>
        {t('backendHint') || '选择/添加聚合后端地址。空 = 关闭聚合回落到咪咕/网易云/QQ/酷我 4 个老平台。点"测试"验证连通。'}
      </Text>

      {!hasAnyBackend && (
        <View style={styles.emptyBackendCard}>
          <Text style={styles.emptyBackendCardTitle}>
            ⚠ {t('settingsBackendUrlEmptyHint') || '未配置后端 API 地址'}
          </Text>
          <Text style={styles.emptyBackendCardHint}>
            {t('settingsBackendUrlEmptyHintDoc') || '部署文档：docs/GOMUSIC-API-DEPLOY.md'}
          </Text>
        </View>
      )}

      {settings.backends.map(b => {
        const active = (settings.activeBackendId || settings.backends[0]?.id) === b.id;
        const lt = lastTest[b.id];
        const isTesting = testingId === b.id;
        return (
          <View key={b.id} style={[styles.backendRow, active && styles.backendRowActive]}>
            {/* 单选 */}
            <Pressable
              onPress={() => settings.setActiveBackend(b.id)}
              hitSlop={8}
              style={{ marginRight: spacing.sm }}
            >
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioInner} />}
              </View>
            </Pressable>
            {/* 信息 */}
            <View style={{ flex: 1 }}>
              <View style={styles.backendNameRow}>
                <Text style={styles.backendName} numberOfLines={1}>{b.name}</Text>
                {b.isDefault && <Text style={styles.defaultTag}>{t('backendDefault') || '默认'}</Text>}
              </View>
              <Text style={styles.backendUrl} numberOfLines={1}>{b.url}</Text>
              {lt && (
                <Text style={[styles.backendTest, lt.ok ? styles.testOk : styles.testFail]}>
                  {lt.ok ? '✓' : '✗'} {lt.message}{lt.latencyMs != null ? ` · ${lt.latencyMs}ms` : ''}
                </Text>
              )}
            </View>
            {/* 测试 + 删除 */}
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <SmallButton
                label={isTesting ? '...' : (t('backendTest') || '测试')}
                onPress={() => handleTest(b)}
                disabled={isTesting}
              />
              {!b.isDefault && (
                <SmallButton
                  label={'删除'}
                  onPress={() => handleDelete(b)}
                  danger
                />
              )}
            </View>
          </View>
        );
      })}

      {/* 添加按钮 */}
      <View style={{ marginTop: spacing.sm }}>
        <SmallButton
          label={(t('backendAdd') || '添加后端') + '  +'}
          onPress={() => setAddOpen(true)}
          block
        />
      </View>

      <AddBackendModal visible={addOpen} onClose={() => setAddOpen(false)} />
    </Section>
  );
}

/** 添加后端的 Modal */
function AddBackendModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  /** null = 还没测；object = 结果 */
  const [test, setTest] = useState<BackendTestResult | null>(null);

  // 重置
  useEffect(() => {
    if (!visible) {
      setName('');
      setUrl('');
      setTest(null);
      setBusy(false);
    }
  }, [visible]);

  const handleTest = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setTest(null);
    const r = await testBackend(url);
    setTest(r);
    setBusy(false);
  };

  const handleSave = () => {
    if (!url.trim()) {
      Alert.alert(t('toastNeedKeyword') || '请填写', 'URL 不能为空');
      return;
    }
    const id = settings.addBackend({ name: name.trim() || url.trim(), url: url.trim() });
    if (!id) {
      Alert.alert(t('exportFailed') || '保存失败', 'URL 重复或无效');
      return;
    }
    // 立刻切到新添加的后端
    settings.setActiveBackend(id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.addBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.addSheet}>
          <Text style={styles.addTitle}>{t('backendAdd') || '添加后端'}</Text>
          <Text style={styles.addLabel}>{t('backendName') || '名称'}</Text>
          <TextInput
            style={styles.addInput}
            placeholder="我的 NAS"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <Text style={styles.addLabel}>URL</Text>
          <TextInput
            style={styles.addInput}
            placeholder="https://api.example.com/api/v1"
            placeholderTextColor={colors.textMuted}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {test && (
            <Text style={[styles.backendTest, test.ok ? styles.testOk : styles.testFail, { marginTop: spacing.sm }]}>
              {test.ok ? '✓' : '✗'} {test.message}{test.latencyMs != null ? ` · ${test.latencyMs}ms` : ''}
            </Text>
          )}
          <View style={[styles.row, { marginTop: spacing.md, gap: spacing.sm, justifyContent: 'flex-end' }]}>
            <SmallButton label={busy ? '...' : (t('backendTest') || '测试')} onPress={handleTest} disabled={busy} />
            <SmallButton label={t('cancel') || '取消'} onPress={onClose} />
            <SmallButton label={t('save') || '保存'} onPress={handleSave} primary />
          </View>
          {busy && (
            <View style={{ marginTop: spacing.sm }}>
              <ActivityIndicator color={colors.accent} size="small" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SmallButton({ label, onPress, primary, danger, block, active, disabled }: {
  label: string; onPress: () => void; primary?: boolean; danger?: boolean; block?: boolean; active?: boolean; disabled?: boolean;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable
      onPress={() => { if (!disabled) onPress(); }}
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
      style={block ? { alignSelf: 'stretch' } : undefined}
    >
      <Animated.View
        style={[
          styles.btn,
          primary && styles.btnPrimary,
          danger && styles.btnDanger,
          active && styles.btnActive,
          block && styles.btnBlock,
          animatedStyle,
        ]}
      >
        <Text style={[
          styles.btnText,
          (primary || active) && { color: colors.bg },
        ]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          styles.tabBtn,
          active && styles.tabBtnActive,
          animatedStyle,
        ]}
      >
        <Text style={[
          styles.tabBtnText,
          active && styles.tabBtnTextActive,
        ]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
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
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.title,
    fontWeight: '700',
  },
  close: {
    color: colors.textMuted,
    fontSize: 24,
    padding: 4,
  },
  section: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  statusOk: {
    color: colors.success,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
  statusOff: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
  // Tab 切换条
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.md,
    gap: 4,
  },
  tabBtn: {
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
  },
  tabBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  tabBtnTextActive: {
    color: colors.bg,
    fontWeight: '700',
  },
  // 按钮
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  btnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: colors.error,
  },
  btnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  btnBlock: {
    width: '100%',
  },
  btnText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  footer: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.lg,
  },

  // 后端列表行
  backendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  backendRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  backendNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backendName: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  defaultTag: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  backendUrl: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  backendTest: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  testOk: { color: colors.success },
  testFail: { color: colors.error },

  // 添加后端 Modal
  addBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  addSheet: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
  },
  addTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  addLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  addInput: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },

  // v1.0.26: baseUrl 空时显示的提示卡片
  emptyBackendCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  emptyBackendCardTitle: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyBackendCardHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
});
