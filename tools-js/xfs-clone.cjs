/*
 * Riscrive un file XFS. Serve a rispondere alla domanda che conta: se una
 * stringa (un nome in giapponese) cambia lunghezza, il resto del file rimane
 * leggibile?
 *
 * Non e' indovinato: rispecchia RIGA PER RIGA la stessa traversata di
 * xfs-parse.cjs (leggiOggetto/leggiValore), lo stesso codice gia' verificato
 * su 19.956 voci vere in costruisci-equip.cjs. Dove quello legge, questo
 * copia i byte cosi' come sono; solo sulle stringhe (type 14/0x20) c'e' un
 * punto di sostituzione.
 *
 * La parte di intestazione — tabella delle classi, nomi dei CAMPI (non dei
 * valori) — non si tocca mai: quella descrive la struttura, non il
 * contenuto, e non ha ragione di cambiare.
 *
 *   node xfs-clone.cjs <file.xfs> --prova
 *       ricostruisce senza cambiare nulla, confronta byte per byte
 *
 *   node xfs-clone.cjs <file.xfs> --prova-lunghezza
 *       sostituisce ogni stringa con una fittizia PIU' LUNGA, poi rilegge il
 *       risultato con lo stesso parser: se ogni campo torna leggibile e nella
 *       posizione giusta, il formato regge una traduzione piu' lunga del
 *       giapponese originale.
 */
const fs = require('fs');
const { parseXfs } = require('./xfs-parse.cjs');

const FILE = process.argv[2];
const PROVA_LUNGHEZZA = process.argv.includes('--prova-lunghezza');

if (!FILE) {
  console.error('Uso: node xfs-clone.cjs <file.xfs> [--prova | --prova-lunghezza]');
  process.exit(1);
}

const HEADER = 24;

function clona(percorso, sostituisciStringa) {
  const buf = fs.readFileSync(percorso);
  const doc = parseXfs(buf); // stesso parser gia' verificato: costruisce anche ctx.classi

  // La tabella delle classi non serve rileggerla da zero: e' identica a
  // quella che xfs-parse.cjs ha gia' ricavato, quindi si copia il blocco
  // di intestazione cosi' com'e' — schema, non dati.
  const defSize = buf.readInt32LE(20);
  const testa = buf.subarray(0, HEADER + defSize);

  const pezzi = [testa];
  let bytesLetti = 0;

  const ctxIn = { buf, classi: doc.classi, pos: HEADER + defSize };

  function scriviClassRef() {
    if (ctxIn.pos + 4 > buf.length) return;
    const type = buf.readInt16LE(ctxIn.pos);
    const variant = buf.readInt16LE(ctxIn.pos + 2);
    const testaRef = buf.subarray(ctxIn.pos, ctxIn.pos + 4);
    ctxIn.pos += 4;
    pezzi.push(testaRef);
    if (type === 0x7fff || (type & 1) === 0) return; // riferimento nullo
    const size = buf.subarray(ctxIn.pos, ctxIn.pos + 8);
    ctxIn.pos += 8;
    pezzi.push(size); // ricalcolato alla fine se serve, per ora copiato
    scriviOggetto(type >> 1);
  }

  function scriviOggetto(classIndex) {
    const cls = ctxIn.classi[classIndex];
    if (!cls) throw new Error(`classe ${classIndex} inesistente`);
    for (const prop of cls.props) {
      const count = buf.readInt32LE(ctxIn.pos);
      pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 4));
      ctxIn.pos += 4;
      for (let j = 0; j < count; j++) scriviValore(prop.type);
    }
  }

  function scriviValore(type) {
    switch (type) {
      case 1: case 2: return scriviClassRef();
      case 3: case 4: case 8: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 1)); ctxIn.pos += 1; return;
      case 5: case 9: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 2)); ctxIn.pos += 2; return;
      case 6: case 10: case 12: case 0x0f: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 4)); ctxIn.pos += 4; return;
      case 7: case 11: case 13: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 8)); ctxIn.pos += 8; return;
      case 0x10: case 0x11: case 0x36: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + (type === 0x36 ? 12 : 8))); ctxIn.pos += (type === 0x36 ? 12 : 8); return;
      case 0x12: case 0x14: case 0x15: case 0x16: case 0x24: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 16)); ctxIn.pos += 16; return;
      case 0x22: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 8)); ctxIn.pos += 8; return;
      case 0x23: case 0x37: pezzi.push(buf.subarray(ctxIn.pos, ctxIn.pos + 12)); ctxIn.pos += 12; return;
      case 14: case 0x20: {
        const inizio = ctxIn.pos;
        const fine = buf.indexOf(0, ctxIn.pos);
        const originale = buf.toString('utf-8', inizio, fine);
        ctxIn.pos = fine + 1;
        const nuova = sostituisciStringa ? sostituisciStringa(originale) : originale;
        pezzi.push(Buffer.concat([Buffer.from(nuova, 'utf-8'), Buffer.from([0])]));
        return;
      }
      default: throw new Error(`tipo ${type} (0x${type.toString(16)}) non gestito a offset ${ctxIn.pos}`);
    }
  }

  // Il documento e' UNO o PIU' oggetti in sequenza fino alla fine del file:
  // si continua finche' resta roba da leggere, stesso criterio implicito di
  // xfs-parse.cjs (che si ferma al primo root, ma qui bisogna consumare tutto
  // il file per non lasciarsi indietro pezzi).
  while (ctxIn.pos < buf.length) {
    const prima = ctxIn.pos;
    scriviClassRef();
    if (ctxIn.pos === prima) break; // niente altro da leggere
  }
  // coda residua (padding finale, se presente) copiata cosi' com'e'
  if (ctxIn.pos < buf.length) pezzi.push(buf.subarray(ctxIn.pos));

  return Buffer.concat(pezzi);
}

