/**
 * AccountsTab — 账号登录（扫码登录）
 *
 * - 列出 5 个支持扫码的平台
 * - 每平台卡片：状态指示 + [扫码登录] / [重新登录]
 * - 进入扫码态后：显示二维码 + 2s 轮询
 * - 扫码成功 → 备份 cookie 到本地（settingsStore.cookieBackup）
 * - 顶部"恢复"横幅：检测到 Render 端 cookie 丢失但本地有缓存时提示
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from '../../i18n/I18nProvider';
import { useSettingsStore } from '../../state/settingsStore';
import { colors, fontSize, spacing, radius } from '../../theme';
import { useAnimatedPress } from '../../hooks/useAnimatedPress';
import {
  createQRSession,
  pollQRStatus,
  listCookies,
  setCookie,
  type QRLoginSession,
  type QRLoginResult,
} from '../../api/gomusic';

// 5 个支持扫码的平台（与服务端 service.GetQRLoginSourceNames() 一致）
// 注意：qq_wx 扫码成功后，cookie 实际写入到后端 cookies.json 的 'qq' 字段
// （gomusic 后端 qrLoginCookieSource 约定），所以查询/备份都用 cookieTarget
interface PlatformInfo {
  /** 传给后端 createQRSession 的 source id */
  source: string;
  /** i18n key for display name */
  nameKey:
    | 'sourceNetease'
    | 'sourceQq'
    | 'sourceKugou'
    | 'sourceBilibili'
    | 'sourceQqWx';
  /** 显示色 */
  color: string;
  /** 后端 cookies.json 实际写入 key（默认 = source） */
  cookieTarget: string;
}

const PLATFORMS: PlatformInfo[] = [
  { source: 'netease', nameKey: 'sourceNetease', color: colors.sourceNetease, cookieTarget: 'netease' },
  { source: 'qq',      nameKey: 'sourceQq',      color: colors.sourceQq,      cookieTarget: 'qq' },
  { source: 'qq_wx',   nameKey: 'sourceQqWx',    color: '#07C160',            cookieTarget: 'qq' },
  { source: 'kugou',   nameKey: 'sourceKugou',   color: '#FF6B27',            cookieTarget: 'kugou' },
  { source: 'bilibili',nameKey: 'sourceBilibili',color: '#FB7299',            cookieTarget: 'bilibili' },
];

// 扫描状态机
type ScanState = 'idle' | 'creating' | 'polling' | 'success' | 'expired' | 'failed';

interface PlatformCardState {
  state: ScanState;
  session: QRLoginSession | null;
  /** 后端返回的最新 result（含 status/extra 等） */
  result: QRLoginResult | null;
}

export default function AccountsTab() {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  // 后端当前 cookie map（来自 GET /system/cookies）
  const [serverCookies, setServerCookies] = useState<Record<string, string>>({});
  // 各平台扫码状态（key = source；未扫码则无 entry）
  const [cards, setCards] = useState<Record<string, PlatformCardState>>({});

  // 初次加载：拉取后端 cookie map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listCookies();
      if (!cancelled && r) setServerCookies(r);
    })();
    return () => { cancelled = true; };
  }, []);

  /** 后端有 cookie */
  const isServerLogged = useCallback(
    (source: string) => !!(serverCookies[source] && serverCookies[source].length > 0),
    [serverCookies],
  );

  /** 本地有备份 */
  const hasLocalBackup = useCallback(
    (source: string) => !!(settings.cookieBackup[source] && settings.cookieBackup[source].length > 0),
    [settings.cookieBackup],
  );

  /** 检测到本地有但后端缺失的平台 */
  const needRestore = PLATFORMS.filter(
    p => !isServerLogged(p.cookieTarget) && hasLocalBackup(p.cookieTarget),
  );

  /** 批量恢复本地备份到后端 */
  const handleRestoreAll = async () => {
    let okCount = 0;
    for (const p of needRestore) {
      const cookie = settings.cookieBackup[p.cookieTarget];
      const ok = await setCookie(p.cookieTarget, cookie);
      if (ok) okCount++;
    }
    // 重新拉取后端 cookie
    const fresh = await listCookies();
    if (fresh) setServerCookies(fresh);
    Alert.alert(
      t('settingsSave') || '已保存',
      `${okCount}/${needRestore.length}`,
    );
  };

  return (
    <View>
      {/* 顶部说明 */}
      <Text style={styles.desc}>
        {t('settingsAccountsDesc') || '扫码登录后可在搜索时拿到完整播放链接与音质。'}
      </Text>

      {/* 恢复横幅 */}
      {needRestore.length > 0 && (
        <Animated.View entering={FadeInDown.duration(180)} style={styles.banner}>
          <Text style={styles.bannerText}>
            ⚠ {needRestore.length} {'个平台登录状态不一致，是否从本地恢复？'}
          </Text>
          <Pressable onPress={handleRestoreAll} hitSlop={8}>
            <Text style={styles.bannerAction}>
              {t('settingsReload') || '恢复'}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* 平台列表 */}
      {PLATFORMS.map(p => (
        <PlatformCard
          key={p.source}
          platform={p}
          loggedIn={isServerLogged(p.cookieTarget)}
          cardState={cards[p.source]}
          setCardState={(s) => setCards(prev => ({ ...prev, [p.source]: s }))}
          onCookieWritten={async () => {
            const fresh = await listCookies();
            if (fresh) setServerCookies(fresh);
          }}
        />
      ))}
    </View>
  );
}

// ============================================================
// 单个平台卡片
// ============================================================

