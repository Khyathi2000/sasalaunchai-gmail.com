import ora, { type Ora } from "ora";

export function createSpinner(text: string): Ora {
  return ora({ text, color: "cyan" });
}

export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  const spinner = ora({ text, color: "cyan" }).start();
  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}
