export interface CloudProvider {
  name(): string;
  displayName(): string;
  validateCredentials(): Promise<{ valid: boolean; identity?: string; error?: string }>;
  getRegions(): { id: string; name: string }[];
}
