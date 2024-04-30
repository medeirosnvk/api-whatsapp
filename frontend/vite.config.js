import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sveltekit } from "@sveltejs/kit/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), sveltekit()],
  server: {
    port: 5174,
    hmr: {
      clientPort: 5174,
    },
  },
});
