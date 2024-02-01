const axios = require('axios');

require('dotenv').config();

async function getCredorDividasTotais(iddevedor, dataBase) {
  const response = await axios.get(`http://localhost:3000/credores/dividas/total?iddevedor=${iddevedor}&database=${dataBase}`);
  return response.data;
};

module.exports = getCredorDividasTotais;
