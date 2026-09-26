import { randomBytes } from "node:crypto";
import type { NewRealtimeEvent, RealtimeEvent } from "@handy/contracts";

type Listener = (event: RealtimeEvent) => void;

interface Buffered {
  seq: number;
  /** null = sent to everyone. */
  recipients: Set<string> | null;
  event: RealtimeEvent;
}

/**
 * In-process pub/sub for realtime events. Each connection subscribes with its
 * user id; admin connections subscribe to everything. Swap for Redis pub/sub if
 * the API ever runs as more than one instance.
 *
 * Every event gets an id `<bootId>:<seq>`, and the last `bufferSize` events are
 * kept so a client that reconnects can be sent what it missed.
 */
export class EventBus {
  private byUser = new Map<string, Set<Listener>>();
  private firehose = new Set<Listener>();
  private buffer: Buffered[] = [];
  private seq = 0;
  /** Changes on every restart, so ids from a previous run are recognized as stale. */
  readonly bootId = randomBytes(4).toString("hex");

  constructor(private bufferSize = 1000) {}

  subscribe(userId: string, listener: Listener, opts: { all?: boolean } = {}): () => void {
    if (opts.all) {
      this.firehose.add(listener);
      return () => this.firehose.delete(listener);
    }
    let set = this.byUser.get(userId);
    if (!set) this.byUser.set(userId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.byUser.delete(userId);
    };
  }

  publish(userIds: string[], input: NewRealtimeEvent): void {
    const recipients = new Set(userIds);
    const event = this.record(input, recipients);
    const delivered = new Set<Listener>();
    for (const id of recipients) {
      for (const l of this.byUser.get(id) ?? []) {
        delivered.add(l);
        safeCall(l, event);
      }
    }
    for (const l of this.firehose) if (!delivered.has(l)) safeCall(l, event);
  }

  /** Sends an event to every open connection. */
  broadcast(input: NewRealtimeEvent): void {
    const event = this.record(input, null);
    const all = new Set<Listener>(this.firehose);
    for (const set of this.byUser.values()) for (const l of set) all.add(l);
    for (const l of all) safeCall(l, event);
  }

  /**
   * Events after `lastEventId` that this user would have received, oldest first.
   * Returns null when they can't all be recovered (unknown/stale id, or too
   * old and already dropped from the buffer).
   */
  replay(userId: string, lastEventId: string, opts: { all?: boolean } = {}): RealtimeEvent[] | null {
    const [boot, seqStr] = lastEventId.split(":");
    const seq = Number(seqStr);
    if (boot !== this.bootId || !Number.isInteger(seq) || seq > this.seq) return null;
    const oldest = this.buffer[0]?.seq ?? this.seq + 1;
    if (seq < oldest - 1) return null; // some events after it were already dropped
    return this.buffer
      .filter((b) => b.seq > seq && (opts.all || b.recipients === null || b.recipients.has(userId)))
      .map((b) => b.event);
  }

  connectionCount(): number {
    let n = this.firehose.size;
    for (const s of this.byUser.values()) n += s.size;
    return n;
  }

  private record(input: NewRealtimeEvent, recipients: Set<string> | null): RealtimeEvent {
    const seq = ++this.seq;
    const event = { ...input, id: `${this.bootId}:${seq}` } as RealtimeEvent;
    this.buffer.push({ seq, recipients, event });
    if (this.buffer.length > this.bufferSize) this.buffer.shift();
    return event;
  }
}

function safeCall(listener: Listener, event: RealtimeEvent) {
  try {
    listener(event);
  } catch {
    // A broken connection must not affect other subscribers.
  }
}
