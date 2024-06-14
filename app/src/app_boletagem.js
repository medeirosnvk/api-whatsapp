require("dotenv").config();
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const qrImage = require("qr-image");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const express = require("express");
const axios = require("axios");

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

let redirectSentMap = new Map();
const sessions = {};

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

  client.on("authenticated", () => {
    console.log(`Conexão bem-sucedida na sessão ${sessionName}!`);
    sessions[sessionName] = client;
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
      console.log(`Session ${sessionName} disconnected`);
    } catch (error) {
      console.error(`Error disconnecting session ${sessionName}:`, error);
      throw error;
    }
  }
};

const disconnectAllSessions = async () => {
  const sessionsPath = path.join(__dirname, "../.wwebjs_auth");

  try {
    const files = fs.readdirSync(sessionsPath);
    const sessionFiles = files.filter((file) => file.endsWith(".json")); // Supondo que os arquivos de sessão terminem com .json

    for (const file of sessionFiles) {
      const sessionName = path.basename(file, ".json");
      await disconnectSession(sessionName);
    }
  } catch (error) {
    console.error("Error reading sessions directory:", error);
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
  const authDir = path.join(__dirname, "../.wwebjs_auth"); // Ajuste no caminho para a pasta raiz
  console.log("Diretório de autenticação:", authDir); // Adicionado para depuração
  if (fs.existsSync(authDir)) {
    const sessionFolders = fs.readdirSync(authDir);
    console.log("Pastas de sessão encontradas:", sessionFolders); // Adicionado para depuração
    sessionFolders.forEach((sessionFolder) => {
      const sessionName = sessionFolder.replace("session-", "");
      console.log(`Restaurando sessão de ${sessionName}...`);
      createSession(sessionName);
    });
  } else {
    console.log("O diretório de autenticação não existe."); // Adicionado para depuração
  }
};

app.post("/session", (req, res) => {
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
    return res.status(400).json({
      error: `QR Code image for session ${instanceName} already exists`,
    });
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

app.post("/restore/all", (req, res) => {
  try {
    restoreAllSessions();
    res.json({
      success: true,
      message: "All sessions restored successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Error restoring all sessions: ${error.message}` });
  }
});

app.delete("/logout/:sessionName", async (req, res) => {
  const { sessionName } = req.params;

  if (!sessionName) {
    return res.status(400).send("sessionName is required");
  }

  try {
    await disconnectSession(sessionName);
    deleteQRCodeImage(sessionName); // Chama a função para excluir a imagem
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

app.delete("/logout/all", async (req, res) => {
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

app.get("/sessions", (req, res) => {
  const authDir = path.join(__dirname, "../.wwebjs_auth"); // Ajuste no caminho para a pasta raiz
  console.log("Diretório de autenticação:", authDir); // Adicionado para depuração

  if (fs.existsSync(authDir)) {
    const sessionFolders = fs.readdirSync(authDir);
    const sessionNames = sessionFolders.map((sessionFolder) =>
      sessionFolder.replace("session-", "")
    );
    res.json({ sessions: sessionNames });
  } else {
    res.json({ sessions: [] });
  }
});

app.get("/qrcode/base64/:sessionName", (req, res) => {
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

app.get("/qrcode/image/:sessionName", (req, res) => {
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
    res.json({ status: "Message sent successfully" });
  } catch (error) {
    res.status(500).send(`Error sending message: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`WhatsApp session server is running on port ${port}`);
});
