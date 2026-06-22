/**
 * backendHealth — 后端连通性测试
 *
 * - 用 AbortController 实现 5s 超时
 * - 探测端点用 GET /system/cookies（轻量、必返回）
 * - 解析 GOMusicResponse 信封，区分 HTTP 错误 / 业务错误 / 网络错误
 */
export interface BackendTestResult {
  ok: boolean;
  /** 简短结果（给 Alert 用） */
  message: string;
  /** 完整延迟（ms） */
  latencyMs?: number;
  /** 探测到的 cookies 数量（后端可用时才有意义） */
  cookiesCount?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** 测试单个后端 URL */
export async function testBackend(
  baseUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<BackendTestResult> {
  const start = Date.now();
  // 规范化 URL：去掉末尾斜杠
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  const url = `${normalized}/system/cookies`;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(tid);
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      return { ok: false, message: `HTTP ${r.status}`, latencyMs };
    }
    const j = await r.json().catch(() => null);
    if (!j || typeof j !== 'object') {
      return { ok: false, message: '响应不是 JSON', latencyMs };
    }
    if (j.code !== 200) {
      return {
        ok: false,
        message: `后端错误：${j.msg || 'code=' + j.code}`,
        latencyMs,
      };
    }
    const cookiesCount = j.data ? Object.keys(j.data).length : 0;
    return {
      ok: true,
      message: `连接成功 · ${cookiesCount} cookies`,
      latencyMs,
      cookiesCount,
    };
  } catch (e: any) {
    clearTimeout(tid);
    const latencyMs = Date.now() - start;
    if (e?.name === 'AbortError') {
      return { ok: false, message: `超时（>${timeoutMs}ms）`, latencyMs };
    }
    return {
      ok: false,
      message: `网络错误：${e?.message || String(e)}`,
      latencyMs,
    };
  }
}
