/*
 * Parser XFS v16 per la variante a 64 BIT usata da MHXR Android.
 *
 *   docker compose -f docker-compose.prod.yml exec -T server node /app/tools/xfs-parse.cjs <file> [--json]
 *
 * PERCHE' NE SERVIVA UNO NUOVO
 * Il parser in src/tools/fpk/formats/xfs.ts e' scritto per il layout a 32 bit e
 * su questi file restituisce sempre root vuoto e propNum = 0. Confrontando i
 * byte veri (definequest_block_define_l90.dft) risultano due differenze:
 *
 *   definizione:  dtiHash(4) + pad(4) + propNum(4) + pad(4)      <- propNum a +8, non a +4
 *   proprieta' :  nameOffset(8) + type(1) + attr(1) + bytes(2) + pad   totale 80 byte, non 40
 *
 * Verificato sulle tre definizioni del file l90: 64+80=144 e 160+2*80=320,
 * che sono esattamente gli offset delle definizioni successive.
 */
const fs = require('fs');

const HEADER = 24;
const PROP_SIZE = 80;

const TIPI = {
  1: 'CLASS', 2: 'CLASSREF', 3: 'BOOL', 4: 'U8', 5: 'U16', 6: 'U32', 7: 'U64',
  8: 'S8', 9: 'S16', 10: 'S32', 11: 'S64', 12: 'F32', 13: 'F64', 14: 'STRING',
  0x20: 'CSTRING', 0x1d: 'ARRAY',
};

function parseXfs(buf) {
  if (buf.toString('ascii', 0, 4) !== 'XFS\0') throw new Error('non e\' un XFS');
  const version = buf.readUInt16LE(4);
  if (version !== 16) throw new Error(`versione XFS non gestita: ${version}`);

  const header = {
    version,
    type: buf.readUInt16LE(6),
    classCount: Number(buf.readBigInt64LE(8)),
    defCount: buf.readInt32LE(16),
    defSize: buf.readInt32LE(20),
  };

  // tabella di offset a 64 bit, una voce per definizione
  const classi = [];
  for (let d = 0; d < header.defCount; d++) {
    const rel = Number(buf.readBigInt64LE(HEADER + d * 8));
    const pos = HEADER + rel;
    const dtiHash = buf.readUInt32LE(pos);
    const propNum = buf.readUInt32LE(pos + 8);

    const props = [];
    let p = pos + 16;
    for (let i = 0; i < propNum; i++) {
      const nameOffset = Number(buf.readBigInt64LE(p));
      const type = buf.readUInt8(p + 8);
      const attr = buf.readUInt8(p + 9);
      const bd = buf.readUInt16LE(p + 10);
      const nameAbs = HEADER + nameOffset;
      const end = buf.indexOf(0, nameAbs);
      const name = buf.toString('utf-8', nameAbs, end === -1 ? nameAbs : end);
      props.push({ name, type, tipo: TIPI[type] || `0x${type.toString(16)}`, attr, bytes: bd & 0x7fff });
      p += PROP_SIZE;
    }
    classi.push({ dtiHash, propNum, props });
  }

  const ctx = { buf, classi, pos: HEADER + header.defSize };
  const root = leggiClassRef(ctx);
  return { header, classi, root };
}

function leggiClassRef(ctx) {
  const { buf } = ctx;
  if (ctx.pos + 4 > buf.length) return null;
  const type = buf.readInt16LE(ctx.pos);
  const variant = buf.readInt16LE(ctx.pos + 2);
  ctx.pos += 4;
  if (type === 0x7fff || (type & 1) === 0) return null; // riferimento nullo
  // "size" e' a 64 bit come il resto di questa variante: leggendolo a 32 il
  // puntatore restava disallineato di 4 byte e il conteggio dei campi usciva 0.
  ctx.pos += 8;
  return leggiOggetto(ctx, type >> 1);
}

let DEBUG = false;
let passi = 0;

function leggiOggetto(ctx, classIndex) {
  const cls = ctx.classi[classIndex];
  if (!cls) throw new Error(`classe ${classIndex} inesistente`);
  const out = {};
  for (const prop of cls.props) {
    const offCount = ctx.pos;
    const count = ctx.buf.readInt32LE(ctx.pos);
    ctx.pos += 4;
    if (DEBUG && passi < 40) {
      console.log(`  [${String(offCount).padStart(6)}] ${prop.name.padEnd(12)} ${prop.tipo.padEnd(9)} count=${count}`);
      passi++;
    }
    if (count < 0 || count > 100000) {
      throw new Error(`count assurdo (${count}) per ${prop.name} a offset ${offCount}`);
    }
    const valori = [];
    for (let j = 0; j < count; j++) valori.push(leggiValore(ctx, prop.type));
    out[prop.name] = count === 1 ? valori[0] : valori;
  }
  return out;
}

