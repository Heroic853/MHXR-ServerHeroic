/*
 * Rimette insieme un archivio ARC a partire dai file estratti.
 *
 * E' il pezzo che mancava: estrai-testo.cjs sa aprire gli archivi del client,
 * questo sa richiuderli. Senza, tradurre non serve a niente — il testo nuovo
 * non tornerebbe mai dentro al gioco.
 *
 * Il formato e' quello gia' noto: intestazione di 8 byte (magic ARCC,
 * versione 7, numero di voci), poi una tabella di voci da 80 byte, poi i corpi
 * compressi in zlib. Se il magic e' ARCC la tabella e' cifrata in Blowfish ECB
 * con inversione a 4 byte.
 *
 * VERIFICA: prima di fidarsi, l'opzione --prova rifa' l'archivio e controlla
 * che riestraendolo si riottengano gli stessi identici file di partenza. Un
 * archivio malformato manderebbe il gioco in crash all'avvio, e non e' il tipo
 * di errore che si scopre comodamente.
 *
 *   node ricompatta-arc.cjs <cartella> <archivio-uscita.arc> [--manifest=f.json]
 *   node ricompatta-arc.cjs --prova <archivio-originale.arc>
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');

const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';
const DIM_HEADER = 8;
const DIM_VOCE = 80;

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
  if (chiaro.length < girato.length) chiaro = Buffer.concat([chiaro, Buffer.alloc(girato.length - chiaro.length)]);
  return inverti(chiaro);
}

function cifra(buf) {
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const girato = inverti(buf);
  const cifrato = Buffer.from(bf.encode(girato));
  return inverti(cifrato);
}

const senzaNulli = (buf) => {
  const i = buf.indexOf(0);
  return buf.toString('utf-8', 0, i === -1 ? buf.length : i);
};

/** Apre un archivio e restituisce le voci con nome interno e dati decompressi. */
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
    // I 4 byte fra nome e dimensione compressa sono un identificativo di tipo:
    // vanno riscritti tali e quali o il gioco non sa piu' che file sia.
    const tipo = corpo.readUInt32LE(off + 64);
    const compSize = corpo.readUInt32LE(off + 68);
    const dimReale = corpo.readUInt32LE(off + 72);
    const inizio = corpo.readUInt32LE(off + 76) - DIM_HEADER;
    let dati = null;
    try { dati = zlib.inflateSync(corpo.subarray(inizio, inizio + compSize)); } catch { /* non zlib */ }
    voci.push({ nomeInterno, tipo, dimReale, dati, grezzo: corpo.subarray(inizio, inizio + compSize) });
  }
  return { magic, versione, voci };
}

/** Ricostruisce l'archivio. `voci` deve avere nomeInterno, tipo, dimReale, dati. */
function scriviArc(voci, magic, versione) {
  const tabella = Buffer.alloc(voci.length * DIM_VOCE);
  const corpi = [];
  // I dati partono subito dopo la tabella; l'offset memorizzato e' assoluto
  // nel file, quindi comprende gli 8 byte di intestazione.
  let cursore = DIM_HEADER + tabella.length;

  voci.forEach((v, i) => {
    const compresso = v.compresso ?? zlib.deflateSync(v.dati);
    const off = i * DIM_VOCE;
    tabella.write(v.nomeInterno, off, 64, 'utf-8');
    tabella.writeUInt32LE(v.tipo, off + 64);
    tabella.writeUInt32LE(compresso.length, off + 68);
    tabella.writeUInt32LE(v.dimReale, off + 72);
    tabella.writeUInt32LE(cursore, off + 76);
    corpi.push(compresso);
    cursore += compresso.length;
  });

  const testa = Buffer.alloc(DIM_HEADER);
  testa.write(magic, 0, 4, 'ascii');
  testa.writeUInt16LE(versione, 4);
  testa.writeUInt16LE(voci.length, 6);

  /*
   * La cifratura copre TUTTO quello che segue l'intestazione, tabella e corpi
   * compressi insieme — non solo la tabella. Si vede dal fatto che nell'
   * originale l'inflate riesce solo dopo aver decifrato l'intero blocco.
   * Blowfish lavora a blocchi di 8 byte, quindi il corpo va riempito fino al
   * multiplo di 8: le dimensioni e gli offset stanno nella tabella, quindi
   * qualche byte in coda non disturba nessuno.
   */
  let corpo = Buffer.concat([tabella, ...corpi]);
  if (magic === 'ARCC') {
    const avanzo = corpo.length % 8;
    if (avanzo) corpo = Buffer.concat([corpo, Buffer.alloc(8 - avanzo)]);
    corpo = cifra(corpo);
  }

  return Buffer.concat([testa, corpo]);
}

