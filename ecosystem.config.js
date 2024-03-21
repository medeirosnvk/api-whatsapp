module.exports = {
  apps: [
    {
      name: "api-whatsapp",
      script: "npm",
      args: "start",
      watch: true,
      cwd: "src",
      env: {
        PORT: 3002,
      },
    },
    {
      name: "frontend",
      script: "npm",
      args: "front", // Use o script 'front' definido no package.json
      watch: true,
      cwd: "src/frontend",
      env: {
        PORT: 3003,
      },
    },
  ],
};
