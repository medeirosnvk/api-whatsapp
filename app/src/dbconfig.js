const puppeteer = require("puppeteer");
const mysql = require("mysql2/promise");
require("dotenv").config();

const createBrowserInstance = async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
    executablePath: "/usr/bin/chromium-browser",
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  return browser;
};

const createConnection = async (dbConfig) => {
  const connection = await mysql.createConnection(dbConfig);
  return connection;
};

const defaultDbConfig = {
  host: process.env.DB1_MY_SQL_HOST,
  user: process.env.MY_SQL_USER,
  password: process.env.DB1_MY_SQL_PASSWORD,
  port: process.env.MY_SQL_PORT,
  database: process.env.DB1_MY_SQL_DATABASE,
  connectionLimit: parseInt(process.env.MY_SQL_CONNECTION_LIMIT),
  charset: process.env.MY_SQL_CHARSET,
};

const executeQuery = async (sql, customDbConfig = defaultDbConfig) => {
  try {
    const connection = await createConnection(customDbConfig);
    try {
      const [rows, fields] = await connection.execute(sql);
      return rows;
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error("Erro ao executar a consulta:", error);
    throw error; // Re-throw the error to handle it in the caller function
  }
};

module.exports = {
  createBrowserInstance,
  executeQuery,
};
