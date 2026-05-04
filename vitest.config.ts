import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: ["lib/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 30000,
  },
  resolve: {
    // Source code uses NodeNext-style ".js" imports that point at ".ts"
    // files. The regex alias rewrites them at resolve time so vitest can
    // find the actual TS source.
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: "$1.ts" }],
  },
});
