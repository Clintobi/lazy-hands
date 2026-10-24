import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import {
  BRIDGE_PORT,
  makeAsk,
  parseBridgeMessage,
  type BridgeAnswer,
  type BridgeAsk,
  type BridgeMessage,
} from "../lib/bridge-protocol";

type ClientRole = "cli" | "extension" | "web";

export class ApprovalBridge {
  port: number;
  pending: BridgeAsk | null = null;
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private sockets = new Map<WebSocket, ClientRole | null>();
  private waiters = new Map<string, (answer: BridgeAnswer) => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(port = BRIDGE_PORT) {
    this.port = port;
  }

  async listen(): Promise<number> {
    if (this.wss) return this.port;
    const http = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: "lazyhands-bridge", pending: this.pending }));
    });
    this.http = http;
    this.wss = new WebSocketServer({ server: http });
    this.wss.on("connection", (socket) => {
      this.sockets.set(socket, null);
      socket.on("message", (raw) => this.onMessage(socket, String(raw)));
      socket.on("close", () => this.sockets.delete(socket));
      if (this.pending) this.send(socket, { type: "status", pending: this.pending });
    });
    await new Promise<void>((resolve, reject) => {
      http.listen(this.port, "127.0.0.1", () => resolve());
      http.on("error", reject);
    });
    const address = http.address() as AddressInfo | null;
    if (address) this.port = address.port;
    return this.port;
  }

  async close() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.waiters.clear();
    this.pending = null;
    for (const socket of this.sockets.keys()) socket.close();
    this.sockets.clear();
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    await new Promise<void>((resolve) => this.http?.close(() => resolve()));
    this.wss = null;
    this.http = null;
  }

  ask(command: string, cwd: string, timeoutMs = 90_000): Promise<BridgeAnswer> {
    if (this.pending) {
      return Promise.resolve({
        type: "answer",
        id: this.pending.id,
        decision: "rejected",
      });
    }
    const ask = makeAsk(command, cwd, timeoutMs);
    this.pending = ask;
    this.broadcast({ type: "status", pending: ask });
    this.broadcast(ask);
    return new Promise((resolve) => {
      this.waiters.set(ask.id, resolve);
      this.timers.set(
        ask.id,
        setTimeout(() => {
          this.finish({ type: "answer", id: ask.id, decision: "timeout" });
        }, timeoutMs),
      );
    });
  }

  answer(answer: BridgeAnswer) {
    this.finish(answer);
  }

  private finish(answer: BridgeAnswer) {
    const waiter = this.waiters.get(answer.id);
    if (this.pending?.id === answer.id) this.pending = null;
    this.waiters.delete(answer.id);
    const timer = this.timers.get(answer.id);
    if (timer) clearTimeout(timer);
    this.timers.delete(answer.id);
    waiter?.(answer);
    this.broadcast(answer);
    this.broadcast({ type: "status", pending: this.pending });
  }

  private onMessage(socket: WebSocket, raw: string) {
    const message = parseBridgeMessage(raw);
    if (!message) return;
    if (message.type === "hello") {
      this.sockets.set(socket, message.role);
      this.send(socket, { type: "status", pending: this.pending });
      return;
    }
    if (message.type === "ask") {
      void this.ask(message.command, message.cwd, message.timeoutMs).then((answer) => {
        this.send(socket, answer);
      });
      return;
    }
    if (message.type === "answer") {
      this.answer(message);
    }
  }

  private broadcast(message: BridgeMessage) {
    for (const socket of this.sockets.keys()) this.send(socket, message);
  }

  private send(socket: WebSocket, message: BridgeMessage) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
