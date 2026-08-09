import type { TaskRunner } from './runner';
import { quickfire } from './tasks/quickfire';
import { sortit } from './tasks/sortit';
import { numberpath } from './tasks/numberpath';
import { measureit } from './tasks/measureit';
import { buildit } from './tasks/buildit';

/**
 * Task archetype registry (§5.3). Adding archetype #9 later: implement a
 * TaskModule in ./tasks/, register it here, document it in AUTHORING.md.
 * (CIRCUIT-IT, SHADOW-IT, and FRACTION-FORGE arrive with Worlds 3–5.)
 */
export function registerTaskModules(runner: TaskRunner): void {
  runner.register('quickfire', quickfire);
  runner.register('sortit', sortit);
  runner.register('numberpath', numberpath);
  runner.register('measureit', measureit);
  runner.register('buildit', buildit);
}
