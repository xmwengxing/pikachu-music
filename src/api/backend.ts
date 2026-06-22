// 本地后端封装 - **当前已禁用**（Android 11+ 禁止从 app 内部 exec ELF 二进制）
//
// 所有函数保留为 stub，确保 PlatformMultiSelect / SettingsPanel 等 UI 仍可工作。
// 用户需要把 settings.gomusicBaseUrl 设为云端 Render URL（或自建）来获取 12 平台聚合。
//
// 如未来 Android 找到绕过方式，重新启用时只需恢复 src/api/native/PikachuBackendModule.kt
// 等三件套，并在 MainApplication.kt 加 `add(PikachuBackendPackage())`。

export const LOCAL_BACKEND_URL = '';

export async function ensureLocalBackend(): Promise<boolean> {
  return false; // 本地后端已禁用
}

export async function stopLocalBackend(): Promise<void> {
  // no-op
}

export async function restartLocalBackend(): Promise<boolean> {
  return false;
}

export async function isLocalBackendRunning(): Promise<boolean> {
  return false;
}

export async function resetLocalBackendCookies(): Promise<boolean> {
  return false;
}

export type BackendEventName = 'onBackendReady' | 'onBackendStopped' | 'onBackendError' | 'onBackendLog';
export interface BackendEventPayload { port?: number; exitCode?: number; phase?: string; error?: string; line?: string }
export interface BackendEventSubscription { remove: () => void }

export function addBackendListener(
  event: BackendEventName,
  cb: (payload: BackendEventPayload) => void,
): BackendEventSubscription {
  // 本地后端已禁用，无事件可订阅
  return { remove: () => {} };
}