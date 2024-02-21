const qrcode = require('qrcode-terminal');
const { executeQuery } = require('./dbconfig')
const { Client, LocalAuth } = require('whatsapp-web.js');
const getCredorInfo = require('./services/getCredorInfo.service');
const getCredorDividas = require('./services/getCredorDividas.service');
const getCredorOfertas = require('./services/getCredorOfertas.service');

require('dotenv').config();

const customDbConfig = {
  host: process.env.DB2_MY_SQL_HOST,
  user: process.env.MY_SQL_USER,
  password: process.env.DB2_MY_SQL_PASSWORD,
  port: process.env.MY_SQL_PORT,
  database: process.env.DB2_MY_SQL_DATABASE,
  connectionLimit: parseInt(process.env.MY_SQL_CONNECTION_LIMIT),
  charset: process.env.MY_SQL_CHARSET,
};

let userName;
let phoneNumber;
let document;
let idDevedor;
let dataBase;
let idLote;
let dataVenc;
let idBoleto;
let horario;
let interactionState = null;

const data = {};
const userState = {};

const defaultValuesMenuState = {
  menuEnviado: false,
  credorEnviado: false,
  ofertaEnviado: false,
  acordoEnviado : false,
}

const agora = new Date();
const horaAtual = agora.getHours();
const minutosAtual = agora.getMinutes();
const segundosAtual = agora.getSeconds();

const hora = `${horaAtual}:${minutosAtual}:${segundosAtual}`;

if (horaAtual >= 18 || horaAtual < 8 || (horaAtual === 8 && minutosAtual === 0 && segundosAtual === 0)) {
  horario = 0;
  console.log('Fora do expediente de atendimento');
} else {
  horario = 1;
  console.log('Dentro do expediente de atendimento.');
}

const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

let menuEnviado = false;

