require("dotenv").config();
const qrcode = require("qrcode-terminal");
const { MessageMedia } = require("whatsapp-web.js");
const { Client, LocalAuth } = require("whatsapp-web.js");

const { executeQuery } = require("./dbconfig");

const requests = require("./services/requests");
const utils = require("./services/utils");

const customDbConfig = {
  host: process.env.DB2_MY_SQL_HOST,
  user: process.env.MY_SQL_USER,
  password: process.env.DB2_MY_SQL_PASSWORD,
  port: process.env.MY_SQL_PORT,
  database: process.env.DB2_MY_SQL_DATABASE,
  connectionLimit: parseInt(process.env.MY_SQL_CONNECTION_LIMIT),
  charset: process.env.MY_SQL_CHARSET,
};

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox"],
  },
});

class StateMachine {
  constructor() {
    this.userStates = {};
    this.client = client;
    this.document = null;
    this.idDevedor = null;
    this.globalData = {};
  }

  _getCredor(phoneNumber) {
    return this.userStates[phoneNumber].credor;
  }

  _getState(phoneNumber) {
    if (this.userStates[phoneNumber]) {
      return this.userStates[phoneNumber];
    }

    this.userStates[phoneNumber] = {
      currentState: "INICIO",
      credor: {},
      data: {
        CREDOR: {},
        OFERTA: {},
      },
    };

    return this.userStates[phoneNumber];
  }

  _setCredor(phoneNumber, credor) {
    this.userStates[phoneNumber].credor = credor;
  }

  _setCurrentState(phoneNumber, newState) {
    if (!this.userStates[phoneNumber]) {
      this.userStates[phoneNumber] = { currentState: "INICIO" };
    }

    this.userStates[phoneNumber].currentState = newState;
  }

  _resetUserState(phoneNumber) {
    delete this.userStates[phoneNumber];
  }

  _setDataMenu(phoneNumber, data) {
    this.userStates[phoneNumber].data.MENU = data;
  }

  _setDataCredores(phoneNumber, data) {
    this.userStates[phoneNumber].data.CREDORES = data;
  }

  _setDataCredorSelecionado(phoneNumber, data) {
    this.userStates[phoneNumber].data.CREDOR_SELECIONADO = data;
  }

  _setDataCredorDividas(phoneNumber, data) {
    this.userStates[phoneNumber].data.CREDOR_DIVIDAS = data;
  }

  _setDataOferta(phoneNumber, data) {
    this.userStates[phoneNumber].data.OFERTA = data;
  }

  _setDataPromessas(phoneNumber, data) {
    this.userStates[phoneNumber].data.PROMESSAS = data;
  }

  _setDataBoleto(phoneNumber, data) {
    this.userStates[phoneNumber].data.BOLETO = data;
  }

  async _postMessage(origin, message) {
    console.log(`Horário da mensagem enviada ao cliente: ${new Date()}`);
    await this.client.sendMessage(origin, message);
  }

  async _getCredorFromDB(phoneNumber) {
    const dbQuery = `
      select
      d.iddevedor,
      d.cpfcnpj,
      d.nome,
      t.telefone,
      t.idtelefones
    from
      statustelefone s,
      telefones2 t
    left join devedor d on
      d.cpfcnpj = t.cpfcnpj
    where
      right(t.telefone,8) = '${phoneNumber}'
      and d.idusuario not in (11, 14)
      and s.idstatustelefone = t.idstatustelefone
      and s.fila = 's' ;
    `;

    const dbResponse = await executeQuery(dbQuery, customDbConfig);

    if (dbResponse && dbResponse.length) {
      this._setCredor(phoneNumber, dbResponse[0]);
      return dbResponse[0];
    }

    throw new Error(`Nao existe credor vinculado ao numero ${phoneNumber}.`);
  }

