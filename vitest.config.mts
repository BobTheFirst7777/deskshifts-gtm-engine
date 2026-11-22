import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      USERS: "ishan:test,tanzil:test",
      API_KEYS: "chatgpt:k1,claude:k2,instinct:k3",
    },
  },
});
