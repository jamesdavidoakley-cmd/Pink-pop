// The tower model: four columns of blocks (gems, rods, slabs, cubes).
// Carrying = fusing ten of a kind into one of the next. Borrowing = smashing one into ten.
import { digitsOf, valueOf, PLACE_VALUE, type Place } from './number';

export type TowerEvent =
  | { type: 'add'; place: Place }
  | { type: 'remove'; place: Place }
  | { type: 'fuse'; place: Place } // ten blocks at `place` became one block at place+1
  | { type: 'smash'; place: Place }; // one block at `place` became ten blocks at place-1

export const MAX_THOUSANDS = 10; // the city tops out at 10,000

export class Tower {
  counts: number[] = [0, 0, 0, 0];

  set(n: number): void {
    this.counts = digitsOf(n);
  }

  value(): number {
    return valueOf(this.counts);
  }

  canAdd(place: Place): boolean {
    return this.value() + PLACE_VALUE[place] <= MAX_THOUSANDS * 1000;
  }

  add(place: Place): TowerEvent[] {
    if (!this.canAdd(place)) return [];
    const events: TowerEvent[] = [{ type: 'add', place }];
    this.counts[place]++;
    let p = place;
    while (p < 3 && this.counts[p] >= 10) {
      this.counts[p] -= 10;
      this.counts[p + 1]++;
      events.push({ type: 'fuse', place: p as Place });
      p++;
    }
    return events;
  }

  canRemove(place: Place): boolean {
    return this.counts[place] > 0;
  }

  remove(place: Place): TowerEvent[] {
    if (!this.canRemove(place)) return [];
    this.counts[place]--;
    return [{ type: 'remove', place }];
  }

  canSmash(place: Place): boolean {
    return place > 0 && this.counts[place] > 0 && this.counts[place - 1] <= 9;
  }

  smash(place: Place): TowerEvent[] {
    if (!this.canSmash(place)) return [];
    this.counts[place]--;
    this.counts[place - 1] += 10;
    return [{ type: 'smash', place }];
  }

  /** True when every column holds a standard digit (no column ≥ 10, except 10 cubes = 10,000). */
  isStandard(): boolean {
    return this.counts[0] < 10 && this.counts[1] < 10 && this.counts[2] < 10 && this.counts[3] <= MAX_THOUSANDS;
  }
}
