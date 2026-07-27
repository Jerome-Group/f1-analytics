// The socket half of the MQTT subscriber: it holds one TCP connection to the broker, keeps it open
// with a heartbeat, hands every received document to a callback, and — the point of the whole file —
// reconnects on its own when the connection drops (#17).
//
// The reconnect is where the ticket's "a dropped upstream connection reconnects without losing
// accumulated Session state" is met, but only half of it: this file loses the *connection* and gets
// it back; the state it was accumulating lives in the feed the callback writes to (live-feed.ts),
// which this never touches. So a reconnection here is a new socket resubscribing, and the Session so
// far is exactly where it was left. Clean-session CONNECTs (protocol.ts) make that explicit — the
// broker holds nothing for us across the gap because we hold it ourselves.
//
// The wire format is protocol.ts and is pinned there; this file is I/O, timers and the reconnect
// loop, and is exercised against a real broker end to end (test/mqtt.test.sh, the live seam).

import { connect, type Socket } from 'node:net';
import {
  CONNACK,
  DISCONNECT_PACKET,
  PINGREQ_PACKET,
  PUBLISH,
  connackReturnCode,
  decodePackets,
  encodeConnect,
  encodeSubscribe,
  parsePublish,
  type Packet,
} from './protocol.ts';

export interface LiveConnection {
  /** Stop for good: send a DISCONNECT, close the socket, and cancel every timer, so nothing
   * reconnects behind a shutting-down server. */
  close(): void;
}

export interface LiveOptions {
  host: string;
  port: number;
  /** The topics to subscribe to on every (re)connect. */
  topics: readonly string[];
  /** Called with each received document. The topic says which stream it is; the payload is its raw
   * bytes, left for the feed to read because what a document *is* belongs above the transport. */
  onMessage: (topic: string, payload: Buffer) => void;
  /** Told when the connection comes up and when it goes down, for a log line — never for correctness,
   * which the reconnect handles without anyone watching. */
  onStatus?: (up: boolean) => void;
}

/** Seconds of silence after which the broker may drop us; a PINGREQ goes out at half this, well
 * inside the window, so an idle live feed between messages is not mistaken for a dead one. */
const KEEPALIVE_SECONDS = 30;

/** How long to wait before dialling again after a drop. Short, because a live Session should not sit
 * disconnected, and constant, because a broker on the same machine is either there or restarting. */
const RECONNECT_MS = 1_000;

/**
 * Open a subscriber to `host:port` and keep it open. Returns at once with a handle to close it; the
 * connection establishes (and re-establishes) in the background, calling `onMessage` for every
 * document that arrives on a subscribed topic.
 */
export function subscribe(options: LiveOptions): LiveConnection {
  const clientId = `f1-live-analytics-${options.port}`;
  let socket: Socket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function open(): void {
    if (closed) return;
    let buffer: Buffer = Buffer.alloc(0);
    let retried = false;
    const active = connect(options.port, options.host);
    socket = active;

    active.on('connect', () => {
      active.write(encodeConnect(clientId, KEEPALIVE_SECONDS));
    });

    active.on('data', (chunk: Buffer) => {
      const { packets, rest } = decodePackets(Buffer.concat([buffer, chunk]));
      buffer = rest;
      for (const packet of packets) handle(active, packet);
    });

    // A dropped or refused connection is the ordinary case this file exists for, not an error to
    // surface: tear the socket down and dial again after a beat. A socket may emit both `error` and
    // `close`, so the `retried` latch makes that one reconnect and not two racing sockets.
    const retry = (): void => {
      if (retried) return;
      retried = true;
      stopHeartbeat();
      options.onStatus?.(false);
      if (!closed) reconnectTimer = setTimeout(open, RECONNECT_MS);
    };
    active.on('error', retry);
    active.on('close', retry);
  }

  function handle(active: Socket, packet: Packet): void {
    if (packet.type === CONNACK) {
      // A refusal is not something a retry mends, but the broker here is anonymous and local, so the
      // simplest honest response is still to drop and try again rather than to reason about the code.
      if (connackReturnCode(packet) === 0) {
        active.write(encodeSubscribe(1, options.topics));
        startHeartbeat(active);
        options.onStatus?.(true);
      } else {
        active.destroy();
      }
      return;
    }
    if (packet.type === PUBLISH) {
      const { topic, payload } = parsePublish(packet);
      options.onMessage(topic, payload);
    }
    // SUBACK, PINGRESP: nothing to do. The heartbeat proves the link by sending, not by reading a
    // reply, so a PINGRESP is confirmation and not a trigger.
  }

  function startHeartbeat(active: Socket): void {
    stopHeartbeat();
    heartbeat = setInterval(() => active.write(PINGREQ_PACKET), (KEEPALIVE_SECONDS / 2) * 1_000);
  }

  function stopHeartbeat(): void {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    heartbeat = undefined;
  }

  open();

  return {
    close() {
      closed = true;
      stopHeartbeat();
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      if (socket !== undefined) {
        socket.write(DISCONNECT_PACKET);
        socket.destroy();
      }
    },
  };
}
