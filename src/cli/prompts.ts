import * as p from "@clack/prompts";

export async function selectProvider(): Promise<string> {
  const result = await p.select({
    message: "Select cloud provider",
    options: [
      { value: "aws", label: "Amazon Web Services (AWS)" },
      { value: "gcp", label: "Google Cloud Platform (GCP)" },
    ],
  });
  if (p.isCancel(result)) process.exit(0);
  return result as string;
}

export async function selectRegion(provider: string): Promise<string> {
  const regions: Record<string, { value: string; label: string }[]> = {
    aws: [
      { value: "us-east-1", label: "US East (N. Virginia)" },
      { value: "us-west-2", label: "US West (Oregon)" },
      { value: "eu-central-1", label: "EU (Frankfurt)" },
      { value: "eu-west-1", label: "EU (Ireland)" },
      { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
      { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
    ],
    gcp: [
      { value: "us-central1", label: "US Central (Iowa)" },
      { value: "us-east1", label: "US East (South Carolina)" },
      { value: "europe-west1", label: "Europe West (Belgium)" },
      { value: "asia-east1", label: "Asia East (Taiwan)" },
    ],
  };

  const result = await p.select({
    message: "Select region",
    options: regions[provider] || regions.aws,
  });
  if (p.isCancel(result)) process.exit(0);
  return result as string;
}

export async function confirm(message: string): Promise<boolean> {
  const result = await p.confirm({ message });
  if (p.isCancel(result)) process.exit(0);
  return result;
}

export async function textInput(message: string, placeholder?: string): Promise<string> {
  const result = await p.text({ message, placeholder });
  if (p.isCancel(result)) process.exit(0);
  return result;
}

export async function multiSelect<T extends string>(
  message: string,
  options: { value: T; label: string; hint?: string }[]
): Promise<T[]> {
  const result = await p.multiselect({ message, options: options as { value: string; label: string; hint?: string }[], required: true });
  if (p.isCancel(result)) process.exit(0);
  return result as T[];
}
