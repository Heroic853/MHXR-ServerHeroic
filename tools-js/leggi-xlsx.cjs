/*
 * Lettore di file .xlsx senza dipendenze esterne.
 *
 * Un .xlsx e' uno zip che contiene XML: sharedStrings.xml (tutte le stringhe,
 * indicizzate) e worksheets/sheetN.xml (le celle, che per il testo rimandano a
 * quell'indice). Non serve una libreria: serve saper leggere lo zip, e Node ha
 * gia' inflateRaw.
 *
 * Si legge il CENTRAL DIRECTORY in fondo al file, non gli header locali: quando
 * un programma scrive lo zip in streaming lascia le dimensioni a zero negli
 * header locali e le mette solo nel central directory. Excel di solito le
 * scrive in entrambi, ma non tutti i generatori lo fanno.
 *
 * Esporta leggiFoglio(percorso) -> { intestazioni: [...], righe: [{col: val}] }
 */
const fs = require('fs');
const zlib = require('zlib');

const FIRMA_EOCD = 0x06054b50; // fine del central directory
const FIRMA_CD = 0x02014b50;   // voce del central directory

/** Legge tutte le voci dello zip: nome -> contenuto decompresso. */
function leggiZip(buf) {
  // L'EOCD sta in fondo, ma dopo di lui puo' esserci un commento di lunghezza
  // variabile: si cerca la firma andando a ritroso.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === FIRMA_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('non e\' uno zip valido: EOCD non trovato');

  const numVoci = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16); // inizio del central directory

  const file = new Map();
  for (let i = 0; i < numVoci; i++) {
    if (buf.readUInt32LE(off) !== FIRMA_CD) break;

    const metodo = buf.readUInt16LE(off + 10);
    const dimComp = buf.readUInt32LE(off + 20);
    const lenNome = buf.readUInt16LE(off + 28);
    const lenExtra = buf.readUInt16LE(off + 30);
    const lenComm = buf.readUInt16LE(off + 32);
    const offLocale = buf.readUInt32LE(off + 42);
    const nome = buf.toString('utf8', off + 46, off + 46 + lenNome);

    // Nell'header locale i dati iniziano dopo nome ed extra, che possono avere
    // lunghezze diverse da quelle del central directory: si rileggono da la'.
    const lenNomeL = buf.readUInt16LE(offLocale + 26);
    const lenExtraL = buf.readUInt16LE(offLocale + 28);
    const inizio = offLocale + 30 + lenNomeL + lenExtraL;
    const grezzo = buf.subarray(inizio, inizio + dimComp);

    file.set(nome, metodo === 0 ? grezzo : zlib.inflateRawSync(grezzo));
    off += 46 + lenNome + lenExtra + lenComm;
  }
  return file;
}

/** Le stringhe condivise, in ordine: l'indice usato dalle celle e' la posizione. */
function stringheCondivise(xml) {
  if (!xml) return [];
  const testo = xml.toString('utf8');
  const fuori = [];
  // Ogni <si> e' una stringa, eventualmente spezzata in piu' <t> (formattazione
  // mista): si concatenano, altrimenti un nome con una parola in grassetto
  // arriverebbe troncato.
  for (const si of testo.split('<si>').slice(1)) {
    const pezzo = si.split('</si>')[0];
    let s = '';
    for (const m of pezzo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += m[1];
    fuori.push(decodifica(s));
  }
  return fuori;
}

function decodifica(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&'); // per ultimo, o si rompono le altre entita'
}

/**
 * Legge il primo foglio e restituisce le righe come oggetti, usando la prima
 * riga come nomi delle colonne.
 */
function leggiFoglio(percorso) {
  const zip = leggiZip(fs.readFileSync(percorso));
  const ss = stringheCondivise(zip.get('xl/sharedStrings.xml'));

  const nomeFoglio = [...zip.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!nomeFoglio) throw new Error('nessun foglio trovato nel file');
  const xml = zip.get(nomeFoglio).toString('utf8');

  const righeXml = xml.split('<row ').slice(1);
  const righe = [];
  for (const r of righeXml) {
    const cel = {};
    for (const m of r.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>|<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>)/g)) {
      const col = m[1];
      const attr = m[2] || '';
      let val = m[3] !== undefined ? m[3] : m[4];
      if (val === undefined) continue;
      // t="s" = il valore e' un indice in sharedStrings; t="inlineStr" e' testo
      // scritto nella cella stessa.
      if (/t="s"/.test(attr)) val = ss[Number(val)] ?? '';
      else val = decodifica(val);
      cel[col] = val;
    }
    righe.push(cel);
  }

  const intestazioni = righe.length ? righe[0] : {};
  const dati = righe.slice(1).map((r) => {
    const o = {};
    for (const [col, val] of Object.entries(r)) {
      const nome = intestazioni[col] || col;
      o[nome] = val;
    }
    return o;
  });

  return { intestazioni, righe: dati };
}

module.exports = { leggiFoglio, leggiZip, stringheCondivise };

// Lanciato direttamente: mostra intestazioni e prime righe di un foglio.
if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('uso: node leggi-xlsx.cjs <file.xlsx>'); process.exit(1); }
  const { intestazioni, righe } = leggiFoglio(f);
  console.log('colonne :', Object.entries(intestazioni).map(([c, n]) => `${c}=${n}`).join('  '));
  console.log('righe   :', righe.length);
  console.log('\nprime 3:');
  righe.slice(0, 3).forEach((r) => console.log('  ' + JSON.stringify(r)));
}
