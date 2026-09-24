const fs = require('fs');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');
const { parseXfs } = require('./xfs-parse.cjs');
const CHIAVE_ARC = 'kaseoa nkaeka;eawf3';

function inverti(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i + 3 < buf.length; i += 4) { out[i] = buf[i + 3]; out[i + 1] = buf[i + 2]; out[i + 2] = buf[i + 1]; out[i + 3] = buf[i]; }
  const r = buf.length % 4; if (r > 0) buf.copy(out, buf.length - r, buf.length - r);
  return out;
}
function decifra(buf) {
  const bf = new Blowfish(CHIAVE_ARC, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
  const g = inverti(buf);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inverti(c);
}
function leggiArc(percorso) {
  const buf = fs.readFileSync(percorso);
  const magic = buf.toString('ascii', 0, 4);
  const numFile = buf.readUInt16LE(6);
  const corpo = magic === 'ARCC' ? decifra(buf.subarray(8)) : buf.subarray(8);
  const voci = [];
  for (let i = 0; i < numFile; i++) {
    const off = i * 80;
    const nomeInterno = corpo.toString('utf-8', off, off + 64).replace(/\0.*$/, '');
    const compSize = corpo.readUInt32LE(off + 68);
    const inizio = corpo.readUInt32LE(off + 76) - 8;
    let dati = null;
    try { dati = zlib.inflateSync(corpo.subarray(inizio, inizio + compSize)); } catch { /* ignore */ }
    voci.push({ nomeInterno, dati });
  }
  return voci;
}
function trovaRecord(nodo, prof) {
  prof = prof || 0;
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

const percorso = process.argv[2] || 'rsdnt_equip_en.arc';
const voci = leggiArc(percorso);
for (const v of voci) {
  const nomePulito = v.nomeInterno.split('\\').join('/');
  if (!/_series$/.test(nomePulito)) continue;
  if (!v.dati) continue;
  let doc;
  try { doc = parseXfs(v.dati); } catch { continue; }
  const rec = trovaRecord(doc.root);
  if (!rec || !rec.length) continue;
  console.log('=== ' + v.nomeInterno + ' (' + rec.length + ' record) ===');
  rec.slice(0, 4).forEach((r) => console.log(' ', r.mName || r.mNameMale || r.mNameFemale));
}
