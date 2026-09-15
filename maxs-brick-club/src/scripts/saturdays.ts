/**
 * The next six Saturdays, shared by the Book page's build-time skeleton
 * (src/pages/book.astro) and its client script (src/scripts/book.ts) so the
 * server-rendered fallback and the browser render agree character for character.
 *
 * Labels are formatted by hand as `Sat 19 Sep` (the handoff's en-GB format):
 * `toLocaleDateString` output varies by ICU version ("Sat, 19 Sept" in recent
 * Chromium, "Sat 19 Sept" in Node 22), which would make the text change after
 * hydration.
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SATURDAY_COUNT = 6;

export function formatDate(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** First Saturday strictly after `today`, then weekly — never today itself. */
export function nextSaturdays(today: Date = new Date(), count: number = SATURDAY_COUNT): Date[] {
  const d0 = new Date(today);
  d0.setDate(today.getDate() + (((6 - today.getDay() + 7) % 7) || 7));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(d0);
    d.setDate(d0.getDate() + i * 7);
    return d;
  });
}

export function saturdayLabels(today: Date = new Date(), count: number = SATURDAY_COUNT): string[] {
  return nextSaturdays(today, count).map(formatDate);
}
