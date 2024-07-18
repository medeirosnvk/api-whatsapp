module.exports = {
  apps: [
    {
      name: "api-whatsapp",
      script: "npm",
      args: "start",
      watch: true,
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
