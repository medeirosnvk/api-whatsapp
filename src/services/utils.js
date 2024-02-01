function formatValue(number) {
  if (number !== undefined && number !== null) {
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } else {
    return "N/A";
  }
}

function formatarMoeda(valorString) {
  let valorNumerico = parseFloat(valorString);
  if (isNaN(valorNumerico)) {
    return "Formato inválido";
  }
  return valorNumerico.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatCredorOfertas(ofertas) {
  return ofertas
    .map(
      (detalhe, index) =>
        `${index + 1}) ` +
        `Parcelamento em ${index + 1} x ` +
        `${formatarMoeda(detalhe.valor_parcela)}`
    )
    .join("\n");
}

function formatCredorInfo(creditorInfo) {
  return creditorInfo
    .map(
      (info, index) =>
        `*--------- ${index + 1} ---------*\n` +
        `IdDevedor: ${info.iddevedor}\n` +
        `Empresa: ${info.empresa}\n` +
        `Saldo: ${formatValue(info.saldo)}`
    )
    .join("\n\n");
}

function formatCredorDividas(creditorDividas) {
  return creditorDividas
    .map(
      (info, index) =>
        `*--------- ${index + 1} ---------*\n` +
        `Contrato: ${info.contrato}\n` +
        `Vencimento: ${formatDateIsoToBr(info.vencimento)}\n` +
        `Dias Atraso: ${info.diasatraso}\n` +
        `Valor: ${formatValue(info.valor)}`
    )
    .join("\n\n");
}

function getCurrentDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateIsoToBr(data) {
  return new Date(data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

module.exports = {
  formatValue,
  formatarMoeda,
  formatCredorOfertas,
  formatCredorInfo,
  formatCredorDividas,
  getCurrentDate,
  formatDateIsoToBr,
};
