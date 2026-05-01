// In-process registry of live orchestrators and their MessageBuses.
// Keyed by planId so SSE re-attach works across requests within the same Node process.

import type { DeploymentOrchestrator, MigrationOrchestrator, MessageBus } from "./core.js";

const orchestrators = new Map<string, DeploymentOrchestrator>();
const migrations = new Map<string, MigrationOrchestrator>();
const externalBuses = new Map<string, MessageBus>();

export function registerOrchestrator(planId: string, orch: DeploymentOrchestrator): void {
  orchestrators.set(planId, orch);
}

export function getOrchestrator(planId: string): DeploymentOrchestrator | undefined {
  return orchestrators.get(planId);
}

export function unregisterOrchestrator(planId: string): void {
  orchestrators.delete(planId);
}

export function registerMigration(migrationId: string, mig: MigrationOrchestrator): void {
  migrations.set(migrationId, mig);
}

export function getMigration(migrationId: string): MigrationOrchestrator | undefined {
  return migrations.get(migrationId);
}

export function registerBus(key: string, bus: MessageBus): void {
  externalBuses.set(key, bus);
}

export function getBus(key: string): MessageBus | undefined {
  return externalBuses.get(key) ?? orchestrators.get(key)?.getBus();
}

export function listOrchestratorIds(): string[] {
  return Array.from(orchestrators.keys());
}
