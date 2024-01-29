const qrcode = require('qrcode-terminal');
const { executeQuery } = require('./dbconfig')
const { Client, LocalAuth } = require('whatsapp-web.js');

require('dotenv').config();

const client = new Client({
  authStrategy: new LocalAuth()
});

let userId;
let userName;
let phoneNumber;
let idLote;
let dataVenc;
let idBoleto;

const agora = new Date();
const horaAtual = agora.getHours();
const minutosAtual = agora.getMinutes();
const segundosAtual = agora.getSeconds();

const hora = `${horaAtual}:${minutosAtual}:${segundosAtual}`;

let horario;

if (horaAtual >= 18 || horaAtual < 8 || (horaAtual === 8 && minutosAtual === 0 && segundosAtual === 0)) {
    horario = 0;
    console.log('Fora do expediente.');
} else {
    horario = 1;
    console.log('Dentro do expediente.');
}

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async (message) => {
  console.log(message.body);

  phoneNumber = message.from.replace(/[^0-9]/g, '');
  console.log('phoneNumber capturado:', phoneNumber);

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
  console.log("resultsResponderPendentes -", resultsResponderPendentes)

  if (!resultsResponderPendentes || resultsResponderPendentes.length === 0) {
    console.error('resultsResponderPendentes retornou Erro ou Vazio -', { resultsResponderPendentes });
    return;
  }

  const firstResult = resultsResponderPendentes[0];

  userId = firstResult.id;
  userName = firstResult.name;

  console.log('User ID:', userId);
  console.log('User Name:', userName);

  const queryConsultaBoletoTelefone = `select
    b.idboleto,
    b.idlote,
    date_format(datavenc, '%d/%m/%Y') as datavenc ,
    bp.emv,
    b.linha
  from
    acordo a,
    devedor d,
    telefones2 t,
    boleto b
  left join boleto_pix bp on
    bp.idboleto = b.idboleto,
    promessa p
  where
    a.situacao = 1
    and d.iddevedor = a.iddevedor
    and t.cpfcnpj = d.cpfcnpj
    and right(t.telefone ,
    8) = right('${phoneNumber}',
    8)
    and a.idacordo = p.idacordo
    and b.idboleto = p.idboleto
    and p.situacao = 1
    and b.DATAVENC >= curdate()
  order by
    DATAVENC
  `;

  const customDbConfig = {
    host: process.env.DB2_MY_SQL_HOST,
    user: process.env.MY_SQL_USER,
    password: process.env.DB2_MY_SQL_PASSWORD,
    port: process.env.MY_SQL_PORT,
    database: process.env.DB2_MY_SQL_DATABASE,
    connectionLimit: parseInt(process.env.MY_SQL_CONNECTION_LIMIT),
    charset: process.env.MY_SQL_CHARSET,
  };

  const resultsBoletoTelefone = await executeQuery(queryConsultaBoletoTelefone, customDbConfig);
  console.log("resultsBoletoTelefone -", resultsBoletoTelefone)

  if (resultsBoletoTelefone && resultsBoletoTelefone.length > 0) {
    const secondResult = resultsBoletoTelefone[0];
  
    // Verifica se 'idlote' está definido antes de acessar suas propriedades
    idLote = secondResult && secondResult.idlote !== undefined ? secondResult.idlote : null;
    dataVenc = secondResult && secondResult.datavenc !== undefined ? secondResult.datavenc : null;
    idBoleto = secondResult && secondResult.idboleto !== undefined ? secondResult.idboleto : null;
  
    if (idLote === 0 || idLote === null) {
      await client.sendMessage(message.from, `Estou vendo aqui que você possui um acordo conosco.`);
      await client.sendMessage(message.from, `Para imprimir a segunda via do seu boleto que vence em *${dataVenc}* clique neste link: http://www.cobrance.com.br/acordo/boleto.php?idboleto=${idBoleto}&email=2`);
    } else {
      await client.sendMessage(message.from, `Estou vendo aqui que você possui uma oferta especial para hoje.`);
      await client.sendMessage(message.from, `Clique no link e acesse sua oferta: http://www.cobrance.com.br/acordo/boleto.php?idboleto=$idboleto_acordo&email=2`);
    }
  } else {
    console.error('resultsBoletoTelefone retornou Erro ou Vazio -', { resultsBoletoTelefone });
  
    const menu = `Para que você tenha uma ótima experiência, por favor, siga as instruções:\n\n1) Para receber o pix copia e cola *digite 1*;\n2) Para receber a linha digitável *digite 2*;`;
  
    await client.sendMessage(message.from, menu);
  }  
});

// se retornou registro, significa q a mensagem já foi enviada
async function pesquisarMensagem(userId, message) {
  const queryPesquisaMensagem = `select * from Messages m where ticketId = ${userId} and body='${message}`

  const resultsPesquisaMensagem = await executeQuery(queryPesquisaMensagem);
  console.log("resultsPesquisaMensagem -", resultsPesquisaMensagem)

  return resultsPesquisaMensagem;
};

client.initialize();