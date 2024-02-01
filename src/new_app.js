require("dotenv").config();
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const { executeQuery } = require("./dbconfig");
const getCredorDividas = require("./services/getCredorDividas.service");
const getCredorInfo = require("./services/getCredorInfo.service");
const getCredorOfertas = require("./services/getCredorOfertas.service");

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

const data = {};

function formatValue(number) {
  if (number !== undefined && number !== null) {
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } else {
    return 'N/A';
  }
}

function formatarMoeda(valorString) {
  let valorNumerico = parseFloat(valorString);
  if (isNaN(valorNumerico)) {
      return 'Formato inválido';
  }
  return valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCredorOfertas(ofertas) {
  return ofertas.map((detalhe, index) => (
    `${index + 1}) ` + `Parcelamento em ${index + 1} x ` + `${formatarMoeda(detalhe.valor_parcela)}`
  )).join('\n');
}

function formatCredorInfo(creditorInfo) {
  return creditorInfo.map((info, index) => (
    `*--------- ${index + 1} ---------*\n` +
    `IdDevedor: ${info.iddevedor}\n` +
    `Empresa: ${info.empresa}\n` +
    `Saldo: ${formatValue(info.saldo)}`  
  )).join('\n\n');
}

function formatCredorDividas(creditorDividas) {
  return creditorDividas.map((info, index) => (
    `*--------- ${index + 1} ---------*\n` +
    `Contrato: ${info.contrato}\n` +
    `Vencimento: ${formatDateIsoToBr(info.vencimento)}\n` +
    `Dias Atraso: ${info.diasatraso}\n` +
    `Valor: ${formatValue(info.valor)}`
  )).join('\n\n');
}

function getCurrentDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateIsoToBr(data) {
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

class StateMachine {
  constructor() {
    this.client = client;
    this.userStates = {};
  }

  _getCredor(phoneNumber) {
    return this.userStates[phoneNumber].credor;
  }

  _getState(phoneNumber) {
    if (this.userStates[phoneNumber]) {
      return this.userStates[phoneNumber];
    }

    this.userStates[phoneNumber] = { currentState: "INICIO", credor: {} };

    return this.userStates[phoneNumber];
  }

  _setCredor(phoneNumber, credor) {
    this.userStates[phoneNumber].credor = credor;
  }

  _setState(phoneNumber, newState) {
    if (!this.userStates[phoneNumber]) {
      this.userStates[phoneNumber] = { currentState: "INICIO" };
    }

    this.userStates[phoneNumber].currentState = newState;
  }

  async _postMessage(origin, message) {
    console.log(`Horário da mensagem enviada ao cliente: ${new Date}`);
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
          const credorInfo = await getCredorInfo(document);

          if (credorInfo && credorInfo.length > 0) {
            const credorMessage = formatCredorInfo(credorInfo);
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
      const credorInfo = await getCredorInfo(document);

      if (selectedOption >= 1 && selectedOption <= credorInfo.length) {
        const selectedCreditor = credorInfo[selectedOption - 1];

        console.log(`Conteúdo da opção ${selectedOption} armazenado:`, selectedCreditor);

        data.credorInfo = credorInfo;
        data.selectedCreditor = selectedCreditor;

        const idDevedor = selectedCreditor.iddevedor;
        const dataBase = getCurrentDate();

        const credorDividas = await getCredorDividas(idDevedor, dataBase);
        const credorOfertas = await getCredorOfertas(idDevedor);

        data.credorDividas = credorDividas;

        const formattedResponseDividas = formatCredorDividas(credorDividas);
        const formattedResponseOfertas = formatCredorOfertas(credorOfertas);

        const terceiraMensagem = `As seguintes dividas foram encontradas para a empresa selecionada:\n\n${formattedResponseDividas}\n\n*Escolha uma das opções abaixo para prosseguirmos no seu acordo:*\n\n${formattedResponseOfertas}`;

        await this._postMessage(origin, terceiraMensagem);
        Object.assign(userState[phoneNumber], { ofertaEnviado: true })
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
        // Lógica para o estado INICIO
        await this._handleInitialState(origin, "80307836");
        this._setState(phoneNumber, "MENU");
        break;

      case "MENU":
        // Lógica para o estado MENU
        await this._handleMenuState(origin, "80307836", response);
        this._setState(phoneNumber, "CREDOR");
        break;

      case "CREDOR":
        // Lógica para o estado MENU
        await this._handleCredorState(origin, "80307836", response);
        this._setState(phoneNumber, "OFERTA");
        break;

      case "OFERTA":
        // Lógica para o estado MENU
        await this._handleOfertaState(origin, "80307836", response);
        this._setState(phoneNumber, "INFINITO");
        break;
        
      case "INFINITO":
        // Lógica para o estado MENU
        await this._handleMenuState(origin, "80307836", response);
        this._setState(phoneNumber, "INICIO");
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
  const phoneNumber = response.from.replace(/[^0-9]/g, "");
  await stateMachine.handleMessage("80307836", response);
});

client.initialize();
