require("dotenv").config();
const qrcode = require("qrcode-terminal");
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
});

class StateMachine {
  constructor() {
    this.userStates = {};
    this.client = client;
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
      }
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

  async _postMessage(origin, message) {
    console.log(`Horário da mensagem enviada ao cliente: ${new Date()}`);
    await this.client.sendMessage(origin, message);
  }

  async _getCredorFromDB(phoneNumber) {
    const dbQuery = `
      SELECT d.iddevedor,d.cpfcnpj,d.nome,t.telefone,t.idtelefones
      FROM telefones2 t JOIN devedor d ON d.cpfcnpj = t.cpfcnpj
      WHERE RIGHT(t.telefone, 8) = '${phoneNumber}' AND d.idusuario NOT IN (11, 14);
    `;

    const dbResponse = await executeQuery(dbQuery, customDbConfig);

    if (dbResponse && dbResponse.length) {
      this._setCredor(phoneNumber, dbResponse[0]);
      return dbResponse[0];
    }

    throw new Error("Credor não encontrado");
  }

  async _getSomething(phoneNumber) {
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

  async _handleInitialState(origin, phoneNumber = "80307836") {
    const { nome: userName } = await this._getCredorFromDB(phoneNumber);
    const message = `Olá *${userName}*,\n\nPor favor, escolha uma opção:\n\n1 - Credores\n2 - Parcelamento\n3 - Ver Acordos\n4 - Ver Boletos\n5 - Linha Digitável\n6 - Pix Copia e Cola\n7 - Voltar`;

    await this._postMessage(origin, message);
  }

  async _handleMenuState(origin, phoneNumber = "80307836", response) {
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
          }
        } catch (error) {
          console.error("Case 1 retornou um erro - ", error.message);
        }

        break;
    }
  }

  async _handleCredorState(origin, phoneNumber = "80307836", response) {
    if (response && response.body.trim().match(/^\d+$/)) {
      const selectedOption = parseInt(response.body.trim());
      const { cpfcnpj: document } = this._getCredor(phoneNumber);
      const credorInfo = await requests.getCredorInfo(document);
      this._setDataCredores(phoneNumber, credorInfo);

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

        const credorDividas = await requests.getCredorDividas(idDevedor,dataBase);
        const credorOfertas = await requests.getCredorOfertas(idDevedor);

        this._setDataCredorDividas(phoneNumber, credorDividas);

        const formattedResponseDividas = utils.formatCredorDividas(credorDividas);
        const formattedResponseOfertas = utils.formatCredorOfertas(credorOfertas);
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

  async _handleOfertaState(origin, phoneNumber = "80307836", response) {
    if (response && response.body.trim().match(/^\d+$/)) {
      const selectedOptionParcelamento = parseInt(response.body.trim());
      const credorOfertas = await requests.getCredorOfertas(this.idDevedor); // Acesse aqui
  
      if (selectedOptionParcelamento >= 1 && selectedOptionParcelamento <= credorOfertas.length) {
        const ofertaSelecionada = credorOfertas[selectedOptionParcelamento - 1];
        this._setDataOferta(phoneNumber, ofertaSelecionada);

        const { periodicidade, valor_parcela, plano, idcredor, total_geral } = ofertaSelecionada;

        const ultimaDataParcela = utils.getUltimaDataParcela(periodicidade, valor_parcela, plano);
        const { parcelasArray, ultimaData } = ultimaDataParcela;
        const ultimaDataFormat = ultimaData.toISOString().slice(0,10)

        console.log('parcelasArray -', parcelasArray);
        console.log('ultimaData -', ultimaData);
    
        const currentDate = new Date();
        const currentTime = utils.getCurrentTime();
        
        const newDataBase = (currentDate.getDate() + parseInt(plano) * periodicidade);
        const formattedDate = newDataBase.toString().substring(0, 10);

        const { data: promessas } = await requests.getCredorDividas(this.idDevedor, formattedDate)

        const obj = {
          promessas,
          ultimaDataVencimento: ultimaData.toISOString().slice(0, 10),
          vencimentosParcelas: parcelasArray
        };

        this._setDataPromessas(phoneNumber, obj);
        console.log('userStates -', JSON.stringify(this.userStates, undefined, 2));

        const responseDividasCredores = await requests.getCredorDividas( this.idDevedor, ultimaDataFormat );
        const responseDividasCredoresTotais = await requests.getCredorDividasTotais( this.idDevedor, ultimaDataFormat );

        const { juros_percentual, honorarios_percentual, multa_percentual, tarifa_boleto } = responseDividasCredoresTotais;

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
          parcelasArray
        });

        const idacordo = await requests.postDadosAcordo(parsedData);
        console.log('idacordo -', idacordo);

        await this._postMessage(origin, 'Acordo realizado com sucesso - ' + JSON.stringify(idacordo));

        const parsedData2 = utils.parsePromessa({
          idacordo,
          iddevedor: this.idDevedor,
          plano
        });

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

        const responsePromessas = await Promise.all(promises);

        await this._postMessage(origin, 'Promessas realizadas com sucesso - ' + JSON.stringify(responsePromessas));
      } else {
        await this._postMessage(origin, 'Opção inválida. Por favor, escolha uma opção válida.');
      }
    } else {
      await this._postMessage(origin, 'Resposta inválida. Por favor, escolha uma opção válida.');
    }
  }  

  async handleMessage(phoneNumber, response) {
    const { credor, currentState } = this._getState(phoneNumber);
    const origin = response.from;

    console.log(`[${phoneNumber} - ${currentState}]`);

    switch (currentState) {
      case "INICIO":
        await this._handleInitialState(origin, "80307836");
        this._setCurrentState(phoneNumber, "MENU");
        break;

      case "MENU":
        await this._handleMenuState(origin, "80307836", response);
        this._setCurrentState(phoneNumber, "CREDOR");
        break;

      case "CREDOR":
        await this._handleCredorState(origin, "80307836", response);
        this._setCurrentState(phoneNumber, "OFERTA");
        break;

      case "OFERTA":
        await this._handleOfertaState(origin, "80307836", response);
        this._setCurrentState(phoneNumber, "INICIO");
        break;

      // case "INFINITO":
      //   await this._handleMenuState(origin, "80307836", response);
      //   this._setCurrentState(phoneNumber, "INICIO");
      //   break;
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
  const phoneNumber = response.from.replace(/[^0-9]/g, "");
  await stateMachine.handleMessage("80307836", response);
});

client.initialize();
