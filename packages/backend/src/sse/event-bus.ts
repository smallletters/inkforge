import { SseEvent } from '@inkforge/shared';

type Listener = (event: SseEvent) => void;

export class EventBus {
  private subscribers = new Map<string, Set<Listener>>();

  subscribe(userId: string, listener: Listener): () => void {
    if (!this.subscribers.has(userId)) this.subscribers.set(userId, new Set());
    this.subscribers.get(userId)!.add(listener);
    return () => this.subscribers.get(userId)?.delete(listener);
  }

  publish(userId: string, event: SseEvent): void {
    const userListeners = this.subscribers.get(userId);
    if (userListeners) userListeners.forEach(l => l(event));
  }

  publishAll(event: SseEvent): void {
    this.subscribers.forEach(listeners => listeners.forEach(l => l(event)));
  }

  removeUser(userId: string): void {
    this.subscribers.delete(userId);
  }
}

export const eventBus = new EventBus();
