/**
 * Site-wide settings and the client-supplied content that is still
 * outstanding (see README → "Content still needed").  Everything in
 * square brackets is a placeholder that shows verbatim on the site
 * until it is replaced here.
 */
export type BookingMode = 'online' | 'enquire';

export const site = {
  name: "Max's Brick Club",
  url: 'https://maxsbrickclub.co.uk',
  description:
    "Saturday brick-building club for kids in Hove. Max's Mini Bricks (ages 2–4, 9:30) and Max's Brick Club (ages 4–7, 10:30). £5 a session, plus brick birthday parties.",

  /** Ink strip above the header. */
  showAnnouncement: true,
  announcement:
    'New for autumn: Saturday sessions now bookable online. First session? Just turn up.',

  /**
   * 'online'  → CTAs read "BOOK A SPOT" and go to /book/
   * 'enquire' → CTAs read "ENQUIRE" and go to /contact/
   */
  bookingMode: 'online' as BookingMode,

  email: 'hello@maxsbrickclub.co.uk',
  phone: '[Phone / WhatsApp]',
  instagram: 'maxsbrickclub',
  instagramUrl: 'https://instagram.com/maxsbrickclub',
  facebookUrl: 'https://facebook.com/maxsbrickclub',

  venue: {
    name: '[Venue name]',
    street: '[Street address]',
    postcode: 'Hove BN3 [___]',
    /**
     * Google Maps embed URL for the Times & Prices page.  Leave empty to
     * show the "MAP PLACEHOLDER" box.  Example (no API key needed):
     * 'https://www.google.com/maps?q=Venue+Name,+Hove+BN3&output=embed'
     */
    mapEmbedUrl: '',
  },

  /** About page placeholders. */
  maxAge: "[Max's age]",
  dadName: '[Your name]',
  safety: {
    dbs: '[Enhanced DBS check status]',
    firstAid: '[Paediatric first aid status]',
    insurance: '[Public liability insurance]',
  },

  /**
   * Where the enquiry / contact forms POST.  Leave empty and the forms
   * only swap the button to "SENT! WE'LL REPLY SOON" (the prototype
   * behaviour).  Set to a Formspree-style endpoint, e.g.
   * 'https://formspree.io/f/xxxxxxx', and the same UI submits for real.
   */
  formEndpoint: '',
} as const;

export const cta = {
  label: site.bookingMode === 'online' ? 'BOOK A SPOT' : 'ENQUIRE',
  href: site.bookingMode === 'online' ? '/book/' : '/contact/',
  /** Deep links from the class cards preset the club on the Book page. */
  mini: site.bookingMode === 'online' ? '/book/?club=mini' : '/contact/',
  club: site.bookingMode === 'online' ? '/book/?club=club' : '/contact/',
};

export const nav = [
  { label: 'Home', href: '/' },
  { label: 'Classes', href: '/classes/' },
  { label: 'Times & Prices', href: '/times/' },
  { label: 'Parties', href: '/parties/' },
  { label: 'About', href: '/about/' },
  { label: 'Contact', href: '/contact/' },
] as const;
