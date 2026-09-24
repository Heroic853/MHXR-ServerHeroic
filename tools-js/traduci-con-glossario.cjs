/*
 * Riempie il campo "en" di un file di traduzioni usando il glossario.
 *
 * Il glossario (glossario.json) nasce dalle tabelle gia' verificate di
 * fix-monsters.cjs: nomi dei mostri, suffissi delle varianti, temi delle
 * collaborazioni, gradi di difficolta'. Per i mostri non si inventa niente —
 * si usa il nome inglese ufficiale, quello con cui Capcom ha pubblicato
 * Monster Hunter fuori dal Giappone.
 *
 * Sostituzione a corrispondenza piu' lunga: '超極級' vince su '極級',
 * 'ゴア・マガラ' vince su 'マガラ'. Senza questa regola si otterrebbero
 * traduzioni spezzate a meta'.
 *
 * Quello che il glossario non copre resta vuoto, cioe' in giapponese nel
 * gioco: meglio una riga non tradotta che una tradotta a caso.
 *
 *   node traduci-con-glossario.cjs <traduzioni.json> [--glossario=...] [--forza]
 *
 * --forza sovrascrive anche le voci gia' tradotte a mano. Senza, le rispetta.
 */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2];
const arg = (n, pred) => {
  const v = process.argv.find((a) => a.startsWith(`--${n}=`));
  return v === undefined ? pred : v.split('=').slice(1).join('=');
};
const GLOSSARIO = arg('glossario', path.join(__dirname, 'glossario.json'));
const FORZA = process.argv.includes('--forza');

if (!FILE) {
  console.error('Uso: node traduci-con-glossario.cjs <traduzioni.json> [--glossario=f.json] [--forza]');
  process.exit(1);
}

const voci = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const glossario = JSON.parse(fs.readFileSync(GLOSSARIO, 'utf8'));

// Chiavi ordinate dalla piu' lunga alla piu' corta: e' cio' che rende corretta
// la sostituzione, non un dettaglio di efficienza.
const chiavi = Object.keys(glossario).sort((a, b) => b.length - a.length);

const HA_JP = /[぀-ゟ゠-ヿ一-鿿]/;
const titolo = (s) => s.replace(/(^|\s)([a-z])/g, (_, p, c) => p + c.toUpperCase());

function traduci(jp) {
  let out = jp;
  for (const k of chiavi) {
    if (out.includes(k)) out = out.split(k).join(glossario[k]);
  }
  return out.replace(/\s+/g, ' ').trim();
}

let complete = 0, parziali = 0, intatte = 0, saltate = 0;
for (const v of voci) {
  if (v.en && !FORZA) { saltate++; continue; }
  if (!v.jp || !HA_JP.test(v.jp)) {
    // Gia' senza giapponese (numeri, sigle): si lascia com'e'.
    intatte++;
    continue;
  }
  const t = traduci(v.jp);
  if (!HA_JP.test(t)) { v.en = titolo(t); complete++; }
  else parziali++; // resta del giapponese: meglio non consegnarla a meta'
}

fs.writeFileSync(FILE, JSON.stringify(voci, null, 1));

const totale = voci.length;
console.log(`${path.basename(FILE)}  (${totale} stringhe)`);
console.log(`  tradotte del tutto : ${complete}`);
console.log(`  ancora parziali    : ${parziali}   (restano in giapponese)`);
console.log(`  senza giapponese   : ${intatte}`);
if (saltate) console.log(`  gia' fatte a mano  : ${saltate}`);
console.log(`  copertura          : ${Math.round((complete / Math.max(1, totale - intatte)) * 100)}%`);
