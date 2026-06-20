import type { Service } from "./service";

export const gcpServices: Service[] = [
  { id: "gce", name: "Compute Engine", description: "Virtual machine instances", category: "compute", provider: "gcp" },
  { id: "cloud-run", name: "Cloud Run", description: "Serverless container platform", category: "orchestration", provider: "gcp" },
  { id: "cloud-functions", name: "Cloud Functions", description: "Serverless functions", category: "serverless", provider: "gcp" },
  { id: "cloud-sql", name: "Cloud SQL", description: "Managed relational database", category: "database", provider: "gcp" },
  { id: "firestore", name: "Firestore", description: "NoSQL document database", category: "database", provider: "gcp" },
  { id: "gcs", name: "Cloud Storage", description: "Object storage", category: "storage", provider: "gcp" },
  { id: "cloud-cdn", name: "Cloud CDN", description: "Content delivery network", category: "cdn", provider: "gcp" },
  { id: "cloud-lb", name: "Cloud Load Balancer", description: "Global load balancing", category: "networking", provider: "gcp" },
  { id: "memorystore", name: "Memorystore", description: "Managed Redis and Memcached", category: "caching", provider: "gcp" },
  { id: "pubsub", name: "Pub/Sub", description: "Messaging and event streaming", category: "messaging", provider: "gcp" },
  { id: "cloud-iam", name: "Cloud IAM", description: "Identity and access management", category: "auth", provider: "gcp" },
  { id: "cloud-monitoring", name: "Cloud Monitoring", description: "Monitoring and alerting", category: "observability", provider: "gcp" },
  { id: "artifact-registry", name: "Artifact Registry", description: "Container and package registry", category: "container-registry", provider: "gcp" },
  { id: "secret-manager", name: "Secret Manager", description: "Secret storage", category: "secrets", provider: "gcp" },
  { id: "vpc-gcp", name: "VPC", description: "Virtual private cloud", category: "networking", provider: "gcp" },
];
