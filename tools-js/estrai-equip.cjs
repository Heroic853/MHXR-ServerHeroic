/*
 * Estrae le tabelle di armi e armature dagli archivi del gioco.
 *
 * Gli id degli equipaggiamenti (mst_equipment_id) sono hash e non esiste nessun
 * elenco pubblico: nei dati del server se ne trovano 18 in tutto, il set
 * iniziale. Senza la tabella vera non si puo' dare al giocatore la scelta libera
 * di arma e armatura, ne' costruire un gacha sensato. Qui la si tira fuori dalla
 * fonte: rsdnt_equip.arc e rsdnt_weapon.arc, dentro l'apk.
 *
 * Riusa due pezzi che esistono gia' e sono stati verificati:
 *   - la logica ARC (Blowfish ECB + inversione a gruppi di 4 byte + zlib),
 *     copiata da src/tools/fpk/formats/arc.ts
 *   - xfs-parse.cjs, il parser XFS v16 validato al 100% su blocks.csv
 *
 * PRIMA di lanciarlo, copia i due archivi dentro tools-js (1,5 MB in tutto):
 *   Monster Hunter XR\...\nativeAndroid\arc_cmn\resident\rsdnt_equip.arc
 *   Monster Hunter XR\...\nativeAndroid\arc_cmn\resident\rsdnt_weapon.arc
 *
 * Uso:
 *   node /app/tools/estrai-equip.cjs /app/tools/rsdnt_equip.arc
 *       elenca i file dentro l'archivio e cosa contengono (nessuna scrittura)
 *
 *   node /app/tools/estrai-equip.cjs /app/tools/rsdnt_equip.arc --json
 *       scrive un .json per ogni tabella trovata
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseXfs } = require('./xfs-parse.cjs');

const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';
const DIM_VOCE = 80; // 64 nome + 4 extHash + 4 compSize + 4 decompSize + 4 offset
const DIM_HEADER = 8; // 4 magic + 2 versione + 2 numero file

const file = process.argv[2];
const SCRIVI_JSON = process.argv.includes('--json');

if (!file) {
  console.error('Manca il percorso dell\'archivio. Esempio:');
  console.error('  node /app/tools/estrai-equip.cjs /app/tools/rsdnt_equip.arc');
  process.exit(1);
}

/**
 * Inverte l'ordine dei byte dentro ogni parola di 4. Serve prima e dopo
 * Blowfish: senza questo passaggio la decifratura produce spazzatura.
 */
function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) {
    out[i] = buf[i + 3];
    out[i + 1] = buf[i + 2];
    out[i + 2] = buf[i + 1];
    out[i + 3] = buf[i];
  }
  const resto = buf.length % 4;
  if (resto > 0) buf.copy(out, buf.length - resto, buf.length - resto);
  return out;
}

function decifra(buf) {
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const girato = inverti(buf);
  let chiaro = Buffer.from(bf.decode(girato, Blowfish.TYPE.UINT8_ARRAY));
  // La rimozione del padding NULL puo' tagliare gli zeri finali: Blowfish ECB
  // conserva la lunghezza, quindi si ripristina la dimensione originale.
  if (chiaro.length < girato.length) {
    chiaro = Buffer.concat([chiaro, Buffer.alloc(girato.length - chiaro.length)]);
  }
  return inverti(chiaro);
}

function senzaNulli(buf) {
  const i = buf.indexOf(0);
  return buf.toString('utf-8', 0, i === -1 ? buf.length : i);
}

function leggiArc(buf) {
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'ARC\0' && magic !== 'ARCC') {
    throw new Error(`magic ARC non valido: ${JSON.stringify(magic)}`);
  }
  const versione = buf.readUInt16LE(4);
  if (versione !== 7) throw new Error(`versione ARC non supportata: ${versione}`);
  const numFile = buf.readUInt16LE(6);

  const corpo = magic === 'ARCC'
    ? decifra(buf.subarray(DIM_HEADER))
    : buf.subarray(DIM_HEADER);

  const voci = [];
  for (let i = 0; i < numFile; i++) {
    const off = i * DIM_VOCE;
    const nome = senzaNulli(corpo.subarray(off, off + 64));
    const compSize = corpo.readUInt32LE(off + 68);
    const offset = corpo.readUInt32LE(off + 76);
    const inizio = offset - DIM_HEADER;

    if (inizio < 0 || inizio + compSize > corpo.length) {
      voci.push({ nome, errore: `dati fuori dai limiti (offset=${offset} size=${compSize})` });
      continue;
    }
    try {
      const dati = Buffer.from(zlib.inflateSync(corpo.subarray(inizio, inizio + compSize)));
      voci.push({ nome, dati });
    } catch (e) {
      voci.push({ nome, errore: `zlib: ${e.message}` });
    }
  }
  return { magic, numFile, voci };
}

/** Cerca l'array di record dentro il documento XFS, senza sapere come si chiama. */
function trovaRecord(nodo, profondita = 0) {
  if (!nodo || typeof nodo !== 'object' || profondita > 6) return null;
  if (Array.isArray(nodo.mpArray) && nodo.mpArray.length) return nodo.mpArray;
  if (Array.isArray(nodo.array) && nodo.array.length) return nodo.array;
  for (const v of Object.values(nodo)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
    const trovato = trovaRecord(v, profondita + 1);
    if (trovato) return trovato;
  }
  return null;
}

const arc = leggiArc(fs.readFileSync(file));
console.log(`archivio : ${path.basename(file)}`);
console.log(`formato  : ${arc.magic} (${arc.magic === 'ARCC' ? 'cifrato' : 'in chiaro'})`);
console.log(`contiene : ${arc.numFile} file\n`);

const dir = path.dirname(file);

for (const v of arc.voci) {
  if (v.errore) {
    console.log(`  ${v.nome}\n      NON LEGGIBILE: ${v.errore}`);
    continue;
  }

  console.log(`  ${v.nome}  (${v.dati.length} byte)`);

  let doc;
  try {
    doc = parseXfs(v.dati);
  } catch (e) {
    // Non tutto dentro un ARC e' XFS: texture, modelli, suoni. Non e' un errore.
    console.log(`      non e' XFS (${e.message.slice(0, 50)})`);
    continue;
  }

  const record = trovaRecord(doc.root);
  if (!record) {
    console.log('      XFS letto, ma nessun array di record trovato');
    continue;
  }

  const campi = Object.keys(record[0] || {});
  console.log(`      record: ${record.length}`);
  console.log(`      campi : ${campi.join(', ').slice(0, 150)}`);
  console.log(`      primo : ${JSON.stringify(record[0]).slice(0, 200)}`);

  if (SCRIVI_JSON) {
    const nomeOut = path.join(dir, `equip-${path.basename(v.nome).replace(/[^\w.-]/g, '_')}.json`);
    fs.writeFileSync(nomeOut, JSON.stringify(record, null, 1));
    console.log(`      scritto: ${nomeOut}`);
  }
  console.log('');
}

if (!SCRIVI_JSON) console.log('\nNessun file scritto. Rilancia con --json per salvare le tabelle.');
