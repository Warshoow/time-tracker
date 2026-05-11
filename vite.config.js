import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base = "/time-tracker/" en prod (GitHub Pages) — "/" en dev (localhost).
// Si tu renommes le repo GitHub, change cette valeur.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/time-tracker/" : "/",
  server: {
    port: 5173,
    open: true,
  },
}));
