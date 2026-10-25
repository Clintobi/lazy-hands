export const RISK_TIERS = ["low", "medium", "high", "critical"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const HOLD_BY_TIER: Record<RiskTier, number> = {
  low: 800,
  medium: 1200,
  high: 1800,
  critical: 2400,
};

export type RiskEngine = "gemma-webllm" | "distilbart" | "heuristic";

export type RiskRating = {
  tier: RiskTier;
  holdMs: number;
  blurb: string;
  engine: RiskEngine;
  note: string;
};

const CRITICAL = [
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/i,
  /\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/i,
  /\bdd\b[\s\S]*\bif=/i,
  /\bmkfs\b/i,
  /\bwipefs\b/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bdrop\s+(database|schema|table|db)\b/i,
  /\bgit\s+push\b[\s\S]*(--force-with-lease|--force|-f\b)/i,
  /\bgit\s+reset\b[\s\S]*--hard\b/i,
  /\bkubectl\s+delete\b/i,
  /\b(npm|pnpm|yarn|poetry|twine|gem|cargo)\s+publish\b/i,
  /\bnpm\s+unpublish\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bdiskutil\s+erase/i,
  /\bterraform\s+destroy\b/i,
  /\bfind\b[\s\S]*\s-delete\b/i,
  /\bdocker\s+system\s+prune\b/i,
];

const HIGH = [
  /\bsudo\b/i,
  /\brm\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+checkout\s+\./i,
  /\b(delete|unlink|truncate)\b/i,
  /\bkill\s+-9\b/i,
  /\b(chmod|chown)\b/i,
  /\bnpm\s+uninstall\s+-g\b/i,
  /\bdocker\s+rm\b/i,
  /\bhelm\s+uninstall\b/i,
  /\bmv\b[\s\S]*\/dev\/null/i,
  /\b(curl|wget)\b[\s\S]*\|\s*(sudo\s+)?(ba)?sh\b/i,
  /\bcat\b[\s\S]*(\.env|id_rsa|id_ed25519|\.ssh\/)/i,
  /\bgit\s+show\b[\s\S]*\.env/i,
];

const LOW_WHOLE =
  /^(echo|ls|pwd|whoami|date|true|false|hostname|uname|which|type|git\s+(status|diff|log|branch)|npm\s+(test|run)|pnpm\s+(test|run)|yarn\s+(test|run)|node\s+-(-version|v)|python3?\s+-(-version|V))(\s|$)/i;

export function clipCommand(command: string, max = 72): string {
  const clean = command.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function classifyCommandTier(command: string): RiskTier {
  const line = command.replace(/\s+/g, " ").trim();
  if (!line) return "medium";
  if (CRITICAL.some((re) => re.test(line))) return "critical";
  if (HIGH.some((re) => re.test(line))) return "high";
  if (LOW_WHOLE.test(line) && !/[|&;]/.test(line)) return "low";
  return "medium";
}

export function heuristicBlurb(command: string, tier: RiskTier): string {
  const line = command.replace(/\s+/g, " ").trim();
  if (!line) return "Empty command. Nothing runs until something concrete is waiting.";
  if (/\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*[rf]\b/i.test(line)) {
    const target = line.replace(/^[\s\S]*?\brm\s+-[a-zA-Z]+\s+/i, "").trim() || "those paths";
    return `This would recursively delete ${clipCommand(target, 48)}.`;
  }
  if (/\bgit\s+push\b/i.test(line) && /--force-with-lease|--force|-f\b/.test(line)) {
    return "This would overwrite remote git history.";
  }
  if (/\bgit\s+reset\b[\s\S]*--hard\b/i.test(line)) {
    return "This would throw away uncommitted work.";
  }
  if (/\b(npm|pnpm|yarn|poetry|twine|gem|cargo)\s+publish\b/i.test(line)) {
    return "This would publish a package to a public registry.";
  }
  if (/\b(shutdown|reboot|halt|poweroff)\b/i.test(line)) {
    return "This would shut the machine down.";
  }
  if (/\bdrop\s+(database|schema|table|db)\b/i.test(line)) {
    return "This would drop a database object.";
  }
  if (/\bkubectl\s+delete\b/i.test(line)) {
    return "This would delete a Kubernetes object.";
  }
  if (/\bsudo\b/i.test(line)) {
    return "This would run with elevated privileges.";
  }
  if (tier === "low") return `Looks like a read or print: ${clipCommand(line)}.`;
  if (tier === "high") return `This can change files or remotes: ${clipCommand(line)}.`;
  return `A command is waiting: ${clipCommand(line)}.`;
}

export function rateCommand(command: string): RiskRating {
  const tier = classifyCommandTier(command);
  return {
    tier,
    holdMs: HOLD_BY_TIER[tier],
    blurb: heuristicBlurb(command, tier),
    engine: "heuristic",
    note: "Local heuristic. The model has not rewritten this line yet.",
  };
}

export function ratePageLabel(label: string, destructive: boolean): RiskRating {
  if (destructive) {
    return {
      tier: "high",
      holdMs: HOLD_BY_TIER.high,
      blurb: `This looks like it could change something (${label}).`,
      engine: "heuristic",
      note: "Label heuristic. Destructive page confirms use the long hold.",
    };
  }
  return {
    tier: "low",
    holdMs: HOLD_BY_TIER.low,
    blurb: `A held thumb clicks ${label}. A held palm leaves it alone.`,
    engine: "heuristic",
    note: "Label heuristic.",
  };
}

export function formatRiskLine(rating: RiskRating): string {
  return `${rating.tier.toUpperCase()} · ${secondsLabel(rating.holdMs)} hold · ${rating.blurb}`;
}

export function formatRiskKicker(tier: RiskTier | undefined, holdMs: number): string {
  const label = (tier ?? "low").replace(/^./, (c) => c.toUpperCase());
  return `${label} · ${secondsLabel(holdMs)} hold`;
}

export function secondsLabel(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")}s`;
}

export function formatAgentDetail(command: string, cwd: string, rating: RiskRating): string {
  const where = cwd ? ` · ${cwd}` : "";
  return `${rating.blurb}${where}`;
}

