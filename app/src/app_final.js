require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const qrImage = require("qr-image");
const express = require("express");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

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
  connectTimeout: 60000,
};

const app = express();
const port = 3060;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("qrcodes"));

const wwebVersion = "2.2412.54";
const QR_CODES_DIR = path.join(__dirname, "qrcodes");

// Verificar se o diretório 'qrcodes' existe, se não, criar
if (!fs.existsSync(QR_CODES_DIR)) {
  fs.mkdirSync(QR_CODES_DIR);
}

class StateMachine {
  constructor(client, sessionName) {
    this.userStates = {};
    this.globalData = {};
    this.connectedUsers = {};
    this.timer = {};
    this.client = client;
    this.ticketId = null;
    this.fromNumber = null;
    this.toNumber = null;
    this.sessionName = sessionName;
  }

  _setConnectedUsers(phoneNumber, ticketId) {
    if (this.connectedUsers && this.connectedUsers[phoneNumber]) {
      this.connectedUsers = {
        ...this.connectedUsers,
        [phoneNumber]: {
          algunsDadosQueTuQueira,
          ticketId: ticketId,
        },
      };
    } else {
      this.connectedUsers[phoneNumber] = {
        algunsDadosQueTuQueira,
        ticketId,
      };
    }
  }

  _setTicketId(ticketId) {
    this.ticketId = ticketId;
  }

  _setFromNumber(from) {
    this.fromNumber = from;
  }

  _setToNumber(to) {
    this.toNumber = to;
  }

  _setDataMenu(phoneNumber, data) {
    this.userStates[phoneNumber].data.MENU = data;
  }

