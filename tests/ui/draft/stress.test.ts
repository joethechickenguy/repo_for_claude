// Owner feedback 2026-09-27 (typed values) exposed two old gaps: a pinned sibling could push a free
// specialty or topic past its own `full`, and ± on a child whose siblings were all pinned could leave
// the children summing to less than their parent. This mixes every draft action over many seeds.
import { it, expect } from "vitest";
import { tree } from "../../../src/content";
import * as M from "../../../src/ui/draft/model";
function mulberry32(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
it("40 seeded runs of ±, typed values and pins keep every total and cap exact", () => {
  let bad = 0;
  for (let seed = 1; seed <= 40 && bad < 3; seed++) {
    const rnd = mulberry32(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const pools = tree.draft.roster.filter((r) => r.id !== M.BUILDERS_POOL_ID);
    let state = M.defaultDraftState(tree);
    for (let i = 0; i < 300; i++) {
      const a = Math.floor(rnd() * 10); const d = rnd() < 0.5 ? -1 : 1; const v = Math.floor(rnd() * 3000) - 100; let desc = "";
      const pool = pick(tree.draft.roster); const spec = pick(pool.specialties); const cat = pick(tree.draft.pages); const top = pick(cat.topics); const np = pick(pools);
      switch (a) {
        case 0: desc = `stepPool ${np.id} ${d}`; state = M.stepPool(tree, state, np.id, d); break;
        case 1: desc = `stepSpec ${pool.id}/${spec.id} ${d}`; state = M.stepSpecialty(tree, state, pool.id, spec.id, d); break;
        case 2: desc = `pinSpec ${pool.id}/${spec.id}`; state = M.toggleSpecialtyPin(state, pool.id, spec.id); break;
        case 3: desc = `stepCat ${cat.id} ${d}`; state = M.stepCategory(tree, state, cat.id, d); break;
        case 4: desc = `stepTopic ${cat.id}/${top.id} ${d}`; state = M.stepTopic(tree, state, cat.id, top.id, d); break;
        case 5: desc = `pinTopic`; state = M.toggleTopicPin(state, cat.id, top.id); break;
        case 6: desc = `setPool ${np.id} ${v}`; state = M.setPool(tree, state, np.id, v); break;
        case 7: desc = `setSpec ${pool.id}/${spec.id} ${v}`; state = M.setSpecialty(tree, state, pool.id, spec.id, v); break;
        case 8: desc = `setCat ${cat.id} ${v}`; state = M.setCategory(tree, state, cat.id, v); break;
        default: desc = `setTopic ${cat.id}/${top.id} ${v}`; state = M.setTopic(tree, state, cat.id, top.id, v);
      }
      const people = tree.draft.roster.reduce((s, r) => s + M.poolValue(state, r.id), 0);
      let err = people !== 10000 ? `people ${people}` : "";
      for (const r of tree.draft.roster) { const pv = M.poolValue(state, r.id); const ss = r.specialties.reduce((s, sp) => s + M.specialtyValue(state, r.id, sp.id), 0); if (ss !== pv) err ||= `${r.id} spec sum ${ss} vs ${pv}`; if (pv > r.full || pv < 0) err ||= `${r.id} pool ${pv}`; for (const sp of r.specialties) { const x = M.specialtyValue(state, r.id, sp.id); if (x > sp.full || x < 0) err ||= `${r.id}/${sp.id} ${x}>${sp.full}`; } }
      for (const c of tree.draft.pages) { const pv = state.pages[c.id] ?? 0; const ts = c.topics.reduce((s, t) => s + M.topicValue(state, c.id, t.id), 0); if (ts !== pv) err ||= `${c.id} topic sum ${ts} vs ${pv}`; for (const t of c.topics) { const x = M.topicValue(state, c.id, t.id); if (x > t.full || x < 0) err ||= `${c.id}/${t.id} ${x}>${t.full}`; } }
      const pages = Object.values(state.pages).reduce((a2, b) => a2 + b, 0); if (pages > 10000) err ||= `pages ${pages}`;
      if (err) { console.log(`seed ${seed} step ${i} ${desc}: ${err}`); bad++; break; }
    }
  }
  expect(bad).toBe(0);
}, 30_000);