interface PlatformCardProps {
  platform: PlatformInfo;
  loggedIn: boolean;
  cardState?: PlatformCardState;
  setCardState: (s: PlatformCardState) => void;
  onCookieWritten: () => Promise<void>;
}

function PlatformCard({
  platform, loggedIn, cardState, setCardState, onCookieWritten,
}: PlatformCardProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleStartScan = async () => {
    setCardState({ state: 'creating', session: null, result: null });
    setQrModalOpen(true);
    const session = await createQRSession(platform.source);
    if (!session) {
      setCardState({ state: 'failed', session: null, result: null });
      Alert.alert(t('qrError') || '二维码错误', t('qrHintDefault') || '请稍后重试');
      return;
    }
    setCardState({ state: 'polling', session, result: null });

    // 启动过期计时
    if (session.expires_at && session.expires_at > 0) {
      const ms = Math.max(0, session.expires_at - Date.now());
      if (ms > 0 && ms < 10 * 60 * 1000) {
        expireTimerRef.current = setTimeout(() => {
          stopPolling();
          setCardState({ state: 'expired', session, result: cardState?.result ?? null });
        }, ms);
      }
    }

    // 启动轮询
    pollTimerRef.current = setInterval(async () => {
      const r = await pollQRStatus(platform.source, session.key);
      if (!r) return;
      const status = r.status;
      if (status === 'waiting' || status === 'scanned') {
        setCardState({ state: 'polling', session, result: r });
      } else if (status === 'success') {
        stopPolling();
        setCardState({ state: 'success', session, result: r });
        // 备份到本地
        const cookie =
          r.cookie ||
          (r.cookies
            ? Object.keys(r.cookies).sort().map(k => `${k}=${r.cookies![k]}`).join('; ')
            : '');
        if (cookie) {
          // 备份到 cookieTarget（qq_wx 扫码时存入 'qq'，与后端 cookies.json key 对齐）
          settings.setCookieBackup(platform.cookieTarget, cookie);
        }
        await onCookieWritten();
        // 1.5s 后自动关闭弹窗
        setTimeout(() => setQrModalOpen(false), 1500);
      } else if (status === 'expired' || status === 'failed') {
        stopPolling();
        setCardState({ state: status, session, result: r });
      }
    }, 2000);
  };

  const handleCancel = () => {
    stopPolling();
    setCardState({ state: 'idle', session: null, result: null });
    setQrModalOpen(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.dot, { backgroundColor: platform.color }]} />
        <Text style={styles.cardName}>{t(platform.nameKey)}</Text>
        <View style={{ flex: 1 }} />
        <Text style={loggedIn ? styles.statusOk : styles.statusOff}>
          {loggedIn ? `● ${t('accLogged')}` : `○ ${t('accNotLogged')}`}
        </Text>
      </View>
      <View style={styles.cardActions}>
        <CardButton
          label={loggedIn ? t('accReLogin') : t('accQrLogin')}
          onPress={handleStartScan}
          primary={!loggedIn}
        />
      </View>

      {/* 二维码弹窗 */}
      <Modal visible={qrModalOpen} transparent animationType="fade" onRequestClose={handleCancel}>
        <View style={styles.qrBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />
          <View style={styles.qrSheet}>
            <Text style={styles.qrTitle}>
              {t(platform.nameKey)} · {t('accQrLogin')}
            </Text>

            {cardState?.state === 'creating' && (
              <View style={styles.qrLoading}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.qrHint}>{t('qrWaiting')}</Text>
              </View>
            )}

            {(cardState?.state === 'polling' || cardState?.state === 'success') && cardState.session && (
              <>
                <View style={styles.qrImageWrap}>
                  {cardState.session.image_url ? (
                    <Image
                      source={{ uri: cardState.session.image_url }}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  ) : (
                    // 某些平台 image_url 为空，让用户手动复制 url 用其他扫码工具
                    <View style={[styles.qrImage, styles.qrFallback]}>
                      <Text style={styles.qrFallbackText} numberOfLines={6}>
                        {cardState.session.url}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.qrHint}>
                  {cardState.state === 'success'
                    ? t('qrSuccess')
                    : cardState.result?.status === 'scanned'
                      ? t('qrScanned')
                      : t('qrWaiting')}
                </Text>
                <Text style={styles.qrSubHint}>
                  {t('qrHintDefault')}
                </Text>
              </>
            )}

            {cardState?.state === 'expired' && (
              <Text style={[styles.qrHint, { color: colors.warning }]}>{t('qrExpired')}</Text>
            )}
            {cardState?.state === 'failed' && (
              <Text style={[styles.qrHint, { color: colors.error }]}>{t('qrError')}</Text>
            )}

            <Pressable onPress={handleCancel} style={styles.qrCloseBtn}>
              <Text style={styles.qrCloseText}>
                {cardState?.state === 'success' ? t('qrSuccess') : t('cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// 小按钮（带按压反馈）
// ============================================================

function CardButton({
  label, onPress, primary, danger,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.btn,
          primary && styles.btnPrimary,
          danger && styles.btnDanger,
          animatedStyle,
        ]}
      >
        <Text style={[styles.btnText, (primary || danger) && { color: colors.bg }]}>
          {label}
        </Text>
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

  // 恢复横幅
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bannerText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSize.xs,
  },
  bannerAction: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // 卡片
  card: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
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
  cardName: {
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
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // 二维码弹窗
  qrBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  qrSheet: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  qrTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  qrLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  qrImageWrap: {
    padding: spacing.sm,
    backgroundColor: '#fff',
    borderRadius: radius.md,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  qrFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  qrFallbackText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  qrHint: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
    fontWeight: '600',
  },
  qrSubHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  qrCloseBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
  },
  qrCloseText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '500',
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
  btnText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
