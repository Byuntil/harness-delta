import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    projects: [
      {
        extends: false,
        test: {
          name: "process-budget",
          environment: "node",
          include: ["tests/owned-cli-invocation.test.ts"],
          fileParallelism: false,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: false,
        test: {
          name: "default",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/owned-cli-invocation.test.ts"],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
