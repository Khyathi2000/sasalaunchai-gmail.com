import { collectMetrics } from "./collectors/metrics.js";
import { checkMultipleEndpoints } from "./collectors/health.js";
import { estimateCosts } from "./collectors/cost.js";
import { detectAnomalies } from "./anomaly-detector.js";
import { renderDashboard } from "./dashboard.js";
import { log } from "../utils/logger.js";
import type { DeploymentPlan } from "../types/plan.js";

export interface MonitorConfig {
  intervalMs: number;
  endpoints: string[];
  serviceIds: string[];
  region: string;
}

export async function startMonitoring(plan: DeploymentPlan, config: MonitorConfig): Promise<void> {
  log.info(`Monitoring ${config.serviceIds.length} services every ${config.intervalMs / 1000}s`);

  const tick = async () => {
    try {
      // Collect all data in parallel
      const [metricsArray, healthResults] = await Promise.all([
        Promise.all(config.serviceIds.map(id => collectMetrics(id, config.region))),
        checkMultipleEndpoints(config.endpoints),
      ]);

      const costs = estimateCosts(config.serviceIds);

      // Detect anomalies
      const allAlerts = metricsArray.flatMap(m => detectAnomalies(m));

      // Render dashboard
      renderDashboard(metricsArray, healthResults, costs, allAlerts);
    } catch (error) {
      log.error(`Monitoring error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Initial tick
  await tick();

  // Set up interval
  const interval = setInterval(tick, config.intervalMs);

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\n");
    log.info("Monitoring stopped.");
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}
