import chalk from "chalk";
import type { ServiceMetrics } from "./collectors/metrics.js";
import type { HealthCheckResult } from "./collectors/health.js";
import type { CostBreakdown } from "./collectors/cost.js";
import type { AnomalyAlert } from "./anomaly-detector.js";

function gauge(value: number, max: number = 100, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  const bar = "█".repeat(Math.min(filled, width)) + "░".repeat(Math.max(width - filled, 0));
  const color = value > 80 ? chalk.red : value > 60 ? chalk.yellow : chalk.green;
  return color(bar) + ` ${value.toFixed(1)}%`;
}

function statusDot(status: string): string {
  if (status === "healthy" || status === "done") return chalk.green("●");
  if (status === "unhealthy" || status === "error") return chalk.red("●");
  return chalk.yellow("●");
}

export function renderDashboard(
  metrics: ServiceMetrics[],
  health: HealthCheckResult[],
  costs: CostBreakdown,
  alerts: AnomalyAlert[]
): void {
  console.clear();
  const line = chalk.gray("─".repeat(70));

  console.log(chalk.cyan.bold("\n  ╔══════════════════════════════════════════════════════════╗"));
  console.log(chalk.cyan.bold("  ║         LAUNCH PLATFORM — MONITORING DASHBOARD          ║"));
  console.log(chalk.cyan.bold("  ╚══════════════════════════════════════════════════════════╝\n"));

  // Health status
  console.log(chalk.white.bold("  Service Health"));
  console.log(`  ${line}`);
  for (const h of health) {
    console.log(`  ${statusDot(h.status)} ${h.url.padEnd(40)} ${h.responseTime}ms`);
  }
  console.log();

  // Metrics
  console.log(chalk.white.bold("  Resource Metrics"));
  console.log(`  ${line}`);
  for (const m of metrics) {
    console.log(`  ${chalk.bold(m.serviceId.padEnd(16))} CPU: ${gauge(m.cpu ?? 0)}  MEM: ${gauge(m.memory ?? 0)}`);
  }
  console.log();

  // Cost
  console.log(chalk.white.bold("  Cost Estimate"));
  console.log(`  ${line}`);
  console.log(`  Daily:   ${chalk.yellow("$" + costs.totalDaily.toFixed(2))}`);
  console.log(`  Monthly: ${chalk.yellow("$" + costs.totalMonthly.toFixed(2))}`);
  console.log();

  // Alerts
  if (alerts.length > 0) {
    console.log(chalk.red.bold("  ⚠ Active Alerts"));
    console.log(`  ${line}`);
    for (const a of alerts) {
      const icon = a.severity === "critical" ? chalk.red("✗") : chalk.yellow("⚠");
      console.log(`  ${icon} ${chalk.bold(a.serviceId)}: ${a.message}`);
    }
  } else {
    console.log(chalk.green("  ✓ No active alerts"));
  }

  console.log();
  console.log(chalk.gray(`  Last updated: ${new Date().toISOString().slice(11, 19)}  |  Press Ctrl+C to exit`));
}