client.on('message', async (userMessage) => {
  console.log('MENSAGEM RECEBIDA -', userMessage.body);
  const origin = userMessage.from;
  phoneNumber = userMessage.from.replace(/[^0-9]/g, '');
  console.log('phoneNumber capturado:', phoneNumber);

  const queryConsultaDadosCredor = `SELECT
    d.iddevedor,
    d.cpfcnpj,
    d.nome,
    t.telefone,
    t.idtelefones
  from
    telefones2 t,
    devedor d
  where
    right(t.telefone,
    8)= '80307836'
    and d.cpfcnpj = t.cpfcnpj
    and d.idusuario not in (11, 14);
  `;

  const resultsConsultaDadosCredor = await executeQuery(queryConsultaDadosCredor, customDbConfig);

  if (resultsConsultaDadosCredor && resultsConsultaDadosCredor.length > 0) {
    const firstResultDadosCredor = resultsConsultaDadosCredor[0];
    userName = firstResultDadosCredor.nome;
    document = firstResultDadosCredor.cpfcnpj;
  } else {
    console.error('resultsConsultaDadosCredor retornou VAZIO, dados nao encontrados -', resultsConsultaDadosCredor)
    return;
  }

  const queryResponderPendentes = `SELECT
    DISTINCT 
    c.*,
    t.*,
    (
    select
      m.fromMe
    from
      Messages m
    where
      m.ticketId = t.id
    order by
      m.createdAt desc
    limit 0,
    1) as fromme,
    (
    select
      m.body
    from
      Messages m
    where
      m.ticketId = t.id
    order by
      m.createdAt desc
    limit 0,
    1) as body
  FROM
    Tickets t
  left join Contacts c on
    c.id = t.contactId
  where
    status = 'pending'
    and length(c.number) <= 15
    and c.number = '${phoneNumber}'
  having
    fromMe = 0;
  `;

  const resultsResponderPendentes = await executeQuery(queryResponderPendentes);

  if (!resultsResponderPendentes || resultsResponderPendentes.length === 0) {
    console.error('resultsResponderPendentes VAZIO, JA EXISTE ATENDIMENTO HUMANO -');
    // return;
  }

  if (!Object.hasOwn(userState, phoneNumber)) {
    console.log('Não tem o telefone.. adicionando..')
    const primeiraMensagem = `Olá *${userName}*,\n\nPor favor, escolha uma opção:\n\n1 - Credores\n2 - Parcelamento\n3 - Ver Acordos\n4 - Ver Boletos\n5 - Linha Digitável\n6 - Pix Copia e Cola\n7 - Voltar`;
    await client.sendMessage(origin, primeiraMensagem);
    
    userState[phoneNumber] = defaultValuesMenuState;
    Object.assign(userState[phoneNumber], { menuEnviado: true });
    console.log('Aguardando resposta da primeira mensagem');

    return;
  }

  if (userState[phoneNumber].menuEnviado && !userState[phoneNumber].credorEnviado && !userState[phoneNumber].ofertaEnviado) {
    console.log('Processando resposta do menu enviado..');

    switch (userMessage.body.trim()) {
      case '1':
        try {
          const credorInfo = await getCredorInfo(document);

          if (credorInfo && credorInfo.length > 0) {
            const credorMessage = formatCredorInfo(credorInfo);
            const segundaMensagem = credorMessage + '\n\n_Selecione o credor (por exemplo, responda com "1" ou "2")_'
            await client.sendMessage(origin, segundaMensagem);

            Object.assign(userState[phoneNumber], { credorEnviado: true });
            
            console.log('Aguardando resposta da segunda mensagem');
            return;
          }
        } catch (error) {
          console.error('Case 1 retornou um erro - ', error.message);
        }

        break;

      default:
        await client.sendMessage(userMessage.from, 'Não foi possível obter informações do credor no momento.');
    }
  }

  if (userState[phoneNumber].menuEnviado && userState[phoneNumber].credorEnviado && !userState[phoneNumber].ofertaEnviado) {
    console.log('Processando resposta do credor enviado..');

    if (userMessage && userMessage.body.trim().match(/^\d+$/)) {
      const selectedOption = parseInt(userMessage.body.trim());
      const credorInfo = await getCredorInfo(document);

      if (selectedOption >= 1 && selectedOption <= credorInfo.length) {
        const selectedCreditor = credorInfo[selectedOption - 1];

        console.log(`Conteúdo da opção ${selectedOption} armazenado:`, selectedCreditor);

        data.credorInfo = credorInfo;
        data.selectedCreditor = selectedCreditor;

        idDevedor = selectedCreditor.iddevedor;
        dataBase = getCurrentDate();

        const credorDividas = await getCredorDividas(idDevedor, dataBase);
        const credorOfertas = await getCredorOfertas(idDevedor);

        data.credorDividas = credorDividas;

        const formattedResponseDividas = formatCredorDividas(credorDividas);
        const formattedResponseOfertas = formatCredorOfertas(credorOfertas);

        const terceiraMensagem = `As seguintes dividas foram encontradas para a empresa selecionada:\n\n${formattedResponseDividas}\n\n*Escolha uma das opções abaixo para prosseguirmos no seu acordo:*\n\n${formattedResponseOfertas}`;

        await client.sendMessage(origin, terceiraMensagem);
        Object.assign(userState[phoneNumber], { ofertaEnviado: true })
      } else {
        await client.sendMessage(origin, 'Opção inválida. Por favor, escolha uma opção válida.');
      }
    } else {
      await client.sendMessage(origin, 'Resposta inválida. Por favor, escolha uma opção válida.');
    }
  }

  if (userState[phoneNumber].menuEnviado && userState[phoneNumber].credorEnviado && userState[phoneNumber].ofertaEnviado) {
    console.log('Processando resposta do oferta enviado..');

    if (userMessage && userMessage.body.trim().match(/^\d+$/)) {
      const selectedOptionParcelamento = parseInt(userMessage.body.trim());
      const credorOfertas = await getCredorOfertas(idDevedor);
      // console.log('credorOfertas -', credorOfertas);

      if (selectedOptionParcelamento >= 1 && selectedOptionParcelamento <= credorOfertas.length) {
        const ofertaSelecionada = credorOfertas[selectedOptionParcelamento - 1];
        // console.log('ofertaSelecionada -', ofertaSelecionada);

        data.ofertaSelecionada = ofertaSelecionada;

        await client.sendMessage(origin, 'MENSAGEM TESTE');
        Object.assign(userState[phoneNumber], { acordoEnviado: true })

        console.log('data -', data);
      } else {
        await client.sendMessage(origin, 'Opção inválida. Por favor, escolha uma opção válida.');
      }
    } else {
      await client.sendMessage(origin, 'Resposta inválida. Por favor, escolha uma opção válida.');
    }
  }

});

async function handleUserResponse(userMessage) {
  // Obtém o estado atual do usuário
  const userState = userStates[userMessage.from];

  if (!userState) {
    // Trate como uma nova interação se o estado do usuário não existir
    // (pode ser necessário implementar a lógica apropriada aqui)
    return;
  }

  switch (userState.state) {
    case 'selecionarCredor':
      // Restante do código para lidar com a seleção do credor...

      // Remova o estado após concluir a interação
      delete userStates[userMessage.from];

      break;
    // Adicione outros casos conforme necessário para outros estados
  }
}

async function getUserResponse(client, userFrom) {
  return new Promise((resolve) => {
    const messageHandler = (response) => {
      if (response.from === userFrom) {
        resolve(response);
        client.off('message', messageHandler); // Remova o manipulador após obter a resposta
      }
    };

    // Adicione o manipulador de eventos para 'message'
    client.on('message', messageHandler);
  });
}

async function pesquisarMensagem(userId, message) {
  const queryPesquisaMensagem = `select * from Messages m where ticketId = ${userId} and body='${message}`

  const resultsPesquisaMensagem = await executeQuery(queryPesquisaMensagem);
  console.log("resultsPesquisaMensagem -", resultsPesquisaMensagem)

  return resultsPesquisaMensagem;
};

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

client.initialize();