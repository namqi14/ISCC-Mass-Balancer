import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Free ngrok assigns a new random subdomain on every restart (unless
    // you've claimed a static domain), so a hardcoded hostname breaks the
    // next time ngrok is started. Wildcard both domains ngrok has used for
    // its free tier instead of pinning to one session's hostname.
    allowedHosts: [".ngrok-free.app", ".ngrok-free.dev"],
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
});
