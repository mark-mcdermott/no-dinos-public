// @ts-check
import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"

// Pure static output — nothing here needs SSR, so no adapter.
export default defineConfig({
  site: "https://www.no-dinos.com",
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
})
