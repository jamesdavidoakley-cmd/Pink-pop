# Shelf Pals

A drag-and-drop toy-shelf game for 3 to 4 year olds. Forty original figurine-style friends, four places to put them (toy shelf, spooky house, lava castle, pirate ship), and eight big buttons that make everyone dance, jump off, spin, wave, sing, sleep, play peekaboo or line back up.

Everything is in one file. No downloads, accounts, ads or network calls. Sounds are synthesised in the browser.

## Play it

- **On a phone or tablet (easiest):** open `index.html` from a web link, then use the browser's *Add to Home Screen*. The service worker caches the game so it keeps working with no connection.
- **Android, no link:** copy `index.html` to the device and open it with Chrome.
- **Computer:** double-click `index.html`.

## Files

| File | What |
|---|---|
| `index.html` | The whole game (characters, scenes, sounds, logic) |
| `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | Home-screen install metadata |
| `sw.js` | Offline cache (only used when served over https) |

## How it plays

- Tap a friend in the bottom tray to pop them onto a shelf, or drag them up onto the exact spot you want.
- Drag a friend higher on a shelf to put them behind the others; lower brings them to the front (they get a little bigger too).
- After **Jump off**, the friends on the floor light up again in the tray (gold ring and arrow). Tap one to send them back up onto a shelf, or drag the tile to put them exactly where you want. **Line up** brings everyone back at once.
- Drag a friend back down to the tray to put them away. Tap a friend on the shelf to hear their name and a giggle.
- Hold the basket button for a second to put everyone away.
- Each place remembers its own arrangement on that device.
