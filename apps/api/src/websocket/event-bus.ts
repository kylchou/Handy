import type { RealtimeEvent } from "@handy/contracts";

type Listener = (event: RealtimeEvent) => void;

/**
 * In-process pub/sub for realtime events. Each connection subscribes with its
 * user id; admin connections subscribe to everything. Swap for Redis pub/sub if
 * the API ever runs as more than one instance.
 */
export class EventBus {
  private byUser = new Map<string, Set<Listener>>();
  private firehose = new Set<Listener>();

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

  publish(userIds: string[], event: RealtimeEvent): void {
    const delivered = new Set<Listener>();
    for (const id of new Set(userIds)) {
      for (const l of this.byUser.get(id) ?? []) {
        delivered.add(l);
        safeCall(l, event);
      }
    }
    for (const l of this.firehose) if (!delivered.has(l)) safeCall(l, event);
  }

  connectionCount(): number {
    let n = this.firehose.size;
    for (const s of this.byUser.values()) n += s.size;
    return n;
  }
}

function safeCall(listener: Listener, event: RealtimeEvent) {
  try {
    listener(event);
  } catch {
    // A broken connection must not affect other subscribers.
  }
}
