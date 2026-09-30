/*
 * Compone un dizionario JP->EN completo per una lista di nomi, partendo da:
 *   - i dizionari di nomi base (tutti i .json di una cartella, tranne parentesi-suffissi.json)
 *   - parentesi-suffissi.json: { parentesi: {parola: traduzione}, suffissi: {suffisso: traduzione} }
 * Regole, applicate a ritroso finche' il resto non e' un nome noto:
 *   nome + suffisso (改, 零, ・凶, α試, ...)   -> traduzione(nome) + traduzione(suffisso)
 *   nome + 【parola】                        -> traduzione(nome) + " [parola]"
 *   nome + α/β/γ e numeri romani Ⅰ..Ⅹ        -> traduzione(nome) + " α" + " I"...
 * Cio' che non si riesce a comporre resta fuori dal dizionario (quindi in giapponese nel gioco).
 *
 *   node componi-dizionario.cjs <cartella-dizionari> <nomi.json|txt> <uscita.json>
 */
const fs = require('fs');
const path = require('path');

const [, , cartella, fileNomi, uscita] = process.argv;
const base = {};
let par = {}, suf = {};
for (const f of fs.readdirSync(cartella).filter((x) => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(cartella, f), 'utf8'));
  if (f === 'parentesi-suffissi.json') { par = j.parentesi || {}; suf = j.suffissi || {}; } else Object.assign(base, j);
}
const suffissi = Object.keys(suf).sort((a, b) => b.length - a.length);
const ROMANI = { 'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V', 'Ⅵ': 'VI', 'Ⅶ': 'VII', 'Ⅷ': 'VIII', 'Ⅸ': 'IX', 'Ⅹ': 'X' };

const cache = new Map();
function traduci(s, prof = 0) {
  if (!s) return null;
  if (base[s] !== undefined) return base[s];
  if (cache.has(s)) return cache.get(s);
  if (prof > 8) return null;
  let r = null;
  // numeri romani finali
  const rom = s.match(/^(.*?)([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])$/);
  if (!r && rom) { const t = traduci(rom[1], prof + 1); if (t != null) r = t.replace(/\s+$/, '') + ' ' + ROMANI[rom[2]]; }
  // α β γ finali
  const gr = s.match(/^(.*?)([αβγ])$/);
  if (!r && gr) { const t = traduci(gr[1], prof + 1); if (t != null) r = t.replace(/\s+$/, '') + ' ' + gr[2]; }
  // 【parola】 finale
  const pa = s.match(/^(.*)【([^】]*)】$/);
  if (!r && pa && par[pa[2]] !== undefined) { const t = traduci(pa[1], prof + 1); if (t != null) r = t.replace(/\s+$/, '') + ' [' + par[pa[2]] + ']'; }
  // suffissi
  if (!r) for (const x of suffissi) {
    if (!s.endsWith(x) || s.length === x.length) continue;
    const t = traduci(s.slice(0, -x.length), prof + 1);
    if (t != null) { r = (suf[x].startsWith(' ') || suf[x] === '+' ? t.replace(/\s+$/, '') : t) + suf[x]; break; }
  }
  cache.set(s, r);
  return r;
}

const grezzo = fs.readFileSync(fileNomi, 'utf8');
const nomi = fileNomi.endsWith('.json') ? [...new Set(Object.values(JSON.parse(grezzo)).flat())] : grezzo.split(/\r?\n/).filter(Boolean);
const out = {}; const mancanti = [];
for (const n of nomi) { const t = traduci(n); if (t != null) out[n] = t.trim(); else mancanti.push(n); }
fs.writeFileSync(uscita, JSON.stringify(out, null, 1) + '\n');
console.log(`tradotti ${Object.keys(out).length} / ${nomi.length}, mancanti ${mancanti.length}`);
if (mancanti.length) console.log(mancanti.join('|'));