  _setDataCredores(phoneNumber, data) {
    if (!this.userStates[phoneNumber].data) {
      this.userStates[phoneNumber].data = {}; // Inicializa o objeto se não existir
    }
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

  _setCredor(phoneNumber, credor) {
    this.userStates[phoneNumber].credor = credor;
  }

  _setCurrentState(phoneNumber, newState) {
    if (!this.userStates[phoneNumber]) {
      this.userStates[phoneNumber] = { currentState: "INICIO" };
    }

    this.userStates[phoneNumber].currentState = newState;
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

  _resetUserState(phoneNumber) {
    delete this.userStates[phoneNumber];
  }

  async _postMessage(origin, body) {
    console.log(`Horário da mensagem ENVIADA ao cliente: ${new Date()}`);

    const demim = 1;

    if (typeof body === "string") {
      await this._getRegisterMessagesDB(
        this.toNumber,
        this.fromNumber,
        body,
        this.ticketId,
        demim
      );

      await this.client.sendMessage(origin, body);
    } else {
      await this.client.sendMessage(origin, body);
    }
  }

  async _getCredorFromDB(phoneNumber) {
    try {
      if (!this.userStates[phoneNumber]) {
        this.userStates[phoneNumber] = {}; // inicialize o objeto se não existir
      }

      const dbQuery = `
        select
        d.iddevedor,
        d.cpfcnpj,
        d.nome,
        t.telefone,
        t.idtelefones,
        d.idusuario
      from
        statustelefone s,
        telefones2 t,
        devedor d ,
        credor c
      where
        right(t.telefone,8) = '${phoneNumber}'
        and d.cpfcnpj = t.cpfcnpj
        and d.idusuario not in (11, 14)
        and s.idstatustelefone = t.idstatustelefone
        and s.fila = 's'
        and c.idcredor = d.idcredor
        and c.libera_api_acordo = 's'
        -- and idcredor <> 1011
        `;

      const dbResponse = await executeQuery(dbQuery, customDbConfig);

      if (dbResponse && dbResponse.length) {
        this._setCredor(phoneNumber, dbResponse[0]);
        return dbResponse[0];
      } else {
        console.log(`Nenhum credor encontrado para o número ${phoneNumber}.`);
        return null;
      }
    } catch (error) {
      console.error(
        `Erro ao buscar credor para o número ${phoneNumber}:`,
        error
      );
      throw error;
    }
  }

  async _getTicketStatusDB(phoneNumber) {
    if (!this.userStates[phoneNumber]) {
      this.userStates[phoneNumber] = {}; // inicialize o objeto se não existir
    }

    const dbQuery = `
    select
      bt.id,
      bot_idstatus,
      bot_contato_id,
      idresponsavel,
      bt.inclusao,
      encerrado
    from
      bot_ticket bt,
      bot_contato bc
    where
      bc.telefone = ${phoneNumber}
      and bc.id = bt.bot_contato_id
    `;

    const dbResponse = await executeQuery(dbQuery, customDbConfig);

    return dbResponse;
  }

  async _getInsertClientNumberDB(phoneNumber) {
    if (!this.userStates[phoneNumber]) {
      this.userStates[phoneNumber] = {}; // inicialize o objeto se não existir
    }

    const dbQuery = `
    INSERT ignore INTO
      cobrance.bot_contato (
        telefone
      ) 
    VALUES(
      ${phoneNumber}
    )`;

    const dbResponse = await executeQuery(dbQuery, customDbConfig);

    return dbResponse;
  }

  async _getInsertTicketDB(phoneNumber) {
    if (!this.userStates[phoneNumber]) {
      this.userStates[phoneNumber] = {}; // inicialize o objeto se não existir
    }

    const dbQuery = `
    insert into
      bot_ticket (
        bot_idstatus,
        bot_contato_id,
        idresponsavel
    )
    values(
      1,
      (select id from bot_contato bc where telefone =${phoneNumber}),
      1
    )`;

    const dbResponse = await executeQuery(dbQuery, customDbConfig);

    return dbResponse;
  }

  async _getRegisterMessagesDB(from, to, message, ticketId, demim) {
    if (!this.userStates[from]) {
      this.userStates[from] = {}; // inicialize o objeto se não existir
    }

    const formatDateTime = utils.getCurrentDateTime();
    const formatFromNumber = utils.formatPhoneNumber(from);
    const formatToNumber = utils.formatPhoneNumber(to);

    const dbQuery = `
      INSERT INTO
      bot_mensagens(
        de,
        para,
        mensagem,
        data_hora,
        bot_ticket_id,
        demim
      )
      values(
        '${formatFromNumber}',
        '${formatToNumber}',
        '${message}',
        '${formatDateTime}',
        '${ticketId}',
        '${demim}'
      )
    `;

    const dbResponse = await executeQuery(dbQuery, customDbConfig);

    return dbResponse;
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

          if (!credorInfo || credorInfo.length === 0) {
            const messageErro = `Você não possui dívidas ou ofertas disponíveis.`;
            await this._postMessage(origin, messageErro);
            await this._handleInitialState(origin, phoneNumber, response);
          } else {
            const credorMessage = utils.formatCredorInfo(credorInfo);
            const messageSucess = `${credorMessage}\n\n_Selecione o numero da divida a negociar._`;

            await this._postMessage(origin, messageSucess);
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
    const credor = await this._getCredorFromDB(phoneNumber);

    if (!credor || credor.length === 0) {
      console.log(
        "Credor sem cadastro no banco de dados. Atendimento chatbot não iniciado para -",
        phoneNumber
      );
      return;
    }

    const message = `Olá *${credor.nome}*,\n\nPor favor, escolha uma opção:\n\n*1)* Ver Dívidas\n*2)* Ver Acordos\n*3)* Linha Digitável\n*4)* Pix Copia e Cola`;
    await this._postMessage(origin, message);
  }

  async _handleCredorState(origin, phoneNumber, response) {
    try {
      if (response && response.body.trim().match(/^\d+$/)) {
        const selectedOption = parseInt(response.body.trim());
        const { cpfcnpj: document } = this._getCredor(phoneNumber);
        const credorInfo = await requests.getCredorInfo(document);

        this._setDataCredores(phoneNumber, credorInfo);

        if (selectedOption >= 1 && selectedOption <= 5 && credorInfo.length) {
          const selectedCreditor = credorInfo[selectedOption - 1];
          this._setDataCredorSelecionado(phoneNumber, selectedCreditor);

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

          this._setCurrentState(phoneNumber, "OFERTA");
        } else {
          await this._postMessage(
            origin,
            "Resposta inválida. Por favor, escolha uma opção válida."
          );
        }
      } else {
        await this._postMessage(
          origin,
          "Resposta inválida. Por favor, escolha uma opção válida."
        );
      }
    } catch (error) {
      console.error("Erro ao lidar com o estado do credor:", error);
    }
  }

  async _handleOfertaState(origin, phoneNumber, response) {
    try {
      if (response && response.body.trim().match(/^\d+$/)) {
        const selectedOptionParcelamento = parseInt(response.body.trim());

        const credorByPhone = await requests.getCredorByPhoneNumber(
          phoneNumber
        );

        const { cpfcnpj } = credorByPhone[0];
        const credorInfo = await requests.getCredorInfo(cpfcnpj);
        const {
          comissao_comercial,
          idcomercial,
          idgerente_comercial,
          iddevedor,
        } = credorInfo[0];

        const credorOfertas = await requests.getCredorOfertas(iddevedor);

        if (
          selectedOptionParcelamento >= 1 &&
          selectedOptionParcelamento <= 5 &&
          selectedOptionParcelamento <= credorOfertas.length
        ) {
          await this._postMessage(
            origin,
            `Aguarde, estamos gerando o seu acordo...`
          );

          const ofertaSelecionada =
            credorOfertas[selectedOptionParcelamento - 1];
          this._setDataOferta(phoneNumber, ofertaSelecionada);

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
            iddevedor,
            formattedDate
          );

          const obj = {
            promessas,
            ultimaDataVencimento: ultimaData.toISOString().slice(0, 10),
            vencimentosParcelas: parcelasArray,
          };

          this._setDataPromessas(phoneNumber, obj);

          const responseDividasCredores = await requests.getCredorDividas(
            iddevedor,
            ultimaDataFormat
          );

          const responseDividasCredoresTotais =
            await requests.getCredorDividasTotais(iddevedor, ultimaDataFormat);

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
            iddevedor: iddevedor,
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

          const parsedData2 = utils.parseDadosPromessa({
            idacordo,
            iddevedor: iddevedor,
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

            const promise = await requests.postDadosPromessa(dataPromessa);
            promises.push(promise);
          }

          const responsePromessas = await Promise.all(promises);

          const [ultimoIdPromessa] = responsePromessas.slice(-1);

          const { chave, empresa } = credorInfo[0];
          const { percentual_comissao_cobrador, idoperacao, idempresa } =
            responseDividasCredores[0];

          const parsedData3 = utils.parseDadosRecibo({
            comissao_comercial,
            cpfcnpj: cpfcnpj,
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

          await requests.getAtualizarPromessas(idacordo);
          await requests.getAtualizarValores(idacordo);

          const responseBoleto = await requests.postBoletoFinal(
            credorInfo,
            idacordo,
            contratosDividas,
            iddevedor,
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

          const { idboleto } = responseIdBoleto[0];
          const { banco } = responseIdBoleto[0];
          const { convenio } = responseIdBoleto[0];

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

          await utils.saveQRCodeImageToLocal(
            responseQrcodeContent.url,
            idboleto
          );

          const media = MessageMedia.fromFilePath(
            `src/qrcodes/${idboleto}.png`
          );

          // Verifique se a imagem foi salva corretamente
          const imageExists = await utils.checkIfFileExists(
            `src/qrcodes/${idboleto}.png`
          );
          console.log("A imagem foi salva corretamente:", imageExists);

          const mensagemAcordo = `*ACORDO REALIZADO COM SUCESSO!*\n\nPague a primeira parcela através do QRCODE ou link do BOLETO abaixo:\n\nhttp://cobrance.com.br/acordo/boleto.php?idboleto=${responseBoletoContent.idboleto}&email=2`;

          const mensagemRecibo = `*ATENÇÃO! CONFIRA SEUS DADOS E VALOR NA HORA DO PAGAMENTO!*\n\nPor favor, nos envie o *comprovante* assim que possivel para registro! Atendimento finalizado, obrigado e bons negócios.`;

          try {
            await this._postMessage(origin, mensagemAcordo);
            await this._postMessage(origin, media);
            await this._postMessage(origin, mensagemRecibo);

            const date = new Date();
            const formattedDateTime = utils.getBrazilTimeFormatted(date);

            console.log(
              `ACORDO FECHADO! IdDevedor - ${iddevedor} IdAcordo - ${idacordo} para o nº ${phoneNumber} em ${formattedDateTime}`
            );

            await requests.getFecharAtendimentoHumano(this.ticketId);
          } catch (error) {
            console.error(
              "Erro ao enviar as mensagens: mensagemAcordo, media e mensagemRecibo",
              error
            );
          }
        }
      } else {
        await this._postMessage(
          origin,
          "Resposta inválida. Por favor, escolha uma opção válida."
        );

        this._setCurrentState(phoneNumber, "CREDOR");
      }
    } catch (error) {
      console.error("Erro ao lidar com o estado de oferta:", error);
    }
  }

  async _handleAcordoState(origin, phoneNumber, response) {
    try {
      const { cpfcnpj: document } = await this._getCredorFromDB(phoneNumber);

      const acordosFirmados = await requests.getAcordosFirmados(document);

      if (!acordosFirmados || acordosFirmados.length === 0) {
        const message = `Você não possui acordos efetuados a listar.`;
        await this._postMessage(origin, message);
        await this._handleInitialState(origin, phoneNumber, response);
      } else {
        const formatAcordos = utils.formatCredorAcordos(acordosFirmados);

        const message = `*Os seguintes acordos firmados foram encontrados:*\n\n${formatAcordos}`;
        await this._postMessage(origin, message);
        await this._handleInitialState(origin, phoneNumber, response);
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

      if (!acordosFirmados || acordosFirmados.length === 0) {
        const message = `Você não possui acordos nem Linhas Digitáveis a listar.`;
        await this._postMessage(origin, message);
        await this._handleInitialState(origin, phoneNumber, response);
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

        if (acordosFirmados.length > 0 && responseBoletoPixArray.length === 0) {
          await this._postMessage(origin, "Boleto vencido ou não disponível.");
          await this._handleInitialState(origin, phoneNumber, response);
        } else if (
          responseBoletoPixArray.length === 1 &&
          responseBoletoPixArray[0].length === 0
        ) {
          await this._postMessage(origin, "Boleto vencido ou não disponível.");
          await this._handleInitialState(origin, phoneNumber, response);
        } else {
          const formatBoletoPixArray = utils.formatCodigoBoleto(
            responseBoletoPixArray
          );
          const message = `${formatBoletoPixArray}`;
          await this._postMessage(origin, message);
          await this._handleInitialState(origin, phoneNumber, response);
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

      if (!acordosFirmados || acordosFirmados.length === 0) {
        const message = `Você não possui acordos nem Códigos PIX a listar.`;
        await this._postMessage(origin, message);
        await this._handleInitialState(origin, phoneNumber, response);
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
        if (acordosFirmados.length > 0 && responseBoletoPixArray.length === 0) {
          await this._postMessage(
            origin,
            "Código PIX vencido ou não disponível."
          );
          await this._handleInitialState(origin, phoneNumber, response);
        } else if (
          responseBoletoPixArray.length === 1 &&
          responseBoletoPixArray[0].length === 0
        ) {
          await this._postMessage(
            origin,
            "Código PIX vencido ou não disponível."
          );
          await this._handleInitialState(origin, phoneNumber, response);
        } else {
          const formatBoletoPixArray = utils.formatCodigoPix(
            responseBoletoPixArray
          );

          const message = `${formatBoletoPixArray}`;
          await this._postMessage(origin, message);
          await this._handleInitialState(origin, phoneNumber, response);
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
    try {
      let { credor, currentState } = this._getState(phoneNumber);
      const origin = response.from;

      if (!currentState) {
        currentState = "INICIO";
      }

      console.log(
        `[Sessão: ${this.sessionName} - Número: ${phoneNumber} - Estado: ${currentState}]`
      );

      switch (currentState) {
        case "INICIO":
          await this._handleInitialState(origin, phoneNumber, response);
          this._setCurrentState(phoneNumber, "MENU");
          break;
        case "MENU":
          await this._handleMenuState(origin, phoneNumber, response);
          break;
        case "CREDOR":
          await this._handleCredorState(origin, phoneNumber, response);
          this._setCurrentState(phoneNumber, "OFERTA");
          break;
        case "OFERTA":
          await this._handleOfertaState(origin, phoneNumber, response);
          this._setCurrentState(phoneNumber, "INICIO");
          break;
        case "VER_ACORDOS":
          await this._handleAcordoState(origin, phoneNumber, response);
          this._setCurrentState(phoneNumber, "INICIO");
          break;
        case "VER_LINHA_DIGITAVEL":
          await this._handleBoletoState(origin, phoneNumber, response);
          this._setCurrentState(phoneNumber, "INICIO");
          break;
        case "VER_CODIGO_PIX":
          await this._handlePixState(origin, phoneNumber, response);
          this._setCurrentState(phoneNumber, "INICIO");
          break;
      }
    } catch (error) {
      if (error.message.includes("Nao existe atendimento registrado")) {
        console.error("Erro ao criar um novo ticket:", error);
      } else {
        console.error("Erro ao verificar o status do serviço:", error);
      }
    }
  }
}

let redirectSentMap = new Map();
const sessions = {};
const stateMachines = {};

const createSession = (sessionName) => {
  if (sessions[sessionName]) {
    console.log(`A sessão ${sessionName} já existe.`);
    return sessions[sessionName];
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionName }),
    puppeteer: {
      headless: true,
      args: [
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
      ],
      takeoverOnConflict: true,
    },
    webVersionCache: {
      type: "remote",
      remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`,
    },
  });

  client.connectionState = "connecting"; // Propriedade de estado inicial
  client.sessionName = sessionName; // Armazenar o sessionName na instância do cliente

  client.on("qr", (qr) => {
    console.log(`QR Code para a sessão ${sessionName}:`);
    qrcode.generate(qr, { small: true });
    saveQRCodeImage(qr, sessionName);
  });

  client.on("disconnected", () => {
    client.connectionState = "disconnected";
    console.log(`Sessão ${sessionName} foi desconectada.`);
  });

  client.on("authenticated", () => {
    sessions[client.sessionName] = client;
    console.log(`Conexão bem-sucedida na sessão ${client.sessionName}!`);

    const stateMachine = new StateMachine(client, client.sessionName);
    stateMachines[client.sessionName] = stateMachine;
  });

  client.on("auth_failure", () => {
    client.connectionState = "disconnected";
    console.error(
      `Falha de autenticação na sessão ${sessionName}. Por favor, verifique suas credenciais.`
    );
  });

  client.on("ready", () => {
    client.connectionState = "open";
    console.log(`Sessão ${sessionName} está pronta!`);

    console.log("client ready -", client);

    saveClientData(client);
  });

  client.on("message", async (message) => {
    try {
      const stateMachine = stateMachines[sessionName]; // Obter a StateMachine específica para a sessão

      const { body, from, to } = message;

      const response = {
        from: message.from,
        body: message.body,
      };

      const fromPhoneNumber = utils.formatPhoneNumber(message.from);

      let mediaUrl = "";
      let mediaBase64 = "";
      const webhookUrl =
        "https://www.cobrance.com.br/codechat/webhook_cobrance.php";

      if (message.hasMedia) {
        const media = await message.downloadMedia();
        const mediaPath = path.join(__dirname, "media", fromPhoneNumber);

        if (!fs.existsSync(mediaPath)) {
          fs.mkdirSync(mediaPath, { recursive: true });
        }

        const fileName = `${new Date().getTime()}.${
          media.mimetype.split("/")[1]
        }`;
        const filePath = path.join(mediaPath, fileName);

        fs.writeFileSync(filePath, media.data, "base64");
        console.log(`Arquivo recebido e salvo em: ${filePath}`);

        mediaUrl = `/media/${fromPhoneNumber}/${fileName}`;
        mediaBase64 = media.data; // Salvar o conteúdo base64 do arquivo
      }

      // Send message info to webhook, including media URL and base64 content if available
      await axios.post(webhookUrl, {
        sessionName,
        message: {
          ...message,
          mediaUrl,
          mediaBase64,
        },
      });

      if (!stateMachine) {
        console.error(
          `StateMachine não encontrada para a sessão ${sessionName}`
        );
        return;
      }

      console.log(
        `Sessão ${sessionName} recebeu a mensagem: ${message.body} de ${
          message.from
        } no horário ${new Date()}`
      );

      if (!fromPhoneNumber || !response) {
        console.log("Mensagem inválida recebida", message);
        return;
      }

      const credorExistsFromDB = stateMachine._getCredorFromDB(fromPhoneNumber);

      if (!credorExistsFromDB) {
        console.log(
          "Credor sem cadastro no banco de dados. Atendimento chatbot não iniciado para -",
          fromPhoneNumber
        );
        return;
      }

      const statusAtendimento = await requests.getStatusAtendimento(
        fromPhoneNumber
      );

      let bot_idstatus;

      if (statusAtendimento[0] && statusAtendimento[0].bot_idstatus) {
        bot_idstatus = statusAtendimento[0].bot_idstatus;
      }

      if (!bot_idstatus) {
        console.log(
          "Status de atendimento não encontrado para o usuário -",
          fromPhoneNumber
        );
      }

      if (bot_idstatus === 2) {
        console.log("Usuário em atendimento humano -", bot_idstatus);
        const redirectSent = redirectSentMap.get(fromPhoneNumber);
        if (!redirectSent) {
          await client.sendMessage(
            from,
            "Estamos redirecionando seu atendimento para um atendente humano, por favor aguarde..."
          );
          redirectSentMap.set(fromPhoneNumber, true);
        }
        return;
      }

      if (bot_idstatus === 1 || bot_idstatus === 3 || bot_idstatus === "") {
        console.log("Usuário em atendimento automático -", bot_idstatus);
      }

      let ticketId;

      const ticketStatus = await requests.getTicketStatusByPhoneNumber(
        fromPhoneNumber
      );

      if (ticketStatus && ticketStatus.length > 0) {
        ticketId = ticketStatus[0].id;
        await requests.getAbrirAtendimentoBot(ticketId);

        console.log(
          `Iniciando atendimento Bot para ${fromPhoneNumber} no Ticket - ${ticketId}`
        );
      } else {
        await requests.getInserirNumeroCliente(fromPhoneNumber);

        const insertNovoTicket = await requests.getInserirNovoTicket(
          fromPhoneNumber
        );

        if (insertNovoTicket && insertNovoTicket.insertId) {
          ticketId = insertNovoTicket.insertId;
          await requests.getAbrirAtendimentoBot(ticketId);

          console.log(
            `Iniciando atendimento Bot para ${fromPhoneNumber} no Ticket - ${ticketId} (NOVO)`
          );
        } else {
          console.log(`Erro ao criar novo número de Ticket no banco.`);
          return;
        }
      }

      const demim = 0;

      stateMachine._setTicketId(ticketId);
      stateMachine._setFromNumber(from);
      stateMachine._setToNumber(to);

      await stateMachine._getRegisterMessagesDB(
        from,
        to,
        body,
        ticketId,
        demim
      );

      await stateMachine.handleMessage(fromPhoneNumber, response);
    } catch (error) {
      console.error("Erro ao lidar com a mensagem:", error);
    }
  });

  client.initialize();
  sessions[sessionName] = client;

  const stateMachine = new StateMachine(client, sessionName); // Inicializar a StateMachine após a inicialização do cliente
  stateMachines[sessionName] = stateMachine;

  return client;
};

const saveClientData = (client) => {
  const filePath = path.join(__dirname, "clientData.json");
  let clientData = {};

  // Tente ler o arquivo existente
  try {
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      clientData = JSON.parse(fileContent);
    }
  } catch (error) {
    console.error("Erro ao ler o arquivo de dados do cliente:", error);
  }

  // Atualize os dados com a nova conexão
  clientData[client.sessionName] = {
    lastLoggedOut: client.lastLoggedOut,
    connectionState: client.connectionState,
    sessionName: client.sessionName,
    wid: {
      user: client.wid.user,
    },
    connectionDateTime: new Date().toISOString(),
  };

  // Escreva os dados atualizados de volta ao arquivo
  try {
    fs.writeFileSync(filePath, JSON.stringify(clientData, null, 2));
    console.log(`Dados da sessão ${client.sessionName} salvos em ${filePath}`);
  } catch (error) {
    console.error("Erro ao salvar os dados do cliente:", error);
  }
};

const getConnectionStatus = (instanceName) => {
  const client = sessions[instanceName];

  if (!client) {
    return "disconnected"; // ou "none" para indicar que a sessão não existe
  }
  return client.connectionState || "unknown";
};

const saveQRCodeImage = (qr, sessionName) => {
  const qrCodeImage = qrImage.image(qr, { type: "png" });
  const qrCodeFileName = `qrcode_${sessionName}.png`;
  const qrCodeFilePath = path.join(QR_CODES_DIR, qrCodeFileName);

  const qrCodeWriteStream = fs.createWriteStream(qrCodeFilePath);
  qrCodeImage.pipe(qrCodeWriteStream);

  qrCodeWriteStream.on("finish", () => {
    console.log(`QR Code image saved: ${qrCodeFilePath}`);
  });
};

const deleteQRCodeImage = (sessionName) => {
  const qrCodeFilePath = path.join(
    __dirname,
    "qrcodes",
    `qrcode_${sessionName}.png`
  );
  if (fs.existsSync(qrCodeFilePath)) {
    try {
      fs.unlinkSync(qrCodeFilePath);
      console.log(`QR Code image deleted: ${qrCodeFilePath}`);
    } catch (error) {
      console.error(`Error deleting QR Code image:`, error);
    }
  } else {
    console.log(`QR Code image not found at: ${qrCodeFilePath}`);
  }
};

const deleteAllQRCodeImages = () => {
  const qrCodesDir = path.join(__dirname, "../src/qrcodes");

  if (fs.existsSync(qrCodesDir)) {
    const files = fs.readdirSync(qrCodesDir);
    files.forEach((file) => {
      const filePath = path.join(qrCodesDir, file);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Error deleting file ${filePath}:`, err);
        } else {
          console.log(`File ${filePath} deleted successfully`);
        }
      });
    });
  } else {
    console.log("QR codes directory does not exist.");
  }
};

const disconnectSession = async (sessionName) => {
  const client = sessions[sessionName];

  if (client) {
    try {
      await client.logout();
      console.log(`Sessão ${sessionName} desconectada`);

      const sessionPath = path.join(
        __dirname,
        "../.wwebjs_auth",
        `session-${sessionName}`
      );

      // Função para excluir a pasta da sessão
      const deleteFolderRecursive = (folderPath) => {
        if (fs.existsSync(folderPath)) {
          fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              // Recursivamente exclui pastas
              deleteFolderRecursive(curPath);
            } else {
              // Exclui arquivos
              fs.unlinkSync(curPath);
            }
          });
          fs.rmdirSync(folderPath);
          console.log(
            `Diretório de autenticação da sessão ${sessionName} excluído com sucesso!`
          );
        }
      };

      // Excluir a pasta da sessão
      deleteFolderRecursive(sessionPath);

      // Destruir o cliente e remover a sessão da memória
      client.destroy();
      delete sessions[sessionName];
      delete stateMachines[sessionName];
      console.log(`Sessão ${sessionName} removida da memória com sucesso.`);
    } catch (error) {
      console.error(`Erro ao desconectar a sessão ${sessionName}:`, error);
      throw error;
    }
  } else {
    console.log(`Sessão ${sessionName} não encontrada.`);
  }
};

const disconnectAllSessions = async () => {
  const sessionsPath = path.join(__dirname, "../.wwebjs_auth");

  try {
    const files = fs.readdirSync(sessionsPath);
    const sessionDirs = files.filter(
      (file) =>
        fs.lstatSync(path.join(sessionsPath, file)).isDirectory() &&
        file.startsWith("session-")
    );

    for (const dir of sessionDirs) {
      const sessionName = dir.substring("session-".length); // Remove o prefixo "session-"
      await disconnectSession(sessionName);
    }
  } catch (error) {
    console.error("Erro ao ler o diretório de sessões:", error);
    throw error;
  }
};

const restoreSession = (sessionName) => {
  const sessionFolder = `session-${sessionName}`;
  const sessionPath = path.join(__dirname, "../.wwebjs_auth", sessionFolder);

  if (fs.existsSync(sessionPath)) {
    console.log(`Restaurando sessão de ${sessionName}...`);
    createSession(sessionName);
  } else {
    console.log(`Sessão ${sessionName} não encontrada.`);
  }
};

const restoreAllSessions = () => {
  const authDir = path.join(__dirname, "../.wwebjs_auth");
  console.log("Diretório de autenticação:", authDir);

  if (fs.existsSync(authDir)) {
    const sessionFolders = fs.readdirSync(authDir);
    console.log("Pastas de sessão encontradas:", sessionFolders);

    sessionFolders.forEach((sessionFolder) => {
      const sessionName = sessionFolder.replace("session-", "");
      console.log(`Restaurando sessão de ${sessionName}...`);
      createSession(sessionName);
    });
  } else {
    console.log("O diretório de autenticação não existe.");
  }
};

const validateAndFormatNumber = (number) => {
  // Remove any non-digit characters
  const cleanedNumber = number.replace(/\D/g, "");

  // Validate the length of the number (Brazilian numbers have 13 digits with country code)
  if (cleanedNumber.length !== 13) {
    throw new Error("Invalid phone number length");
  }

  // Ensure the number starts with the country code
  if (!cleanedNumber.startsWith("55")) {
    throw new Error("Invalid country code");
  }

  // Return the formatted number
  return cleanedNumber;
};

app.post("/instance/create", (req, res) => {
  const { instanceName } = req.body;

  const qrCodeFilePath = path.join(QR_CODES_DIR, `qrcode_${instanceName}.png`);

  if (!instanceName) {
    return res.status(400).json({ error: "instanceName is required" });
  }

  if (sessions[instanceName]) {
    console.log(`Session ${instanceName} already exists`);
    return res
      .status(400)
      .json({ error: `Session ${instanceName} already exists` });
  }

  if (fs.existsSync(qrCodeFilePath)) {
    console.log(`QR Code image for session ${instanceName} already exists`);
    // return res.status(400).json({
    //   error: `QR Code image for session ${instanceName} already exists`,
    // });
  }

  console.log("Creating a new session...");

  try {
    createSession(instanceName);
    res.status(201).json({
      instance: {
        instanceName,
        status: "created",
      },
    });
  } catch (error) {
    res.status(500).json({ error: `Error creating session: ${error.message}` });
  }
});

app.post("/restore/:sessionName", (req, res) => {
  const { sessionName } = req.params;

  if (!sessionName) {
    return res.status(400).send("sessionName is required");
  }

  try {
    restoreSession(sessionName);
    res.json({
      success: true,
      message: `Session ${sessionName} restored successfully`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Error restoring session: ${error.message}` });
  }
});

app.post("/restoreAll", (req, res) => {
  try {
    restoreAllSessions();

    res.json({
      success: true,
      message: "Todas as sessões foram restauradas com sucesso",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Erro ao restaurar todas as sessões: ${error.message}` });
  }
});

app.post("/chat/whatsappNumbers/:sessionName", async (req, res) => {
  const { sessionName } = req.params;
  const { numbers } = req.body;
  const client = sessions[sessionName];

  if (!client) {
    return res
      .status(500)
      .json({ success: false, message: "Client is not initialized" });
  }

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid input format. "numbers" should be a non-empty array.',
    });
  }

