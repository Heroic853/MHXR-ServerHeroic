/*
 * Ricostruisce un archivio rsdnt_*.arc (ARCC) sostituendo, dentro alle
 * tabelle XFS che contiene, ogni stringa giapponese che compare come chiave
 * in un dizionario JP->EN con la sua traduzione. Tutto il resto (voci non
 * XFS, stringhe senza traduzione, struttura/offset) resta byte per byte
 * identico.
 *
 * Riusa due pezzi gia' verificati altrove, senza toccarli:
 *   - xfs-parse.cjs (parseXfs) per LEGGERE una tabella e sapere se e' XFS
 *   - la stessa identica logica di riscrittura byte-per-byte di
 *     xfs-clone.cjs (qui adattata per lavorare su un Buffer in memoria
 *     invece che rileggere da file, visto che le voci arrivano gia'
 *     decompresse dall'archivio ARCC)
 *   - lettura/scrittura ARCC (Blowfish ECB invertito a 4 byte + zlib),
 *     stessa identica logica di ricompatta-arc.cjs
 *
 *   node traduci-rsdnt-arc.cjs <ingresso.arc> <dizionario.json> <uscita.arc>
 *
 * <dizionario.json> e' un oggetto flat { "stringa giapponese": "traduzione" }.
 */
const fs = require('fs');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseXfs } = require('./xfs-parse.cjs');

const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';
const DIM_HEADER = 8;
const DIM_VOCE = 80;
const XFS_HEADER = 24;

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3]; out[i + 1] = buf[i + 2]; out[i + 2] = buf[i + 1]; out[i + 3] = buf[i];
  }
  const resto = buf.length % 4;
  if (resto > 0) buf.copy(out, buf.length - resto, buf.length - resto);
  return out;
}
function decifra(buf) {
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const girato = inverti(buf);
  let chiaro = Buffer.from(bf.decode(girato, Blowfish.TYPE.UINT8_ARRAY));
  if (chiaro.length < girato.length) chiaro = Buffer.concat([chiaro, Buffer.alloc(girato.length - chiaro.length)]);
  return inverti(chiaro);
}
function cifra(buf) {
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const girato = inverti(buf);
  const cifrato = Buffer.from(bf.encode(girato));
  return inverti(cifrato);
}
const senzaNulli = (buf) => { const i = buf.indexOf(0); return buf.toString('utf-8', 0, i === -1 ? buf.length : i); };

function leggiArc(percorso) {
  const buf = fs.readFileSync(percorso);
  const magic = buf.toString('ascii', 0, 4);
  const versione = buf.readUInt16LE(4);
  const numFile = buf.readUInt16LE(6);
  const corpo = magic === 'ARCC' ? decifra(buf.subarray(DIM_HEADER)) : buf.subarray(DIM_HEADER);
  const voci = [];
  for (let i = 0; i < numFile; i++) {
    const off = i * DIM_VOCE;
    const nomeInterno = senzaNulli(corpo.subarray(off, off + 64));
    const tipo = corpo.readUInt32LE(off + 64);
    const compSize = corpo.readUInt32LE(off + 68);
    const dimReale = corpo.readUInt32LE(off + 72);
    const inizio = corpo.readUInt32LE(off + 76) - DIM_HEADER;
    let dati = null;
    try { dati = zlib.inflateSync(corpo.subarray(inizio, inizio + compSize)); } catch { /* non zlib */ }
    voci.push({ nomeInterno, tipo, dimReale, dati });
  }
  return { magic, versione, voci };
}

function scriviArc(voci, magic, versione) {
  const tabella = Buffer.alloc(voci.length * DIM_VOCE);
  const corpi = [];
  let cursore = DIM_HEADER + tabella.length;
  voci.forEach((v, i) => {
    const compresso = zlib.deflateSync(v.dati);
    const off = i * DIM_VOCE;
    tabella.write(v.nomeInterno, off, 64, 'utf-8');
    tabella.writeUInt32LE(v.tipo, off + 64);
    tabella.writeUInt32LE(compresso.length, off + 68);
    tabella.writeUInt32LE(v.dati.length, off + 72);
    tabella.writeUInt32LE(cursore, off + 76);
    corpi.push(compresso);
    cursore += compresso.length;
  });
  const testa = Buffer.alloc(DIM_HEADER);
  testa.write(magic, 0, 4, 'ascii');
  testa.writeUInt16LE(versione, 4);
  testa.writeUInt16LE(voci.length, 6);
  let corpo = Buffer.concat([tabella, ...corpi]);
  if (magic === 'ARCC') {
    const avanzo = corpo.length % 8;
    if (avanzo) corpo = Buffer.concat([corpo, Buffer.alloc(8 - avanzo)]);
    corpo = cifra(corpo);
  }
  return Buffer.concat([testa, corpo]);
}

