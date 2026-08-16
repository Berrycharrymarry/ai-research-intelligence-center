import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "request-logger",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const t = new Date().toISOString();
          res.on("finish", () => {
            console.log(`[http] ${t} ${req.method} ${req.url} -> ${res.statusCode}`);
          });
          next();
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
