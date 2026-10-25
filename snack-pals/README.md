# Snack Pals

The snack-time edition of Shelf Pals, for 3 to 4 year olds. Pick snacks for the table, count them up to ten, line them up, then press **Eat it!** and a crew of six little yellow goggle-wearing helpers (original characters, minion-inspired) runs in and eats the lot.

One file, no downloads inside, no ads, no network. Sounds are synthesised in the browser.

## Play it

- **Phone or tablet:** open `index.html` from a web link, then *Add to Home Screen*. The service worker caches it for offline play.
- **Android, no link:** copy `index.html` to the device and open it in Chrome.
- **Computer:** double-click `index.html`.

## How it plays

- Tap a snack in the tray to pop it onto the table, or drag it to an exact spot. The big number counts each one out loud (1 to 10).
- At ten snacks the table is full and two buttons appear: **Line up** tidies the snacks into rows, **Eat it!** calls the crew.
- The crew runs in from both sides, each one picks a snack, takes three bites (watch the bite marks), then burps and pats a slightly bigger belly. Fruit gets hearts, veg goes crunch, drinks get slurped, bananas get a cheer.
- Silly things in the tray (a sock, a boot, a rubber duck, soap) get spat out with a "BLEH!".
- When everything is gone they dance, nod off for a nap, then run home. Press **Again!** for another round.
- **Gus** waits by the table the whole time. Drag any snack onto him to feed him straight away. The bubble over his head shows the snack he is wishing for: feed him that one for a big celebration.
- Tap Gus to hear his tummy rumble. Hold the basket button to clear the table.
- Three places: Kitchen, Picnic and Party. Each remembers its own table on that device.

## Files

| File | What |
|---|---|
| `index.html` | The whole game |
| `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | Home-screen install metadata |
| `sw.js` | Offline cache (used when served over https) |
