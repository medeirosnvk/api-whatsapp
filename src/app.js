const qrcode = require('qrcode-terminal');
const axios = require('axios');
const { Client, LocalAuth, Buttons, List } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth()
});

let respondedConversations = new Set();
let userDocument;
let dataBase;
let iddevedor;
let lastInteractionTime;
let incorrectAttempts = 0;

const messages = [];
const indexes = {
  greeting: 0,
  document: 1,
  switch: 2,
}

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('auth_failure', msg => console.log(msg));

client.on('ready', () => {
  console.log('Client is ready!');
});

client.on('message', async message => {
  lastInteractionTime = new Date();

  const lowerCaseMessage = message.body.trim().toLowerCase();

  if (messages.length === 0) {
    // length igual à zero significa que o array de mensagens está vazio, então é necessária a mensagem de boas-vindas para dar início ao chat;
    return await handleGreeting(message, lowerCaseMessage);
  }

  if (messages.length === 1) {
    // length igual à um significa que o chat já foi iniciado, logo solicito o documento do cliente;
    return await processUserDocument(message, lowerCaseMessage);
  }

  if (messages.length === 2 || messages.length === 3) {
    // length igual à dois significa que o chat já possui documento, logo solicito qual opção ele quer executar;
    return await handleUserChoice(message, lowerCaseMessage);
  }
});

// client.on('message', msg => {
//   console.log('mensaje de: ', msg.from, 'Texto: ', msg.body)

//   if (msg.body === 'Hello') {
//     let button = new Buttons('Button body', [{ body: 'Aceitar' }, { body: 'Rejeitar' }], 'title', 'footer');
//     client.sendMessage(msg.from, button);
//   }
// });

async function handleGoBack(message, userResponse) {
  if (userResponse === 'voltar') {
    messages.pop();
    await processUserDocument(message, userDocument);
  }
}

async function handleGreeting(message, userResponse) {
  if (isGreeting(userResponse)) {
    messages.push(message);
    return client.sendMessage(message.from, 'Olá, bem-vindo a Cobrance!\n\nPara agilizar o atendimento, por favor, nos informe o seu *CPF* ou *CNPJ* do seu cadastro.');
  }
    
  return client.sendMessage(message.from, 'Para iniciar o atendimento, inicie uma conversa com *"Oi"* ou *"Olá"*.');
}

async function processUserDocument(message, userResponse) {
  console.log("processUserResponse props -", message, userResponse)

  if (isValidDocument(userResponse)) {
    try {
      userDocument = userResponse; // Armazena o número do documento
      const creditorInfo = await getCredorInfo(userResponse);
      const formattedMessage = createFormattedMessage(creditorInfo);

      await client.sendMessage(message.from, formattedMessage);

      // dataBase = getCurrentDate();
      // iddevedor = creditorInfo.iddevedor;

      // const userConfirmation = await waitForUserResponse();

      // await handleUserConfirmation(message, userConfirmation);

      if (messages.length === 1) {
        // só incrementar o array de messages, caso somente a mensagem de greeting esteja dentro do array, caso contrário, não executar o push
        messages.push(message);
      }
    } catch (error) {
      handleProcessingError(message, error);
    }
  } else {
    client.sendMessage(message.from, 'Número de documento inválido. Favor, insira novamente.');
  }
}

async function novaMensagemAposSwitch(message) {
  await client.sendMessage(message.from, "_Você pode *Voltar* digitando 8_");
}

let selectedCreditors = [];

