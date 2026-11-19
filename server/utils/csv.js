function csvCell(value) {
  let text = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvDocument(rows) {
  return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
}

module.exports = { csvCell, csvDocument };
