// GCP Cloud Monitoring metrics collector. Maps our internal serviceId
// onto the right GCP metric.type strings and queries the last 5 minutes
// of data.
//
// We pick a small, hand-curated metric set per service so the dashboard
// gets a recognizable shape (CPU / memory / requests / errors / latency)
// regardless of which GCP product a service maps to.

import type { ServiceMetrics } from "./metrics.js";

const METRIC_MAP: Record<
  string,
  Array<{ key: keyof ServiceMetrics; type: string; aligner?: string }>
> = {
  "cloud-run": [
    { key: "cpu", type: "run.googleapis.com/container/cpu/utilizations" },
    { key: "memory", type: "run.googleapis.com/container/memory/utilizations" },
    { key: "requestCount", type: "run.googleapis.com/request_count", aligner: "ALIGN_RATE" },
    { key: "latencyP50", type: "run.googleapis.com/request_latencies", aligner: "ALIGN_PERCENTILE_50" },
    { key: "latencyP99", type: "run.googleapis.com/request_latencies", aligner: "ALIGN_PERCENTILE_99" },
  ],
  "cloud-functions": [
    { key: "requestCount", type: "cloudfunctions.googleapis.com/function/execution_count", aligner: "ALIGN_RATE" },
    { key: "errorRate", type: "cloudfunctions.googleapis.com/function/execution_count" },
    { key: "latencyP99", type: "cloudfunctions.googleapis.com/function/execution_times", aligner: "ALIGN_PERCENTILE_99" },
  ],
  "cloud-sql": [
    { key: "cpu", type: "cloudsql.googleapis.com/database/cpu/utilization" },
    { key: "memory", type: "cloudsql.googleapis.com/database/memory/utilization" },
  ],
  gce: [
    { key: "cpu", type: "compute.googleapis.com/instance/cpu/utilization" },
  ],
  gke: [
    { key: "cpu", type: "kubernetes.io/container/cpu/core_usage_time" },
    { key: "memory", type: "kubernetes.io/container/memory/used_bytes" },
  ],
};

interface MetricServiceClientLike {
  listTimeSeries(req: unknown): Promise<[Array<{
    points?: Array<{ value?: { doubleValue?: number; int64Value?: number | string } }>;
  }>]>;
}

let _client: MetricServiceClientLike | null = null;

async function metricsClient(): Promise<MetricServiceClientLike> {
  if (_client) return _client;
  const mod = (await import("@google-cloud/monitoring")) as unknown as {
    MetricServiceClient: new () => MetricServiceClientLike;
  };
  _client = new mod.MetricServiceClient();
  return _client;
}

export function _setMetricsClientForTest(c: MetricServiceClientLike | null): void {
  _client = c;
}

/**
 * Collect ServiceMetrics for a GCP service. Returns null when there's
 * nothing to query (no credentials, no mapping, or the API call failed).
 * The caller (route handler) is expected to fall back to the AWS path
 * or the simulated metrics from `metrics.ts`.
 */
export async function collectGcpMetrics(serviceId: string): Promise<ServiceMetrics | null> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!projectId || !credsPath) return null;

  const mapping = METRIC_MAP[serviceId];
  if (!mapping) return null;

  let client: MetricServiceClientLike;
  try {
    client = await metricsClient();
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const fiveMinutesAgo = now - 300;

  const result: ServiceMetrics = {
    serviceId,
    collectedAt: new Date().toISOString(),
  };

  await Promise.all(
    mapping.map(async (m) => {
      try {
        const [series] = await client.listTimeSeries({
          name: `projects/${projectId}`,
          filter: `metric.type="${m.type}"`,
          interval: {
            startTime: { seconds: fiveMinutesAgo },
            endTime: { seconds: now },
          },
          aggregation: {
            alignmentPeriod: { seconds: 60 },
            perSeriesAligner: m.aligner ?? "ALIGN_MEAN",
          },
        });
        const v = latestValue(series);
        if (v != null) (result as unknown as Record<string, unknown>)[m.key] = v;
      } catch {
        // Per-metric failure — leave the field undefined.
      }
    }),
  );

  return result;
}

function latestValue(
  series: Array<{ points?: Array<{ value?: { doubleValue?: number; int64Value?: number | string } }> }>,
): number | null {
  for (const s of series) {
    const pts = s.points;
    if (!pts || pts.length === 0) continue;
    const v = pts[0].value;
    if (v?.doubleValue != null) return v.doubleValue;
    if (v?.int64Value != null) return Number(v.int64Value);
  }
  return null;
}
