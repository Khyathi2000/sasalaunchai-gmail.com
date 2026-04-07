import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";
const levelOrder: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  debug(msg: string, ...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.log(chalk.gray(`[${timestamp()}] DBG`), chalk.gray(msg), ...args);
    }
  },
  info(msg: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.log(chalk.blue(`[${timestamp()}] INF`), msg, ...args);
    }
  },
  warn(msg: string, ...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.log(chalk.yellow(`[${timestamp()}] WRN`), chalk.yellow(msg), ...args);
    }
  },
  error(msg: string, ...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(chalk.red(`[${timestamp()}] ERR`), chalk.red(msg), ...args);
    }
  },
  success(msg: string): void {
    console.log(chalk.green("  ✓"), msg);
  },
  step(msg: string): void {
    console.log(chalk.cyan("  →"), msg);
  },
};
