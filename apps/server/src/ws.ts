import type { Server as HttpServer } from 'node:http';
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

interface ConnectedClient {
  socket: WebSocket;
  clientId: string;
  roomId: string | null;
}

export function attachWebSocketRelay(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
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

  wss.on('connection', (socket) => {
    const client: ConnectedClient = { socket, clientId: '', roomId: null };

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

  return wss;
}
