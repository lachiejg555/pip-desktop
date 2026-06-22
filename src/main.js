'use strict';
const { app, BrowserWindow, ipcMain, Notification, desktopCapturer, session, screen, Menu } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

/* Run a prompt through the user's local Claude Code CLI (their Claude subscription
   via OAuth — no API key). The prompt goes over stdin so there's no shell-escaping.
   Works for anyone who has Claude Code installed and has run `claude` to sign in. */
function runClaudeCli({ system, messages }) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    const lines = [];
    if (system) lines.push(system, '');
    let hadImage = false;
    for (const m of (messages || [])) {
      if (typeof m.content !== 'string') { hadImage = true; continue; } // vision not supported here
      lines.push((m.role === 'user' ? 'User: ' : 'You: ') + m.content);
    }
    if (hadImage && !lines.length) {
      return reject(new Error('Screen-watch needs the API or OpenClaw provider — chat works on your subscription.'));
    }
    lines.push('', 'Now respond in character to the last message. Give a complete, genuinely helpful answer — full code, full detail, or as long as the task needs. Plain text (no markdown symbols).');
    const prompt = lines.join('\n');
    const win = process.platform === 'win32';
    // A GUI-launched app can have a stripped PATH, so try common Claude Code locations too.
    const cands = win
      ? ['claude.cmd',
         path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
         path.join(process.env.LOCALAPPDATA || '', 'npm', 'claude.cmd')]
      : ['claude', '/usr/local/bin/claude', '/opt/homebrew/bin/claude',
         path.join(process.env.HOME || '', '.local', 'bin', 'claude')];
    const tryAt = (i) => {
      if (i >= cands.length) {
        return reject(new Error('Claude Code not found on this computer. Install it (npm i -g @anthropic-ai/claude-code) and run `claude` once to sign in.'));
      }
      const bin = cands[i];
      if ((bin.includes('/') || bin.includes('\\')) && !fs.existsSync(bin)) return tryAt(i + 1);
      let child;
      // POWER MODE: full agent — Pip can run commands, read/write files, build things,
      // and use the web, all without permission prompts. Runs from the user's home folder.
      try {
        child = spawn(bin, ['-p', '--output-format', 'text', '--dangerously-skip-permissions'],
          { shell: win, cwd: require('os').homedir() });
      } catch (e) { return tryAt(i + 1); }
      let out = '', err = '', done = false;
      child.stdout.on('data', d => out += d);
      child.stderr.on('data', d => err += d);
      child.on('error', () => { if (!done) { done = true; tryAt(i + 1); } });
      child.on('close', (code) => {
        if (done) return; done = true;
        if (code === 0 && out.trim()) resolve(out.trim());
        else reject(new Error((err.trim() || ('Claude Code exited ' + code)).slice(0, 240)));
      });
      child.stdin.on('error', () => {});
      child.stdin.write(prompt);
      child.stdin.end();
    };
    tryAt(0);
  });
}

let win;

function createWindow() {
  // Cover the whole primary display so Pip can roam the entire desktop.
  const { bounds } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: 'P3TS',
    frame: false,            // no title bar — just the pet
    transparent: true,       // see-through so the real desktop shows behind the pet
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,       // stays above other windows like a real desktop buddy
    skipTaskbar: true,       // it's a desktop buddy, not a normal app window
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');   // float above fullscreen apps too
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Start mouse-transparent: clicks pass through to the real desktop. The renderer
  // re-enables capture (via 'set-ignore') only while the cursor is over the pet/chat/settings.
  win.setIgnoreMouseEvents(true, { forward: true });

  // Grant whole-screen capture when the renderer requests it (ambient roaming watch).
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0] });
    }).catch(() => callback({}));
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

/* let the renderer move the window (custom drag, since the window is frameless) */
ipcMain.on('drag', (_e, { dx, dy }) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});

/* renderer hit-testing toggles click-through: ignore=true → clicks pass to the desktop,
   ignore=false → the pet/chat/settings under the cursor are interactive */
