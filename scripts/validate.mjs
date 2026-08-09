#!/usr/bin/env node
/**
 * Content gate: validates every file under /content against its JSON Schema,
 * then runs cross-file invariants (refs resolve, pool minimums, fossil counts,
 * chip budgets). CI fails if any check fails. Run: npm run validate
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const contentDir = join(root, 'content');

const errors = [];
const warnings = [];

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    errors.push(`${relative(root, p)}: invalid JSON — ${e.message}`);
    return null;
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.json')) yield p;
  }
}

// ---- 1. Schema validation ---------------------------------------------------
const ajv = new Ajv({ allErrors: true, strict: false });
const schemaDir = join(contentDir, 'schemas');
const schemas = {};
for (const p of walk(schemaDir)) {
  const s = readJson(p);
  if (s) schemas[p.split(sep).pop().replace('.schema.json', '')] = ajv.compile(s);
}

const dirToSchema = {
  'strings': 'strings',
  'voices': 'voices',
  'dialogue': 'dialogue',
  'questions': 'questions',
  'tasks': 'tasks',
  'enemies': 'enemies',
  'bosses': 'bosses',
  'movesets': 'movesets',
  'levels': 'levels',
  'music': 'music',
};

const docs = { levels: {}, bosses: {}, movesets: {}, tasks: {}, enemies: {}, questions: {}, voices: {}, dialogue: {}, music: {}, strings: {} };
let config = null;
let characters = null;

for (const p of walk(contentDir)) {
  const rel = relative(contentDir, p).split(sep);
  if (rel[0] === 'schemas') continue;
  const doc = readJson(p);
  if (!doc) continue;
  let schemaName = null;
  if (rel.length === 1 && rel[0] === 'config.json') { schemaName = 'config'; config = doc; }
  else if (rel.length === 1 && rel[0] === 'characters.json') { schemaName = 'characters'; characters = doc; }
  else if (rel.length > 1) schemaName = dirToSchema[rel[0]] ?? null;
  if (!schemaName) { warnings.push(`${relative(root, p)}: no schema mapping — skipped`); continue; }
  const validate = schemas[schemaName];
  if (!validate) { errors.push(`missing schema: ${schemaName}`); continue; }
  if (!validate(doc)) {
    for (const e of validate.errors) errors.push(`${relative(root, p)}: ${e.instancePath || '/'} ${e.message}`);
  }
  if (rel.length > 1 && docs[rel[0]]) {
    const key = doc.id ?? rel[rel.length - 1].replace('.json', '');
    docs[rel[0]][key] = doc;
  }
}

// ---- 2. Cross-file invariants ----------------------------------------------
if (config && characters) {
  const levelIds = new Set(Object.keys(docs.levels));
  const activeChars = Object.entries(characters).filter(([k, v]) => k !== '$schema' && v.active);
  const companionIds = activeChars.filter(([, v]) => v.role === 'companion').map(([k]) => k);
  const askableIds = new Set([...companionIds, ...activeChars.filter(([, v]) => v.role === 'hero').map(([k]) => k)]);

  // Levels: refs + fossil/chip budgets
  for (const [id, lvl] of Object.entries(docs.levels)) {
    if (lvl.music && !docs.music[lvl.music]) errors.push(`level ${id}: unknown music '${lvl.music}'`);
    for (const f of lvl.fossils ?? []) {
      if (f.taskId && !docs.tasks[f.taskId]) errors.push(`level ${id}: fossil ${f.id} references unknown task '${f.taskId}'`);
      if (f.arenaId && !levelIds.has(f.arenaId)) errors.push(`level ${id}: fossil ${f.id} references unknown arena '${f.arenaId}'`);
    }
    for (const e of lvl.enemies ?? []) {
      if (!docs.enemies[e.archetype]) errors.push(`level ${id}: unknown enemy archetype '${e.archetype}'`);
    }
    for (const t of lvl.tasks ?? []) {
      if (!docs.tasks[t.ref]) errors.push(`level ${id}: unknown task ref '${t.ref}'`);
    }
    for (const p of lvl.portals ?? []) {
      if (!p.sealed && !levelIds.has(p.to)) errors.push(`level ${id}: portal to unknown level '${p.to}'`);
      if (p.gateKey && config.doors[p.gateKey] === undefined) errors.push(`level ${id}: portal gateKey '${p.gateKey}' not in config.doors`);
    }
    if (lvl.boss && !docs.bosses[lvl.boss]) errors.push(`level ${id}: unknown boss '${lvl.boss}'`);
    if (lvl.kind === 'world') {
      const n = (lvl.fossils ?? []).length;
      if (n !== 7) errors.push(`level ${id}: worlds must define exactly 7 fossils (6 quest + 1 bonus), found ${n}`);
      const chips = (lvl.chips ?? []).reduce((s, c) => s + (c.count ?? 0), 0);
      if (chips !== config.economy.chipsPerWorld) errors.push(`level ${id}: chip budget must equal ${config.economy.chipsPerWorld}, found ${chips}`);
      const types = (lvl.fossils ?? []).map((f) => f.type);
      for (const req of ['secret', 'platforming', 'arena', 'boss', 'bonus']) {
        if (!types.includes(req)) errors.push(`level ${id}: fossil mix missing required type '${req}'`);
      }
    }
    if (lvl.kind === 'hub') {
      const n = (lvl.fossils ?? []).length;
      if (n !== 3) errors.push(`level ${id}: hub must define exactly 3 fossils, found ${n}`);
    }
  }

  // Bosses: refs. Inactive bosses (characters[id].active === false) are
  // data-complete for the AI sims but their worlds haven't shipped — their
  // arenas may not exist yet.
  for (const [id, b] of Object.entries(docs.bosses)) {
    if (!docs.movesets[b.moveset]) errors.push(`boss ${id}: unknown moveset '${b.moveset}'`);
    if (!docs.voices[b.voicePack]) errors.push(`boss ${id}: unknown voicePack '${b.voicePack}'`);
    const active = characters[id]?.active !== false;
    if (active && b.arena && !levelIds.has(b.arena)) errors.push(`boss ${id}: unknown arena '${b.arena}'`);
    if (!active && b.arena && !levelIds.has(b.arena)) warnings.push(`boss ${id}: arena '${b.arena}' arrives with its world (boss inactive)`);
    if (!characters[id]) warnings.push(`boss ${id}: no character entry (visuals will use defaults)`);
  }

  // Questions: askStyles reference speakable characters; parametric sanity
  for (const [pid, pack] of Object.entries(docs.questions)) {
    for (const q of pack.questions ?? []) {
      for (const s of q.askStyles ?? []) {
        if (!askableIds.has(s) && !companionIds.includes(s)) {
          errors.push(`questions ${pid}/${q.id}: askStyle '${s}' is not an active companion/hero`);
        }
      }
      if (q.choices && q.answerIndex !== undefined && q.answerIndex >= q.choices.length) {
        errors.push(`questions ${pid}/${q.id}: answerIndex out of range`);
      }
    }
  }

  // Voice pools: minimum variant counts for active companions and bosses
  const minC = config.voice.minVariants.companion;
  const minB = config.voice.minVariants.boss;
  const voiceByChar = {};
  for (const v of Object.values(docs.voices)) voiceByChar[v.character] = v;
  for (const [cid, ch] of activeChars) {
    if (ch.role === 'companion' || ch.role === 'hero') {
      const pack = voiceByChar[cid];
      if (!pack) { errors.push(`character ${cid}: active ${ch.role} has no voice pack`); continue; }
      if (ch.role === 'companion') {
        for (const [pool, min] of Object.entries(minC)) {
          const have = (pack.pools[pool] ?? []).length;
          if (have < min) errors.push(`voices ${cid}: pool '${pool}' needs ≥${min} variants, has ${have}`);
        }
      }
    }
    if (ch.role === 'boss' || ch.role === 'miniboss') {
      const pack = voiceByChar[cid];
      if (!pack) { errors.push(`character ${cid}: active boss has no voice pack`); continue; }
      if (ch.role === 'boss') {
        for (const [pool, min] of Object.entries(minB)) {
          const have = (pack.pools[pool] ?? []).length;
          if (have < min) errors.push(`voices ${cid}: pool '${pool}' needs ≥${min} variants, has ${have}`);
        }
      }
    }
  }

  // Tasks: sortit items reference declared bins; buildit matchSlots solutions exist
  for (const [tid, t] of Object.entries(docs.tasks)) {
    if (t.type === 'sortit') {
      const bins = new Set((t.bins ?? []).map((b) => b.id));
      for (const it of t.items ?? []) {
        if (!bins.has(it.bin)) errors.push(`task ${tid}: item '${it.id}' targets unknown bin '${it.bin}'`);
      }
    }
    if (t.type === 'buildit' && t.goal?.kind === 'matchSlots') {
      for (const [slot, opt] of Object.entries(t.goal.solution ?? {})) {
        const s = (t.slots ?? []).find((x) => x.id === slot);
        if (!s) errors.push(`task ${tid}: solution slot '${slot}' not defined`);
        else if (!s.options.some((o) => o.id === opt)) errors.push(`task ${tid}: solution '${slot}→${opt}' not an option`);
      }
    }
    if (t.chain) {
      for (const c of t.chain) if (!docs.tasks[c]) errors.push(`task ${tid}: chain step '${c}' unknown`);
    }
    if (t.topicId && !Object.values(docs.questions).some((p) => p.topic === t.topicId)) {
      warnings.push(`task ${tid}: no question pack for topic '${t.topicId}'`);
    }
  }
}

// ---- Report -----------------------------------------------------------------
for (const w of warnings) console.log(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`\n✖ Content validation FAILED (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
} else {
  const counts = Object.entries(docs).map(([k, v]) => `${Object.keys(v).length} ${k}`).join(', ');
  console.log(`✔ Content valid (${counts})`);
}
