const axios = require('axios');

require('dotenv').config();

async function getAcordosFirmadosDetalhado(idacordo) {
  const response = await axios.get(`http://localhost:3000/lista-acordos-firmados-detalhado?idacordo=${idacordo}`);
  return response.data;
};

module.exports = getAcordosFirmadosDetalhado;
