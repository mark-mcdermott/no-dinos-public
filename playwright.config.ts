import { defineConfig } from "@playwright/test"

// Both suites run against a built site served by `astro preview`, which the
// config starts itself (or reuses, locally, if one is already running). Build
// first: `pnpm build && pnpm test`.
// `--ignore-lock` keeps `astro preview` in the foreground: Astro 7 otherwise
// detaches when it detects an AI agent, which Playwright reads as the server dying.
const PORT = Number(process.env.PREVIEW_PORT ?? 4321)

export default defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 120_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    browserName: "chromium",
  },
  webServer: {
    command: `pnpm preview --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "controls", testDir: "./tests/controls", use: { baseURL: `http://localhost:${PORT}` } },
    { name: "visual", testDir: "./tests/visual" },
  ],
})
