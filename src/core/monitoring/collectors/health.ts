import { log } from "../../utils/logger.js";

export interface HealthCheckResult {
  url: string;
  status: "healthy" | "unhealthy" | "timeout";
  statusCode?: number;
  responseTime: number;
  checkedAt: string;
}

export async function checkHealth(url: string, timeoutMs: number = 5000): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    return {
      url,
      status: response.ok ? "healthy" : "unhealthy",
      statusCode: response.status,
      responseTime: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      url,
      status: "timeout",
      responseTime: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function checkMultipleEndpoints(urls: string[]): Promise<HealthCheckResult[]> {
  return Promise.all(urls.map(url => checkHealth(url)));
}
