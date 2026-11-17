function retryAfterMs(error: any): number | undefined {
  const value = error?.response?.headers?.["retry-after"] ?? error?.headers?.get?.("retry-after") ?? error?.headers?.["retry-after"];
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isTransient(error: any) {
  const status = Number(error?.response?.status ?? error?.status);
  const reason = error?.errors?.[0]?.reason ?? error?.response?.data?.error?.errors?.[0]?.reason;
  return status === 429 || status >= 500 || ["rateLimitExceeded", "userRateLimitExceeded", "backendError", "quotaExceeded"].includes(reason);
}

export function isPermanentProviderError(error: any) {
  const status = Number(error?.response?.status ?? error?.status);
  return status >= 400 && status < 500 && status !== 408 && !isTransient(error);
}

// A short in-request retry handles provider Retry-After; the durable queue retries jobs that still fail.
export async function withProviderRetry<T>(operation: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransient(error) || attempt >= maxAttempts - 1) throw error;
      const exponential = Math.min(30_000, 500 * 2 ** attempt);
      const delay = Math.max(retryAfterMs(error) ?? 0, Math.random() * exponential);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