ipcMain.on('set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

/* quit from the pet's right-click menu */
ipcMain.on('quit', () => app.quit());

/* Read THIS user's own local Claude Code chat history (~/.claude/projects/*.jsonl),
   so the pet can show their past conversations. Stays on their machine. */
ipcMain.handle('claude-history', async () => {
  const fs = require('fs'); const os = require('os');
  const root = path.join(os.homedir(), '.claude', 'projects');
  const files = [];
  try {
    for (const dir of fs.readdirSync(root)) {
      const dp = path.join(root, dir);
      let st; try { st = fs.statSync(dp); } catch (e) { continue; }
      if (!st.isDirectory()) continue;
      for (const f of fs.readdirSync(dp)) {
        if (f.endsWith('.jsonl')) { const fp = path.join(dp, f); try { files.push({ fp, mtime: fs.statSync(fp).mtimeMs }); } catch (e) {} }
      }
    }
  } catch (e) { return []; }
  files.sort((a, b) => b.mtime - a.mtime);
  const out = [];
  let petAdded = false; // the pet's -p sessions all hold the same growing transcript; keep just the newest, rebuilt
  for (const { fp, mtime } of files.slice(0, 20)) {
    let buf; try { buf = fs.readFileSync(fp); } catch (e) { continue; }
    if (buf.length > 3000000) buf = buf.slice(buf.length - 3000000); // cap huge sessions
    const lines = buf.toString('utf8').split('\n');
    const msgs = [];
    for (const line of lines) {
      if (!line) continue;
      let j; try { j = JSON.parse(line); } catch (e) { continue; }
      if (j.isSidechain) continue;
      if (j.type !== 'user' && j.type !== 'assistant') continue;
      const m = j.message || j; const c = m && m.content;
      let txt = '';
      if (typeof c === 'string') txt = c;
      else if (Array.isArray(c)) txt = c.filter(b => b && b.type === 'text' && b.text).map(b => b.text).join('\n');
      txt = (txt || '').trim();
      if (!txt || txt[0] === '<' || txt.startsWith('Caveat:')) continue; // skip tool/meta noise
      msgs.push({ who: j.type === 'user' ? 'me' : 'bot', t: txt.slice(0, 4000) });
    }
    if (!msgs.length) continue;
    const isPet = msgs[0].who === 'me' && /^You are .{0,90}(companion|desktop[ -]?pet|pixel)/.test(msgs[0].t);
    if (isPet) {
      // the pet wraps the whole transcript into one prompt; rebuild it into a clean thread
      if (petAdded) continue;
      const turns = [];
      const wrapped = msgs.find(x => x.who === 'me');
      if (wrapped) {
        let who = null, acc = [];
        const flush = () => { if (who) { const t = acc.join('\n').trim(); if (t) turns.push({ who, t: t.slice(0, 4000) }); } who = null; acc = []; };
        for (const line of wrapped.t.split('\n')) {
          if (line.startsWith('User: ')) { flush(); who = 'me'; acc = [line.slice(6)]; }
          else if (line.startsWith('You: ')) { flush(); who = 'bot'; acc = [line.slice(5)]; }
          else if (line.startsWith('You are ') || line.startsWith('Now respond')) { /* system/instruction */ }
          else if (who) { acc.push(line); }
        }
        flush();
      }
      const lastBot = msgs.filter(x => x.who === 'bot').slice(-1)[0];
      if (lastBot && (!turns.length || turns[turns.length - 1].t !== lastBot.t)) turns.push({ who: 'bot', t: lastBot.t });
      if (turns.length) { petAdded = true; out.unshift({ id: 'h' + Math.round(mtime), title: 'Pip — your chat', msgs: turns.slice(-60) }); }
      continue;
    }
    const trimmed = msgs.slice(-50);
    const fu = trimmed.find(x => x.who === 'me');
    const title = ((fu ? fu.t : trimmed[0].t) || 'Claude chat').replace(/\s+/g, ' ').slice(0, 28);
    out.push({ id: 'h' + Math.round(mtime), title, msgs: trimmed });
    if (out.length >= 10) break;
  }
  return out;
});

/* right-click context menu on the pet — quit fully */
ipcMain.on('pet-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: 'Settings', click: () => { if (win) win.webContents.send('open-settings'); } },
    { type: 'separator' },
    { label: 'Close P3TS', click: () => app.quit() }
  ]);
  if (win) menu.popup({ window: win });
});

