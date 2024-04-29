import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), sveltekit()],
  server: {
    port: 5174,
    host: "0.0.0.0", // Isso permitirá que o servidor seja acessível a partir de qualquer IP externo

    // Configurações do servidor HMR (WebSocket)
    hmr: {
      clientPort: 5174,
    },
  },
});
