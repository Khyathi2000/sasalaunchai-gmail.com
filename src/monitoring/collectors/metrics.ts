export interface MetricDataPoint {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  dimensions: Record<string, string>;
}

export interface ServiceMetrics {
  serviceId: string;
  cpu?: number;
  memory?: number;
  requestCount?: number;
  errorRate?: number;
  latencyP50?: number;
  latencyP99?: number;
  collectedAt: string;
}

// Placeholder for AWS CloudWatch integration
export async function collectMetrics(serviceId: string, _region: string): Promise<ServiceMetrics> {
  // In production, this would call CloudWatch GetMetricData
  return {
    serviceId,
    cpu: Math.random() * 30 + 5, // Simulated
    memory: Math.random() * 40 + 20,
    requestCount: Math.floor(Math.random() * 1000),
    errorRate: Math.random() * 2,
    latencyP50: Math.random() * 100 + 20,
    latencyP99: Math.random() * 500 + 100,
    collectedAt: new Date().toISOString(),
  };
}