  async _getWhaticketStatus(phoneNumber) {
    const dbQuery = `
    SELECT DISTINCT c.*, t.*,
    (SELECT m.fromMe FROM Messages m WHERE m.ticketId = t.id ORDER BY m.createdAt DESC LIMIT 1) AS fromMe,
    (SELECT m.body FROM Messages m WHERE m.ticketId = t.id ORDER BY m.createdAt DESC LIMIT 1) AS body
    FROM Tickets t
    LEFT JOIN Contacts c ON c.id = t.contactId
    WHERE status = 'pending' AND LENGTH(c.number) <= 15 AND c.number = '${phoneNumber}'
    HAVING fromMe = 0;
    `;

    const dbResponse = await executeQuery(dbQuery);

    if (dbResponse && dbResponse.length) {
      return dbResponse;
    }

    throw new Error("Something não encontrado");
  }

  async _handleErrorState(origin, phoneNumber, errorMessage) {
    await this._postMessage(origin, errorMessage);
    await this._resetUserState(phoneNumber);
    await this._handleInitialState(origin, phoneNumber);
  }

  async _handleMenuState(origin, phoneNumber, response) {
    const initialStateResponse = response.body.trim();
    switch (initialStateResponse) {
      case "1":
        try {
          const { cpfcnpj: document } = this._getCredor(phoneNumber);
          const credorInfo = await requests.getCredorInfo(document);

          if (credorInfo && credorInfo.length > 0) {
            const credorMessage = utils.formatCredorInfo(credorInfo);
            const message = `${credorMessage}\n\n_Selecione o credor (por exemplo, responda com "1" ou "2")_`;

            await this._postMessage(origin, message);

            this._setCurrentState(phoneNumber, "CREDOR");
          }
        } catch (error) {
          console.error("Case 1 retornou um erro - ", error.message);
          await this._handleErrorState(
            origin,
            phoneNumber,
            "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
          );
        }
        break;

      case "2":
        try {
          await this._handleAcordoState(origin, phoneNumber); // Passando o phoneNumber como argumento
        } catch (error) {
          console.error("Case 2 retornou um erro - ", error.message);
          await this._handleErrorState(
            origin,
            phoneNumber,
            "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
          );
        }
        break;

      case "3":
        try {
          await this._handleBoletoState(origin, phoneNumber, response); // Passando o phoneNumber e response como argumentos
        } catch (error) {
          console.error("Case 3 retornou um erro - ", error.message);
          await this._handleErrorState(
            origin,
            phoneNumber,
            "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
          );
        }
        break;

      case "4":
        try {
          await this._handlePixState(origin, phoneNumber, response); // Passando o phoneNumber e response como argumentos
        } catch (error) {
          console.error("Case 4 retornou um erro - ", error.message);
          await this._handleErrorState(
            origin,
            phoneNumber,
            "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
          );
        }
        break;
    }
  }

  async _handleInitialState(origin, phoneNumber, response) {
    const { nome: userName } = await this._getCredorFromDB(phoneNumber);
    const message = `Olá *${userName}*,\n\nPor favor, escolha uma opção:\n\n1) Credores\n2) Ver Acordos\n3) Linha Digitável\n4) Pix Copia e Cola\n5) Voltar`;

    await this._postMessage(origin, message);
  }

