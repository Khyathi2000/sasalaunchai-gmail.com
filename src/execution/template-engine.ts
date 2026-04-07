import Handlebars from "handlebars";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { log } from "../utils/logger.js";

export interface TemplateContext {
  project: {
    name: string;
    language: string;
    framework: string;
    runtime: string;
    port: number;
    entrypoint: string;
    envVars: { key: string; value: string; sensitive: boolean }[];
  };
  provider: {
    name: string;
    region: string;
  };
  service: Record<string, unknown>;
  outputs: Record<string, Record<string, unknown>>;
}

export function renderTemplate(templatePath: string, context: TemplateContext): string {
  if (!existsSync(templatePath)) {
    log.warn(`Template not found: ${templatePath}`);
    return `# Template not found: ${templatePath}`;
  }
  const source = readFileSync(templatePath, "utf-8");
  const template = Handlebars.compile(source);
  return template(context);
}

export function renderInlineTemplate(source: string, context: Record<string, unknown>): string {
  const template = Handlebars.compile(source);
  return template(context);
}

// Register common helpers
Handlebars.registerHelper("json", (obj: unknown) => JSON.stringify(obj, null, 2));
Handlebars.registerHelper("upper", (str: string) => str?.toUpperCase());
Handlebars.registerHelper("lower", (str: string) => str?.toLowerCase());
Handlebars.registerHelper("kebab", (str: string) => str?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase());
Handlebars.registerHelper("ifEq", function(this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this);
});