  try {
    const results = await Promise.all(
      numbers.map(async (number) => {
        try {
          // Validate and format the number
          const formattedNumber = validateAndFormatNumber(number);
          console.log(`Verificando número formatado: ${formattedNumber}`);
          const isRegistered = await client.isRegisteredUser(formattedNumber);
          return res.status(200).json([{ exists: true }]);
        } catch (error) {
          console.error(
            `Erro ao formatar/verificar o número ${number}:`,
            error.message
          );
          return res.status(400).json({ success: false, error: error.message });
        }
      })
    );

    return { results };
  } catch (error) {
    console.error("Erro ao verificar os números:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Erro ao verificar os números" });
  }
});

app.delete("/instance/logout/:sessionName", async (req, res) => {
  const { sessionName } = req.params;

  if (!sessionName) {
    return res.status(400).send("sessionName is required");
  }

  try {
    await disconnectSession(sessionName);

    console.log(`Sessao ${sessionName} desconectada com sucesso!`);
    res.json({
      success: true,
      message: `Session ${sessionName} disconnected successfully`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Error disconnecting session: ${error.message}` });
  }
});

app.delete("/instance/logoutAll", async (req, res) => {
  try {
    await disconnectAllSessions();
    res.json({
      success: true,
      message: "All sessions disconnected successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Error disconnecting all sessions: ${error.message}` });
  }
});

