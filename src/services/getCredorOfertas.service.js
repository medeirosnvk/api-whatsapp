export async function getCredorOfertas(iddevedor) {
  const response = await axios.get(`http://localhost:3000/credores/oferta-parcelas?iddevedor=${iddevedor}`);
  return response.data;
};