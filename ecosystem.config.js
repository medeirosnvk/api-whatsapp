module.exports = {
  apps: [
    {
      name: "app-whatsapp",
      script: "npm",
      args: "start",
      watch: true,
      cwd: "app",
      env: {
        PORT: 3002,
      },
    },
  ],
  cron_restart: {
    cron_time: "0 6 * * *",
    timezone: "America/Sao_Paulo",
  },
};
