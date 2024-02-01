const axios = require('axios');

require('dotenv').config();

async function getCredorDividas(iddevedor, dataBase) {
  const response = await axios.get(`http://localhost:3000/credores/dividas?iddevedor=${iddevedor}&database=${dataBase}`);
  return response.data;
};

module.exports = getCredorDividas;
