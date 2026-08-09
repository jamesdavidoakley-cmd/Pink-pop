import { expect, test } from '@playwright/test';

/**
 * Smoke suite: boot → new game → hub renders → enter Fossil Canyon → a spoken
 * question begins → save persists across reload. Zero console errors allowed.
 */

test('boot → new game → hub → W1 → spoken question → save/reload, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    // wipe once per test, not on the mid-test reload (window.name survives)
    if (window.name !== 'smoke-kept') {
      localStorage.clear();
      window.name = 'smoke-kept';
    }
    localStorage.setItem('maxfossils.settings', JSON.stringify({ voiceOn: false, musicVolume: 0, sfxVolume: 0 }));
  });

  // boot → title
  await page.goto('/');
  await expect(page.locator('.menu-title')).toContainText('Max & the Star Fossils', { timeout: 30_000 });

  // new game on slot 1 → hub loads, HUD visible
  await page.locator('.menu-btn').first().click();
  await page.waitForFunction(() => (window as never as { __game?: { player?: unknown } }).__game?.player, null, { timeout: 30_000 });
  await expect(page.locator('.hud')).toBeVisible();

  // the intro cutscene speaks (subtitles carry it even with voices off) — skip through
  await expect(page.locator('.subtitle-bar.visible')).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 30; i++) {
    const active = await page.evaluate(() => (window as never as { __game: { dialogue: { cutsceneActive: boolean } } }).__game.dialogue.cutsceneActive);
    if (!active && i > 3) break;
    await page.keyboard.press('e');
    await page.waitForTimeout(200);
  }

  // enter Fossil Canyon
  await page.evaluate(() => (window as never as { __game: { goto: (id: string) => void } }).__game.goto('w1'));
  await page.waitForFunction(
    () => (window as never as { __game: { scene?: { def?: { id?: string } } } }).__game.scene?.def?.id === 'w1',
    null, { timeout: 30_000 },
  );

  // start the Counting Causeway chain → its rule is SPOKEN (subtitle appears)
  await page.evaluate(() => {
    const w = window as never as { __game: { scene: { def: { tasks: { ref: string; pos: [number, number, number] }[] } }; player: { pos: { set(x: number, y: number, z: number): void } } } };
    const t = w.__game.scene.def.tasks.find((x) => x.ref === 'w1-path')!;
    w.__game.player.pos.set(t.pos[0] + 0.5, t.pos[1] + 0.5, t.pos[2] + 0.5);
  });
  // the loading screen blocks interactions for a beat — press until it takes
  await expect(async () => {
    await page.keyboard.press('e');
    await page.waitForTimeout(350);
    const active = await page.evaluate(
      () => (window as never as { __game: { scene: { runner: { isActive: boolean } } } }).__game.scene.runner.isActive,
    );
    expect(active).toBe(true);
  }).toPass({ timeout: 30_000 });
  await expect(page.locator('.subtitle-bar.visible')).toBeVisible({ timeout: 20_000 });

  // collect nothing, but the visit persists: reload → continue → same level id
  const before = await page.evaluate(() => (window as never as { __game: { session: { data: { lastLevel: string } } } }).__game.session.data.lastLevel);
  expect(before).toBe('w1');
  await page.goto('/');
  await page.locator('.menu-btn').first().click();
  await page.waitForFunction(() => (window as never as { __game?: { scene?: { def?: { id?: string } } } }).__game?.scene?.def?.id === 'w1', null, { timeout: 30_000 });

  expect(errors, `console errors:\n${errors.join('\n')}`).toHaveLength(0);
});

test('playground gymnasium: run + jump work end to end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('maxfossils.settings', JSON.stringify({ voiceOn: false, musicVolume: 0, sfxVolume: 0 }));
  });
  await page.goto('/?level=playground&slot=2');
  await page.waitForFunction(() => (window as never as { __game?: { player?: unknown } }).__game?.player, null, { timeout: 30_000 });
  await page.waitForTimeout(1500); // let software-GL shader compiles settle
  const posOf = () => page.evaluate(() => {
    const p = (window as never as { __game: { player: { pos: { x: number; y: number; z: number }; grounded: boolean } } }).__game.player;
    return { x: p.pos.x, y: p.pos.y, z: p.pos.z, grounded: p.grounded };
  });
  const start = await posOf();
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  const moved = await posOf();
  expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(2);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const air = await posOf();
  expect(air.y).toBeGreaterThan(moved.y + 0.2);
  expect(errors).toHaveLength(0);
});
