import type { ServiceMetrics } from "./collectors/metrics.js";

export interface AnomalyAlert {
  serviceId: string;
  metric: string;
  value: number;
  threshold: number;
  severity: "warning" | "critical";
  message: string;
  detectedAt: string;
}

export interface Thresholds {
  cpuWarning: number;
  cpuCritical: number;
  memoryWarning: number;
  memoryCritical: number;
  errorRateWarning: number;
  errorRateCritical: number;
  latencyWarning: number;
  latencyCritical: number;
}

const defaultThresholds: Thresholds = {
  cpuWarning: 70, cpuCritical: 90,
  memoryWarning: 75, memoryCritical: 90,
  errorRateWarning: 2, errorRateCritical: 5,
  latencyWarning: 1000, latencyCritical: 3000,
};

export function detectAnomalies(
  metrics: ServiceMetrics,
  thresholds: Thresholds = defaultThresholds
): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];
  const now = new Date().toISOString();

  if (metrics.cpu !== undefined) {
    if (metrics.cpu >= thresholds.cpuCritical) {
      alerts.push({ serviceId: metrics.serviceId, metric: "cpu", value: metrics.cpu, threshold: thresholds.cpuCritical, severity: "critical", message: `CPU at ${metrics.cpu.toFixed(1)}% (threshold: ${thresholds.cpuCritical}%)`, detectedAt: now });
    } else if (metrics.cpu >= thresholds.cpuWarning) {
      alerts.push({ serviceId: metrics.serviceId, metric: "cpu", value: metrics.cpu, threshold: thresholds.cpuWarning, severity: "warning", message: `CPU at ${metrics.cpu.toFixed(1)}% (threshold: ${thresholds.cpuWarning}%)`, detectedAt: now });
    }
  }

  if (metrics.memory !== undefined) {
    if (metrics.memory >= thresholds.memoryCritical) {
      alerts.push({ serviceId: metrics.serviceId, metric: "memory", value: metrics.memory, threshold: thresholds.memoryCritical, severity: "critical", message: `Memory at ${metrics.memory.toFixed(1)}% (threshold: ${thresholds.memoryCritical}%)`, detectedAt: now });
    } else if (metrics.memory >= thresholds.memoryWarning) {
      alerts.push({ serviceId: metrics.serviceId, metric: "memory", value: metrics.memory, threshold: thresholds.memoryWarning, severity: "warning", message: `Memory at ${metrics.memory.toFixed(1)}%`, detectedAt: now });
    }
  }

  if (metrics.errorRate !== undefined && metrics.errorRate >= thresholds.errorRateWarning) {
    const severity = metrics.errorRate >= thresholds.errorRateCritical ? "critical" : "warning";
    alerts.push({ serviceId: metrics.serviceId, metric: "errorRate", value: metrics.errorRate, threshold: thresholds.errorRateWarning, severity, message: `Error rate at ${metrics.errorRate.toFixed(2)}%`, detectedAt: now });
  }

  if (metrics.latencyP99 !== undefined && metrics.latencyP99 >= thresholds.latencyWarning) {
    const severity = metrics.latencyP99 >= thresholds.latencyCritical ? "critical" : "warning";
    alerts.push({ serviceId: metrics.serviceId, metric: "latencyP99", value: metrics.latencyP99, threshold: thresholds.latencyWarning, severity, message: `P99 latency at ${metrics.latencyP99.toFixed(0)}ms`, detectedAt: now });
  }

  return alerts;
}
