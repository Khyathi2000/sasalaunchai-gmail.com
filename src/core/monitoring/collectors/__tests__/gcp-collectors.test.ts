import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  _setBillingClientForTest,
  fetchGcpCosts,
} from "../gcp-cost.js";
import {
  _setMetricsClientForTest,
  collectGcpMetrics,
} from "../gcp-metrics.js";

beforeEach(() => {
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.LAUNCH_GCP_BILLING_BQ_DATASET;
  delete process.env.LAUNCH_GCP_BILLING_BQ_TABLE;
  _setBillingClientForTest(null);
  _setMetricsClientForTest(null);
});

afterEach(() => {
  _setBillingClientForTest(null);
  _setMetricsClientForTest(null);
});

describe("fetchGcpCosts", () => {
  it("returns null when no credentials are set", async () => {
    expect(await fetchGcpCosts("us-central1")).toBeNull();
  });

  it("returns null when billing client throws", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/creds.json";
    _setBillingClientForTest({
      getBillingAccount: async () => {
        throw new Error("nope");
      },
    });
    expect(await fetchGcpCosts("us-central1")).toBeNull();
  });

  it("returns null when BQ export is not configured", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/creds.json";
    _setBillingClientForTest({ getBillingAccount: async () => ({}) });
    expect(await fetchGcpCosts("us-central1")).toBeNull();
  });
});

describe("collectGcpMetrics", () => {
  it("returns null when no credentials are set", async () => {
    expect(await collectGcpMetrics("cloud-run")).toBeNull();
  });

  it("returns null for an unmapped service id", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/creds.json";
    expect(await collectGcpMetrics("imaginary-service")).toBeNull();
  });

  it("collects mapped metrics for cloud-run via the stubbed client", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/creds.json";
    _setMetricsClientForTest({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      listTimeSeries: async (_req: unknown) => [
        [{ points: [{ value: { doubleValue: 0.42 } }] }],
      ],
    });
    const m = await collectGcpMetrics("cloud-run");
    expect(m).not.toBeNull();
    expect(m!.serviceId).toBe("cloud-run");
    // All five mapped metrics should land at 0.42 (stub returns same value).
    expect(m!.cpu).toBe(0.42);
    expect(m!.memory).toBe(0.42);
    expect(m!.requestCount).toBe(0.42);
    expect(m!.latencyP50).toBe(0.42);
    expect(m!.latencyP99).toBe(0.42);
  });

  it("tolerates per-metric failures and returns partial results", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/creds.json";
    let firstCall = true;
    _setMetricsClientForTest({
      listTimeSeries: async () => {
        if (firstCall) {
          firstCall = false;
          throw new Error("transient");
        }
        return [[{ points: [{ value: { doubleValue: 0.7 } }] }]];
      },
    });
    const m = await collectGcpMetrics("cloud-sql");
    expect(m).not.toBeNull();
    // One of {cpu, memory} fails, the other lands.
    const filled = [m!.cpu, m!.memory].filter((v) => v != null);
    expect(filled).toHaveLength(1);
  });
});
