/* eslint-disable radix */
const mysql = require("mysql2/promise");
require('dotenv').config();

// Função para criar e retornar uma nova conexão
const createConnection = async (dbConfig) => {
  const connection = await mysql.createConnection(dbConfig);
  return connection;
};

// Configuração padrão da conexão MySQL usando variáveis de ambiente
const defaultDbConfig = {
  host: process.env.DB1_MY_SQL_HOST,
  user: process.env.MY_SQL_USER,
  password: process.env.DB1_MY_SQL_PASSWORD,
  port: process.env.MY_SQL_PORT,
  database: process.env.DB1_MY_SQL_DATABASE,
  connectionLimit: parseInt(process.env.MY_SQL_CONNECTION_LIMIT),
  charset: process.env.MY_SQL_CHARSET,
};

// Função para executar consultas no banco de dados
const executeQuery = async (sql, customDbConfig = defaultDbConfig) => {
  const connection = await createConnection(customDbConfig);
  try {
    const [rows, fields] = await connection.execute(sql);
    return rows;
  } finally {
    await connection.end();
  }
};

module.exports = {
  executeQuery,
};