/* list screens (for multi-monitor: which display Pip is on / capturing) */
ipcMain.handle('list-screens', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'], thumbnailSize: { width: 1, height: 1 }
  });
  return sources.map(s => ({ id: s.id, name: s.name }));
});

/* Start an in-process Driftwood Cove relay so local & LAN multiplayer works with no
   setup. The first app instance binds the port; later instances hit EADDRINUSE and just
   connect to it as clients. For internet play, run server/relay.js on a host instead. */
function startEmbeddedRelay() {
  try {
    const { startRelay } = require(path.join(__dirname, '..', 'server', 'relay.js'));
    startRelay(parseInt(process.env.COVE_PORT, 10) || 8787);
  } catch (e) {
    console.log('[cove] embedded relay not started:', e && e.message);
  }
}

app.whenReady().then(() => {
  startEmbeddedRelay();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---- native OS notification ---- */
ipcMain.handle('notify', (_e, { title, body }) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: title || 'Pip', body: body || '' });
  n.on('click', () => { if (win) { win.show(); win.focus(); } });
  n.show();
  return true;
});

/* list capturable screens for ambient roaming capture */
ipcMain.handle('list-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 240, height: 150 }
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }));
});

/* Convert an Anthropic-style message to OpenAI chat format (handles vision blocks). */
function toOpenAIMessage(m) {
  if (typeof m.content === 'string') return { role: m.role, content: m.content };
  const parts = (m.content || []).map(b => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'image' && b.source) {
      return { type: 'image_url', image_url: { url: 'data:' + (b.source.media_type || 'image/jpeg') + ';base64,' + b.source.data } };
    }
    return { type: 'text', text: '' };
  });
  return { role: m.role, content: parts };
}

/* ---- AI proxy (keeps the key in the main process, off the page) ----
   provider 'claude'  → Anthropic   POST {baseUrl}/v1/messages          (x-api-key)
   provider 'openclaw'→ OpenAI-compat POST {baseUrl}/v1/chat/completions (Bearer token)
   Keeps keys out of web code and sidesteps browser CORS. */
ipcMain.handle('claude', (_e, { provider, key, baseUrl, model, system, messages, max_tokens }) => {
  return new Promise((resolve, reject) => {
    if (provider === 'claudecli') { runClaudeCli({ system, messages }).then(resolve, reject); return; }
    const openclaw = provider === 'openclaw';
    let url;
    try {
      const base = String(baseUrl || (openclaw ? 'http://localhost:18789' : 'https://api.anthropic.com')).replace(/\/+$/, '');
      url = new URL(base + (openclaw ? '/v1/chat/completions' : '/v1/messages'));
    } catch (e) { return reject(new Error('Bad endpoint URL.')); }
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    let payload, headers;
    if (openclaw) {
      const msgs = [];
      if (system) msgs.push({ role: 'system', content: system });
      for (const m of (messages || [])) msgs.push(toOpenAIMessage(m));
      payload = JSON.stringify({ model: model || 'openclaw/default', max_tokens: max_tokens || 400, messages: msgs });
      headers = { 'content-type': 'application/json' };
      if (key) headers['authorization'] = 'Bearer ' + key;   // gateway token/password
    } else {
      payload = JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: max_tokens || 400,
        system: system || '',
        messages: messages || []
      });
      headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
      if (key) headers['x-api-key'] = key;
    }
    headers['content-length'] = Buffer.byteLength(payload);

    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (res.statusCode >= 400) {
            return reject(new Error(j.error && j.error.message ? j.error.message : ('AI error ' + res.statusCode)));
          }
          const text = openclaw
            ? ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim()
            : (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
          resolve(text || '…');
        } catch (err) { reject(new Error('Bad response from the AI endpoint.')); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
});
