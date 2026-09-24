/*
 * Estrae gli archivi di testo dell'interfaccia dal client (GUI_msg.arc e
 * simili), per poterli tradurre.
 *
 * A differenza di tutto il resto del progetto questo NON parla col server: il
 * testo dei menu, dei mostri e delle abilita' non passa mai dalla rete, sta
 * dentro l'APK. Il server non ne manda nemmeno una stringa.
 *
 * Formato: stesso ARC gia' noto (magic ARCC, versione 7, voci da 80 byte,
 * Blowfish ECB con inversione a 4 byte, corpo in zlib). Dentro ogni voce c'e'
 * un file di messaggi, uno per area dell'interfaccia: Common, Monster,
 * SkillName, SkillText, Quest, Navi_*.
 *
 *   node estrai-testo.cjs <archivio.arc> [cartella-destinazione]
 *
 * Esempio, dopo aver tirato fuori l'arc dall'APK:
 *   node estrai-testo.cjs GUI_msg.arc msg/
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');

const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';
const DIM_HEADER = 8;
const DIM_VOCE = 80;

/* L'archivio memorizza ogni gruppo di 4 byte al contrario rispetto a quello
 * che Blowfish si aspetta: va girato prima di decifrare e dopo aver decifrato. */
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
  if (chiaro.length < girato.length) {
    chiaro = Buffer.concat([chiaro, Buffer.alloc(girato.length - chiaro.length)]);
  }
  return inverti(chiaro);
}

const senzaNulli = (buf) => {
  const i = buf.indexOf(0);
  return buf.toString('utf-8', 0, i === -1 ? buf.length : i);
};

const ARCHIVIO = process.argv[2];
const DEST = process.argv[3] || 'estratto';

if (!ARCHIVIO) {
  console.error('Uso: node estrai-testo.cjs <archivio.arc> [cartella-destinazione]');
  process.exit(1);
}

const buf = fs.readFileSync(ARCHIVIO);
const magic = buf.toString('ascii', 0, 4);
const numFile = buf.readUInt16LE(6);
const corpo = magic === 'ARCC' ? decifra(buf.subarray(DIM_HEADER)) : buf.subarray(DIM_HEADER);

fs.mkdirSync(DEST, { recursive: true });

console.log(`${path.basename(ARCHIVIO)}  magic=${magic}  voci=${numFile}\n`);

let estratti = 0;
const saltati = [];
/* Il manifest serve a ricompattare: il nome interno completo
 * ("GUI\font\Common_jpn") e l'identificativo di tipo non si possono dedurre
 * dal nome del file su disco, e sbagliarli significa un archivio che il gioco
 * rifiuta. Si salva qui, accanto ai file estratti. */
const manifest = { magic, versione: buf.readUInt16LE(4), voci: [] };

for (let i = 0; i < numFile; i++) {
  const off = i * DIM_VOCE;
  // Il nome interno usa la backslash di Windows come separatore
  // ("GUI\\font\\Common_jpn"): si tiene solo l'ultimo pezzo.
  const nomeInterno = senzaNulli(corpo.subarray(off, off + 64));
  const nome = nomeInterno.split('\\').pop();
  const tipo = corpo.readUInt32LE(off + 64);
  const compSize = corpo.readUInt32LE(off + 68);
  const inizio = corpo.readUInt32LE(off + 76) - DIM_HEADER;

  if (inizio < 0 || inizio + compSize > corpo.length) { saltati.push(nome + ' (fuori dai limiti)'); continue; }
  let dati;
  try {
    dati = zlib.inflateSync(corpo.subarray(inizio, inizio + compSize));
  } catch {
    saltati.push(nome + ' (non zlib)');
    continue;
  }
  fs.writeFileSync(path.join(DEST, nome), dati);
  manifest.voci.push({ nomeInterno, tipo });
  console.log(`  ${String(dati.length).padStart(8)} byte  ${nome}`);
  estratti++;
}

const percorsoManifest = path.join(DEST, 'arc.manifest.json');
fs.writeFileSync(percorsoManifest, JSON.stringify(manifest, null, 1));

console.log(`\n${estratti}/${numFile} estratti in ${DEST}/`);
console.log(`manifest: ${percorsoManifest}`);
if (saltati.length) console.log(`saltati: ${saltati.join(', ')}`);
