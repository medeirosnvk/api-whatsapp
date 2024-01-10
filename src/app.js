const qrcode = require('qrcode-terminal');
const axios = require('axios');
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth()
});

let respondedConversations = new Set();
let userDocument;
let dataBase;
let iddevedor;
let lastInteractionTime;
let incorrectAttempts = 0;

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('auth_failure', msg => console.log(msg));

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async message => {
  lastInteractionTime = new Date();

  if (respondedConversations.has(message.from)) {
    return;
  }

  const lowerCaseMessage = message.body.trim().toLowerCase();

  if (isGreeting(lowerCaseMessage)) {
    await handleGreeting(message);
  } else {
    if (!userDocument) {
      await processUserResponse(message, lowerCaseMessage);
    } else {
      await handleUserChoice(message, parseInt(lowerCaseMessage, 10));
    }
  }
});

async function handleGreeting(message) {
  console.log("handleGreeting props -", message)

  respondedConversations.add(message.from);
  incorrectAttempts = 0;

  message.reply('Olá, bem-vindo a Cobrance! Para agilizar o atendimento, por favor, nos informe o seu CPF ou CNPJ do seu cadastro.');

  const userResponse = await waitForUserResponse();

  await processUserResponse(message, userResponse);
}

async function processUserResponse(message, userResponse) {
  console.log("processUserResponse props -", message, userResponse)

  if (isValidDocument(userResponse)) {
    try {
      userDocument = userResponse; // Armazena o número do documento
      const creditorInfo = await getCredorInfo(userResponse);

      const formattedMessage = createFormattedMessage(creditorInfo);

      await message.reply(formattedMessage);

      dataBase = getCurrentDate();
      iddevedor = creditorInfo.iddevedor;

      const userConfirmation = await waitForUserResponse();

      await handleUserConfirmation(message, userConfirmation);
    } catch (error) {
      handleProcessingError(message, error);
    }
  } else {
    message.reply('Número de documento inválido. Favor, insira novamente.');
  }
}


async function handleUserChoice(message, userChoice) {
  console.log('handleUserChoice props -', message, userChoice);

  switch (userChoice) {
    case 1:
      console.log('Opção 1 selecionada. Chamando getCredorInfo.');
      try {
        const creditorInfo = await getCredorInfo(userDocument);
        console.log('Informações do credor:', creditorInfo);
        const creditorMessage = createFormattedMessage(creditorInfo);
        await message.reply(creditorMessage);
      } catch (error) {
        console.error('Erro ao obter informações do credor:', error.message);
        handleProcessingError(message, error);
      }
      break;
    case 2:
      // Adicione lógica para a opção 2, se necessário
      break;
    // Adicione outras opções conforme necessário
    default:
      console.log('Opção não reconhecida ou não tratada.');
      // Trate outras opções, se necessário
  }
}

function createFormattedMessage(creditorInfo) {
  return `Olá *${creditorInfo.nome}*, tudo bem? Esperamos que sim!\n\nNosso contato é referente a *${creditorInfo.empresa}*, ao qual encontramos um débito em aberto sobre nossa consultoria. Gostaria de receber mais informações e propostas?\n\nPor favor, escolha uma opção:\n1. Credores\n2. Dívidas\n3. Parcelamento\n4. Ver Acordos\n5. Ver Boletos\n6. Linha Digitável\n7. Pix Copia e Cola`;
}