app.delete("/qrcodes", (req, res) => {
  try {
    deleteAllQRCodeImages();
    res.json({
      success: true,
      message: "All QR code images deleted successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Error deleting QR code images: ${error.message}` });
  }
});

app.get("/instance/list", (req, res) => {
  const authDir = path.join(__dirname, "../.wwebjs_auth"); // Ajuste no caminho para a pasta raiz
  console.log("Diretório de autenticação:", authDir); // Adicionado para depuração

  if (fs.existsSync(authDir)) {
    const sessionFolders = fs.readdirSync(authDir);
    const sessionNames = sessionFolders.map((sessionFolder) =>
      sessionFolder.replace("session-", "")
    );
    console.log({ sessions: sessionNames });
    res.json({ sessions: sessionNames });
  } else {
    res.json({ sessions: [] });
  }
});

app.get("/instance/fetchInstances", (req, res) => {
  const authDir = path.join(__dirname, "../.wwebjs_auth"); // Ajuste no caminho para a pasta raiz
  console.log("Diretório de autenticação:", authDir); // Adicionado para depuração

  if (fs.existsSync(authDir)) {
    const sessionFolders = fs.readdirSync(authDir);
    const sessions = sessionFolders
      .map((sessionFolder) => {
        const sessionFilePath = path.join(
          authDir,
          sessionFolder,
          "session.json"
        );

        if (fs.existsSync(sessionFilePath)) {
          const sessionData = JSON.parse(
            fs.readFileSync(sessionFilePath, "utf8")
          );
          return {
            instance: {
              instanceName: sessionFolder.replace("session-", ""),
              owner: sessionData.owner, // Supondo que a informação do proprietário esteja armazenada aqui
            },
          };
        }
        return null;
      })
      .filter((session) => session !== null);

    console.log({ sessions });
    res.json(sessions);
  } else {
    res.json([]);
  }
});

app.get("/instance/connectionState/:instanceName", (req, res) => {
  const { instanceName } = req.params;
  const state = getConnectionStatus(instanceName);
  res.json({ instanceName, state });
});

app.get("/instance/connect/:sessionName", (req, res) => {
  const { sessionName } = req.params;

  const qrCodeFilePath = path.join(
    __dirname,
    "qrcodes",
    `qrcode_${sessionName}.png`
  );

  if (fs.existsSync(qrCodeFilePath)) {
    const image = fs.readFileSync(qrCodeFilePath, { encoding: "base64" });
    const base64Image = `data:image/png;base64,${image}`;
    res.json({
      instance: sessionName,
      base64: base64Image,
    });
  } else {
    res.status(404).json({ error: "QR code not found" });
  }
});

app.get("/instance/connect/image/:sessionName", (req, res) => {
  const { sessionName } = req.params;

  const qrCodeFilePath = path.join(
    __dirname,
    "qrcodes",
    `qrcode_${sessionName}.png`
  );

  if (fs.existsSync(qrCodeFilePath)) {
    // Define o tipo de conteúdo da resposta como imagem/png
    res.type("png");

    // Lê o arquivo de imagem e transmite como resposta
    fs.createReadStream(qrCodeFilePath).pipe(res);
  } else {
    res.status(404).json({ error: "QR code not found" });
  }
});

app.post("/sendMessage", async (req, res) => {
  const { instanceName, number, mediaMessage } = req.body;

  if (!instanceName || !number || !mediaMessage) {
    return res
      .status(400)
      .send("instanceName, number, and mediaMessage are required");
  }

  const client = sessions[instanceName];
  if (!client) {
    return res.status(400).send(`Session ${instanceName} does not exist`);
  }

  try {
    const { mediatype, fileName, caption, media } = mediaMessage;

    // Processar o número de telefone
    let processedNumber = number;

    // Remover o nono dígito se o número for brasileiro e contiver 9 dígitos no número local
    const brazilCountryCode = "55";

    if (
      processedNumber.startsWith(brazilCountryCode) &&
      processedNumber.length === 13
    ) {
      processedNumber = processedNumber.slice(0, -1);
    }

    // Obter o arquivo de mídia
    const response = await axios.get(media, { responseType: "arraybuffer" });
    const mimeType = response.headers["content-type"];
    const mediaData = Buffer.from(response.data, "binary").toString("base64");

    const messageMedia = new MessageMedia(mimeType, mediaData, fileName);

    await client.sendMessage(`${processedNumber}@c.us`, messageMedia, {
      caption: caption,
    });

    console.log("Mensagem enviada com sucesso!");
    res.status(200).json({ status: "PENDING" });
  } catch (error) {
    res.status(500).send(`Error sending message: ${error.message}`);
  }
});

app.post("/message/sendText/:instanceName", async (req, res) => {
  const { number, options, textMessage } = req.body;
  const { instanceName } = req.params;

  if (!instanceName || !number || !textMessage || !textMessage.text) {
    return res
      .status(400)
      .send("instanceName, number, and textMessage.text are required");
  }

  const client = sessions[instanceName];
  if (!client) {
    return res.status(400).send(`Session ${instanceName} does not exist`);
  }

  try {
    let processedNumber = number;
    const brazilCountryCode = "55";

    if (processedNumber.startsWith(brazilCountryCode)) {
      const localNumber = processedNumber.slice(4);

      if (localNumber.length === 9 && localNumber.startsWith("9")) {
        processedNumber =
          brazilCountryCode +
          processedNumber.slice(2, 4) +
          localNumber.slice(1);
      }
    }

    await client.sendMessage(`${processedNumber}@c.us`, textMessage.text);

    console.log(`Mensagem de texto enviada com sucesso ao numero ${number}!`);
    res.status(200).json({ status: "PENDING" });
  } catch (error) {
    res.status(500).send(`Error sending message: ${error.message}`);
  }
});

app.post("/message/sendMedia/:instanceName", async (req, res) => {
  const { number, mediaMessage } = req.body;
  const { instanceName } = req.params;

  if (!instanceName || !number || !mediaMessage) {
    return res
      .status(400)
      .send("instanceName, number, and mediaMessage are required");
  }

  const client = sessions[instanceName];
  if (!client) {
    return res.status(400).send(`Session ${instanceName} does not exist`);
  }

  try {
    let processedNumber = number;
    const brazilCountryCode = "55";

    if (processedNumber.startsWith(brazilCountryCode)) {
      const localNumber = processedNumber.slice(4);

      if (localNumber.length === 9 && localNumber.startsWith("9")) {
        processedNumber =
          brazilCountryCode +
          processedNumber.slice(2, 4) +
          localNumber.slice(1);
      }
    }

    // Obter o arquivo de mídia
    const response = await axios.get(media, { responseType: "arraybuffer" });
    const mimeType = response.headers["content-type"];
    const mediaData = Buffer.from(response.data, "binary").toString("base64");

    const messageMedia = new MessageMedia(mimeType, mediaData, fileName);

    await client.sendMessage(`${processedNumber}@c.us`, messageMedia, {
      caption: caption,
    });

    console.log(`Mensagem enviada com sucesso ao numero ${number}!`);
    res.status(200).json({ status: "PENDING" });
  } catch (error) {
    res.status(500).send(`Error sending message: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`WhatsApp session server is running on port ${port}`);
});
