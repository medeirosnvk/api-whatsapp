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
  ],
};
