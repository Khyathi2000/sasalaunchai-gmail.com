export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  service: string;
  message: string;
}

// Placeholder for CloudWatch Logs integration
export async function tailLogs(serviceId: string, _region: string, _limit: number = 20): Promise<LogEntry[]> {
  // In production, this would call CloudWatch Logs FilterLogEvents
  return [
    { timestamp: new Date().toISOString(), level: "info", service: serviceId, message: "Service running normally" },
  ];
}
