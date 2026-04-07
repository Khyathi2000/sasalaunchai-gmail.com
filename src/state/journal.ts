import { appendFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export interface JournalEntry {
  timestamp: string;
  type: string;
  agentId?: string;
  phase?: string;
  data: Record<string, unknown>;
}

export class ExecutionJournal {
  private filePath: string;

  constructor(workDir: string) {
    this.filePath = join(workDir, "journal.ndjson");
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  append(entry: Omit<JournalEntry, "timestamp">): void {
    const full: JournalEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    appendFileSync(this.filePath, JSON.stringify(full) + "\n");
  }

  read(): JournalEntry[] {
    if (!existsSync(this.filePath)) return [];
    const content = readFileSync(this.filePath, "utf-8");
    return content
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line) as JournalEntry; }
        catch { return null; }
      })
      .filter((e): e is JournalEntry => e !== null);
  }

  hasCompleted(agentId: string, phase: string): boolean {
    return this.read().some(
      e => e.agentId === agentId && e.phase === phase && e.type === "phase:complete"
    );
  }
}
