# Max's Brick Club — website

Marketing + booking site for a Saturday kids' brick-building club in Hove. Built from the
high-fidelity design handoff (`Max's Brick Club Website.dc.html`, concept 1a) as a static
[Astro](https://astro.build) site: plain HTML/CSS per page, a little vanilla TypeScript for
the booking flow and the enquiry forms, no UI framework.

## Run it

```bash
cd maxs-brick-club
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
npm test           # build first; drives dist/ with Playwright (routes, nav, booking flow, forms)
```

## Pages

| Route | File | Notes |
|---|---|---|
| `/` | `src/pages/index.astro` | Hero, two clubs, how a session goes, timetable strip, parties banner, FAQ |
| `/classes/` | `src/pages/classes.astro` | Two class cards, "Not sure which club?", £5 strip |
| `/times/` | `src/pages/times.astro` | Saturday timetable, price card, venue card + map |
| `/parties/` | `src/pages/parties.astro` | Green page: packages, steps, enquiry form |
| `/about/` | `src/pages/about.astro` | Father & son, team cards, beliefs, the grown-up bit |
| `/book/` | `src/pages/book.astro` + `src/scripts/book.ts` | Club → Saturday → builders → summary → success |
| `/contact/` | `src/pages/contact.astro` | Contact details + form |

Shared pieces: `src/layouts/Base.astro` (head, announcement bar, header, footer),
`src/components/Header.astro` / `Footer.astro`, `src/styles/global.css` (design tokens and
shared classes), `src/scripts/enquiry.ts` (form behaviour).

## Settings — `src/site.config.ts`

Everything the client still needs to supply lives in one file:

- `showAnnouncement` / `announcement` — the ink strip above the header.
- `bookingMode` — `'online'` (CTAs say **BOOK A SPOT** → `/book/`) or `'enquire'` (CTAs say
  **ENQUIRE** → `/contact/`).
- `venue.name`, `venue.street`, `venue.postcode`, `venue.mapEmbedUrl` — the Times & Prices
  venue card. Leave `mapEmbedUrl` empty for the placeholder box; set it to a Google Maps embed
  URL (`https://www.google.com/maps?q=<address>&output=embed`) to show a real map.
- `maxAge`, `dadName`, `safety.*` — About page placeholders.
- `email`, `phone`, `instagramUrl`, `facebookUrl`.
- `formEndpoint` — where the Parties and Contact forms POST (Formspree, Netlify Forms, Basin…).
  Empty = the forms only flip to "SENT! WE'LL REPLY SOON" without sending anything.

## Booking

`/book/` reproduces the prototype end to end: club toggle, the next six Saturdays (computed in
the browser, `Sat 19 Sep` format), spots pills (red "N left!" at ≤ 3), 1–4 builders at
£5 + £4 per extra child, sticky summary, "PAY £N & BOOK" and the green success card. It is a
front-end only: **no payment is taken**. Wire it to a booking provider before launch. The
handoff recommends Bookwhen or Class4Kids: replace the three cards + summary in
`src/pages/book.astro` with their embed and keep the page header. The `?club=mini` /
`?club=club` deep links from the class cards preset the club.

## Photos

Placeholders until real photos are dropped into `public/images/` — see
`public/images/README.md` for file names and briefs.

## Fonts

Luckiest Guy and Nunito (variable) are self-hosted in `public/fonts/` (SIL Open Font License,
the same subsets Google Fonts serves), so nothing is loaded from third parties.

## Deploy

Static output, any host works. Netlify: set base directory `maxs-brick-club` (the included
`netlify.toml` handles the rest). Vercel / Cloudflare Pages: framework preset Astro, root
directory `maxs-brick-club`, output `dist`. Update `site` in `astro.config.mjs` and
`site.url` in `src/site.config.ts` when the domain is confirmed (they feed canonical URLs,
Open Graph tags and the sitemap).

## Still needed from the client

Venue name/address, phone/WhatsApp, Max's age, Dad's name, DBS / first-aid / insurance wording,
final party prices and deposit (current figures are proposed), holiday dates, booking provider
account, the three photos, and where the forms should send.
