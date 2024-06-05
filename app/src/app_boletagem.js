require("dotenv").config();
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const qrImage = require("qr-image");
const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");

const app = express();
const port = 3060;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("qrcodes"));

const wwebVersion = "2.2412.54";
const SESSION_FILE_PATH = "./sessionTest.json";
const QR_CODES_DIR = path.join(__dirname, "qrcodes"); // Diretório para salvar os QR codes

let sessionData;

// Verificar se o diretório 'qrcodes' existe, se não, criar
if (!fs.existsSync(QR_CODES_DIR)) {
  fs.mkdirSync(QR_CODES_DIR);
}

if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionData = require(SESSION_FILE_PATH);
}

const sessions = {};

const saveQRCodeImage = (qr, sessionName) => {
  // Generate QR code image
  const qrCodeImage = qrImage.image(qr, { type: "png" });
  const qrCodeFileName = `qrcode_${sessionName}.png`; // Nome do arquivo
  const qrCodeFilePath = path.join(QR_CODES_DIR, qrCodeFileName); // Caminho completo para o arquivo

  // Save the QR code image
  const qrCodeWriteStream = fs.createWriteStream(qrCodeFilePath);
  qrCodeImage.pipe(qrCodeWriteStream);

  qrCodeWriteStream.on("finish", () => {
    console.log(`QR Code image saved: ${qrCodeFilePath}`);
  });
};

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

  client.on("qr", (qr) => {
    console.log(`QR Code para a sessão ${sessionName}:`);
    qrcode.generate(qr, { small: true });
    saveQRCodeImage(qr, sessionName);
  });

  client.on("ready", () => {
    console.log(`Sessão ${sessionName} está pronta!`);
  });

  client.on("auth_failure", () => {
    console.error(
      `Falha de autenticação na sessão ${sessionName}. Por favor, verifique suas credenciais.`
    );
  });

  client.on("disconnected", () => {
    console.log(`Sessão ${sessionName} foi desconectada.`);
  });

  client.on("authenticated", (session) => {
    console.log(`Conexão bem-sucedida na sessão ${sessionName}!`);
    sessionData = session;

    if (sessionData) {
      fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), (err) => {
        if (err) {
          console.error(`Erro ao salvar a sessão ${sessionName}:`, err);
        }
      });
    }
  });

  client.on("message", (msg) => {
    console.log(`Mensagem ${msg.body} recebida de ${msg.from}`);

    if (msg.body == "!ping") {
      msg.reply("pong");
    }
  });

  client.initialize();
  sessions[sessionName] = client;

  return client;
};

const deleteSession = async (sessionName) => {
  const client = sessions[sessionName];

  if (client) {
    if (client.pupBrowser) {
      await client.pupBrowser.close();
    }
    await client.destroy();
    delete sessions[sessionName];

    const qrCodeFilePath = path.join(QR_CODES_DIR, `qrcode_${sessionName}.png`);
    if (fs.existsSync(qrCodeFilePath)) {
      fs.unlinkSync(qrCodeFilePath);
      console.log(`QR Code image deleted: ${qrCodeFilePath}`);
    }
  }
};

const getSession = (sessionName) => {
  if (!sessionName) {
    console.log("Conexões estabelecidas:");
    Object.keys(sessions).forEach((session) => {
      console.log(`- ${session}`);
    });
  } else {
    return sessions[sessionName];
  }
};

app.post("/session", (req, res) => {
  const { sessionName } = req.body;

  const qrCodeFilePath = path.join(QR_CODES_DIR, `qrcode_${sessionName}.png`);

  if (!sessionName) {
    return res.status(400).send("sessionName is required");
  }

  if (sessions[sessionName]) {
    console.log(`Session ${sessionName} already exists`);
    return res.status(400).send(`Session ${sessionName} already exists`);
  }

  if (fs.existsSync(qrCodeFilePath)) {
    console.log(`QR Code image for session ${sessionName} already exists`);
    return res
      .status(400)
      .send(`QR Code image for session ${sessionName} already exists`);
  }

  console.log("Creating a new session...");

  try {
    createSession(sessionName);
    res.send(`Session ${sessionName} created successfully`);
  } catch (error) {
    res.status(500).send(`Error creating session: ${error.message}`);
  }
});

app.delete("/session", async (req, res) => {
  const { sessionName } = req.body;

  if (!sessionName) {
    return res.status(400).send("sessionName is required");
  }

  try {
    await deleteSession(sessionName);
    res.send(`Session ${sessionName} deleted successfully`);
  } catch (error) {
    res.status(500).send(`Error deleting session: ${error.message}`);
  }
});

app.get("/sessions", (req, res) => {
  const sessionNames = Object.keys(sessions);
  res.json({ sessions: sessionNames });
});

app.get("/qrcode/:sessionName", (req, res) => {
  const qrCodeFilePath = path.join(
    __dirname,
    "qrcodes",
    `qrcode_${req.params.sessionName}.png`
  );

  if (fs.existsSync(qrCodeFilePath)) {
    res.sendFile(qrCodeFilePath);
  } else {
    res.status(404).send("QR code not found");
  }
});

app.listen(port, () => {
  console.log(`WhatsApp session server is running on port ${port}`);
});