// --- prova di andata e ritorno ---------------------------------------------
if (process.argv.includes('--prova')) {
  const originale = process.argv[process.argv.indexOf('--prova') + 1];
  if (!originale) { console.error('Uso: node ricompatta-arc.cjs --prova <archivio.arc>'); process.exit(1); }

  const prima = leggiArc(originale);
  console.log(`${path.basename(originale)}: magic=${prima.magic} versione=${prima.versione} voci=${prima.voci.length}`);

  const rifatto = scriviArc(prima.voci.map((v) => ({ ...v, compresso: undefined })), prima.magic, prima.versione);
  const tmp = originale + '.rifatto';
  fs.writeFileSync(tmp, rifatto);

  const dopo = leggiArc(tmp);
  let uguali = 0; const diversi = [];
  for (let i = 0; i < prima.voci.length; i++) {
    const a = prima.voci[i], b = dopo.voci[i];
    const stessiDati = a.dati && b.dati ? a.dati.equals(b.dati) : a.grezzo.equals(b.grezzo);
    if (a.nomeInterno === b.nomeInterno && a.tipo === b.tipo && stessiDati) uguali++;
    else diversi.push(a.nomeInterno);
  }

  console.log(`\ndimensione: ${fs.statSync(originale).size} -> ${rifatto.length} byte`);
  console.log(`voci identiche dopo il giro: ${uguali}/${prima.voci.length}`);
  if (diversi.length) console.log('DIVERSE:', diversi.join(', '));
  console.log(uguali === prima.voci.length
    ? '\nOK: l\'archivio si richiude e si riapre senza perdere niente.'
    : '\nATTENZIONE: il giro non e\' fedele, non usare questo archivio nel gioco.');
  fs.unlinkSync(tmp);
  process.exit(uguali === prima.voci.length ? 0 : 1);
}

// --- ricompattamento normale ------------------------------------------------
const CARTELLA = process.argv[2];
const USCITA = process.argv[3];
const manifest = (process.argv.find((a) => a.startsWith('--manifest=')) || '').split('=')[1];

if (!CARTELLA || !USCITA) {
  console.error('Uso: node ricompatta-arc.cjs <cartella> <uscita.arc> [--manifest=f.json]');
  console.error('     node ricompatta-arc.cjs --prova <archivio.arc>');
  process.exit(1);
}

/* Serve il manifest dell'archivio originale: il nome interno completo
 * ("GUI\font\Common_jpn") e l'identificativo di tipo non si possono indovinare
 * dal nome del file su disco. */
if (!manifest) {
  console.error('Serve --manifest=<file.json> prodotto dall\'estrazione originale.');
  process.exit(1);
}
const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const voci = meta.voci.map((v) => {
  const p = path.join(CARTELLA, v.nomeInterno.split('\\').pop());
  const dati = fs.readFileSync(p);
  return { nomeInterno: v.nomeInterno, tipo: v.tipo, dimReale: dati.length, dati };
});
fs.writeFileSync(USCITA, scriviArc(voci, meta.magic, meta.versione));
console.log(`${voci.length} voci -> ${USCITA} (${fs.statSync(USCITA).size} byte)`);
