/*
 * Legge e riscrive le stringhe dentro un file GMD, il contenitore di testo di
 * Capcom usato dal client per menu, mostri, abilita' e messaggi.
 *
 * STRUTTURA (verificata su tutti i 49 file dell'archivio):
 *   0x00  "GMD\0"
 *   0x04  versione (0x10302 in questo gioco)
 *   0x08  lingua   (0 = giapponese)
 *   0x14  numero etichette
 *   0x18  numero stringhe
 *   0x1c  dimensione blocco etichette
 *   0x20  dimensione blocco stringhe
 *   0x24  lunghezza del nome
 *   0x28  nome, terminato da zero
 *   ...   blocco etichette
 *   coda  blocco stringhe: testo UTF-8 separato da zero
 *
 * Il blocco stringhe occupa esattamente gli ULTIMI byte del file, quindi si
 * puo' sostituire senza toccare le etichette: cambia solo la dimensione
 * dichiarata a 0x20. Le etichette restano quelle originali, cosi' il gioco
 * continua a trovare ogni messaggio con la stessa chiave di prima.
 *
 *   node testo-gmd.cjs estrai <file_jpn> <uscita.json>
 *   node testo-gmd.cjs scrivi <file_jpn> <traduzioni.json> <uscita_gmd>
 *
 * Il JSON e' una lista: una voce per stringa, nell'ordine originale.
 *   [{ "i": 0, "jp": "...", "en": "" }, ...]
 * Si traduce riempiendo "en". Le voci con "en" vuoto restano in giapponese,
 * quindi si puo' tradurre a pezzi senza rompere niente.
 */
const fs = require('fs');

const OFF_N_STRINGHE = 0x18;
const OFF_DIM_STRINGHE = 0x20;

function leggiGmd(percorso) {
  const d = fs.readFileSync(percorso);
  if (d.toString('ascii', 0, 3) !== 'GMD') throw new Error(`${percorso} non e' un file GMD`);

  const nStringhe = d.readUInt32LE(OFF_N_STRINGHE);
  const dimStringhe = d.readUInt32LE(OFF_DIM_STRINGHE);
  const testa = d.subarray(0, d.length - dimStringhe);
  const blocco = d.subarray(d.length - dimStringhe);

  // L'ultimo zero chiude l'ultima stringa: split lascerebbe una voce vuota in
  // coda, che non e' una stringa vera e non va contata.
  const stringhe = blocco.toString('utf8').split('\0');
  if (stringhe.length && stringhe[stringhe.length - 1] === '') stringhe.pop();

  if (stringhe.length !== nStringhe) {
    throw new Error(`${percorso}: trovate ${stringhe.length} stringhe ma l'intestazione ne dichiara ${nStringhe}`);
  }
  return { testa, stringhe, nStringhe };
}

function scriviGmd(testa, stringhe) {
  const blocco = Buffer.concat(stringhe.map((s) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])));
  const fuori = Buffer.from(testa);
  // Il numero di stringhe non cambia mai (si traduce, non si aggiunge):
  // cambia solo quanto spazio occupano.
  fuori.writeUInt32LE(blocco.length, OFF_DIM_STRINGHE);
  return Buffer.concat([fuori, blocco]);
}

const [, , comando, ...resto] = process.argv;

if (comando === 'estrai') {
  const [entrata, uscita] = resto;
  if (!entrata || !uscita) { console.error('Uso: testo-gmd.cjs estrai <file_jpn> <uscita.json>'); process.exit(1); }
  const { stringhe } = leggiGmd(entrata);
  const voci = stringhe.map((jp, i) => ({ i, jp, en: '' }));
  fs.writeFileSync(uscita, JSON.stringify(voci, null, 1));
  console.log(`${stringhe.length} stringhe -> ${uscita}`);
  process.exit(0);
}

if (comando === 'scrivi') {
  const [entrata, traduzioni, uscita] = resto;
  if (!entrata || !traduzioni || !uscita) {
    console.error('Uso: testo-gmd.cjs scrivi <file_jpn> <traduzioni.json> <uscita_gmd>');
    process.exit(1);
  }
  const { testa, stringhe } = leggiGmd(entrata);
  const voci = JSON.parse(fs.readFileSync(traduzioni, 'utf8'));

  let tradotte = 0;
  const nuove = stringhe.slice();
  for (const v of voci) {
    if (typeof v.i !== 'number' || v.i < 0 || v.i >= nuove.length) continue;
    // Una traduzione vuota non e' un errore: vuol dire "questa non l'ho ancora
    // fatta", e resta il giapponese. Cosi' si puo' consegnare a strati.
    if (!v.en) continue;
    nuove[v.i] = v.en;
    tradotte++;
  }

  fs.writeFileSync(uscita, scriviGmd(testa, nuove));
  console.log(`${tradotte}/${stringhe.length} stringhe tradotte -> ${uscita}`);

  // Rilettura di controllo: un GMD malformato fa crashare il gioco all'avvio,
  // ed e' meglio accorgersene qui che sul telefono.
  const ric = leggiGmd(uscita);
  console.log(`verifica: riletto ${ric.stringhe.length} stringhe, intestazione coerente`);
  process.exit(0);
}

console.error('Comandi: estrai | scrivi');
process.exit(1);
