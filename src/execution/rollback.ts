import { ExecutionJournal, type JournalEntry } from "../state/journal.js";
import { terraformDestroy } from "./terraform.js";
import { log } from "../utils/logger.js";
import { join } from "path";
import { existsSync } from "fs";

export async function rollbackFromJournal(workDir: string): Promise<void> {
  const journal = new ExecutionJournal(workDir);
  const entries = journal.read();

  // Find completed agents and rollback in reverse order
  const completedAgents = entries
    .filter(e => e.type === "phase:complete" && e.agentId)
    .map(e => e.agentId!)
    .reverse();

  // Deduplicate
  const seen = new Set<string>();
  const unique = completedAgents.filter(id => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  for (const agentId of unique) {
    const serviceId = agentId.replace("-agent", "");
    const tfDir = join(workDir, "artifacts", "terraform", "aws", serviceId);

    if (existsSync(join(tfDir, "main.tf"))) {
      log.info(`Rolling back: ${serviceId}`);
      const result = terraformDestroy(tfDir);
      if (!result.success) {
        log.error(`Rollback failed for ${serviceId}: ${result.output}`);
      }
    }
  }

  journal.append({ type: "rollback:complete", data: { agents: unique } });
  log.info("Rollback complete");
}
