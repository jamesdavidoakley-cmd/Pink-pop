"""Bundle the flat preview build into ONE self-contained HTML file:
inline CSS, fonts as data URIs, all seven screens in the DOM with a hash router (#/classes …)."""
import re, base64, html, os, hashlib, json
P = '.preview'
PAGES = [('home','index.html','/'),('classes','classes.html','/classes/'),('times','times.html','/times/'),
         ('parties','parties.html','/parties/'),('about','about.html','/about/'),('book','book.html','/book/'),('contact','contact.html','/contact/')]
def read(p): return open(os.path.join(P,p), encoding='utf-8').read()

# ---- CSS: concatenate every stylesheet once, embed fonts
css_files = []
for _, f, _ in PAGES:
    for m in re.finditer(r'<link rel="stylesheet" href="/(_astro/[^"]+)">', read(f)):
        if m.group(1) not in css_files: css_files.append(m.group(1))
css = '\n'.join(read(c) for c in css_files)
def font_uri(m):
    data = base64.b64encode(open(os.path.join(P,'fonts',m.group(1)),'rb').read()).decode()
    return f"url(data:font/woff2;base64,{data})"
css = re.sub(r"url\(/fonts/([^)]+)\)", font_uri, css)
css += "\n/* single-file preview: one screen visible at a time */\n.site__main[hidden]{display:none}\n"

# ---- Pages: header/footer from home, one <main> per screen, scripts deduped
first = read('index.html')
header = re.search(r'(<header class="header".*?</header>)', first, re.S).group(1)
announce = re.search(r'(<div class="announce">.*?</div>)', first, re.S)
footer = re.search(r'(<footer class="footer".*?</footer>)', first, re.S).group(1)
mains, scripts, titles = [], {}, {}
for key, f, route in PAGES:
    doc = read(f)
    titles[key] = html.unescape(re.search(r'<title>(.*?)</title>', doc).group(1))
    main = re.search(r'(<main class="site__main"[^>]*>.*?</main>)', doc, re.S).group(1)
    main = main.replace('<main class="site__main"', f'<main class="site__main" data-route="{key}"' + ('' if key=='home' else ' hidden'), 1)
    mains.append(main)
    for m in re.finditer(r'<script type="module"(?: src="/(_astro/[^"]+)")?>(.*?)</script>', doc, re.S):
        src = read(m.group(1)) if m.group(1) else m.group(2)
        # inline sibling chunks (`import"./enquiry.xxx.js"`) so the file stands alone
        def inline_import(mm):
            return read('_astro/' + mm.group(1)) + '\n'
        for _ in range(3):
            src = re.sub(r'import\s*"\./([^"]+)";?', inline_import, src)
        scripts.setdefault(hashlib.md5(src.encode()).hexdigest(), src)
body = (announce.group(1) if announce else '') + header + '\n' + '\n'.join(mains) + '\n' + footer

# ---- Links → hash routes
ROUTES = {'/': '#/', '/classes/': '#/classes', '/times/': '#/times', '/parties/': '#/parties', '/about/': '#/about', '/book/': '#/book', '/contact/': '#/contact'}
def relink(m):
    url = m.group(1); path, q = (url.split('?',1)+[''])[:2]
    if path in ROUTES: return f'href="{ROUTES[path]}{"?"+q if q else ""}"'
    return m.group(0)
body = re.sub(r'href="(/[^"]*)"', relink, body)
body = body.replace('src="/images/', 'src="images/')

# ---- Scripts: deep-link query comes from the hash in single-file mode
HASH_Q = '("?"+(location.hash.split("?")[1]||""))'
# one <script type="module"> per bundle so their top-level consts never collide
js = '\n'.join('<script type="module">\n' + src.replace('window.location.search', HASH_Q).replace('location.search', HASH_Q) + '\n</script>' for src in scripts.values())
router = """
// Hash router for the single-file preview: #/classes, #/book?club=mini …
const TITLES = %s;
const NAV_ROUTES = ['/','/classes/','/times/','/parties/','/about/','/contact/'];
function route() {
  const hash = location.hash || '#/';
  const key = (hash.slice(2).split('?')[0] || 'home').replace(/\\/$/, '') || 'home';
  let found = false;
  for (const main of document.querySelectorAll('main[data-route]')) { const on = main.dataset.route === key; main.hidden = !on; found = found || on; }
  if (!found) { location.hash = '#/'; return; }
  document.title = TITLES[key] || document.title;
  for (const a of document.querySelectorAll('.nav__link')) { const on = a.getAttribute('href') === '#/' + (key === 'home' ? '' : key); if (on) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); }
  document.getElementById('site-nav')?.classList.remove('is-open');
  document.querySelector('[data-nav-toggle]')?.setAttribute('aria-expanded','false');
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event('routechange'));
}
window.addEventListener('hashchange', route);
route();
""" % json.dumps(titles)
# Book page reads the deep link once at load; re-apply it whenever the route changes to #/book?club=…
router += """
window.addEventListener('routechange', () => {
  const club = new URLSearchParams(location.hash.split('?')[1] || '').get('club');
  if (club === 'mini' || club === 'club') document.querySelector(`[data-pick-club="${club}"]`)?.click();
});
"""

head_extra = re.search(r'<meta name="description"[^>]*>', first).group(0)
favicon = 'data:image/svg+xml;base64,' + base64.b64encode(open(os.path.join(P,'favicon.svg'),'rb').read()).decode()
out = f"""<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(titles['home'])}</title>
{head_extra}
<meta name="theme-color" content="#E3000B">
<link rel="icon" href="{favicon}" type="image/svg+xml">
<!--
  Max's Brick Club — single-file build of the whole site (7 screens, hash routing: #/classes, #/book?club=mini …).
  Generated from the Astro source in maxs-brick-club/ (see README there). Fonts: Luckiest Guy + Nunito, SIL OFL, embedded.
  Photos are placeholder cards until home-01.jpg / about-01.jpg / about-02.jpg exist in an images/ folder next to this file.
-->
<style>
{css}
</style>
</head>
<body>
<div class="site">
{body}
</div>
{js}
<script type="module">
{router}
</script>
</body>
</html>
"""
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'maxs-brick-club.html'),'w',encoding='utf-8').write(out)
print('bytes', len(out.encode()), 'scripts', len(scripts), 'css files', css_files)
