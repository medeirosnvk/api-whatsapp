export async function getAcordosFirmados(document) {
  const response = await axios.get(`http://localhost:3000/lista-acordos-firmados?documento=${document}`);
  return response.data;
};