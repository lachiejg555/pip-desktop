'use strict';
/* Driftwood Cove — multiplayer relay (HTTP + WebSocket on one port).
   Clients send their pet position + chat; it broadcasts to everyone else in the cove.
   - Locally: started in-process by the desktop app (zero-config local/LAN play).
   - Publicly: `node server/relay.js` on any host. Binds process.env.PORT when set
     (Render/Koyeb/Railway/Fly all set it), and answers HTTP health checks, so it
     deploys to free Node hosts with no changes. */
const http = require('http');
let WebSocketServer;
try { ({ WebSocketServer } = require('ws')); }
catch (e) { /* `ws` not installed — embedded host just won't start */ }

function startRelay(port) {
  if (!WebSocketServer) throw new Error("the 'ws' package is not installed (run: npm install)");

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Driftwood Cove relay OK — connect over WebSocket.');
  });

  const wss = new WebSocketServer({ server });
  let nextId = 1;
  const clients = new Map(); // ws -> { id, name, hue, x, y, face, joined }

  function broadcast(obj, exceptWs) {
    const s = JSON.stringify(obj);
    for (const ws of clients.keys()) {
      if (ws !== exceptWs && ws.readyState === 1) ws.send(s);
    }
  }

  wss.on('connection', (ws) => {
    const me = { id: nextId++, name: 'player', hue: 0, x: 300, y: 470, face: 1, joined: false };
    clients.set(ws, me);

    ws.on('message', (data) => {
      let m; try { m = JSON.parse(data); } catch (_) { return; }
      if (m.t === 'join') {
        me.name = String(m.name || 'player').slice(0, 20);
        me.hue = m.hue | 0; me.x = +m.x || 300; me.y = +m.y || 470; me.joined = true;
        const peers = [...clients.values()].filter(c => c.id !== me.id && c.joined)
          .map(c => ({ id: c.id, name: c.name, hue: c.hue, x: c.x, y: c.y }));
        ws.send(JSON.stringify({ t: 'welcome', id: me.id, peers }));
        broadcast({ t: 'join', id: me.id, name: me.name, hue: me.hue, x: me.x, y: me.y }, ws);
      } else if (m.t === 'pos') {
        me.x = +m.x; me.y = +m.y; me.face = m.face | 0;
        broadcast({ t: 'pos', id: me.id, x: me.x, y: me.y, face: me.face }, ws);
      } else if (m.t === 'chat') {
        const text = String(m.text || '').slice(0, 200);
        if (text) broadcast({ t: 'chat', id: me.id, name: me.name, text }, ws);
      }
    });

    ws.on('close', () => { clients.delete(ws); if (me.joined) broadcast({ t: 'leave', id: me.id }); });
    ws.on('error', () => {});
  });

  server.on('error', (e) => {
    if (e && e.code === 'EADDRINUSE') {
      console.log('[cove] port ' + port + ' already in use; using the existing relay.');
    } else { console.error('[cove] relay error:', e && e.message); }
  });
  server.listen(port, '0.0.0.0', () => console.log('[cove] relay listening on :' + port));
  return server;
}

module.exports = { startRelay };

// Run standalone: `node server/relay.js`  (uses $PORT if set, else 8787)
if (require.main === module) {
  startRelay(parseInt(process.env.PORT, 10) || 8787);
}
