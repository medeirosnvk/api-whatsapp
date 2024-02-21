const axios = require("axios");

const baseURL = "http://localhost:3000";
const axiosApiInstance = axios.create({ baseURL });
const utils = require("./utils");

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

async function getAtualizarPromessas(idacordo) {
  try {
    const { data } = await axiosApiInstance.get(
      `/atualizar-valores-promessas?idacordo=${idacordo}`
    );
    console.log("getAtualizarPromessas -", idacordo, data);
    return data;
  } catch (error) {
    console.error("Erro ao buscar dados no servidor: ", error);
    return { error: "erro ao buscar os dados" };
  }
}

async function getAtualizarValores(idacordo) {
  try {
    const { data } = await axiosApiInstance.get(
      `/atualizar-valores?idacordo=${idacordo}`
    );
    console.log("getAtualizarValores -", idacordo, data);
    return data;
  } catch (error) {
    console.error("Erro ao buscar dados no servidor: ", error);
    return { error: "erro ao buscar os dados" };
  }
}

async function getDataValdoc(props) {
  const { ultimoIdAcordo } = props;
  console.log("ultimoIdAcordo DENTRO DE getDataValdoc -", ultimoIdAcordo);

  try {
    const { data } = await axiosApiInstance.get(
      `/lista-promessas-datavaldoc?idacordo=${ultimoIdAcordo}`
    );
    return data;
  } catch (error) {
    console.error("Erro ao buscar getDataValdoc no servidor: ", error);
    return { error: "Erro ao buscar getDataValdoc no servidor." };
  }
}

async function postDadosBoleto(props) {
  try {
    const { data } = await axiosApiInstance.post("/insert-boleto", props);
    console.log("postDadosBoleto -", data);
    return data;
  } catch (error) {
    const errorMessage = "Erro ao inserir dados do boleto";
    console.error(errorMessage, error);

    return { error: errorMessage };
  }
}

async function postBoletoFinal(
  credorInfo,
  ultimoIdAcordo,
  contratosDividas,
  idDevedor,
  idCredor,
  plano,
  total_geral,
  valor_parcela
) {
  if (!credorInfo.length && contratosDividas === "" && ultimoIdAcordo === "") {
    console.error(
      "Informação faltando: credores, ultimoIdAcordo ou contratosDividas",
      credorInfo
    );
    return;
  }

  const filterCredoresIdDevedor = await credorInfo.find(
    (item) => item.iddevedor === idDevedor
  );

  const { endres, baires, cidres, cepres, ufres, chave, idcedente, cpfcnpj } =
    filterCredoresIdDevedor;

  const responseDataValdoc = await getDataValdoc({ ultimoIdAcordo });

  if (
    responseDataValdoc[0].valdoc === null ||
    responseDataValdoc[0].valdoc === ""
  ) {
    console.error(
      "Informação faltando: responseDataValdoc",
      responseDataValdoc
    );
    return;
  }

  const { datavenc, valdoc } = responseDataValdoc[0];

  const parsedData5 = utils.parseDadosBoleto({
    iddevedor: idDevedor,
    datavenc,
    valdoc,
    idcredor: idCredor,
    cpfcnpj,
    plano,
    total_geral,
    valor_parcela,
    idcedente,
    ultimoIdAcordo,
    endres,
    baires,
    cidres,
    cepres,
    ufres,
    chave,
    contratosDividas,
  });

  const responseBoleto = await postDadosBoleto(parsedData5);

  if (
    responseBoleto &&
    Object.prototype.hasOwnProperty.call(responseBoleto, "error")
  ) {
    console.error("Está faltando alguma coisa: ", { responseBoleto });
    return;
  }
  console.log(`Boleto inserido com sucesso -`, responseBoleto);

  // const data = {
  //   idcredor,
  //   cpfcnpj,
  //   comissao_comercial,
  //   idcomercial,
  //   idgerente_comercial,
  //   iddevedor,
  //   plano,
  //   total_geral,
  //   valor_parcela,
  //   tarifa_boleto,
  //   ultimoIdAcordo,
  //   dataacordo: currentDate,
  // };

  return responseBoleto;
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
  getAtualizarPromessas,
  getAtualizarValores,
  postBoletoFinal,
};
