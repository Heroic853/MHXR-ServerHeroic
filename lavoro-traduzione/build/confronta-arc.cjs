// Confronta due .arc (originale e tradotto) tabella per tabella: ogni campo deve essere identico,
// tranne le stringhe che sono chiavi del dizionario, che devono valere esattamente la traduzione.
// node confronta-arc.cjs <lib.cjs> <originale.arc> <tradotto.arc> <dizionario.json>
const fs = require('fs');
const { parseArc } = require(process.argv[2]);
const { parseXfs } = require('../../tools-js/xfs-parse.cjs');
const diz = JSON.parse(fs.readFileSync(process.argv[5], 'utf8'));
const JP = /[぀-ヿ一-鿿]/;
(async () => {
  const a = await parseArc(fs.readFileSync(process.argv[3]));
  const b = await parseArc(fs.readFileSync(process.argv[4]));
  let campi = 0, tradotti = 0, errori = [], jpRimaste = 0;
  const confronta = (x, y, via) => {
    if (typeof x === 'string') {
      campi++;
      if (x === y) { if (JP.test(y)) jpRimaste++; return; }
      if (diz[x] !== undefined && diz[x] === y) { tradotti++; return; }
      errori.push(`${via}: "${x}" -> "${y}"`); return;
    }
    if (x === null || typeof x !== 'object') { campi++; if (x !== y && !(Number.isNaN(x) && Number.isNaN(y))) errori.push(`${via}: ${x} -> ${y}`); return; }
    const kx = Object.keys(x), ky = Object.keys(y || {});
    if (kx.join() !== ky.join()) { errori.push(`${via}: chiavi diverse`); return; }
    for (const k of kx) confronta(x[k], y[k], via + '.' + k);
  };
  if (a.length !== b.length) errori.push(`numero voci ${a.length} -> ${b.length}`);
  a.forEach((v, i) => {
    const w = b[i];
    if (!w || v.name !== w.name) { errori.push('voce diversa ' + v.name); return; }
    confronta(parseXfs(v.data).root, parseXfs(w.data).root, v.name.split(/[\\/]/).pop());
  });
  console.log(`campi confrontati ${campi}, nomi tradotti ${tradotti}, testi giapponesi rimasti ${jpRimaste}, errori ${errori.length}`);
  if (errori.length) console.log(errori.slice(0, 20).join('\n'));
})();
