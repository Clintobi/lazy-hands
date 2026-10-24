declare const chrome: {
  runtime: {
    id: string;
    getURL: (path: string) => string;
    sendMessage: (msg: unknown, cb?: (res: unknown) => void) => void;
    onMessage: {
      addListener: (
        fn: (msg: unknown, sender: unknown, reply: (res?: unknown) => void) => boolean | void,
      ) => void;
    };
    lastError?: { message: string };
  };
  offscreen: {
    createDocument: (opts: { url: string; reasons: string[]; justification: string }) => Promise<void>;
    closeDocument?: () => Promise<void>;
  };
  tabs: {
    query: (q: { active?: boolean; lastFocusedWindow?: boolean }) => Promise<Array<{ id?: number }>>;
    sendMessage: (id: number, msg: unknown) => Promise<unknown>;
  };
  storage: {
    local: {
      get: (keys?: string[] | string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
};
