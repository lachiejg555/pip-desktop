/* Driftwood Cove relay as a Cloudflare Worker + Durable Object.
   Free plan, always-on, global. A single Durable Object ("driftwood") is the room:
   every player's WebSocket goes to it, so everyone sees everyone. Uses the WebSocket
   Hibernation API so it costs nothing while idle.

   Deploy:
     cd worker
     npx wrangler login
     npx wrangler deploy
   Then use  wss://driftwood-cove.<your-subdomain>.workers.dev  as the relay URL in the app. */

export class Cove {
  constructor(state) { this.state = state; }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Driftwood Cove relay OK — connect over WebSocket.', { status: 200 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernatable accept: the DO can sleep between messages and wake on traffic.
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID(), name: 'player', hue: 0, x: 300, y: 470, face: 1, joined: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      if (ws !== except && ws.readyState === 1) { try { ws.send(s); } catch (_) {} }
    }
  }

  async webSocketMessage(ws, data) {
    let m; try { m = JSON.parse(data); } catch (_) { return; }
    const me = ws.deserializeAttachment();
    if (m.t === 'join') {
      me.name = String(m.name || 'player').slice(0, 20);
      me.hue = m.hue | 0; me.x = +m.x || 300; me.y = +m.y || 470; me.joined = true;
      ws.serializeAttachment(me);
      const peers = this.state.getWebSockets()
        .filter(o => o !== ws)
        .map(o => o.deserializeAttachment())
        .filter(a => a && a.joined)
        .map(a => ({ id: a.id, name: a.name, hue: a.hue, x: a.x, y: a.y }));
      ws.send(JSON.stringify({ t: 'welcome', id: me.id, peers }));
      this.broadcast({ t: 'join', id: me.id, name: me.name, hue: me.hue, x: me.x, y: me.y }, ws);
    } else if (m.t === 'pos') {
      me.x = +m.x; me.y = +m.y; me.face = m.face | 0; ws.serializeAttachment(me);
      this.broadcast({ t: 'pos', id: me.id, x: me.x, y: me.y, face: me.face }, ws);
    } else if (m.t === 'chat') {
      const text = String(m.text || '').slice(0, 200);
      if (text) this.broadcast({ t: 'chat', id: me.id, name: me.name, text }, ws);
    }
  }

  async webSocketClose(ws) {
    const me = ws.deserializeAttachment();
    if (me && me.joined) this.broadcast({ t: 'leave', id: me.id }, ws);
  }
  async webSocketError() {}
}

export default {
  async fetch(request, env) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const id = env.COVE.idFromName('driftwood'); // one shared room
      return env.COVE.get(id).fetch(request);
    }
    return new Response('Driftwood Cove relay OK — connect over WebSocket.', { status: 200 });
  }
};
