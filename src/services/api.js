const axios = require("axios");

const baseURL = "https://whatsapp.cobrance.online:3060";

const axiosApiInstance = axios.create({ baseURL });

module.exports = {
  axiosApiInstance,
};