async function handleUserChoice(message, userChoice) {
  // console.log('handleUserChoice props -', message, userChoice, typeof userChoice);

  switch (userChoice) {
    case "1":
      try {
        const creditorInfo = await getCredorInfo(userDocument);
        const creditorMessage = formatCredorInfo(creditorInfo);
        
        // await message.reply(creditorMessage);
        client.sendMessage(message.from, creditorMessage)
        messages.push(message);
        const previousMessage = messages[indexes.document];
        await novaMensagemAposSwitch(previousMessage, userDocument);
      } catch (error) {
        console.error('Switch case opcao 1 retornou erro - ', error.message);
        handleProcessingError(message, error);
      } finally {
        console.log('sempre vou ser executado');
        break;
      }

    case "2":
      try {
        const creditorInfo = await getCredorInfo(userDocument);
        const creditorMessage = formatCredorInfo(creditorInfo);
    
        // Envie as informações do credor
        client.sendMessage(message.from, creditorMessage);
        messages.push(message);
    
        // Pergunte ao usuário para escolher uma opção da lista
        await client.sendMessage(message.from, 'Escolha uma opção (por exemplo, responda com "1" ou "2")');
    
        // Aguarde a resposta do usuário
        const userResponse = await waitForUserResponse(message.from);

        // Use a resposta do usuário para determinar os próximos passos
        const selectedOption = parseInt(userResponse.trim()); // Supondo que o usuário responda com um número

        // Valide a opção selecionada
        if (selectedOption >= 1 && selectedOption <= creditorInfo.length) {
          const selectedCreditor = creditorInfo[selectedOption - 1];

          // Armazene a opção selecionada no array
          selectedCreditors.push(selectedCreditor);
          console.log(`Conteúdo da opção ${selectedOption} armazenado:`, selectedCreditor);

          // Use a informação correta do IdDevedor da opção selecionada
          const idDevedor = selectedCreditor.iddevedor;

          // Faça a solicitação Axios no endpoint especificado
          const credorDividas = await axios.get(`http://localhost:3000/credores/dividas?iddevedor=${idDevedor}&database=2024-01-03`);

          // Processe a resposta do Axios (use axiosResponse.data conforme necessário)
          const responseCredorDividas = credorDividas.data;

          // Organize as informações para exibir ao usuário
          const formattedResponse = formatCredorDividas(responseCredorDividas)

          // Exiba as informações formatadas ao usuário
          client.sendMessage(message.from, formattedResponse);

          // Continue com o restante da sua lógica
          const previousMessage = messages[indexes.document];
          await novaMensagemAposSwitch(previousMessage, userDocument);
              } else {
                await message.reply('Opção inválida. Por favor, escolha uma opção válida.');
              }
            } catch (error) {
              console.error('Case 2 retornou um erro - ', error.message);
              handleProcessingError(message, error);
            } finally {
              console.log('Sempre serei executado');
              break;
            }

    case "3":
    await message.reply('Case 3');
    break;

    case "4":
    await message.reply('Case 4');
    break;

    case "5":
      try {
        const credorAcordoFirmado = await getAcordosFirmados(userDocument);
    
        // Verifica se há pelo menos um acordo retornado
        if (credorAcordoFirmado.length > 0) {
          const idacordo = credorAcordoFirmado[0].idacordo;
    
          const credorAcordoFirmadoDetalhado = await getAcordosFirmadosDetalhado(idacordo);
          const formatAcordo = formatAcordoDetalhado(credorAcordoFirmadoDetalhado);
    
          client.sendMessage(message.from, formatAcordo);
          messages.push(message);
          const previousMessage = messages[indexes.document];
          await novaMensagemAposSwitch(previousMessage, userDocument);
        } else {
          console.error('Nenhum acordo encontrado para o usuário.');
          // Trate a situação em que nenhum acordo foi encontrado
        }
      } catch (error) {
        console.error('Switch case opcao 5 retornou erro - ', error.message);
        handleProcessingError(message, error);
      } finally {
        console.log('sempre vou ser executado');
        break;
      }

    case "6":
    await message.reply('Case 6');
    break;

    case "7":
    await message.reply('Case 7');
    break;

    case "8":
      handleGoBack(message, 'voltar')
      break;

    default:
      await message.reply('Opção inválida');
      const previousMessage = messages[indexes.document];
      await processUserDocument(previousMessage, userDocument);
  }
}

function createFormattedMessage(creditorInfo) {
  return `Olá *${creditorInfo[0].nome}*,\n\nPor favor, escolha uma opção:\n\n1 - Credores\n2 - Dívidas\n3 - Parcelamento\n4 - Ver Acordos\n5 - Ver Boletos\n6 - Linha Digitável\n7 - Pix Copia e Cola\n8 - Voltar`;
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
  return response.data;
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

async function getAcordosFirmados(document) {
  const response = await axios.get(`http://localhost:3000/lista-acordos-firmados?documento=${document}`);
  return response.data;
}

async function getAcordosFirmadosDetalhado(idacordo) {
  const response = await axios.get(`http://localhost:3000/lista-acordos-firmados-detalhado?idacordo=${idacordo}`);
  return response.data;
}

async function getCredorVerBoleto(iddevedor) {
  const response = await axios.get(`http://localhost:3000/credores/oferta-parcelas?iddevedor=${iddevedor}`);
  return response.data;
}

function formatCredorOfertas(ofertas) {
  return ofertas.map((detalhe, index) => (
    `*Parcelamento em ${index + 1}x*\n` +
    `Valor: ${formatValue(detalhe.valor_parcela)}\n`
  ));
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
    `Vencimento: ${info.vencimento}\n` +
    `Valor: ${formatValue(info.valor)}\n` +
    `Dias Atraso: ${info.dias_atraso}`
  )).join('\n\n');
}

function formatAcordoDetalhado(acordos) {
  return acordos.map((info, index) => {
    return (
      `*--------- ${index + 1} ---------*\n` +
      `IdAcordo: ${info.idacordo}\n` +
      `IdBoleto: ${info.idboleto}\n` +
      `Data Vencimento: ${formatDateIsoToBr(info.datavenc)}\n` +
      `Situacao: ${info.situacao}\n` +
      `Empresa: ${info.credor}\n` +
      `Link Boleto: ${info.idboleto > 1 ? `http://cobrance.com.br/acordo/boleto.php?idboleto=${info.idboleto}&email=2` : 'Boleto Indisponível'}`
    );
  }).join('\n\n');
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

function formatDateIsoToBr(data) {
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
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
