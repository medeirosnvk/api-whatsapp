const requests = require("./requests");

function formatValue(number) {
  if (number !== undefined && number !== null) {
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } else {
    return "N/A";
  }
}

function formatarMoeda(valorString) {
  let valorNumerico = parseFloat(valorString);
  if (isNaN(valorNumerico)) {
    return "Formato inválido";
  }
  return valorNumerico.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatCredorOfertas(ofertas) {
  return ofertas
    .map(
      (detalhe, index) =>
        `${index + 1}) ` +
        `Parcelamento em ${index + 1} x ` +
        `${formatarMoeda(detalhe.valor_parcela)}`
    )
    .join("\n");
}

function formatCredorInfo(creditorInfo) {
  return creditorInfo
    .map(
      (info, index) =>
        `*--------- ${index + 1} ---------*\n` +
        `IdDevedor: ${info.iddevedor}\n` +
        `Empresa: ${info.empresa}\n` +
        `Saldo: ${formatValue(info.saldo)}`
    )
    .join("\n\n");
}

function formatCredorDividas(creditorDividas) {
  return creditorDividas
    .map(
      (info, index) =>
        `*--------- ${index + 1} ---------*\n` +
        `Contrato: ${info.contrato}\n` +
        `Vencimento: ${formatDateIsoToBr(info.vencimento)}\n` +
        `Dias Atraso: ${info.diasatraso}\n` +
        `Valor: ${formatValue(info.valor)}`
    )
    .join("\n\n");
}

function getCurrentDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentTime() {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

function formatDateIsoToBr(data) {
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateRegistroBr(dateString) {
  const date = new Date(dateString);
  date.setUTCHours(0, 0, 0, 0); // Define a hora para meia-noite (00:00:00) no fuso horário UTC
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function formatDateRegistroBrUTC(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`); // Adiciona a hora e o UTC ao criar a data
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function getUltimaDataParcela(periodicidade, valor_parcela, plano) {
  try {
    const parcelasArray = [];
    const valorParcelaFloat = parseFloat(valor_parcela);
    let ultimaData = new Date(); // Variável para armazenar a última data de vencimento

    for (let i = 0; i < plano; i += 1) {
      const vencimento = new Date();
      vencimento.setDate(vencimento.getDate() + i * periodicidade); // Incrementa 7 dias para cada parcela
      const valorParcelaAtual = valorParcelaFloat.toFixed(2);
      parcelasArray.push({ vencimento, valorParcelaAtual });

      // Atualiza a última data de vencimento a cada iteração
      ultimaData = vencimento;
    }

    return { parcelasArray, ultimaData };
  } catch (error) {
    console.error(error);
  }
}

function parseDadosAcordo(props) {
  const {
    iddevedor,
    plano,
    idcredor,
    total_geral,
    currentTime,
    ultimaDataVencimento,
    juros_percentual,
    honorarios_percentual,
    multa_percentual,
    tarifa_boleto,
    responseDividasCredores
  } = props;

  console.log('ultimaDataVencimento -', ultimaDataVencimento);

  const currentDate = new Date().toISOString().slice(0, 10);

  const insertMessageAcordo = () => {
    const currentDateFormat = formatDateRegistroBr(currentDate);
    const currentDataBase = formatDateRegistroBrUTC(ultimaDataVencimento);
    const currentTimeFormat = getCurrentTime();

    const message = `
Juros.....: ${juros_percentual} %
Honorarios: ${honorarios_percentual} %
Multa.....: ${multa_percentual} %
Campanha..: 
Desconto..: 
Inclusão..: ${currentDateFormat}
Data Base.: ${currentDataBase}
====================================================================================================
  CONTRATO      PARCELA VENCIMENTO   VALOR      JUROS      MULTA     DESCONTO  HONORARIOS   TOTAL   
--------------- ------- ---------- ---------- ---------- ---------- ---------- ---------- ----------
`;

    let dynamicMessage = '';

    responseDividasCredores.forEach((dividas, index, array) => {
      const contrato = dividas.contrato.padEnd(15, ' ');
      const parcela = '10'.padStart(7, ' ');
      const vencimento = formatDateRegistroBr(dividas.vencimento);

      const formatNumber = (number) => {
        const formattedNumber = number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return formattedNumber.replace('R$', '').trim();
      };

      const valor = formatNumber(Number(dividas.saldo)).padStart(10, ' ');
      const juros = formatNumber(Number(dividas.juros_calculado)).padStart(10, ' ');
      const multa = formatNumber(Number(dividas.multa_calculada)).padStart(10, ' ');
      const desconto = '0,00'.padStart(10, ' ');
      const honorarios = formatNumber(Number(dividas.honorarios_calculado)).padStart(10, ' ');
      const total = formatNumber(Number(dividas.total)).padStart(10, ' ');

      if (index === array.length - 1) {
        dynamicMessage += `${contrato} ${parcela} ${vencimento} ${valor} ${juros} ${multa} ${desconto} ${honorarios} ${total}`;
      } else {
        dynamicMessage += `${contrato} ${parcela} ${vencimento} ${valor} ${juros} ${multa} ${desconto} ${honorarios} ${total}\n`;
      }
    });

    let somaSaldo = 0;
    let somaJurosCalculado = 0;
    let somaMultaCalculada = 0;
    let somaHonorariosCalculado = 0;
    let somaTotal = 0;

    responseDividasCredores.forEach((array) => {
      somaSaldo += array.saldo || 0;
      somaJurosCalculado += array.juros_calculado || 0;
      somaMultaCalculada += array.multa_calculada || 0;
      somaHonorariosCalculado += array.honorarios_calculado || 0;
      somaTotal += array.total || 0;
    });

    const formatNumber = (number) => {
      const formattedNumber = number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return formattedNumber.replace('R$', '').trim();
    };

    const totalSaldo = formatNumber(somaSaldo).padStart(45, ' ');
    const totalJuros = formatNumber(somaJurosCalculado).padStart(10, ' ');
    const totalMulta = formatNumber(somaMultaCalculada).padStart(10, ' ');
    const desconto = '0,00'.padStart(10, ' ');
    const totalHonorarios = formatNumber(somaHonorariosCalculado).padStart(10, ' ');
    const totalGeral = formatNumber(somaTotal).padStart(10, ' ');

    const messageTotais = `${totalSaldo} ${totalJuros} ${totalMulta} ${desconto} ${totalHonorarios} ${totalGeral}`;

    const sumMessageTotais = `
                                   ---------- ---------- ---------- ---------- ---------- ----------
${messageTotais}
`;

    const bottomMessage = `
  
\nINCLUÍDO POR: API COBRANCE EM ${currentDateFormat} ${currentTimeFormat}.
---------------------------------------------------------------------------`;

    return (message + dynamicMessage + sumMessageTotais + bottomMessage).trimStart();
  };

  const mensagem = insertMessageAcordo();
  // console.log(mensagem);

  let periodo;

  if (plano === 1) {
    periodo = 1;
  } else {
    periodo = 7;
  }

  return {
    iddevedor,
    inclusao: `'${currentDate}'`,
    descricao: `'${mensagem}'`,
    plano,
    dataacordo: `'${currentDate}'`,
    codexcecao: null,
    contrato: null,
    documento: null,
    idcredor,
    codcli: null,
    codcobradora: null,
    valoroperacao: total_geral,
    dataentrada: null,
    responsavel: "'API ACORDO'",
    hora: `'${currentTime}'`,
    database1: `'${ultimaDataVencimento}'`,
    juros: juros_percentual,
    honorarios: honorarios_percentual,
    multa: multa_percentual,
    idforma: 1,
    situacao: 1,
    idcampanha: 0,
    desconto: 0,
    autorizante: "''",
    margem: "'C'",
    periodo,
    retencao: null,
    idresponsavel: null,
    tipocampanha: "'N'",
    arquivo: null,
    enviado: "'N'",
    data_cancela: null,
    boletagem: 0,
    taxa_boleto: tarifa_boleto,
    idtiponegociacao: 15
  };
}

function parsePromessa(props) {
  const { idacordo, iddevedor, plano } = props;

  return {
    responsavel: 'API PROMESSA',
    data: '',
    valor: 0,
    iddevedor,
    sistema: 'API',
    tipo: 'BOLETO',
    mensagem: '',
    situacao: 1,
    alteracao: null,
    respalteracao: '',
    parcela: 0,
    codigo: 0,
    idacordo,
    plano,
    idresponsavel: 111,
    email: 'N',
    idemail: null,
    idstatus_cartao: null
  };
}

async function criarPromessas(parsedData2, responseDividasCredores, parcelasArray, plano) {
  let contratos = '';
      const contratosIncluidos = new Set();

      responseDividasCredores.forEach((dividas, index) => {
        const { contrato, indice } = dividas;

        // Verifica se o contrato já foi incluído na lista.
        if (!contratosIncluidos.has(contrato)) {
          contratos += contrato;
          contratosIncluidos.add(contrato); // Adiciona o contrato ao Set.

          // Verifica se não é o último contrato antes de adicionar a barra "/".
          if (index !== responseDividasCredores.length - 1) {
            contratos += ' / ';
          }
        }
      });

      const contratosDividas = contratos;

      const promises = [];
      let parcelaNumber = 0;

      for await (const parcela of parcelasArray) {
        parcelaNumber += 1;

        const dataPromessa = {
          ...parsedData2,
          data: parcela.vencimento.toISOString().slice(0, 10),
          valor: parseFloat(parcela.valorParcelaAtual),
          parcela: parcelaNumber
        };

        dataPromessa.mensagem = `Parcela(s) ${parcelaNumber}/${plano} de acordo referente ao(s) título(s): ${contratos}
  Sr(a). Caixa:
  Não receber após o vencimento.
  Não receber valor inferior ao valor facial deste boleto, sem autorização do cedente.
  Sr (a). Cliente:
  A utilização deste boleto é obrigatória para adequada confirmação do pagamento.
  Depósito na conta corrente, sem a devida autorização do cedente, não garante a quitação do débito.
  `;

        // console.log(dataPromessa.mensagem);

        const promise = await requests.postDadosPromessa(dataPromessa);
        promises.push(promise);
      }

    return promises;
}

module.exports = {
  formatValue,
  formatarMoeda,
  formatCredorOfertas,
  formatCredorInfo,
  formatCredorDividas,
  getCurrentDate,
  getCurrentTime,
  formatDateIsoToBr,
  getUltimaDataParcela,
  parseDadosAcordo,
  parsePromessa,
  criarPromessas
};
