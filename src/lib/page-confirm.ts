export type ButtonShape = {
  label: string;
  role?: string;
  disabled?: boolean;
  selector?: string;
  inDialog?: boolean;
  type?: string;
};

export type ConfirmCandidate = {
  label: string;
  selector: string;
  destructive: boolean;
  score: number;
};

const APPROVE_EXACT =
  /^(approve|confirm|allow|continue|accept|run|yes|ok|okay|execute|proceed|got it|do it)$/i;
const APPROVE_PHRASE =
  /\b(approve|confirm|allow this|run (the )?command|continue|accept|yes,?\s+do it|execute)\b/i;
const IGNORE =
  /\b(cancel|dismiss|close|not now|later|no thanks|edit|copy|share|subscribe|sign in|log in|search)\b/i;
const DESTRUCTIVE =
  /\b(delete|remove|destroy|purchase|buy now|pay|send payment|transfer|drop database|format|shutdown|revoke|uninstall|overwrite|force push)\b/i;
const CHAT_SEND = /^(send|submit)$/i;

export function isDestructiveLabel(label: string): boolean {
  return DESTRUCTIVE.test(label.trim());
}

export function classifyButton(button: ButtonShape): ConfirmCandidate | null {
  const label = button.label.replace(/\s+/g, " ").trim();
  if (!label || button.disabled) return null;
  if (IGNORE.test(label) && !APPROVE_EXACT.test(label)) return null;
  if (CHAT_SEND.test(label) && !button.inDialog) return null;

  const approve = APPROVE_EXACT.test(label) || (Boolean(button.inDialog) && APPROVE_PHRASE.test(label));
  const destructive = isDestructiveLabel(label);
  if (!approve && !destructive) return null;
  if (!approve && destructive && !button.inDialog) return null;

  let score = approve ? 12 : 4;
  if (button.inDialog) score += 8;
  if (button.role === "button" || button.type === "button" || button.type === "submit") score += 2;
  if (destructive) score += 1;

  return {
    label,
    selector: button.selector ?? "",
    destructive,
    score,
  };
}

export function pickConfirmCandidate(buttons: ButtonShape[]): ConfirmCandidate | null {
  let best: ConfirmCandidate | null = null;
  for (const button of buttons) {
    const candidate = classifyButton(button);
    if (!candidate) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

export function buttonsFromDocument(
  nodes: ArrayLike<{
    innerText?: string;
    textContent?: string | null;
    disabled?: boolean;
    type?: string;
    getAttribute?: (name: string) => string | null;
    closest?: (sel: string) => unknown;
  }>,
): ButtonShape[] {
  return Array.from(nodes).map((node, i) => ({
    label: (node.innerText ?? node.textContent ?? "").replace(/\s+/g, " ").trim(),
    role: node.getAttribute?.("role") ?? undefined,
    disabled: Boolean(node.disabled) || node.getAttribute?.("aria-disabled") === "true",
    type: node.type,
    selector: `[data-lh-btn="${i}"]`,
    inDialog: Boolean(node.closest?.("dialog, [role='dialog'], [role='alertdialog']")),
  }));
}
