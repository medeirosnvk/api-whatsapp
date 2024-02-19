const axios = require("axios");

const baseURL = "http://localhost:3000";
const axiosApiInstance = axios.create({ baseURL });

async function getAcordosFirmados(document) {
  const response = await axiosApiInstance.get(
    `/lista-acordos-firmados?documento=${document}`
  );

  return response.data;
}

async function getAcordosFirmadosDetalhado(idacordo) {
  const response = await axiosApiInstance.get(
    `/lista-acordos-firmados-detalhado?idacordo=${idacordo}`
  );

  return response.data;
}

async function getCredorDividas(iddevedor, dataBase) {
  const response = await axiosApiInstance.get(
    `/credores/dividas?iddevedor=${iddevedor}&database=${dataBase}`
  );

  return response.data;
}

async function getCredorDividasTotais(iddevedor, dataBase) {
  const response = await axiosApiInstance.get(
    `/credores/dividas/total?iddevedor=${iddevedor}&database=${dataBase}`
  );

  return response.data;
}

async function getCredorInfo(document) {
  const response = await axiosApiInstance.get(
    `/lista-credores?documento=${document}`
  );

  return response.data;
}

async function getCredorOfertas(iddevedor) {
  const response = await axiosApiInstance.get(
    `/credores/oferta-parcelas?iddevedor=${iddevedor}`
  );

  return response.data;
}

async function getCredorVerBoleto(iddevedor) {
  const response = await axiosApiInstance.get(
    `/credores/oferta-parcelas?iddevedor=${iddevedor}`
  );

  return response.data;
}

async function postDadosAcordo(props) {
  try {
    const { data } = await axiosApiInstance.post("/insert-acordo", props);
    return data;
  } catch (error) {
    const errorMessage = "Erro ao inserir dados do acordo";
    console.error(errorMessage, error);

    return { error: errorMessage };
  }
}

async function postDadosPromessa(props) {
  try {
    const { data } = await axiosApiInstance.post("/insert-promessa", props);
    return data;
  } catch (error) {
    const errorMessage = "Erro ao inserir promessa";
    console.error(errorMessage, error);

    return { error: errorMessage };
  }
}

async function postDadosRecibo(props) {
  try {
    const { data } = await axiosApiInstance.post(
      "/insert-recibo/parcelado",
      props
    );
    return data;
  } catch (error) {
    const errorMessage = "Erro ao inserir dados do recibo";
    console.error(errorMessage, error);

    return { error: errorMessage };
  }
}

module.exports = {
  getAcordosFirmados,
  getAcordosFirmadosDetalhado,
  getCredorDividas,
  getCredorDividasTotais,
  getCredorInfo,
  getCredorOfertas,
  getCredorVerBoleto,
  postDadosAcordo,
  postDadosPromessa,
  postDadosRecibo,
};
