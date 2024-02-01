const axios = require('axios');

async function getCredorInfo(document) {
  const response = await axios.get(`http://localhost:3000/lista-credores?documento=${document}`);
  return response.data;
};

module.exports = getCredorInfo;

