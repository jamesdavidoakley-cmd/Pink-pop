/**
 * Dev-server content validation: every /content file is checked against its
 * schema at load (mirrors scripts/validate.mjs, which is the CI gate).
 * Only ever imported in dev — production bundles exclude ajv entirely.
 */
export async function validateContentDev(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const { default: Ajv } = await import('ajv');
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schemaFiles = import.meta.glob('/content/schemas/*.json', { eager: true }) as Record<string, { default?: unknown }>;
  const schemas = new Map<string, ReturnType<typeof ajv.compile>>();
  for (const [path, mod] of Object.entries(schemaFiles)) {
    const name = path.split('/').pop()!.replace('.schema.json', '');
    schemas.set(name, ajv.compile((mod.default ?? mod) as object));
  }
  const dirToSchema: Record<string, string> = {
    strings: 'strings', voices: 'voices', dialogue: 'dialogue', questions: 'questions',
    tasks: 'tasks', enemies: 'enemies', bosses: 'bosses', movesets: 'movesets',
    levels: 'levels', music: 'music',
  };
  const files = import.meta.glob('/content/**/*.json', { eager: true }) as Record<string, { default?: unknown }>;
  let errors = 0;
  for (const [path, mod] of Object.entries(files)) {
    const m = path.match(/\/content\/(?:([^/]+)\/)?([^/]+)\.json$/);
    if (!m) continue;
    const [, dir, base] = m;
    if (dir === 'schemas') continue;
    const schemaName = !dir ? (base === 'config' ? 'config' : base === 'characters' ? 'characters' : null) : dirToSchema[dir] ?? null;
    if (!schemaName) continue;
    const validate = schemas.get(schemaName);
    if (!validate) continue;
    const doc = mod.default ?? mod;
    if (!validate(doc)) {
      errors++;
      console.error(`[content] ${path} fails ${schemaName} schema:`, validate.errors);
    }
  }
  if (errors === 0) console.info(`[content] all ${Object.keys(files).length} content files valid`);
}
