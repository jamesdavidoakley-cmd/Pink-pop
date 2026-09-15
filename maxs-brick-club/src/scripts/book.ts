/**
 * Book page state machine — a straight port of the prototype's renderVals().
 *
 *   state = { cls: 'mini' | 'club', date: 0..5, kids: 1..4, booked: boolean }
 *
 * Dates are the next six Saturdays from today (never today), computed in the
 * browser so they are never stale.  Spots = seed[i] + 2 for Mini Bricks.
 * Price = £5 for the first builder + £4 for each additional one.
 *
 * Markup contract (see src/pages/book.astro):
 *   [data-pick-club="mini|club"]  [data-dates] > [data-date-index]  [data-kids-minus] [data-kids-plus]
 *   [data-kids] [data-sum-club] [data-sum-time] [data-sum-date] [data-sum-kids] [data-total] [data-pay-total]
 *   [data-confirm] (type=submit) [data-book-form] [data-booking] [data-success] [data-done-kids] [data-done-club] [data-done-date]
 *   [data-book-another]
 */
import { saturdayLabels } from './saturdays';

type Cls = 'mini' | 'club';

interface State {
  cls: Cls;
  date: number;
  kids: number;
  booked: boolean;
}

const SPOTS_SEED = [7, 3, 11, 1, 9, 6];
const CLUB_NAME: Record<Cls, string> = { mini: "Max's Mini Bricks", club: "Max's Brick Club" };
const CLUB_TIME: Record<Cls, string> = { mini: '9:30–10:30', club: '10:30–11:30' };

const state: State = { cls: 'club', date: 0, kids: 1, booked: false };

// Deep links from the class cards: /book/?club=mini|club
const preset = new URLSearchParams(window.location.search).get('club');
if (preset === 'mini' || preset === 'club') state.cls = preset;

// Next six Saturdays (never today), formatted `Sat 19 Sep` — see saturdays.ts.
const dateLabels = saturdayLabels();

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel));

const el = {
  booking: $('[data-booking]'),
  success: $('[data-success]'),
  form: $<HTMLFormElement>('[data-book-form]'),
  dates: $('[data-dates]'),
  kids: $('[data-kids]'),
  sumClub: $('[data-sum-club]'),
  sumTime: $('[data-sum-time]'),
  sumDate: $('[data-sum-date]'),
  sumKids: $('[data-sum-kids]'),
  total: $('[data-total]'),
  payTotal: $('[data-pay-total]'),
  doneKids: $('[data-done-kids]'),
  doneClub: $('[data-done-club]'),
  doneDate: $('[data-done-date]'),
};

function setText(node: HTMLElement | null, text: string) {
  if (node && node.textContent !== text) node.textContent = text;
}

function renderDates() {
  if (!el.dates) return;
  const extra = state.cls === 'mini' ? 2 : 0;
  const rows = SPOTS_SEED.map((seed, i) => {
    const spots = seed + extra;
    const selected = state.date === i;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = selected ? 'date is-selected' : 'date';
    row.dataset.dateIndex = String(i);
    row.setAttribute('aria-pressed', String(selected));

    const label = document.createElement('span');
    label.className = 'date__label';
    label.textContent = dateLabels[i];

    const pill = document.createElement('span');
    pill.className = spots <= 3 ? 'pill pill--low' : 'pill';
    pill.textContent = spots <= 3 ? `${spots} left!` : `${spots} spots`;

    row.append(label, pill);
    return row;
  });
  el.dates.replaceChildren(...rows);
}

function render() {
  const price = 5 + Math.max(0, state.kids - 1) * 4;
  const total = `£${price}`;

  for (const tile of $$('[data-pick-club]')) {
    const selected = tile.dataset.pickClub === state.cls;
    tile.classList.toggle('is-selected', selected);
    tile.setAttribute('aria-pressed', String(selected));
  }

  renderDates();

  setText(el.kids, String(state.kids));
  setText(el.sumClub, CLUB_NAME[state.cls]);
  setText(el.sumTime, CLUB_TIME[state.cls]);
  setText(el.sumDate, dateLabels[state.date]);
  setText(el.sumKids, String(state.kids));
  setText(el.total, total);
  setText(el.payTotal, total);

  setText(el.doneKids, String(state.kids));
  setText(el.doneClub, CLUB_NAME[state.cls]);
  setText(el.doneDate, dateLabels[state.date]);

  if (el.booking) el.booking.hidden = state.booked;
  if (el.success) el.success.hidden = !state.booked;
}

function confirmBooking() {
  state.booked = true;
  render();
  window.scrollTo(0, 0);
}

// ---- Events ----------------------------------------------------------------
for (const tile of $$('[data-pick-club]')) {
  tile.addEventListener('click', () => {
    const cls = tile.dataset.pickClub;
    if (cls === 'mini' || cls === 'club') { state.cls = cls; render(); }
  });
}

el.dates?.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-date-index]');
  if (!row) return;
  const i = Number(row.dataset.dateIndex);
  if (Number.isInteger(i) && i >= 0 && i < SPOTS_SEED.length) { state.date = i; render(); }
});

$('[data-kids-minus]')?.addEventListener('click', () => { state.kids = Math.max(1, state.kids - 1); render(); });
$('[data-kids-plus]')?.addEventListener('click', () => { state.kids = Math.min(4, state.kids + 1); render(); });

// The PAY button is the form's submit button, so clicking it and pressing Enter
// in any input both arrive here.
el.form?.addEventListener('submit', (event) => { event.preventDefault(); confirmBooking(); });

$('[data-book-another]')?.addEventListener('click', () => {
  state.booked = false;
  state.date = (state.date + 1) % SPOTS_SEED.length;
  render();
});

render();
