import { useState, useEffect } from "react";
import axios from "axios";
import styled, { css } from "styled-components";

const Container = styled.div`
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  padding-left: 30px;
  width: 100%;
  background-color: #242424;
`;

const Table = styled.table`
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 12px;
    text-align: left;
  }

  th {
    background-color: #000000;
  }

  tr:nth-child(even) {
    background-color: #000000;
  }
`;

const Button = styled.button`
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  padding: 8px 16px;
  border: none;
  cursor: pointer;

  ${(props) =>
    props.status === 1 &&
    css`
      background-color: #28a745;
      color: #ffffff;
    `}
  ${(props) =>
    props.status === 2 &&
    css`
      background-color: #dc3545;
      color: #ffffff;
    `}
`;

function TicketTable() {
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const response = await axios.get(
          `http://191.252.214.9:3030/ticket-status`
        );
        const ticketStatus = response.data;
        console.log("Buscando novos tickets...");

        // Verificar se a resposta é diferente da última
        if (!areArraysEqual(tickets, ticketStatus)) {
          setTickets(ticketStatus);
        }
      } catch (error) {
        console.error("Erro ao buscar tickets:", error);
      }
    };

    const intervalId = setInterval(fetchTickets, 5000); // Atualizar a cada 5 segundos
    return () => clearInterval(intervalId); // Limpar o intervalo quando o componente for desmontado
  }, [tickets]); // Adicionando tickets como dependência para reexecutar o efeito quando tickets mudar

  // Função para verificar se duas arrays são iguais
  const areArraysEqual = (array1, array2) => {
    if (array1.length !== array2.length) return false;
    for (let i = 0; i < array1.length; i++) {
      if (array1[i] !== array2[i]) return false;
    }
    return true;
  };

  async function buttonClick(ticketId, status) {
    console.log(`Botao ${status} clicado! TicketId - ${ticketId}`);

    try {
      let url = "";

      if (status === 1) {
        url = `http://191.252.214.9:3030/atendimento-humano-abrir?id=${ticketId}`;
      } else if (status === 2) {
        url = `http://191.252.214.9:3030/atendimento-humano-fechar?id=${ticketId}`;
      }

      const response = await axios.get(url);
    } catch (error) {
      console.error("Erro ao realizar ação:", error);
    }
  }

  const renderTicketTable = (status) => {
    const filteredTickets = tickets.filter(
      (ticket) => ticket.bot_idstatus === status
    );

    if (filteredTickets.length === 0) {
      return null;
    }

    return (
      <Container key={`status-${status}`}>
        <h2>{status === 1 ? "PENDENTE" : "EM ATENDIMENTO"}</h2>
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Telefone</th>
              {/* <th>Responsável</th> */}
              <th>Inclusão</th>
              {/* <th>Encerrado</th> */}
              <th>Status</th>
              <th>Eventos</th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>{ticket.id}</td>
                <td>{ticket.telefone}</td>
                {/* <td>{ticket.idresponsavel}</td> */}
                <td>{ticket.inclusao}</td>
                {/* <td>{ticket.encerrado || "-"}</td> */}
                <td>{ticket.descricao}</td>
                <td>
                  <Button
                    status={status}
                    onClick={() => buttonClick(ticket.id, ticket.bot_idstatus)}
                  >
                    {ticket.bot_idstatus === 1 ? "Atender" : "Encerrar"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Container>
    );
  };

  // Verifica se há tickets e se todos têm o mesmo status
  return (
    <Container>
      {renderTicketTable(1)}
      {renderTicketTable(2)}
    </Container>
  );
}

export default TicketTable;