async function handleUserConfirmation(message, userConfirmation) {
  if (userConfirmation.toLowerCase() === 'sim') {
    const totalInfo = await getCredorDividasTotais(iddevedor, dataBase);

    const totalFormatado = totalInfo && totalInfo.total_geral ? formatValue(totalInfo.total_geral) : 'Erro ao formatar total_geral';

    const replyMessage = `Foram encontradas em seu CPF/CNPJ um total de *${totalInfo.numero_dividas}* dívidas, no valor total de *${totalFormatado}*.\n\nA seguir, segue oferta de parcelamento disponível:\n\n`;
    
    const ofertas = await getCredorOfertas(iddevedor);
    const cards = await formatOfertasAsCards(ofertas);

    const fullMessage = replyMessage + cards.join('\n') + "\n_(Selecione a opção correspondente ao parcelamento escolhido. Ex: 1, 2, 3...)_";

    await message.reply(fullMessage);

    // Aguarde a resposta do usuário e armazene o número de parcelas escolhido
    const userChoice = await waitForUserChoice();

    // Agora, você pode usar userChoice em uma nova rota ou realizar outras operações
    console.log('Número de parcelas escolhido pelo usuário:', userChoice);

    // Continue o fluxo conforme necessário...
  } else if (userConfirmation.toLowerCase() === 'não' || userConfirmation.toLowerCase() === 'nao') {
    message.reply('Obrigado por entrar em contato. Encerrando atendimento.');
    respondedConversations.add(message.from);
  } else {
    incorrectAttempts++;

    if (incorrectAttempts < 3) {
      // Se a resposta não for reconhecida, solicite novamente
      message.reply('Desculpe, não entendi. Por favor, responda com "sim" se deseja mais informações e propostas, ou "não" para encerrar o atendimento.');
    } else {
      message.reply('Você forneceu respostas incorretas várias vezes. Encerrando atendimento.');
      respondedConversations.add(message.from);
    }
  }
}

async function waitForUserChoice() {
  return new Promise(resolve => {
    client.on('message', async userMessage => {
      lastInteractionTime = new Date();
      const userChoice = userMessage.body.trim().toLowerCase();

      if (/^\d+$/.test(userChoice)) {
        // Se a resposta for um número, resolve a Promise
        resolve(parseInt(userChoice, 10));
      } else {
        // Se a resposta não for um número, solicita novamente
        client.sendMessage(userMessage.from, 'Desculpe, não entendi. Por favor, responda com o número correspondente ao parcelamento escolhido (Ex: 1, 2, 3...).');
      }
    });
  });
}

function handleProcessingError(message, error) {
  console.error('Erro ao processar a solicitação:', error.message);
  message.reply('Desculpe, ocorreu um erro ao processar a sua solicitação. Por favor, tente novamente mais tarde.');
}

async function waitForUserResponse() {
  return new Promise(resolve => {
    client.on('message', async userMessage => {
      lastInteractionTime = new Date();
      resolve(userMessage.body.trim());
    });
  });
}

function isGreeting(message) {
  return ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(message);
}

async function getCredorInfo(document) {
  const response = await axios.get(`http://localhost:3000/lista-credores?documento=${document}`);
  return response.data[0];
}

async function getCredorDividas(iddevedor, dataBase) {
  const response = await axios.get(`http://localhost:3000/credores/dividas?iddevedor=${iddevedor}&database=${dataBase}`);
  return response.data[0];
}

async function getCredorDividasTotais(iddevedor, dataBase) {
  const response = await axios.get(`http://localhost:3000/credores/dividas/total?iddevedor=${iddevedor}&database=${dataBase}`);
  return response.data;
}

async function getCredorOfertas(iddevedor) {
  const response = await axios.get(`http://localhost:3000/credores/oferta-parcelas?iddevedor=${iddevedor}`);
  return response.data;
}

function formatOfertasAsCards(ofertas) {
  return ofertas.map((detalhe, index) => (
    `*Parcelamento em ${index + 1}x*\n` +
    `Valor: ${formatValue(detalhe.valor_parcela)}\n`
  ));
}

function isValidDocument(document) {
  const isCPF = /^[0-9]{11}$/.test(document);
  const isCNPJ = /^[0-9]{14}$/.test(document);
  return isCPF || isCNPJ;
}

function getCurrentDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function checkInactivity() {
  const currentTime = new Date();
  const elapsedTime = currentTime - lastInteractionTime;
  const inactivityThreshold = 5 * 60 * 1000; // 10 minutos em milissegundos

  if (elapsedTime >= inactivityThreshold) {
    // Reinicia a conversa
    respondedConversations.clear();
    console.log('Conversa reiniciada devido à inatividade.');
  }

  // Agende a próxima verificação de inatividade
  setTimeout(checkInactivity, inactivityThreshold);
}

function formatValue(number) {
  if (number !== undefined && number !== null) {
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } else {
    return 'N/A';
  }
}

// Inicia o temporizador de verificação de inatividade
checkInactivity();

client.initialize();
