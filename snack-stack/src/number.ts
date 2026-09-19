// Pure number helpers — no DOM, no three.js. Everything here is unit-tested.

export type Place = 0 | 1 | 2 | 3; // ones, tens, hundreds, thousands
export const PLACES: Place[] = [0, 1, 2, 3];
export const PLACE_NAMES = ['ones', 'tens', 'hundreds', 'thousands'] as const;
export const BLOCK_NAMES = ['cookie', 'pack', 'box', 'crate'] as const;
export const PLACE_VALUE = [1, 10, 100, 1000] as const;

/** Standard digits of n (0..10000) as per-place counts, ones first. 10000 → [0,0,0,10]. */
export function digitsOf(n: number): number[] {
  if (n >= 10000) return [0, 0, 0, 10];
  return [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10, Math.floor(n / 1000) % 10];
}

export function valueOf(counts: number[]): number {
  return counts.reduce((sum, c, i) => sum + c * PLACE_VALUE[i], 0);
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t];
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (!h) return below100(rest);
  return rest ? `${ONES[h]} hundred and ${below100(rest)}` : `${ONES[h]} hundred`;
}

/** British English words: 347 → "three hundred and forty-seven". Supports 0..10000. */
export function toWords(n: number): string {
  if (n === 10000) return 'ten thousand';
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  if (!rest) return `${ONES[th]} thousand`;
  const joiner = rest < 100 ? ' and ' : ', ';
  return `${ONES[th]} thousand${joiner}${below1000(rest)}`;
}

/** 1234 → "1,234" */
export function withCommas(n: number): string {
  return n.toLocaleString('en-GB');
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Deterministic PRNG so rounds can be replayed in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
