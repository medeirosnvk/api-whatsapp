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

class StateMachine {
  constructor() {
    this.client = client;
    this.userStates = {};
  }

  _getCredor(phoneNumber) {
    return this.userStates[phoneNumber].credor;
  }

  _getState(phoneNumber) {
    return this.userStates[phoneNumber]
      ? this.userStates[phoneNumber].currentState
      : "INICIO";
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
          const credorInfo = await this.getCredorInfo(document);

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

  async handleMessage(phoneNumber, response) {
    const currentState = this._getState(phoneNumber);
    const origin = response.from;

    console.log(`Handle Message from ${phoneNumber} - ${currentState}`);

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
  await stateMachine.handleMessage(phoneNumber, response);
});

client.initialize();
