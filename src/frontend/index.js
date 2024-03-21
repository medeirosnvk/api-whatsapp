const React = require("react");
const { executeQuery } = require("./dbconfig");

function TicketTable() {
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const dbQuery = `
          SELECT
            bt.id,
            bot_idstatus,
            bot_contato_id,
            bt.idresponsavel,
            bt.inclusao,
            encerrado,
            bs.descricao
          FROM
            bot_ticket bt,
            bot_contato bc,
            bot_status bs
          WHERE
            bc.telefone = '85071891'
            AND bc.id = bt.bot_contato_id
            AND bt.bot_idstatus = 1
            AND bt.bot_idstatus = bs.id
        `;

        const dbResponse = await executeQuery(dbQuery);
        console.log("dbResponse -", dbResponse);

        setTickets(dbResponse);
      } catch (error) {
        console.error("Erro ao buscar tickets:", error);
      }
    };

    fetchTickets();
  }, []);

  const renderTicketsByStatus = (status) => {
    const filteredTickets = tickets.filter(
      (ticket) => ticket.bot_idstatus === status
    );
    return (
      <div key={status}>
        <h2>Status: {status}</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Contato ID</th>
              <th>Responsável</th>
              <th>Inclusão</th>
              <th>Encerrado</th>
              <th>Descrição do Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>{ticket.id}</td>
                <td>{ticket.bot_contato_id}</td>
                <td>{ticket.idresponsavel}</td>
                <td>{ticket.inclusao}</td>
                <td>{ticket.encerrado}</td>
                <td>{ticket.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      {renderTicketsByStatus(1)}{" "}
      {/* Mudar o número conforme os diferentes status */}
      {/* Adicione mais chamadas para renderTicketsByStatus para outros status, se necessário */}
    </div>
  );
}

export default TicketTable;
