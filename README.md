# P3TS — Desktop Demo (v0.2)

P3TS is a desktop companion demo. A sleeping panda pet (named **Pip** by default — renameable) sits on your desktop. You **drag it anywhere** (including onto a second monitor), it can **watch your whole screen** and comment on what you're doing, and it can **notify** you.

Built with Electron.

---

## Run it
Needs Node.js v18+ (https://nodejs.org).
```bash
cd pip-desktop
npm install
npm start
```
The panda appears, floating on your desktop.

- **Drag**: left-click-hold the panda and move it — across monitors too.
- **Left-click the panda**: opens **settings** before you've added an API key; opens **chat with your pet** once a key is connected.
- **Right-click the panda**: a menu with **Settings** and **Close P3TS** (quits fully).
- In settings: name your pet, paste your Anthropic API key, then **👁 Watch my screen** to have the pet comment on what's on screen (a red "Watching" tab shows the whole time), **⏸** to pause instantly, **🔔** to test a notification.

## Build an installer
```bash
npm run build
```
→ `.dmg` / `.exe` / `.AppImage` in `dist/`.

---

## What changed from v0.1
- **Floating frameless pet** (transparent, always-on-top) instead of a boxed app window.
- **Drag-to-move across monitors** — the window follows your cursor; Electron moves it across displays natively.
- **Ambient whole-screen watching** — no more picking a single window; Pip watches the screen it's roaming on.
- **Privacy controls** (see below), because ambient watching needs them.

## Privacy controls (important)
Ambient watching means Pip can see everything on screen, so this version ships guardrails:
- **Always-visible "Watching" indicator** above the pet whenever capture is on — it's never secretly watching.
- **One-click pause** (⏸) that immediately stops sending frames.
- **Exclusion list** in settings — list sensitive apps/titles (bank, password manager). *Note:* this v0.2 enforces exclusions two ways — a list you maintain, and a model-side check where Pip is instructed to reply "(looking away)" and stay silent if it sees banking/passwords/financial info on screen. This is a **first-pass** safeguard, not the deck's full capture-time exclusion (which blocks sensitive windows *before* any frame is captured). That stronger, capture-time version is the next privacy layer.

## How "commentate" works
While watching (and not paused), Pip grabs a downscaled screen frame on your chosen interval, sends it to Claude's vision model asking for one short reaction, and shows the reply in its bubble. Frames go only to Anthropic, only per-comment, only while actively watching.

## Caveats
- **macOS**: first run asks for Screen Recording permission (System Settings → Privacy & Security → Screen Recording) — grant it and restart.
- **Cost**: each comment is one vision API call. Widen the interval in ⚙ settings to spend less.
- **Always-on-top**: Pip floats above other windows by design. 

## Files
- `src/main.js` — frameless/transparent window, drag handler, screen capture grant, notifications, Claude proxy (key held off the web page).
- `src/preload.js` — secure bridge (`notify`, `listSources`, `listScreens`, `drag`, `claude`).
- `src/renderer/index.html` — the floating pet, drag logic, ambient watch loop, privacy controls, settings.

## Next layers (not in this v0.2)
- True capture-time exclusions (block sensitive windows before capture) + encryption — the deck's full privacy spine.
- Notification integrations: Telegram bot (easiest), then Gmail via OAuth.
- Agentic browsing (Pip reads/acts in its own browser pane, propose→approve gates).
- Decentralized transport (Spacecoin/SpaceRouter) underneath.