if (!PROVA_LUNGHEZZA) {
  const originale = fs.readFileSync(FILE);
  const rifatto = clona(FILE, null);
  console.log(`originale: ${originale.length} byte  |  rifatto: ${rifatto.length} byte`);
  console.log(originale.equals(rifatto) ? 'OK: identico byte per byte.' : 'DIVERSO: la ricostruzione non e\' fedele.');
  process.exit(originale.equals(rifatto) ? 0 : 1);
}

// --- prova con stringhe piu' lunghe -----------------------------------------
const rifatto = clona(FILE, (s) => (s ? `${s}__TRADOTTO_PIU_LUNGO_DEL_GIAPPONESE__` : s));
console.log(`file con stringhe allungate: ${rifatto.length} byte (originale ${fs.statSync(FILE).size})`);

let doc2;
try {
  doc2 = parseXfs(rifatto);
} catch (e) {
  console.error('FALLITO: il file allungato non si rilegge piu' + '\':', e.message);
  process.exit(1);
}

function trovaRecord(nodo, prof = 0) {
  if (!nodo || typeof nodo !== 'object' || prof > 6) return null;
  if (Array.isArray(nodo.mpArray) && nodo.mpArray.length) return nodo.mpArray;
  if (Array.isArray(nodo.array) && nodo.array.length) return nodo.array;
  for (const v of Object.values(nodo)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
    const t = trovaRecord(v, prof + 1);
    if (t) return t;
  }
  return null;
}

const rec = trovaRecord(doc2.root);
console.log(`riletto correttamente: ${rec ? rec.length : 0} record`);
if (rec && rec.length) {
  console.log('primi 3 record dopo l\'allungamento:');
  rec.slice(0, 3).forEach((r) => console.log('  ', JSON.stringify(r).slice(0, 200)));
}
console.log(rec && rec.length ? 'OK: il file regge stringhe piu\' lunghe del giapponese.' : 'FALLITO: nessun record leggibile.');
