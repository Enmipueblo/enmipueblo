// astro.config.mjs
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://enmipueblo.com", // ✅ necesario para canonical/og:url correctos
  integrations: [react()],
  output: "static",
  vite: {
    plugins: [tailwindcss()],
    envPrefix: "PUBLIC_",
  },
});
