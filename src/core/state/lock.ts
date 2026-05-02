import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export class ExecutionLock {
  private filePath: string;

  constructor(workDir: string) {
    this.filePath = join(workDir, "lock");
  }

  acquire(): boolean {
    if (existsSync(this.filePath)) {
      const content = readFileSync(this.filePath, "utf-8");
      try {
        const lock = JSON.parse(content);
        const age = Date.now() - new Date(lock.acquiredAt).getTime();
        // Auto-release stale locks older than 1 hour
        if (age < 3600_000) {
          return false;
        }
      } catch {
        // Corrupt lock file, take it over
      }
    }

    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    writeFileSync(this.filePath, JSON.stringify({
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    }));
    return true;
  }

  release(): void {
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath);
    }
  }

  isLocked(): boolean {
    return existsSync(this.filePath);
  }
}
