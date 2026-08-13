/**
 * WebSocket wire protocol shared between @airos/web and @airos/server.
 *
 * This is intentionally small. The server never receives camera frames,
 * images, or landmark arrays — only compact, already-classified gesture and
 * cursor state. Keeping the message union here (rather than duplicated in
 * both apps) is what makes that guarantee enforceable: the server literally
 * cannot decode a message shape it doesn't know about.
 *
 * Nothing here is persisted server-side. It exists to make the future
 * multiplayer architecture (see IMPLEMENTATION.md §1.7 / §10) real but
 * unused today — Phase 1 wires the relay, no module publishes to it yet.
 */

/** Provenance of any value shown in the UI. See IMPLEMENTATION.md §1.4. */
export type Method = 'MODEL' | 'HEURISTIC' | 'DERIVED';

export interface RoomJoinMessage {
  type: 'room:join';
  roomId: string;
  clientId: string;
}

export interface RoomLeaveMessage {
  type: 'room:leave';
  roomId: string;
  clientId: string;
}

export interface PresenceMessage {
  type: 'presence';
  roomId: string;
  clients: string[];
}

/** Compact per-frame gesture summary. No landmarks, no imagery. */
export interface GestureStateMessage {
  type: 'gesture:state';
  roomId: string;
  clientId: string;
  timestamp: number;
  gesture: string;
  confidence: number;
  method: Method;
  cursor: { x: number; y: number } | null;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ClientToServerMessage =
  | RoomJoinMessage
  | RoomLeaveMessage
  | GestureStateMessage;

export type ServerToClientMessage =
  | PresenceMessage
  | GestureStateMessage
  | ErrorMessage;

export type WireMessage = ClientToServerMessage | ServerToClientMessage;

export function isWireMessage(value: unknown): value is WireMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string'
  );
}

/** One entry in the health endpoint's model manifest — whether a given
 *  MediaPipe model asset is actually present in the served build, checked
 *  against the real file on disk rather than assumed. See `apps/server/src/
 *  index.ts` and `apps/web/scripts/fetch-models.mjs` (the source of truth
 *  for which models this build expects). */
export interface ModelManifestEntry {
  name: string;
  present: boolean;
  sizeBytes: number | null;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
  /** IMPLEMENTATION.md §10: "version, uptime, model manifest." Empty in
   *  dev (Vite serves the web app itself; this process never sees
   *  `public/models/` there) — populated once the client's built `dist/`
   *  is present, which is the only case this process actually serves
   *  models from. */
  models: ModelManifestEntry[];
}