function leggiFloat(b, ctx, n) {
  const v = [];
  for (let i = 0; i < n; i++) v.push(Number(b.readFloatLE(ctx.pos + i * 4).toFixed(3)));
  ctx.pos += n * 4;
  return v;
}

function leggiValore(ctx, type) {
  const b = ctx.buf;
  switch (type) {
    case 1: case 2: return leggiClassRef(ctx);
    case 3: { const v = b.readUInt8(ctx.pos) !== 0; ctx.pos += 1; return v; }
    case 4: { const v = b.readUInt8(ctx.pos); ctx.pos += 1; return v; }
    case 5: { const v = b.readUInt16LE(ctx.pos); ctx.pos += 2; return v; }
    case 6: { const v = b.readUInt32LE(ctx.pos); ctx.pos += 4; return v; }
    case 7: { const v = b.readBigUInt64LE(ctx.pos).toString(); ctx.pos += 8; return v; }
    case 8: { const v = b.readInt8(ctx.pos); ctx.pos += 1; return v; }
    case 9: { const v = b.readInt16LE(ctx.pos); ctx.pos += 2; return v; }
    case 10: { const v = b.readInt32LE(ctx.pos); ctx.pos += 4; return v; }
    case 11: { const v = b.readBigInt64LE(ctx.pos).toString(); ctx.pos += 8; return v; }
    case 12: { const v = b.readFloatLE(ctx.pos); ctx.pos += 4; return v; }
    case 13: { const v = b.readDoubleLE(ctx.pos); ctx.pos += 8; return v; }
    case 14: case 0x20: {
      // Le stringhe sono scritte in chiaro e terminate da NUL, non precedute
      // dalla lunghezza: leggendo un int32 come lunghezza usciva un numero
      // assurdo perche' erano i primi 4 caratteri del nome ("l90_").
      const off = ctx.pos;
      const fine = b.indexOf(0, ctx.pos);
      if (fine === -1) throw new Error(`stringa senza terminatore a offset ${off}`);
      const s = b.toString('utf-8', ctx.pos, fine);
      ctx.pos = fine + 1;
      if (DEBUG && passi < 40) { console.log(`        stringa @${off} -> "${s}"`); passi++; }
      return s;
    }
    // Tipi geometrici: nel motore MT sono allineati a 16 byte per il SIMD,
    // anche quando i componenti utili sono meno (VECTOR3 = 3 float + padding).
    case 0x0f: { const v = b.readUInt32LE(ctx.pos); ctx.pos += 4; return v; }        // COLOR
    case 0x10: case 0x11: { const v = [b.readInt32LE(ctx.pos), b.readInt32LE(ctx.pos + 4)]; ctx.pos += 8; return v; } // POINT, SIZE
    case 0x12: { const v = leggiFloat(b, ctx, 4); return v; }                        // RECT
    case 0x14: case 0x15: case 0x16: { const v = leggiFloat(b, ctx, 4); return v; }  // VECTOR3/4, QUATERNION
    case 0x22: { const v = leggiFloat(b, ctx, 2); return v; }                        // FLOAT2
    case 0x23: { const v = leggiFloat(b, ctx, 3); return v; }                        // FLOAT3
    case 0x24: { const v = leggiFloat(b, ctx, 4); return v; }                        // FLOAT4
    case 0x36: { const v = [b.readInt32LE(ctx.pos), b.readInt32LE(ctx.pos + 4), b.readInt32LE(ctx.pos + 8)]; ctx.pos += 12; return v; } // RANGE
    case 0x37: { const v = leggiFloat(b, ctx, 3); return v; }                        // RANGEF
    default: throw new Error(`tipo ${type} (0x${type.toString(16)}) non gestito a offset ${ctx.pos}`);
  }
}

module.exports = { parseXfs };

if (require.main === module) {
  const file = process.argv[2];
  DEBUG = process.argv.includes('--debug');
  const doc = parseXfs(fs.readFileSync(file));
  console.log(`header: ${JSON.stringify(doc.header)}`);
  console.log('\nclassi:');
  for (const c of doc.classi) {
    console.log(`  dtiHash=${c.dtiHash} propNum=${c.propNum}`);
    for (const p of c.props) console.log(`      ${p.name.padEnd(14)} ${p.tipo} (attr=0x${p.attr.toString(16)}, bytes=${p.bytes})`);
  }
  if (process.argv.includes('--json')) {
    console.log('\n' + JSON.stringify(doc.root, null, 1).slice(0, 3000));
  } else {
    console.log('\nroot (estratto):');
    console.log(JSON.stringify(doc.root, null, 1).slice(0, 1200));
  }
}
