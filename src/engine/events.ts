import type { EventMap } from './types';

type Handler<T> = (payload: T) => void;

/** Typed event bus — systems talk through this, never into each other. */
export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  on<K extends keyof EventMap>(event: K, fn: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  once<K extends keyof EventMap>(event: K, fn: Handler<EventMap[K]>): () => void {
    const off = this.on(event, (p) => { off(); fn(p); });
    return off;
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try { (fn as Handler<EventMap[K]>)(payload); }
      catch (e) { console.error(`[events] handler for ${String(event)} threw`, e); }
    }
  }

  clear(): void { this.handlers.clear(); }
}

export const bus = new EventBus();
