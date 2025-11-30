// astro.config.mjs
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],
  output: "static",          // 🔹 solo estático, nada de SSR
  vite: {
    plugins: [tailwindcss()],
    envPrefix: "PUBLIC_",   // para PUBLIC_BACKEND_URL
  },
});
