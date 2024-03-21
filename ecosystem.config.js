module.exports = {
  apps: [
    {
      name: "api-whatsapp",
      script: "npm",
      args: "run server",
      watch: true,
      cwd: "src",
      env: {
        PORT: 3002,
      },
    },
    {
      name: "api-whatsapp-frontend",
      script: "npm",
      args: "run front",
      watch: true,
      cwd: "src/frontend",
      env: {
        PORT: 5175,
      },
    },
  ],
};
