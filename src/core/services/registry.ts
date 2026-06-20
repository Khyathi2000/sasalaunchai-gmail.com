import type { Service } from "./service";
import { awsServices } from "./aws-services";
import { gcpServices } from "./gcp-services";

const allServices: Service[] = [...awsServices, ...gcpServices];

export function getServiceRegistry(): Service[] {
  return allServices;
}

export function forProvider(provider: string): Service[] {
  return allServices.filter((s) => s.provider === provider);
}

export function getServiceById(id: string): Service | undefined {
  return allServices.find((s) => s.id === id);
}

export function getServicesByCategory(category: string, provider?: string): Service[] {
  return allServices.filter(
    (s) => s.category === category && (!provider || s.provider === provider)
  );
}
