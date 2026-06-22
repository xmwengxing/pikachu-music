/**
 * CookiesTab — Cookie 管理（高级面板）
 *
 * - 列出 5 个平台的状态 + cookie 长度
 * - 操作：查看（脱敏预览 + Share 复制）/ 粘贴覆盖 / 删除
 * - 数据来源：listCookies()（后端 GET /system/cookies）
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from '../../i18n/I18nProvider';
import { useSettingsStore } from '../../state/settingsStore';
import { colors, fontSize, spacing, radius } from '../../theme';
import { useAnimatedPress } from '../../hooks/useAnimatedPress';
import { listCookies, setCookie } from '../../api/gomusic';

interface PlatformInfo {
  source: string;
  nameKey: 'sourceNetease' | 'sourceQq' | 'sourceKugou' | 'sourceBilibili';
  color: string;
}

const PLATFORMS: PlatformInfo[] = [
  { source: 'netease', nameKey: 'sourceNetease', color: colors.sourceNetease },
  { source: 'qq', nameKey: 'sourceQq', color: colors.sourceQq },
  { source: 'kugou', nameKey: 'sourceKugou', color: '#FF6B27' },
  { source: 'bilibili', nameKey: 'sourceBilibili', color: '#FB7299' },
];

export default function CookiesTab() {
  const { t } = useTranslation();
  const [serverCookies, setServerCookies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const r = await listCookies();
    if (r) setServerCookies(r);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <View>
      <Text style={styles.desc}>
        {t('settingsCookiesDesc') || '手动查看/粘贴各平台 Cookie。修改后点击保存。'}
      </Text>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : (
        PLATFORMS.map(p => (
          <CookieRow
            key={p.source}
            platform={p}
            cookie={serverCookies[p.source] || ''}
            onChanged={refresh}
          />
        ))
      )}
    </View>
  );
}

// ============================================================
// 单个平台一行
// ============================================================

interface CookieRowProps {
  platform: PlatformInfo;
  cookie: string;
  onChanged: () => Promise<void>;
}

function CookieRow({ platform, cookie, onChanged }: CookieRowProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const loggedIn = cookie.length > 0;
  const localBackup = settings.cookieBackup[platform.source] || '';

  const handleView = async () => {
    const masked = maskCookie(cookie);
    const lines = [
      `${t(platform.nameKey)} · ${loggedIn ? t('accLogged') : t('accNotLogged')}`,
      '',
      `长度: ${cookie.length}`,
      '',
      cookie,
    ];
    Alert.alert(
      masked,
      '点 "复制" 后可通过系统分享菜单复制。',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: '复制',
          onPress: async () => {
            try {
              await Share.share({ message: lines.join('\n') });
            } catch {}
          },
        },
      ],
    );
  };

  const handleStartEdit = () => {
    setDraft(cookie || localBackup);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await setCookie(platform.source, draft.trim());
    setSaving(false);
    if (ok) {
      // 同步本地备份
      if (draft.trim()) settings.setCookieBackup(platform.source, draft.trim());
      else settings.setCookieBackup(platform.source, '');
      setEditing(false);
      await onChanged();
    } else {
      Alert.alert(t('exportFailed') || '保存失败', t('exportFailed') || '后端拒绝，请检查格式');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('confirm'),
      `${t(platform.nameKey)} · ${t('clearAll') || '退出登录?'}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          style: 'destructive',
          onPress: async () => {
            // 后端可能不接受空串，先试一下；失败则提示用户用粘贴覆盖
            const ok = await setCookie(platform.source, '');
            if (ok) {
              settings.setCookieBackup(platform.source, '');
              await onChanged();
            } else {
              Alert.alert(
                t('qrError') || '不支持',
                '请用 "粘贴覆盖" 留空保存。',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Animated.View entering={FadeInDown.duration(150)} style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={[styles.dot, { backgroundColor: platform.color }]} />
        <Text style={styles.rowName}>{t(platform.nameKey)}</Text>
        <View style={{ flex: 1 }} />
        <Text style={loggedIn ? styles.statusOk : styles.statusOff}>
          {loggedIn ? `● ${t('accLogged')} (${cookie.length})` : `○ ${t('accNotLogged')}`}
        </Text>
      </View>
      {localBackup && !loggedIn && (
        <Text style={styles.localHint}>
          💾 {'本地有备份（Render 端已丢失）'}
        </Text>
      )}
      <View style={styles.rowActions}>
        {loggedIn && <RowBtn label={'查看'} onPress={handleView} />}
        <RowBtn label={'粘贴覆盖'} onPress={handleStartEdit} primary={!loggedIn} />
        {loggedIn && <RowBtn label={'删除'} onPress={handleDelete} danger />}
      </View>

      {/* 粘贴覆盖弹窗 */}
      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <View style={styles.editBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(false)} />
          <View style={styles.editSheet}>
            <Text style={styles.editTitle}>
              {t(platform.nameKey)} · {'粘贴覆盖'}
            </Text>
            <TextInput
              style={styles.editInput}
              placeholder="MUSIC_U=xxx; __csrf=yyy; ..."
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.editActions}>
              <RowBtn label={t('cancel') || '取消'} onPress={() => setEditing(false)} />
              <RowBtn label={saving ? '...' : t('save') || '保存'} onPress={handleSave} primary disabled={saving} />
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

// ============================================================
// 工具：脱敏（保留前后 6 字符，中间省略）
// ============================================================

function maskCookie(cookie: string): string {
  if (!cookie) return '(空)';
  if (cookie.length <= 24) return cookie;
  return cookie.slice(0, 6) + '...' + cookie.slice(-6);
}

// ============================================================
// 小按钮
// ============================================================

function RowBtn({
  label, onPress, primary, danger, disabled,
}: {
  label: string; onPress: () => void;
  primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable
      onPress={() => { if (!disabled) onPress(); }}
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
    >
      <Animated.View
        style={[
          styles.btn,
          primary && styles.btnPrimary,
          danger && styles.btnDanger,
          disabled && styles.btnDisabled,
          animatedStyle,
        ]}
      >
        <Text style={[
          styles.btnText,
          (primary || danger) && { color: colors.bg },
        ]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  desc: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  loadingWrap: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },

  // 行
  row: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  rowName: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  statusOk: {
    color: colors.success,
    fontSize: fontSize.xs,
  },
  statusOff: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  localHint: {
    color: colors.warning,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },

  // 编辑弹窗
  editBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  editSheet: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  editTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  editInput: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    padding: spacing.sm,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },

  // 按钮
  btn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: colors.textPrimary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
});
