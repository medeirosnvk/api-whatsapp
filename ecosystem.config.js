module.exports = {
  apps: [
    {
      name: "api-whatsapp",
      script: "npm", // Substitua pelo nome do seu arquivo de entrada do servidor Node.js
      args: "start", // Substitua pelo nome do seu arquivo de entrada do servidor Node.js
      watch: true, // Isso reiniciará o servidor quando houver alterações nos arquivos
      cwd: "backend",
      env: {
        PORT: 3002, // Porta para o servidor Node.js
      },
    },
  ],
};