  async _handleCredorState(origin, phoneNumber, response) {
    if (response && response.body.trim().match(/^\d+$/)) {
      const selectedOption = parseInt(response.body.trim());
      const { cpfcnpj: document } = this._getCredor(phoneNumber);
      const credorInfo = await requests.getCredorInfo(document);

      this.document = document; // salvando documento no construtor
      this._setDataCredores(phoneNumber, credorInfo); // salvando toda a response de credorInfo

      if (selectedOption >= 1 && selectedOption <= credorInfo.length) {
        const selectedCreditor = credorInfo[selectedOption - 1];
        this._setDataCredorSelecionado(phoneNumber, selectedCreditor);

        console.log(
          `Conteúdo da opção ${selectedOption} armazenado:`,
          selectedCreditor
        );

        this.idDevedor = selectedCreditor.iddevedor; // Defina o valor aqui

        const idDevedor = selectedCreditor.iddevedor;
        const dataBase = utils.getCurrentDate();

        const credorDividas = await requests.getCredorDividas(
          idDevedor,
          dataBase
        );
        const credorOfertas = await requests.getCredorOfertas(idDevedor);

        this._setDataCredorDividas(phoneNumber, credorDividas);

        const formattedResponseDividas =
          utils.formatCredorDividas(credorDividas);
        const formattedResponseOfertas =
          utils.formatCredorOfertas(credorOfertas);
        const terceiraMensagem = `As seguintes dividas foram encontradas para a empresa selecionada:\n\n${formattedResponseDividas}\n\n*Escolha uma das opções abaixo para prosseguirmos no seu acordo:*\n\n${formattedResponseOfertas}`;

        await this._postMessage(origin, terceiraMensagem);
      } else {
        await this._postMessage(
          origin,
          "Opção inválida. Por favor, escolha uma opção válida."
        );
      }
    } else {
      await this._postMessage(
        origin,
        "Resposta inválida. Por favor, escolha uma opção válida."
      );
    }
  }

