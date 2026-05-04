// GCP cost collector. Uses Cloud Billing's BigQuery export when
// configured, falls back to the Cloud Billing Catalog API for SKU
// pricing-based estimates, and finally to the per-service catalog from
// our cost-catalog when neither is available.
//
// Setup that the user runs once:
//   gcloud billing accounts list                                  # pick BILLING_ACCOUNT_ID
//   gcloud billing projects link $GCP_PROJECT_ID \
//     --billing-account=$BILLING_ACCOUNT_ID
//   bq mk billing_export                                          # dataset for the export
//   gcloud beta billing accounts get-iam-policy $BILLING_ACCOUNT_ID
//   # configure the export in the Cloud Console (Billing → Billing export)
//
// Then set:
//   LAUNCH_GCP_BILLING_BQ_DATASET=billing_export
//   LAUNCH_GCP_BILLING_BQ_TABLE=gcp_billing_export_v1_<billing-account-id>

import type { CostBreakdown } from "./cost.js";

interface BillingClientLike {
  getBillingAccount(req: { name: string }): Promise<unknown>;
}

let _billingClient: BillingClientLike | null = null;

async function billingClient(): Promise<BillingClientLike> {
  if (_billingClient) return _billingClient;
  const mod = (await import("@google-cloud/billing")) as unknown as {
    CloudBillingClient: new () => BillingClientLike;
  };
  _billingClient = new mod.CloudBillingClient();
  return _billingClient;
}

/** Test-only: install a stub. */
export function _setBillingClientForTest(c: BillingClientLike | null): void {
  _billingClient = c;
}

/**
 * Fetch real GCP cost data. Returns null if no credentials / project /
 * BigQuery export are configured — the caller falls back to the static
 * catalog estimate.
 */
export async function fetchGcpCosts(_region: string): Promise<CostBreakdown | null> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!projectId || !credsPath) return null;

  // Probe the billing API to validate credentials. We don't need the
  // result — failure means no usable creds.
  try {
    await (await billingClient()).getBillingAccount({
      name: `projects/${projectId}/billingInfo`,
    });
  } catch {
    return null;
  }

  // Two paths from here:
  //   1. BigQuery billing export (best — real cost, broken down by SKU).
  //   2. Catalog-based estimate (rough but always available).
  // We prefer (1) when configured; (2) is a no-op for now and the caller
  // falls through to the static estimate.
  const dataset = process.env.LAUNCH_GCP_BILLING_BQ_DATASET;
  const table = process.env.LAUNCH_GCP_BILLING_BQ_TABLE;
  if (!dataset || !table) return null;

  try {
    return await fetchFromBigQuery(projectId, dataset, table);
  } catch {
    return null;
  }
}

async function fetchFromBigQuery(
  projectId: string,
  dataset: string,
  table: string,
): Promise<CostBreakdown> {
  // Lazy-import @google-cloud/bigquery only if it's actually installed.
  // We don't add it as a dep yet — users who want real GCP cost will
  // need to install it; the catalog estimate covers the default path.
  type BigQueryRow = { service: string; cost: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bq: any = await import("@google-cloud/bigquery" as never).catch(() => null);
  if (!bq) {
    throw new Error("@google-cloud/bigquery is not installed; npm install it to enable real GCP costs");
  }
  const client = new bq.BigQuery({ projectId });
  const sql = `
    SELECT service.description AS service, SUM(cost) AS cost
    FROM \`${projectId}.${dataset}.${table}\`
    WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    GROUP BY service
    ORDER BY cost DESC
    LIMIT 20
  `;
  const [rows] = (await client.query({ query: sql, useLegacySql: false })) as [BigQueryRow[]];
  const byService: CostBreakdown["byService"] = [];
  let totalMonthly = 0;
  for (const row of rows) {
    const monthly = Number(row.cost);
    totalMonthly += monthly;
    byService.push({
      serviceId: row.service.toLowerCase().replace(/\s+/g, "-"),
      monthlyCost: round2(monthly),
      dailyCost: round2(monthly / 30),
    });
  }
  return {
    totalMonthly: round2(totalMonthly),
    totalDaily: round2(totalMonthly / 30),
    byService,
    currency: "USD",
    collectedAt: new Date().toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
