const axios = require('axios');

require('dotenv').config();

async function getCredorVerBoleto(iddevedor) {
  const response = await axios.get(`http://localhost:3000/credores/oferta-parcelas?iddevedor=${iddevedor}`);
  return response.data;
};

module.exports = getCredorVerBoleto;