  async _handleOfertaState(origin, phoneNumber, response) {
    if (response && response.body.trim().match(/^\d+$/)) {
      const selectedOptionParcelamento = parseInt(response.body.trim());
      const credorInfo = await requests.getCredorInfo(this.document);
      const {
        comissao_comercial,
        idcomercial,
        idgerente_comercial,
        iddevedor,
      } = credorInfo[0];

      const credorOfertas = await requests.getCredorOfertas(this.idDevedor); // Acesse aqui

      if (
        selectedOptionParcelamento >= 1 &&
        selectedOptionParcelamento <= credorOfertas.length
      ) {
        const ofertaSelecionada = credorOfertas[selectedOptionParcelamento - 1];
        this._setDataOferta(phoneNumber, ofertaSelecionada);
        console.log("ofertaSelecionada -", ofertaSelecionada);

        const { periodicidade, valor_parcela, plano, idcredor, total_geral } =
          ofertaSelecionada;

        const ultimaDataParcela = utils.getUltimaDataParcela(
          periodicidade,
          valor_parcela,
          plano
        );

        const { parcelasArray, ultimaData } = ultimaDataParcela;
        const ultimaDataFormat = ultimaData.toISOString().slice(0, 10);

        const currentDate = new Date();
        const currentTime = utils.getCurrentTime();

        const newDataBase =
          currentDate.getDate() + parseInt(plano) * periodicidade;
        const formattedDate = newDataBase.toString().substring(0, 10);

        const { data: promessas } = await requests.getCredorDividas(
          this.idDevedor,
          formattedDate
        );

        const obj = {
          promessas,
          ultimaDataVencimento: ultimaData.toISOString().slice(0, 10),
          vencimentosParcelas: parcelasArray,
        };

        this._setDataPromessas(phoneNumber, obj);
        console.log(
          "userStates -",
          JSON.stringify(this.userStates, undefined, 2)
        );

        const responseDividasCredores = await requests.getCredorDividas(
          this.idDevedor,
          ultimaDataFormat
        );

        const responseDividasCredoresTotais =
          await requests.getCredorDividasTotais(
            this.idDevedor,
            ultimaDataFormat
          );

        const {
          juros_percentual,
          honorarios_percentual,
          multa_percentual,
          tarifa_boleto,
        } = responseDividasCredoresTotais;

        const parsedData = utils.parseDadosAcordo({
          currentTime,
          honorarios_percentual,
          idcredor,
          iddevedor: this.idDevedor,
          juros_percentual,
          multa_percentual,
          plano,
          responseDividasCredores,
          tarifa_boleto,
          total_geral,
          ultimaDataVencimento: ultimaDataFormat,
          parcelasArray,
        });

        const idacordo = await requests.postDadosAcordo(parsedData);
        console.log("idacordo -", idacordo);

        // await this._postMessage(
        //   origin,
        //   "Acordo realizado com sucesso - " + JSON.stringify(idacordo)
        // );

        const parsedData2 = utils.parseDadosPromessa({
          idacordo,
          iddevedor: this.idDevedor,
          plano,
        });

        let contratos = "";
        const contratosIncluidos = new Set();

        responseDividasCredores.forEach((dividas, index) => {
          const { contrato, indice } = dividas;

          // Verifica se o contrato já foi incluído na lista.
          if (!contratosIncluidos.has(contrato)) {
            contratos += contrato;
            contratosIncluidos.add(contrato); // Adiciona o contrato ao Set.

            // Verifica se não é o último contrato antes de adicionar a barra "/".
            if (index !== responseDividasCredores.length - 1) {
              contratos += " / ";
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
            parcela: parcelaNumber,
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

        const responsePromessas = await Promise.all(promises);
        // await this._postMessage(
        //   origin,
        //   "Promessas realizadas com sucesso - " +
        //     JSON.stringify(responsePromessas)
        // );

        const [ultimoIdPromessa] = responsePromessas.slice(-1);

        const { chave, empresa } = credorInfo[0];
        const { percentual_comissao_cobrador, idoperacao, idempresa } =
          responseDividasCredores[0];

        const parsedData3 = utils.parseDadosRecibo({
          comissao_comercial,
          cpfcnpj: this.document,
          honorarios_percentual,
          idacordo,
          iddevedor,
          idcredor,
          idcomercial,
          idgerente_comercial,
          juros_percentual,
          plano,
          ultimaDataVencimento: ultimaDataFormat,
          ultimoIdPromessa,
          chave,
          empresa,
          percentual_comissao_cobrador,
          idoperacao,
          idempresa,
        });

        const responseRecibo = await requests.postDadosRecibo(parsedData3);

        if (
          responseRecibo &&
          Object.prototype.hasOwnProperty.call(responseRecibo, "error")
        ) {
          console.error(responseRecibo.error);
          setErrorMessage("Erro ao receber responseRecibo.");
          return;
        }

        // await this._postMessage(origin, "Recibo inserido com sucesso!");

        await requests.getAtualizarPromessas(idacordo);
        await requests.getAtualizarValores(idacordo);

        const responseBoleto = await requests.postBoletoFinal(
          credorInfo,
          idacordo,
          contratosDividas,
          this.idDevedor,
          idcredor,
          plano,
          total_geral,
          valor_parcela,
          comissao_comercial,
          idcomercial,
          idgerente_comercial,
          tarifa_boleto
        );

        this._setDataBoleto(phoneNumber, responseBoleto);

        const responseIdBoleto = await requests.getIdBoleto(idacordo);
        console.log("responseIdBoleto -", responseIdBoleto);

        // await this._postMessage(
        //   origin,
        //   "getAtualizarPromessas, getAtualizarValores e postDadosBoleto realizado com sucesso!" +
        //     JSON.stringify(responseBoleto, undefined, 2)
        // );

        const { idboleto } = responseIdBoleto[0];
        const { banco } = responseIdBoleto[0];
        const { convenio } = responseIdBoleto[0];

        console.log(
          `IdBoleto de número ${idboleto} no banco ${banco} encontrado!`
        );

        const updateValoresBoleto = await requests.postAtualizarValores({
          idboleto,
          banco,
          convenio,
        });

        if (
          updateValoresBoleto &&
          Object.prototype.hasOwnProperty.call(updateValoresBoleto, "error")
        ) {
          console.error("Erro ao atualizar valores de nossoNum e numDoc: ", {
            updateValoresBoleto,
          });
          setErro("Erro ao atualizar valores de nossoNum e numDoc.");
          return;
        }

        const parsedData4 = utils.parseDadosImagemBoleto({
          idacordo,
          idboleto,
          banco,
        });

        const responseBoletoContent = await requests.getImagemBoleto(
          parsedData4
        );

        const parsedData5 = utils.parseDadosImagemQrCode({ idboleto });

        const responseQrcodeContent = await requests.getImagemQrCode(
          parsedData5
        );
        console.log(responseQrcodeContent.url);

        const parsedData6 = utils.parseDadosEmv({ idboleto });

        const responseEmvContent = await requests.getDataEmv(parsedData6);

        await utils.saveQRCodeImageToLocal(responseQrcodeContent.url);
        const media = MessageMedia.fromFilePath("qrcode.png");

        const mensagem = `*ACORDO REALIZADO COM SUCESSO!*\n\nPague a primeira parcela através do QRCODE ou link do BOLETO abaixo:\n\nhttp://cobrance.com.br/acordo/boleto.php?idboleto=${responseBoletoContent.idboleto}&email=2`;

        await this._postMessage(origin, mensagem);
        await this._postMessage(origin, media);
      } else {
        await this._postMessage(
          origin,
          "Opção inválida. Por favor, escolha uma opção válida."
        );
      }
    } else {
      await this._postMessage(
        origin,
        "Resposta inválida. Por favor, escolha uma opção válida."
      );
    }
  }

  async _handleAcordoState(origin, phoneNumber, response) {
    try {
      const { cpfcnpj: document } = await this._getCredorFromDB(phoneNumber);

      const acordosFirmados = await requests.getAcordosFirmados(document);

      if (!acordosFirmados || acordosFirmados.length === 0) {
        const message = `Você não possui acordos efetuados a listar.\n\n_Digite a tecla 5 para voltar._`;
        await this._postMessage(origin, message);
        this._setCurrentState(phoneNumber, "INICIO");
      } else {
        const formatAcordos = utils.formatCredorAcordos(acordosFirmados);

        const message = `${formatAcordos}\n\n_Digite a tecla 5 para voltar._`;
        await this._postMessage(origin, message);
        this._setCurrentState(phoneNumber, "INICIO");
      }
    } catch (error) {
      console.error("Case 2 retornou um erro - ", error.message);
      await this._handleErrorState(
        origin,
        phoneNumber,
        "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
      );
    }
  }

  async _handleBoletoState(origin, phoneNumber, response) {
    try {
      const { cpfcnpj: document } = await this._getCredorFromDB(phoneNumber);

      const acordosFirmados = await requests.getAcordosFirmados(document);
      console.log("acordosFirmados -", acordosFirmados);

      if (!acordosFirmados || acordosFirmados.length === 0) {
        const message = `Você não possui acordos nem Linhas Digitáveis a listar.\n\n_Digite a tecla 5 para voltar._`;
        await this._postMessage(origin, message);
        this._setCurrentState(phoneNumber, "INICIO");
      } else {
        const responseBoletoPixArray = [];

        for (const acordo of acordosFirmados) {
          const iddevedor = acordo.iddevedor;

          try {
            const responseBoletoPix = await requests.getDataBoletoPix(
              iddevedor
            );
            responseBoletoPixArray.push(responseBoletoPix);
            console.log(
              `responseBoletoPix executado para ${iddevedor} com resposta ${responseBoletoPix}`
            );
          } catch (error) {
            console.error(
              "Erro ao obter dados do boleto para iddevedor",
              iddevedor,
              ":",
              error.message
            );
            await this._handleErrorState(
              origin,
              phoneNumber,
              "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
            );
            return;
          }
        }

        // Verificar se acordosFirmados tem dados e responseBoletoPixArray está vazio ou indefinido
        if (
          acordosFirmados.length > 0 &&
          responseBoletoPixArray &&
          responseBoletoPixArray.length === 0
        ) {
          await this._postMessage(origin, "Boleto vencido ou não disponível");
          this._setCurrentState(phoneNumber, "INICIO");
        } else {
          const formatBoletoPixArray = utils.formatCodigoBoleto(
            responseBoletoPixArray
          );

          const message = `${formatBoletoPixArray}\n\n_Digite a tecla 5 para voltar._`;
          await this._postMessage(origin, message);
          this._setCurrentState(phoneNumber, "INICIO");
        }
      }
    } catch (error) {
      console.error("Case 3 retornou um erro - ", error.message);
      await this._handleErrorState(
        origin,
        phoneNumber,
        "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
      );
    }
  }

  async _handlePixState(origin, phoneNumber, response) {
    try {
      const { cpfcnpj: document } = await this._getCredorFromDB(phoneNumber);

      const acordosFirmados = await requests.getAcordosFirmados(document);
      console.log("acordosFirmados -", acordosFirmados);

      if (!acordosFirmados || acordosFirmados.length === 0) {
        const message = `Você não possui acordos nem Códigos PIX a listar.\n\n_Digite a tecla 5 para voltar._`;
        await this._postMessage(origin, message);
        this._setCurrentState(phoneNumber, "INICIO");
      } else {
        const responseBoletoPixArray = [];

        for (const acordo of acordosFirmados) {
          const iddevedor = acordo.iddevedor;

          try {
            const responseBoletoPix = await requests.getDataBoletoPix(
              iddevedor
            );
            responseBoletoPixArray.push(responseBoletoPix);
            console.log(
              `responseBoletoPix executado para ${iddevedor} com resposta ${responseBoletoPix}`
            );
          } catch (error) {
            console.error(
              "Erro ao obter dados do boleto para iddevedor",
              iddevedor,
              ":",
              error.message
            );
            await this._handleErrorState(
              origin,
              phoneNumber,
              "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
            );
            return;
          }
        }

        // Verificar se acordosFirmados tem dados e responseBoletoPixArray está vazio ou indefinido
        if (
          acordosFirmados.length > 0 &&
          responseBoletoPixArray &&
          responseBoletoPixArray.length === 0
        ) {
          await this._postMessage(
            origin,
            "Código PIX vencido ou não disponível"
          );
          this._setCurrentState(phoneNumber, "INICIO");
        } else {
          const formatBoletoPixArray = utils.formatCodigoPix(
            responseBoletoPixArray
          );

          const message = `${formatBoletoPixArray}\n\n_Digite a tecla 5 para voltar._`;
          await this._postMessage(origin, message);
          this._setCurrentState(phoneNumber, "INICIO");
        }
      }
    } catch (error) {
      console.error("Case 4 retornou um erro - ", error.message);
      await this._handleErrorState(
        origin,
        phoneNumber,
        "Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente."
      );
    }
  }

  async handleMessage(phoneNumber, response) {
    const { credor, currentState } = this._getState(phoneNumber);
    const origin = response.from;

    console.log(`[${phoneNumber} - ${currentState}]`);

    switch (currentState) {
      case "INICIO":
        await this._handleInitialState(origin, phoneNumber, response); // Alterado para passar phoneNumber
        this._setCurrentState(phoneNumber, "MENU");
        break;

      case "MENU":
        await this._handleMenuState(origin, phoneNumber, response); // Alterado para passar phoneNumber
        break;

      case "CREDOR":
        await this._handleCredorState(origin, phoneNumber, response); // Alterado para passar phoneNumber
        this._setCurrentState(phoneNumber, "OFERTA");
        break;

      case "OFERTA":
        await this._handleOfertaState(origin, phoneNumber, response); // Alterado para passar phoneNumber
        this._setCurrentState(phoneNumber, "INICIO");
        break;

      case "VER_ACORDOS":
        await this._handleAcordoState(origin, phoneNumber, response); // Alterado para passar phoneNumber
        this._setCurrentState(phoneNumber, "INICIO");
        break;

      case "VER_LINHA_DIGITAVEL":
        await this._handleBoletoState(origin, phoneNumber, response); // Alterado para passar phoneNumber
        this._setCurrentState(phoneNumber, "INICIO");
        break;

      case "VER_CODIGO_PIX":
        await this._handlePixState(origin, phoneNumber, response); // Alterado para passar phoneNumber
        this._setCurrentState(phoneNumber, "INICIO");
        break;
    }
  }
}

const stateMachine = new StateMachine();

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message", async (response) => {
  const phoneNumber = response.from
    .replace(/[^\d]/g, "")
    .replace(/^.*?(\d{8})$/, "$1");
  await stateMachine.handleMessage(phoneNumber, response);
});

client.initialize();
