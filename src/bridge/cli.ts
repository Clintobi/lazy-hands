import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { BRIDGE_PORT, parseBridgeMessage, wsUrl, type BridgeAnswer, type BridgeAsk } from "../lib/bridge-protocol";
import { ApprovalBridge } from "./server";

function help() {
  return `lazyhands

  lazyhands serve [--port ${BRIDGE_PORT}]
  lazyhands approve [--timeout 90] -- <command>

The approve command waits for a held thumbs-up from the Lazy Hands extension
or the web player. A held palm, or a timeout, refuses and the command does not run.
`;
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const command = args[0] ?? "help";
  const timeoutIdx = args.indexOf("--timeout");
  const timeoutSec = timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : 90;
  const portIdx = args.indexOf("--port");
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : BRIDGE_PORT;
  const dash = args.indexOf("--");
  const rest = dash >= 0 ? args.slice(dash + 1) : args.slice(1).filter((a) => !a.startsWith("--") && a !== String(timeoutSec) && a !== String(port));
  return { command, timeoutMs: Math.max(3, timeoutSec) * 1000, port, rest };
}

async function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: "127.0.0.1", port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
  });
}

async function ensureServer(port: number) {
  if (await portOpen(port)) return;
  const child = spawn(process.execPath, [process.argv[1], "serve", "--port", String(port)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 20; i++) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Could not start the Lazy Hands bridge on 127.0.0.1:${port}`);
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(port));
    socket.addEventListener("open", () => resolve(socket));
    socket.addEventListener("error", () => reject(new Error("bridge socket failed")));
  });
}

async function approveRemote(port: number, command: string, cwd: string, timeoutMs: number): Promise<BridgeAnswer> {
  const socket = await connect(port);
  socket.send(JSON.stringify({ type: "hello", role: "cli" }));
  const ask: BridgeAsk = {
    type: "ask",
    id: `cli-${Date.now()}`,
    command,
    cwd,
    timeoutMs,
    createdAt: Date.now(),
  };
  socket.send(JSON.stringify(ask));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      resolve({ type: "answer", id: ask.id, decision: "timeout" });
    }, timeoutMs + 1000);
    socket.addEventListener("message", (event) => {
      const message = parseBridgeMessage(String(event.data));
      if (message?.type === "answer") {
        clearTimeout(timer);
        socket.close();
        resolve(message);
      }
    });
    socket.addEventListener("close", () => {
      clearTimeout(timer);
      reject(new Error("bridge closed"));
    });
  });
}

async function runCommand(argv: string[]) {
  return new Promise<number>((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export async function main(argv = process.argv) {
  const { command, timeoutMs, port, rest } = parseArgs(argv);
  if (command === "help" || command === "-h" || command === "--help") {
    process.stdout.write(help());
    return 0;
  }
  if (command === "serve") {
    const bridge = new ApprovalBridge(port);
    await bridge.listen();
    process.stdout.write(`Lazy Hands bridge on 127.0.0.1:${port}\n`);
    return new Promise<number>(() => undefined);
  }
  if (command === "approve") {
    if (rest.length === 0) {
      process.stderr.write("usage: lazyhands approve -- <command>\n");
      return 2;
    }
    await ensureServer(port);
    const line = rest.join(" ");
    process.stdout.write(`Waiting for a thumbs-up to run:\n  ${line}\n`);
    const answer = await approveRemote(port, line, process.cwd(), timeoutMs);
    if (answer.decision !== "approved") {
      process.stderr.write(`Refused (${answer.decision}). Command not run.\n`);
      return 3;
    }
    process.stdout.write("Approved. Running.\n");
    return runCommand(rest);
  }
  process.stderr.write(help());
  return 2;
}

export default main;
