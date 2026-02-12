type Handler<T = unknown> = (payload: T) => void;

const listeners = new Map<string, Set<Handler>>();

export const EventBus = {
  on<T = unknown>(event: string, handler: Handler<T>): () => void {
    const set = listeners.get(event) ?? new Set<Handler>();
    set.add(handler as Handler);
    listeners.set(event, set);

    return () => {
      set.delete(handler as Handler);
      if (set.size === 0) {
        listeners.delete(event);
      }
    };
  },

  emit<T = unknown>(event: string, payload: T): void {
    const set = listeners.get(event);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(payload);
    }
  }
};

export const eventBus = EventBus;
