import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: "0.0.0.0", // Isso permitirá que o servidor seja acessível a partir de qualquer IP externo

    // Configurações do servidor HMR (WebSocket)
    hmr: {
      protocol: "ws", // ou 'wss' se estiver usando HTTPS
      host: "191.101.70.186", // Altere para o endereço do seu servidor WebSocket
      port: 5174, // Altere para a porta desejada
      path: "/websocket", // Caminho para a rota WebSocket
    },
  },
});
