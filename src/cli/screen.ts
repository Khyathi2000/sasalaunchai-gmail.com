import chalk from "chalk";

const BRAND = `
  ███████╗ █████╗ ███████╗ █████╗
  ██╔════╝██╔══██╗██╔════╝██╔══██╗
  ███████╗███████║███████╗███████║
  ╚════██║██╔══██║╚════██║██╔══██║
  ███████║██║  ██║███████║██║  ██║
  ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝`;

export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

export function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

export function showBanner(): void {
  const width = getTerminalWidth();
  const border = chalk.cyan("═".repeat(width));

  console.log();
  console.log(border);
  for (const line of BRAND.split("\n")) {
    if (line.trim()) {
      console.log(chalk.cyan.bold(line));
    }
  }
  console.log(chalk.white.bold("  L A U N C H") + chalk.gray("  ·  Cloud Deployment Platform  ·  v0.1.0"));
  console.log(border);
  console.log();
}

export function showStepHeader(current: number, total: number, title: string): void {
  const width = getTerminalWidth();
  const progress = Math.round((current / total) * (width - 20));
  const bar = chalk.cyan("━".repeat(progress)) + chalk.gray("━".repeat(Math.max(0, width - 20 - progress)));

  console.log();
  console.log(`  ${chalk.cyan.bold(`STEP ${current} OF ${total}`)} ${bar}`);
  console.log(`  ${chalk.white.bold(title)}`);
  console.log();
}

export function panel(title: string, content: string, color: (s: string) => string = chalk.gray): void {
  const width = Math.min(getTerminalWidth() - 4, 76);
  const border = "─".repeat(width - 2);
  const lines = content.split("\n");

  console.log(color(`  ┌─ ${title} ${"─".repeat(Math.max(0, width - title.length - 5))}┐`));
  for (const line of lines) {
    const trimmed = line.slice(0, width - 4);
    console.log(color("  │") + ` ${trimmed.padEnd(width - 3)}` + color("│"));
  }
  console.log(color(`  └${border}┘`));
}

export function statusPanel(title: string, items: { label: string; value: string; color?: (s: string) => string }[]): void {
  const width = Math.min(getTerminalWidth() - 4, 76);
  const border = "─".repeat(width - 2);

  console.log(chalk.cyan(`  ┌─ ${title} ${"─".repeat(Math.max(0, width - title.length - 5))}┐`));
  for (const item of items) {
    const colorFn = item.color || chalk.white;
    const label = chalk.gray(item.label.padEnd(16));
    const value = colorFn(item.value.slice(0, width - 22));
    console.log(chalk.cyan("  │") + ` ${label} ${value.padEnd(width - 20)}` + chalk.cyan("│"));
  }
  console.log(chalk.cyan(`  └${border}┘`));
}

export function serviceTable(
  headers: string[],
  rows: { cells: string[]; color?: (s: string) => string }[]
): void {
  const width = Math.min(getTerminalWidth() - 4, 76);

  // Calculate column widths
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r.cells[i] || "").length))
  );

  const headerLine = headers.map((h, i) => chalk.white.bold(h.padEnd(colWidths[i]))).join("  ");
  const separator = colWidths.map(w => "─".repeat(w)).join("──");

  console.log(`    ${headerLine}`);
  console.log(chalk.gray(`    ${separator}`));
  for (const row of rows) {
    const colorFn = row.color || chalk.white;
    const line = row.cells.map((cell, i) => (cell || "").padEnd(colWidths[i])).join("  ");
    console.log(`    ${colorFn(line)}`);
  }
}

export function progressBar(label: string, value: number, max: number = 100, barWidth: number = 25): string {
  const filled = Math.round((value / max) * barWidth);
  const empty = Math.max(0, barWidth - filled);
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const color = value > 80 ? chalk.red : value > 60 ? chalk.yellow : chalk.green;
  return `${label.padEnd(14)} ${color(bar)} ${value.toFixed(1)}%`;
}

export function agentStatusLine(
  agentId: string,
  status: string,
  message?: string,
  duration?: number
): void {
  const statusColors: Record<string, (s: string) => string> = {
    idle: chalk.gray,
    provisioning: chalk.yellow,
    configuring: chalk.blue,
    deploying: chalk.magenta,
    validating: chalk.cyan,
    done: chalk.green,
    error: chalk.red,
    "rolling-back": chalk.redBright,
  };
  const colorFn = statusColors[status] || chalk.white;
  const dot = status === "done" ? chalk.green("●") : status === "error" ? chalk.red("●") : chalk.yellow("●");
  const dur = duration !== undefined ? chalk.gray(` [${(duration / 1000).toFixed(1)}s]`) : "";
  const msg = message ? chalk.gray(` ${message}`) : "";

  console.log(`    ${dot} ${agentId.padEnd(24)} ${colorFn(status.toUpperCase().padEnd(14))}${dur}${msg}`);
}

export function costBar(serviceId: string, monthly: number, maxMonthly: number): void {
  const barWidth = 20;
  const filled = Math.round((monthly / maxMonthly) * barWidth);
  const bar = chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(Math.max(0, barWidth - filled)));
  console.log(`    ${serviceId.padEnd(20)} $${monthly.toFixed(2).padStart(7)}/mo  ${bar}`);
}

export function divider(): void {
  console.log(chalk.gray(`  ${"─".repeat(Math.min(getTerminalWidth() - 4, 76))}`));
}

export function success(msg: string): void {
  console.log(chalk.green(`  ✓ ${msg}`));
}

export function error(msg: string): void {
  console.log(chalk.red(`  ✗ ${msg}`));
}

export function info(msg: string): void {
  console.log(chalk.blue(`  → ${msg}`));
}

export function warn(msg: string): void {
  console.log(chalk.yellow(`  ⚠ ${msg}`));
}

export function dim(msg: string): void {
  console.log(chalk.gray(`    ${msg}`));
}

export function showComplete(): void {
  const width = getTerminalWidth();
  console.log();
  console.log(chalk.green("═".repeat(width)));
  console.log(chalk.green.bold("  ✓ SASA LAUNCH COMPLETE"));
  console.log(chalk.green("═".repeat(width)));
  console.log();
}
