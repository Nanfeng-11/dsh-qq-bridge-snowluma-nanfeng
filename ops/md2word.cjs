// Markdown → Word（.doc，HTML 格式，WPS/Word 手机端可直接打开）
const fs = require('fs');
const path = require('path');

const SRC = 'bridge/roles/你的角色.md';
const OUT = './out/你的角色-人格卡.doc';

const md = fs.readFileSync(SRC, 'utf8');
const lines = md.split('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => {
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/〔按需〕/g, '<span style="color:#888">〔按需〕</span>');
  return t;
};

const out = [];
let inList = false, inQuote = false, inTable = false, tableRows = [];
const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
const closeQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };
const flushTable = () => {
  if (!inTable) return;
  inTable = false;
  const rows = tableRows.filter((r) => !/^\|[\s\-:|]+\|$/.test(r));
  if (!rows.length) { tableRows = []; return; }
  const cells = rows.map((r) => r.split('|').slice(1, -1).map((c) => c.trim()));
  const head = cells[0];
  const body = cells.slice(1);
  out.push('<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">');
  out.push('<tr>' + head.map((c) => `<th style="background:#f2f2f2;text-align:left">${inline(c)}</th>`).join('') + '</tr>');
  for (const row of body) {
    out.push('<tr>' + row.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
  }
  out.push('</table>');
  tableRows = [];
};

for (const raw of lines) {
  const line = raw.replace(/\r$/, '');
  const isTableRow = /^\|.*\|$/.test(line.trim());
  if (isTableRow) { closeList(); closeQuote(); inTable = true; tableRows.push(line.trim()); continue; }
  flushTable();

  if (!line.trim()) { closeList(); closeQuote(); continue; }

  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    closeList(); closeQuote();
    const lvl = h[1].length;
    out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
    continue;
  }
  if (/^---+\s*$/.test(line)) { closeList(); closeQuote(); out.push('<hr/>'); continue; }

  const q = line.match(/^>\s?(.*)$/);
  if (q) {
    closeList();
    if (!inQuote) { out.push('<blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 10px;color:#555">'); inQuote = true; }
    out.push(`<p style="margin:4px 0">${inline(q[1])}</p>`);
    continue;
  }
  closeQuote();

  const li = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (li) {
    if (!inList) { out.push('<ul>'); inList = true; }
    out.push(`<li>${inline(li[2])}</li>`);
    continue;
  }
  closeList();

  const num = line.match(/^(\d+)\.\s+(.*)$/);
  if (num) {
    out.push(`<p style="margin:4px 0"><strong>${num[1]}.</strong> ${inline(num[2])}</p>`);
    continue;
  }
  out.push(`<p style="margin:6px 0;line-height:1.6">${inline(line)}</p>`);
}
closeList(); closeQuote(); flushTable();

const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>你的角色 · 人格卡</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 11pt; line-height: 1.7; color: #222; margin: 2cm; }
  h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 6px; }
  h2 { font-size: 15pt; margin-top: 22px; border-left: 4px solid #2f6fed; padding-left: 8px; }
  h3 { font-size: 12.5pt; margin-top: 16px; color: #333; }
  blockquote { background: #f7f9fc; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-family: Consolas, monospace; font-size: 9.5pt; }
  li { margin: 3px 0; }
  table { margin: 10px 0; font-size: 10pt; }
  th { font-weight: bold; }
  hr { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
</style>
</head>
<body>
${out.join('\n')}
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('已生成:', OUT);
console.log('大小:', (fs.statSync(OUT).size / 1024).toFixed(1) + 'KB');
console.log('原文:', md.length, '字 → HTML:', out.length, '块');
