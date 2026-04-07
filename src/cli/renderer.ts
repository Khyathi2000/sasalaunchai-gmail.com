import chalk from "chalk";

export function header(title: string): void {
  const line = "─".repeat(60);
  console.log();
  console.log(chalk.cyan(line));
  console.log(chalk.cyan.bold(`  ${title}`));
  console.log(chalk.cyan(line));
  console.log();
}

export function subheader(title: string): void {
  console.log();
  console.log(chalk.white.bold(`  ${title}`));
  console.log(chalk.gray("  " + "─".repeat(40)));
}

export function box(title: string, content: string): void {
  const lines = content.split("\n");
  const maxLen = Math.max(title.length, ...lines.map((l) => l.length));
  const width = Math.min(maxLen + 4, 70);
  const border = "─".repeat(width);

  console.log();
  console.log(chalk.gray(`  ┌${border}┐`));
  console.log(chalk.gray("  │") + chalk.bold(` ${title.padEnd(width - 1)}`) + chalk.gray("│"));
  console.log(chalk.gray(`  ├${border}┤`));
  for (const line of lines) {
    console.log(chalk.gray("  │") + ` ${line.padEnd(width - 1)}` + chalk.gray("│"));
  }
  console.log(chalk.gray(`  └${border}┘`));
}

export function table(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );

  const headerLine = headers.map((h, i) => chalk.bold(h.padEnd(colWidths[i]))).join("  ");
  const separator = colWidths.map((w) => "─".repeat(w)).join("──");

  console.log(`  ${headerLine}`);
  console.log(chalk.gray(`  ${separator}`));
  for (const row of rows) {
    const line = row.map((cell, i) => (cell || "").padEnd(colWidths[i])).join("  ");
    console.log(`  ${line}`);
  }
}

export function success(msg: string): void {
  console.log(chalk.green("  ✓ ") + msg);
}

export function error(msg: string): void {
  console.log(chalk.red("  ✗ ") + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("  ⚠ ") + msg);
}

export function dim(msg: string): void {
  console.log(chalk.gray(`  ${msg}`));
}

export function keyValue(key: string, value: string): void {
  console.log(`  ${chalk.gray(key + ":")} ${value}`);
}

export function agentStatus(agentId: string, status: string, message?: string): void {
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
  const statusStr = colorFn(`[${status.toUpperCase()}]`);
  console.log(`  ${chalk.bold(agentId)} ${statusStr}${message ? ` ${message}` : ""}`);
}
