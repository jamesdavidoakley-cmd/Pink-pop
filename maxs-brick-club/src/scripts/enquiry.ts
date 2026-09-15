/**
 * Enquiry / contact forms.
 *
 * Markup contract:  <form data-enquiry> … <button type="submit" data-enquiry-submit>SEND IT</button></form>
 *
 * With no `site.formEndpoint` configured the form just swaps its button label
 * to "SENT! WE'LL REPLY SOON" (the prototype behaviour).  With an endpoint set
 * (Formspree, Netlify Forms, Basin, your own API) the same form POSTs there
 * first and only shows the sent state on success.
 */
import { site } from '../site.config';

const SENT = "SENT! WE'LL REPLY SOON";
const SENDING = 'SENDING…';
const FAILED = "COULDN'T SEND — EMAIL US INSTEAD";

for (const form of document.querySelectorAll<HTMLFormElement>('form[data-enquiry]')) {
  const button = form.querySelector<HTMLButtonElement>('[data-enquiry-submit]');
  if (!button) continue;
  button.setAttribute('aria-live', 'polite');
  const original = button.textContent ?? 'SEND IT';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.sent === 'true') return;

    if (!site.formEndpoint) {
      markSent();
      return;
    }

    button.disabled = true;
    button.textContent = SENDING;
    try {
      const res = await fetch(site.formEndpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      markSent();
    } catch {
      button.disabled = false;
      button.textContent = FAILED;
      window.setTimeout(() => { button.textContent = original; }, 4000);
    }
  });

  function markSent() {
    // Prototype behaviour: the button just relabels; further clicks are ignored via data-sent.
    form.dataset.sent = 'true';
    if (button) { button.disabled = false; button.textContent = SENT; }
  }
}
