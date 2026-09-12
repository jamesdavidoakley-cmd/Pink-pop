// Calibration harness: CALIB=1 npx vitest run tests/calib.test.ts
import { it } from 'vitest';
import { Sim } from '../src/sim';
import { makeLevel } from '../src/levels';
import { emptyBuild, placeSegment, placeBlock, type Build } from '../src/build';

export function run(name: string, lv: ReturnType<typeof makeLevel>, b: Build, trace = false): string {
  const sim = new Sim(lv, b);
  const pre = sim.precheck(); if (pre) return `${name} precheck ${pre.reason}`;
  for (let i = 0; i < 90; i++) sim.update(1 / 60);
  const out: string[] = [];
  for (const load of lv.loads) {
    sim.startLoad(load);
    const peak = new Map<string, number>();
    let status = sim.update(1 / 60); let t = 0; const tr: string[] = [];
    while (status.state === 'running' && t < 25) {
      status = sim.update(1 / 60); t += 1 / 60;
      for (const p of sim.parts) for (const l of p.links) { const k = `${p.kind}${l.role === 'bend' ? '-bend' : ''}`; peak.set(k, Math.max(peak.get(k) ?? 0, l.stress)); }
      if (trace && Math.round(t * 60) % 15 === 0) tr.push(`t${t.toFixed(2)}:top=${sim.topY().toFixed(2)}`);
    }
    const o = status.state === 'done' ? status.outcome : null;
    out.push(`${load.label}: ${o ? o.reason + (o.link ? `(${o.link.role})` : '') : 'timeout'} t=${t.toFixed(1)} stress=${[...peak].map(([k, v]) => `${k}=${v.toFixed(2)}`).join(',')}${trace ? ' ' + tr.join(' ') : ''}`);
    if (o && !o.ok) break;
    sim.clearLoad();
  }
  return `${name} → ${out.join(' || ')}`;
}

const enabled = !!process.env.CALIB;
(enabled ? it : it.skip)('calibration sweep', () => {
  const lines: string[] = [];
  const lv = makeLevel('bridge', 1);
  const truss = emptyBuild();
  placeSegment(truss, 'beam', 9, 8, 12, 8); placeSegment(truss, 'beam', 12, 8, 15, 8); placeSegment(truss, 'brace', 9, 10, 12, 8); placeSegment(truss, 'brace', 15, 10, 12, 8);
  lines.push(run('deck truss', lv, truss));
  const hinged = emptyBuild(); placeSegment(hinged, 'beam', 9, 8, 12, 8); placeSegment(hinged, 'beam', 12, 8, 15, 8);
  lines.push(run('hinged', lv, hinged));
  const lone = emptyBuild(); placeSegment(lone, 'long', 9, 8, 15, 8);
  lines.push(run('lone long', lv, lone));
  const propped = emptyBuild(); placeSegment(propped, 'long', 9, 8, 15, 8); placeSegment(propped, 'pillar', 12, 8, 12, 13);
  lines.push(run('propped long', lv, propped));
  const hung = emptyBuild(); placeSegment(hung, 'long', 9, 8, 15, 8); placeSegment(hung, 'rope', 9, 8, 12, 5); placeSegment(hung, 'rope', 15, 8, 12, 5); placeSegment(hung, 'rope', 12, 5, 12, 8);
  lines.push(run('hung long (ropes)', lv, hung));
  for (const tier of [2, 3] as const) {
    const l2 = makeLevel('bridge', tier);
    const x1 = 12 - [0, 6, 8, 12][tier] / 2; const x2 = 24 - x1;
    const b = emptyBuild();
    placeSegment(b, 'long', x1, 8, 12, 8); placeSegment(b, 'long', 12, 8, x2, 8); placeSegment(b, 'pillar', 12, 8, 12, 11);
    lines.push(run(`tier ${tier} two longs on rock pillar`, l2, b));
    const c = emptyBuild();
    placeSegment(c, 'long', x1, 8, 12, 8); placeSegment(c, 'long', 12, 8, x2, 8); placeSegment(c, 'pillar', 12, 8, 12, 11);
    const m1 = (x1 + 12) / 2; const m2 = (12 + x2) / 2;
    placeSegment(c, 'brace', x1, 10, m1, 8); placeSegment(c, 'brace', x2, 10, m2, 8);
    placeSegment(c, 'brace', 12, 11, m1, 8); placeSegment(c, 'brace', 12, 11, m2, 8);
    lines.push(run(`tier ${tier} longs + pillar + 4 braces`, l2, c));
  }
  const lw = makeLevel('wobble', 1);
  const sq = emptyBuild(); placeSegment(sq, 'pillar', 10, 11, 10, 8); placeSegment(sq, 'pillar', 13, 11, 13, 8); placeSegment(sq, 'beam', 10, 8, 13, 8);
  lines.push(run('square gate', lw, sq, true));
  const br = emptyBuild(); placeSegment(br, 'pillar', 10, 11, 10, 8); placeSegment(br, 'pillar', 13, 11, 13, 8); placeSegment(br, 'beam', 10, 8, 13, 8); placeSegment(br, 'brace', 10, 11, 13, 8);
  lines.push(run('braced gate', lw, br));
  const lw3 = makeLevel('wobble', 3);
  const br3 = emptyBuild(); placeSegment(br3, 'pillar', 10, 11, 10, 6); placeSegment(br3, 'pillar', 15, 11, 15, 6); placeSegment(br3, 'beam', 10, 6, 13, 6); placeSegment(br3, 'beam', 13, 6, 15, 6); placeSegment(br3, 'brace', 10, 11, 13, 6); placeSegment(br3, 'brace', 15, 11, 13, 6);
  lines.push(run('braced gate tier 3 vs Max', lw3, br3));
  const ls = makeLevel('stand', 1);
  const thin = emptyBuild(); for (let i = 0; i < 4; i++) placeBlock(thin, 'block', 12, 11 - i);
  lines.push(run('thin tower', ls, thin, true));
  const wide = emptyBuild(); for (let i = 0; i < 4; i++) placeBlock(wide, 'wide', 11, 11 - i);
  lines.push(run('wide tower', ls, wide, true));
  const mixed = emptyBuild(); placeBlock(mixed, 'wide', 11, 11); placeBlock(mixed, 'wide', 11, 10); placeBlock(mixed, 'block', 12, 9); placeBlock(mixed, 'block', 12, 8);
  lines.push(run('mixed tower', ls, mixed, true));
  const lr = makeLevel('roof', 1);
  const good = emptyBuild();
  placeSegment(good, 'pillar', 10, 10, 10, 7); placeSegment(good, 'pillar', 14, 10, 14, 7); placeSegment(good, 'beam', 10, 7, 12, 7); placeSegment(good, 'beam', 12, 7, 14, 7); placeSegment(good, 'brace', 10, 10, 12, 7); placeSegment(good, 'brace', 14, 10, 12, 7);
  lines.push(run('braced roof', lr, good));
  const flat = emptyBuild();
  placeSegment(flat, 'pillar', 10, 10, 10, 7); placeSegment(flat, 'pillar', 14, 10, 14, 7); placeSegment(flat, 'long', 10, 7, 14, 7);
  lines.push(run('long beam roof', lr, flat));
  const ll = makeLevel('lift', 2);
  for (const px of [7, 8, 9, 10]) { const b = emptyBuild(); b.pivotX = px; lines.push(run(`lift tier2 pivot ${px}`, ll, b)); }
  console.log('\n' + lines.join('\n'));
});
