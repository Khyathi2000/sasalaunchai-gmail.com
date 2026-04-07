export interface Service {
  id: string;
  name: string;
  description: string;
  category: "compute" | "database" | "storage" | "networking" | "messaging" | "caching" | "auth" | "observability" | "orchestration" | "cdn" | "dns" | "ci-cd" | "secrets" | "container-registry" | "serverless";
  provider: "aws" | "gcp";
}
