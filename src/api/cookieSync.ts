// src/api/cookieSync.ts
// 多设备共享 cookie：每次打开 App / 切后端 / 回前台 时，
// 把后端 /system/cookies 拉回来，与本地 cookieBackup 按"长者胜"规则合并后写回。
//
// 设计动机：
// - 后端 cookies.json 是共享存储，A 设备扫码登录后 B 设备本地缓存为空，
//   单纯靠 CookiesTab/AccountsTab mount 时拉一次不够（用户可能根本不开这俩 tab）。
// - "长者胜"：保护用户在 CookiesTab 手动粘贴的较长 cookie 不被远程短值覆盖；
//   扫码登录产生的 cookie 通常更长，所以新扫码也会赢。
import { listCookies } from './gomusic';
import { useSettingsStore } from '../state/settingsStore';

export interface CookieSyncResult {
  ok: boolean;
  /** 实际写回 cookieBackup 的字段数（=0 表示没变化或后端为空） */
  updated: number;
  /** ok=false 时的简短原因 */
  reason?: 'no-base-url' | 'fetch-failed' | 'invalid-response' | 'store-error';
}

/**
 * 从当前激活后端拉取 cookies，按"长者胜"与本地 cookieBackup 合并，写回 store。
 *
 * 行为表：
 *   baseUrl 为空           → { ok:false, reason:'no-base-url', updated:0 }
 *   后端不可达 / fetch 抛错 → { ok:false, reason:'fetch-failed', updated:0 }（静默）
 *   后端返 { code:200, data:{...} } 但 data 不是对象 → invalid-response
 *   合并后无变化            → { ok:true, updated:0 }
 *   合并后有变化            → { ok:true, updated:N }
 */
export async function syncCookiesFromBackend(): Promise<CookieSyncResult> {
  let remote: Record<string, string> | null = null;
  try {
    remote = await listCookies();
  } catch {
    return { ok: false, reason: 'fetch-failed', updated: 0 };
  }
  if (!remote || typeof remote !== 'object') {
    return { ok: false, reason: 'invalid-response', updated: 0 };
  }

  const settings = useSettingsStore.getState();
  const local = settings.cookieBackup || {};
  const next: Record<string, string> = { ...local };
  let updated = 0;

  for (const [source, cookie] of Object.entries(remote)) {
    if (!cookie) continue;
    const cur = next[source];
    if (!cur) {
      next[source] = cookie;
      updated++;
      continue;
    }
    // 长者胜：保留较长的一方
    if (cookie.length > cur.length) {
      next[source] = cookie;
      updated++;
    }
  }

  if (updated === 0) {
    return { ok: true, updated: 0 };
  }
  try {
    useSettingsStore.getState().loadFromObject({ cookieBackup: next });
    return { ok: true, updated };
  } catch {
    return { ok: false, reason: 'store-error', updated: 0 };
  }
}
