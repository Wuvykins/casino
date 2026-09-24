# The Casino

A private, Hoyle-Casino-style casino for the phone. Vanilla HTML/JS, no build step, one save on the device.

**Live now:** lobby, bank and five credit-card tiers, Ken's bailout, Texas Hold'em (no-limit cash tables and Sit & Go tournaments — everyone starts with 1,500 chips, blinds climb, bust and you're out, first and second are paid) with personality-driven opponents, Blackjack (6 decks, dealer stands on 17, 3:2, double any two, double after split, split to 4 hands, insurance) with up to two of the family playing beside you, two-handed Cribbage (first to 121, a stake per game, skunks pay double and triple), Farkle (first to 10,000, up to three opponents), and the Van Halen slot machine (skill-stop reels, Hot for Teacher on the pull, Jump on a jackpot — and the house is generous: about one spin in twenty hits).

## Put it on your phone (the real thing)

The game is a web app that installs to the home screen and then runs offline. It needs to live at an https address once; free static hosting is fine — GitHub Pages is the simplest:

1. Make a new **public** repository on github.com (e.g. `casino`), then **Add file → Upload files** and drag the whole contents of this folder in (everything except `node_modules`). Commit.
2. Repo **Settings → Pages → Source: Deploy from a branch → main / (root) → Save.** A minute later it's live at `https://<your-username>.github.io/casino/`.
3. Open that address in **Safari** on the iPhone/iPad, tap **Share → Add to Home Screen**. From then on it opens full-screen from its own icon, in landscape, with no browser bars, and it works with no internet.

Updating: upload the changed files again (run `python3 tools/build_sw.py` first so `sw.js` lists the new version). The phone fetches the update in the background and uses it the next time the app is opened.

## Run it locally

```
python3 serve.py
```

It prints two addresses. Open the phone one in Safari on your iPhone/iPad (same Wi-Fi), tap **Share → Add to Home Screen**, and it runs full-screen like an app. The computer running `serve.py` has to be on when you open it. Play in landscape.

## Two ways to play

- **Live link (for testing as we build):** the game is also published as a Claude artifact. Every change is pushed to the same link; just reload. Saves live on each device that opens it.
- **Home network (the real thing):** `python3 serve.py` on a computer, open the phone address in Safari, Add to Home Screen. Full-screen, works like an app, and you can drop art files in yourself.

## How the money works

- Your money lives in the **bank**. Sitting at a table buys chips out of the bank; leaving cashes them back in.
- Your **card** is re-evaluated every time you cash out (or get bailed out): Basic → Silver ($2,500) → Gold ($5,000) → Platinum ($25,000) → Sovereign ($100,000). Higher cards unlock higher tables. Lose it back and the card downgrades.
- Bust at a table → rebuy from the bank or go to the lobby. Bank too low to play → the **Ask Ken** button appears by the bank statement. Ken gives you the starting $1,000 back and says what he says. (His lines are in `js/content/characters.js` under `BANKER`.)
- Reload mid-session and your chips go back to the bank automatically.

Tier thresholds and table stakes are plain numbers in `js/content/tiers.js` and `js/content/tables.js`.

## Replacing the art

Every piece of art has a fixed file name under `assets/`. Drop a PNG or JPG in with that exact name and it takes over on the next reload; nothing else changes. Settings → "Art files" shows what's still a placeholder. Transparent backgrounds where it makes sense (chips, dealer button, portraits).

| What | File | Size (px) | Notes |
|---|---|---|---|
| Casino floor (lobby background) | `assets/img/lobby/floor.png` or `.jpg` | 2048×1024 | landscape. When present, the five door tiles disappear and the games become tap regions over your painted signs — positions are in `js/content/lobby.js` (`LOBBY_HOTSPOTS`, percentages of the picture; set `SHOW_HOTSPOT_GUIDES = true` to see the boxes while lining them up) |
| Game doors / signs (5) | `assets/img/lobby/door-holdem.png`, `door-blackjack.png`, `door-slots.png`, `door-farkle.png`, `door-cribbage.png` | 600×800 | portrait tiles; name is overlaid at the bottom |
| Cashier window | `assets/img/lobby/cashier.png` | 600×400 | not shown yet — reserved for the bank screen |
| Ken | `assets/img/portraits/ken.png` | 512×512 | shown in the bailout scene |
| Credit cards (5) | `assets/img/cards/credit-1.png` … `credit-5.png` | 860×540 | Basic, Silver, Gold, Platinum, Sovereign. Corners are rounded by the game |
| Poker table | `assets/img/table/felt-holdem.png` | 1774×887 (2:1), transparent outside the rail | in place — Nic's oval table, drawn at ~75% of the play area with the seats around it |
| Blackjack scene | `assets/img/table/felt-blackjack.jpg` | 1774×887 (2:1) | in place — Nic's mockup (whole screen); hands sit in the three painted betting circles |
| Cribbage board | `assets/img/table/cribbage-board.png` | 2138×275 | Nic's board (in place). Two lanes × two rows of 60 holes (one hole per point); hole positions are listed in `BOARD_ART` in `js/ui/cribbageTable.js`. Pegs: `cribbage-peg-gold.png` (yours), `cribbage-peg-red.png` (theirs), 128×128 transparent |
| Dice (6) | `assets/img/dice/1.png` … `6.png` | 256×256 | optional; drawn by the game otherwise |
| Slot machine | `assets/img/slots/background.jpg` + `symbols.jpg` | 1774×887 | in place — the empty cabinet, and the same shot with symbols on the reels (the game crops them out) |
| Farkle scene | `assets/img/table/felt-farkle.jpg` | 1774×887 (2:1) | in place — the whole screen incl. the room; the rail interior is where the dice land |
| Dice cup | `assets/img/farkle/cup.png` | ~660×700, transparent | in place — shaken and tipped before every roll |
| Cribbage table felt | `assets/img/table/felt-cribbage.png` | 2048×1024 | the board is drawn across the top, opponent at left, deck and crib at right, your cards along the bottom; falls back to the poker felt |
| Dealer button | `assets/img/table/dealer-button.png` | 128×128 | |
| Card back | `assets/img/cards/back.png` | 250×350 | |
| Card faces (optional) | `assets/img/cards/AS.png`, `TD.png`, `2C.png` … | 250×350 | rank `2-9 T J Q K A` + suit `S H D C`. Any you don't supply stay drawn by the game |
| Chips (7) | `assets/img/chips/1.png`, `5.png`, `25.png`, `100.png`, `500.png`, `1000.png`, `5000.png` | 256×256 | top-down view; they're stacked with a small offset |
| Portraits | `assets/img/portraits/<id>.png` | 512×512 | one per character. Optional `<id>-happy.png`, `<id>-mad.png` |
| App icon | `assets/img/icon-180.png`, `icon-512.png` | 180 / 512 | home-screen icon |

## The cast

`js/content/characters.js`. Each person has an `id` (used for file names), a `name`, a `tagline`, and five dials from 0 to 1:

| Dial | 0 | 1 |
|---|---|---|
| `skill` | misreads hands and odds, never adjusts to opponents | reads ranges accurately, adjusts to who's betting |
| `tight` | plays every hand | plays only premiums |
| `aggro` | checks and calls | bets and raises |
| `bluff` | never bluffs | bluffs constantly |
| `tilt` | ice | loses a big pot and starts spewing |
| `chatty` | 0.5 = rarely speaks | 2 = talks twice as often (Freddy is 1.8) — every line still shows its text bubble even when a recording plays |

Then `lines`: banter per trigger, each entry either plain text or `{ text, file }` when there's a recording for it (generic lines from `js/content/lines.js` fill any gaps).

## Voice lines

Files go in `assets/voice/<id>/`, and each line in `characters.js` names its own file, e.g. `fold: [{ text: "Not with that.", file: "02-fold.mp3" }, "Nope."]`. Record in anything (iPhone voice memos are .m4a); clips are converted to mp3 for the game so they play on every host. When a recording plays, the text bubble still shows.

Triggers, roughly in order of how often you'll hear them:

| Trigger | When | Suggested takes |
|---|---|---|
| `fold` | they fold | 3 |
| `check` | they check | 2 |
| `call` | they call | 3 |
| `raise` | they bet or raise | 3 |
| `allin` | they go all in | 2 |
| `winSmall` | they win a small pot | 2 |
| `winBig` | they win a pot over 25 big blinds | 3 |
| `lose` | they lose at showdown | 2 |
| `badBeat` | they lose at showdown with a strong hand | 3 |
| `caughtBluff` | they bet, got called, and had nothing | 2 |
| `hit` / `stand` / `double` / `split` | blackjack decisions | 2 each |
| `bust` | they go over 21 | 3 |
| `blackjack` | they're dealt a natural | 2 |
| `push` | they tie the dealer | 1 |
| `dealerBust` | the dealer busts | 2 |
| `cribGo` / `cribPeg` / `cribThirtyOne` | cribbage pegging | 2 each |
| `cribGoodHand` / `cribBadHand` / `cribGoodCrib` / `cribBadCrib` | counting a hand or crib | 2 each |
| `cribHeels` / `cribGameWin` / `cribGameLose` / `cribSkunked` / `cribGotSkunked` | cribbage moments | 1–2 each |
| `fkRoll` / `fkFarkle` / `fkHotDice` / `fkBank` / `fkBankBig` / `fkPush` / `tauntFarkle` | farkle | 2 each |
| `hurry` | you've taken more than 14 s to act | 3 |
| `greet` | when you sit down | 2 |
| `bustOut` | they lose their whole stack | 2 |
| `rebuy` | they buy back in | 1 |
| `playerBust` | **you** bust | 2 |
| `playerWin` | you win a big pot | 2 |
| `idle` | filler | 2 |

Ken has `bailout` and `bailoutAgain`, in `assets/voice/ken/`.

## Sound effects

Synthesised placeholders play until you drop files in `assets/sfx/<name>.mp3` (or .m4a/.wav): `tap chip chips deal flip check call raise fold win bigwin lose allin tierup tierdown bailout shuffle yourturn dice`. Nic's recordings so far: deal, check, call (ante up), raise, allin, lose, dice.

## Leaving and coming back

Settings has **Exit Game**: chips go back to the bank and the app closes (on iPhone and iPad, which don't let a web app close itself, it shows a "Closed for the night" card instead — swipe home from there). The same happens by itself if the phone is locked or the app is put away for more than a minute, so nobody comes back to a hand from yesterday. Everything is saved continuously — there is no separate save step.

## Music and the Setlist

Songs live in `assets/music/song-N.mp3`, numbered from 1 with no gaps (the game stops looking at the first missing number). To add one:

    python3 tools/make_song.py "Some Song.mp3" 26

That trims the lead-in, softens it to sound like a speaker across the room and matches the level of the others. Then add a line for it to `assets/music/setlist.json` (`{ "file": "song-26.mp3", "title": "…", "artist": "…" }`) so it has a name, and run `python3 tools/build_sw.py`. The **Songs** button on Casino Radio (bottom-right of the lobby) opens the Music Library: untick a song to take it out of the shuffle, ▶ plays it right now. Songs stream rather than being stored for offline play (there are too many for the phone to keep), so the music needs a connection; everything else in the game works offline.

## Tests

```
npm test        # hand evaluator, engine rules, chip conservation fuzz, and a cast simulation
npm run test:ui # headless-browser play-through (needs: npm install)
```

`node tests/ai.sim.mjs nolimit 5000` prints a table of how each character does against the others — handy when you tune someone's dials.

## Layout

```
index.html, css/app.css, serve.py
js/core/      cards, evaluator, poker (the rules engine), ai (opponents), bank, assets, audio
js/content/   characters, lines, tiers, tables      ← the things you'll edit
js/ui/        lobby, holdemSelect, holdemTable, components, dom
assets/       your art, sounds, voices
tests/
```
