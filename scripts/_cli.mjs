// Shared helpers for the Node-based GCP scripts (secrets/logs/deploy).
// Tiny on purpose — keeps each script readable while killing dup.

export const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

// Minimal argv flag parser. `args` is process.argv.slice(2).
// `has("--foo")` → boolean; `val("--foo", "default")` → next token or default.
export function flagReader(args) {
  return {
    has: (f) => args.includes(f),
    val: (f, d) => {
      const i = args.indexOf(f);
      return i >= 0 && args[i + 1] ? args[i + 1] : d;
    },
  };
}
