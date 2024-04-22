import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/ws": {
        target: "ws://191.101.70.186", // Altere para o endereço do seu servidor WebSocket
        changeOrigin: true,
        ws: true,
      },
    },
    host: "0.0.0.0", // Isso permitirá que o servidor seja acessível a partir de qualquer IP externo
    port: 5174, // Altere para a porta desejada
  },
});
