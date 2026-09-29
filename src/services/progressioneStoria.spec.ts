import { describe, it, expect } from 'vitest';
import { statoStoria, mappaProgressiva, missioniCompletate } from './progressioneStoria.js';
import struttura from '../json/progressione-storia.json' with { type: 'json' };
import completa from '../json/full_enabled_state.json' with { type: 'json' };

const isola1 = struttura[0]!.isole[0]!;
const isola2 = struttura[0]!.isole[1]!;
// マラクジャ島: 港町(1) アドポの丘(2) パクペバ(3) ローゼル渓流(2) トララ川(3) ヒスコア湿地帯(2) ピアウ海岸(4)
const [villaggio, adopo, pakupeba, rozeru, torara, hisukoa, costa] = isola1.nodi;
const ultime = (n: { missioni: number[] }) => n.missioni.slice(-2);

describe('progressioneStoria', () => {
  it('a player with no cleared quest sees island 1 up to the first zone only', () => {
    const s = statoStoria(new Set());
    expect([...s.oceani]).toEqual([struttura[0]!.mst_ocean_id]);
    expect([...s.isole]).toEqual([isola1.mst_part_id]);
    expect([...s.nodi]).toEqual([villaggio!.mst_node_id, adopo!.mst_node_id]);
    expect(s.tesori.size).toBe(0);
  });

  it('clearing 2-7 or 2-8 opens the passage and the next zone', () => {
    for (const q of ultime(adopo!)) {
      const s = statoStoria(new Set([q]));
      expect(s.nodi).toEqual(new Set([villaggio, adopo, pakupeba, rozeru].map((n) => n!.mst_node_id)));
    }
    // Un'altra missione della zona non basta.
    expect(statoStoria(new Set([adopo!.missioni[0]!])).nodi.has(pakupeba!.mst_node_id)).toBe(false);
  });

  it('clearing 6-8 opens the exit coast, the island 1 treasure and island 2', () => {
    const fatte = new Set([ultime(adopo!)[0]!, ultime(rozeru!)[0]!, ultime(hisukoa!)[1]!]);
    const s = statoStoria(fatte);
    expect(s.nodi.has(torara!.mst_node_id)).toBe(true);
    expect(s.nodi.has(costa!.mst_node_id)).toBe(true);
    expect(s.tesori.has(isola1.mst_part_id)).toBe(true);
    expect(s.isole.has(isola2.mst_part_id)).toBe(true);
    expect(s.nodi.has(isola2.nodi[1]!.mst_node_id)).toBe(true);
  });

  it('who already went further keeps everything up to the furthest zone with a cleared quest', () => {
    // Solo 4-1 fatta (la mappa prima era tutta aperta): resta aperto fino a ローゼル渓流, non oltre.
    const s = statoStoria(new Set([rozeru!.missioni[0]!]));
    expect(s.nodi).toEqual(new Set([villaggio, adopo, pakupeba, rozeru].map((n) => n!.mst_node_id)));
    // Solo 6-8 fatta: arriva alla costa, al tesoro e all'isola 2.
    const t = statoStoria(new Set([ultime(hisukoa!)[1]!]));
    expect(t.nodi.has(costa!.mst_node_id)).toBe(true);
    expect(t.tesori.has(isola1.mst_part_id)).toBe(true);
    expect(t.isole.has(isola2.mst_part_id)).toBe(true);
  });

  it('the map is the full one, reduced: nothing new, nothing reordered', () => {
    const m = mappaProgressiva(completa, new Set());
    expect(m).toHaveLength(1);
    expect(m[0]!.part_list).toHaveLength(1);
    const p = m[0]!.part_list[0]!;
    expect(p.node_list.map((n) => n.mst_node_id)).toEqual([villaggio!.mst_node_id, adopo!.mst_node_id]);
    expect(p.node_list[1]).toEqual(completa[0]!.part_list[0]!.node_list[1]);
    // Tesoro non preso: piedistallo vuoto e nota "non trovato", le altre note come prima.
    expect(p.object_list).toEqual([]);
    const note = p.exploration_note.note_contents;
    expect(note.find((c) => c.mst_note_content_id === isola1.nota_tesoro)!.state).toBe(1);
    expect(note.filter((c) => c.mst_note_content_id !== isola1.nota_tesoro).every((c) => c.state === 3)).toBe(true);
    // La mappa completa non viene toccata.
    expect(completa[0]!.part_list[0]!.exploration_note.note_contents.every((c) => c.state === 3)).toBe(true);
  });

  it('with every quest cleared the map is exactly the full one', () => {
    const tutte = new Set(struttura.flatMap((o) => o.isole.flatMap((i) => i.nodi.flatMap((n) => n.missioni))));
    expect(mappaProgressiva(completa, tutte)).toEqual(completa);
  });

  it('only quests with a clear_time count as cleared', () => {
    expect(missioniCompletate([{ mst_quest_id: 1, clear_time: 30 }, { mst_quest_id: 2 }, { mst_quest_id: 3, clear_time: 0 }])).toEqual(new Set([1, 3]));
  });
});
