export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  service: string;
  message: string;
}

/**
 * Tail logs from CloudWatch Logs or return simulated entries.
 */
export async function tailLogs(serviceId: string, region: string, limit: number = 20): Promise<LogEntry[]> {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    try {
      return await tailFromCloudWatch(serviceId, region, limit);
    } catch {
      // Fall through to simulated
    }
  }

  return [
    { timestamp: new Date().toISOString(), level: "info", service: serviceId, message: "Service running normally" },
  ];
}

async function tailFromCloudWatch(serviceId: string, region: string, limit: number): Promise<LogEntry[]> {
  // Dynamic import to avoid loading SDK when not needed
  const { CloudWatchLogsClient, FilterLogEventsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
  const client = new CloudWatchLogsClient({ region });

  const logGroupMap: Record<string, string> = {
    ecs: "/ecs/launch",
    lambda: "/aws/lambda/launch-function",
    ec2: "/app/launch",
  };

  const logGroup = logGroupMap[serviceId];
  if (!logGroup) {
    return [{ timestamp: new Date().toISOString(), level: "info", service: serviceId, message: "No log group configured" }];
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const response = await client.send(new FilterLogEventsCommand({
    logGroupName: logGroup,
    startTime: fiveMinAgo.getTime(),
    limit,
    interleaved: true,
  }));

  return (response.events || []).map(event => ({
    timestamp: new Date(event.timestamp || Date.now()).toISOString(),
    level: detectLevel(event.message || ""),
    service: serviceId,
    message: (event.message || "").trim().slice(0, 200),
  }));
}

function detectLevel(message: string): "info" | "warn" | "error" {
  const lower = message.toLowerCase();
  if (lower.includes("error") || lower.includes("fatal") || lower.includes("exception")) return "error";
  if (lower.includes("warn") || lower.includes("warning")) return "warn";
  return "info";
}
