export const BRIDGE_PORT = 4537;
export const BRIDGE_HOST = "127.0.0.1";
export const DEFAULT_TIMEOUT_MS = 90_000;

export type BridgeHello = {
  type: "hello";
  role: "cli" | "extension" | "web";
};

export type BridgeAsk = {
  type: "ask";
  id: string;
  command: string;
  cwd: string;
  timeoutMs: number;
  createdAt: number;
};

export type BridgeAnswer = {
  type: "answer";
  id: string;
  decision: "approved" | "rejected" | "timeout";
  holdMs?: number;
  gesture?: "approve" | "reject";
};

export type BridgeStatus = {
  type: "status";
  pending: BridgeAsk | null;
};

export type BridgeError = {
  type: "error";
  message: string;
};

export type BridgeMessage = BridgeHello | BridgeAsk | BridgeAnswer | BridgeStatus | BridgeError;

export function wsUrl(port = BRIDGE_PORT): string {
  return `ws://${BRIDGE_HOST}:${port}`;
}

export function parseBridgeMessage(raw: string): BridgeMessage | null {
  try {
    const value = JSON.parse(raw) as BridgeMessage;
    if (!value || typeof value !== "object" || !("type" in value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function makeAsk(command: string, cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): BridgeAsk {
  return {
    type: "ask",
    id: `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    command,
    cwd,
    timeoutMs,
    createdAt: Date.now(),
  };
}
