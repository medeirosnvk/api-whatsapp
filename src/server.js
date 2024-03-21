const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

// Define o diretório de arquivos estáticos
const publicDirectoryPath = path.join(__dirname, "frontend");

// Configura o servidor para servir os arquivos estáticos
app.use(express.static(publicDirectoryPath));

// Rota para servir a página inicial
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDirectoryPath, "index.html"));
});

// Inicia o servidor
app.listen(process.env.PORT_FRONT, () => {
  console.log(
    `Front-end ChatBot está rodando na porta ${process.env.PORT_FRONT}`
  );
});
