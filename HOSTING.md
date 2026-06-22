# Hosting the Driftwood Cove relay for free

The app already plays **local & LAN multiplayer with zero setup** (it runs its own relay
on launch — open two windows, click 🌐 in each). To let **strangers over the internet**
meet in the cove, run the relay on a host and put its URL in **Settings → Cove relay**.

Pick one of these free options.

---

## Option A — Cloudflare Workers + Durable Objects  (recommended: always-on, free, global)

No cold starts, scales worldwide, stays on the free plan.

```bash
cd worker
npx wrangler login        # opens the browser, sign in / create a free account
npx wrangler deploy
```

Wrangler prints a URL like `https://driftwood-cove.YOURNAME.workers.dev`.
In the app: **Settings → Cove relay** =
```
wss://driftwood-cove.YOURNAME.workers.dev
```
(note `wss://`, not `https://`). Everyone who sets that URL shares one cove.

Free limits (100k requests/day, generous Durable Object usage) are plenty for a small game.

---

## Option B — Render  (easiest: no CLI, deploy from the dashboard)

Runs the Node relay as-is. Free, but the instance **sleeps after ~15 min idle**, so the
first player after a quiet spell waits ~30–60s for it to wake. Fine for casual testing.

1. Push this `pip-desktop` folder to a GitHub repo.
2. On [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm run relay`
   - **Instance type:** Free
4. Deploy. Render gives you `https://your-app.onrender.com`.
5. In the app: **Settings → Cove relay** = `wss://your-app.onrender.com`.

(Render sets `$PORT`; the relay listens on it automatically.)

---

## Other free hosts that work the same way as Render

Any host that runs a Node process and sets `$PORT` works with **Option B's** start command
(`npm run relay`) — e.g. **Koyeb** (free nano instance, stays on) or **Railway** (trial credit).
Use `wss://<the-host-domain>` as the relay URL.

---

## Testing locally first (free, instant)

```bash
npm install
npm start        # window 1
npm start        # window 2 (or just open the app twice)
```
Click 🌐 **Go Online** in both → you'll see two pets in the same cove. The default relay
URL `ws://localhost:8787` is the app's own embedded relay.
