import type { Server as HttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  isWireMessage,
  type ClientToServerMessage,
  type ServerToClientMessage,
} from '@airos/shared';

/**
 * A deliberately small room relay.
 *
 * This exists to make the "future multiplayer" architecture described in
 * IMPLEMENTATION.md §1.7/§10 real rather than aspirational: a client can join
 * a room and broadcast its already-classified gesture state to peers in that
 * room. No module publishes to this yet (that starts once a module actually
 * needs it) and nothing is persisted — the moment every socket in a room
 * disconnects, the room is forgotten.
 *
 * Explicitly out of scope: auth, reconnection/backoff, message history,
 * anything resembling a database. Keep this small.
 */

// A GestureStateMessage is a handful of primitive fields — timestamp,
// gesture name, a confidence number, an {x,y} cursor — comfortably under
// 1KB as JSON. `ws`'s default maxPayload is 100MB; without an explicit cap,
// a single oversized frame (malicious or just malformed) costs a full
// buffer allocation and a JSON.parse over that whole payload before
// isWireMessage() ever gets a chance to reject it. 8KB leaves generous
// headroom over any real message this protocol defines.
const MAX_PAYLOAD_BYTES = 8 * 1024;

// How often to ping every connected client, and terminate whichever ones
// didn't respond to the *previous* round — the standard `ws` heartbeat
// pattern (see the `ws` package's own docs). Browsers don't always fire a
// clean 'close' event on every disconnect (a dropped WiFi connection, a
// crashed tab, a network change) — without this, a client's `ConnectedClient`
// entry (and its room membership) can leak until the OS-level TCP timeout,
// which can be minutes.
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * WebSocket connections aren't subject to CORS, so without this check any
 * origin can open a connection here and — if it can guess or already knows
 * a `roomId` — join it and read whatever `gesture:state` broadcasts pass
 * through. A real browser cannot omit or forge the `Origin` header on a
 * WebSocket handshake (unlike a raw script/curl, which could set anything
 * it wants) — so this specifically closes off the "a hostile page in
 * someone's browser opens a connection to this relay" vector (cross-site
 * WebSocket hijacking), not connections from arbitrary non-browser tooling,
 * which "no auth" already puts out of scope per this file's own doc
 * comment above. Requests with no Origin header at all (non-browser
 * clients) are allowed through for the same reason.
 */
function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

interface ConnectedClient {
  socket: WebSocket;
  clientId: string;
  roomId: string | null;
}

/** The heartbeat's liveness flag lives directly on the socket instance
 *  rather than in `ConnectedClient` — this is the `ws` package's own
 *  documented pattern for this exact check, and `wss.clients` (what the
 *  heartbeat interval below actually iterates) only ever exposes raw
 *  `WebSocket` objects, not this file's wrapper, which is reachable only
 *  through `rooms` and would miss any socket that connected but never
 *  joined a room. */
type HeartbeatSocket = WebSocket & { isAlive?: boolean };

export function attachWebSocketRelay(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: (info, callback) => {
      if (isAllowedOrigin(info.req)) {
        callback(true);
      } else {
        callback(false, 403, 'Forbidden origin');
      }
    },
  });
  const rooms = new Map<string, Set<ConnectedClient>>();

  const send = (socket: WebSocket, message: ServerToClientMessage) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const broadcastPresence = (roomId: string) => {
    const members = rooms.get(roomId);
    if (!members) return;
    const clients = [...members].map((m) => m.clientId);
    const message: ServerToClientMessage = { type: 'presence', roomId, clients };
    for (const member of members) send(member.socket, message);
  };

  const leaveRoom = (client: ConnectedClient) => {
    if (!client.roomId) return;
    const members = rooms.get(client.roomId);
    if (!members) return;
    members.delete(client);
    if (members.size === 0) {
      rooms.delete(client.roomId);
    } else {
      broadcastPresence(client.roomId);
    }
    client.roomId = null;
  };

  wss.on('connection', (socket: HeartbeatSocket) => {
    const client: ConnectedClient = { socket, clientId: '', roomId: null };
    socket.isAlive = true;

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: 'error', message: 'Malformed JSON payload.' });
        return;
      }

      if (!isWireMessage(parsed)) {
        send(socket, { type: 'error', message: 'Unrecognized message shape.' });
        return;
      }

      const message = parsed as ClientToServerMessage;

      switch (message.type) {
        case 'room:join': {
          leaveRoom(client);
          client.clientId = message.clientId;
          client.roomId = message.roomId;
          if (!rooms.has(message.roomId)) rooms.set(message.roomId, new Set());
          rooms.get(message.roomId)?.add(client);
          broadcastPresence(message.roomId);
          break;
        }
        case 'room:leave': {
          leaveRoom(client);
          break;
        }
        case 'gesture:state': {
          const members = rooms.get(message.roomId);
          if (!members) break;
          for (const member of members) {
            if (member !== client) send(member.socket, message);
          }
          break;
        }
        default: {
          send(socket, { type: 'error', message: 'Unhandled message type.' });
        }
      }
    });

    socket.on('close', () => leaveRoom(client));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients as Set<HeartbeatSocket>) {
      if (socket.isAlive === false) {
        // Didn't respond to the previous ping — the underlying connection
        // is gone even though 'close' never fired (a dropped network, a
        // crashed tab). terminate() closes the raw connection immediately;
        // its own 'close' handler still runs, cleaning up room membership
        // the normal way.
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}