/** Stessa identica logica di xfs-clone.cjs::clona, ma su un Buffer gia' in memoria. */
function clonaBuf(buf, sostituisciStringa) {
  const doc = parseXfs(buf);
  const defSize = buf.readInt32LE(20);
  const testa = buf.subarray(0, XFS_HEADER + defSize);
  const pezzi = [testa];
  const ctxIn = { buf, classi: doc.classi, pos: XFS_HEADER + defSize };

  function scriviClassRef() {
    if (ctxIn.pos + 4 > buf.length) return;
    const type = buf.readInt16LE(ctxIn.pos);
    const testaRef = buf.subarray(ctxIn.pos, ctxIn.pos + 4);
    ctxIn.pos += 4;
    pezzi.push(testaRef);
    if (type === 0x7fff || (type & 1) === 0) return;
    const size = buf.subarray(ctxIn.pos, ctxIn.pos + 8);
    ctxIn.pos += 8;
    pezzi.push(size);
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
  while (ctxIn.pos < buf.length) {
    const prima = ctxIn.pos;
    scriviClassRef();
    if (ctxIn.pos === prima) break;
  }
  if (ctxIn.pos < buf.length) pezzi.push(buf.subarray(ctxIn.pos));
  return Buffer.concat(pezzi);
}

// --- programma principale ---------------------------------------------------
const [, , INGRESSO, DIZIONARIO, USCITA] = process.argv;
if (!INGRESSO || !DIZIONARIO || !USCITA) {
  console.error('Uso: node traduci-rsdnt-arc.cjs <ingresso.arc> <dizionario.json> <uscita.arc>');
  process.exit(1);
}

const dizionario = JSON.parse(fs.readFileSync(DIZIONARIO, 'utf8'));
const nDizionario = Object.keys(dizionario).length;
console.log(`dizionario: ${nDizionario} traduzioni`);

const { magic, versione, voci } = leggiArc(INGRESSO);
console.log(`${INGRESSO}: ${voci.length} voci`);

let tabelleXfs = 0, tabelleAltro = 0, sostituzioni = 0;
const usate = new Set();
const nuoveVoci = voci.map((v) => {
  if (!v.dati) return v; // voce non-zlib, non toccata
  let rifatto;
  try {
    rifatto = clonaBuf(v.dati, (s) => {
      if (Object.prototype.hasOwnProperty.call(dizionario, s)) { sostituzioni++; usate.add(s); return dizionario[s]; }
      return s;
    });
  } catch {
    tabelleAltro++;
    return v; // non e' un XFS (o non nel formato atteso): si lascia intatta
  }
  tabelleXfs++;
  return { ...v, dati: rifatto };
});

console.log(`tabelle XFS riconosciute: ${tabelleXfs} | altre voci (intatte): ${tabelleAltro}`);
console.log(`sostituzioni applicate: ${sostituzioni} | chiavi del dizionario usate: ${usate.size}/${nDizionario}`);

const risultato = scriviArc(nuoveVoci, magic, versione);
fs.writeFileSync(USCITA, risultato);
console.log(`scritto: ${USCITA} (${risultato.length} byte)`);

// --- verifica: riapre l'uscita e controlla che ogni tabella XFS toccata si rilegga ---
const rilettura = leggiArc(USCITA);
let okRilettura = 0, persi = 0;
for (let i = 0; i < rilettura.voci.length; i++) {
  const v = rilettura.voci[i];
  if (!v.dati) continue;
  try { parseXfs(v.dati); okRilettura++; } catch { persi++; console.log('  ATTENZIONE: non si rilegge piu\':', v.nomeInterno); }
}
console.log(`verifica: ${okRilettura} tabelle si rileggono correttamente, ${persi} rotte`);
