import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", target: "es2022" },
  test: { globals: true, environment: "node" },
});
