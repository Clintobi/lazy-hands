import { describe, expect, it } from "vitest";
import { classifyButton, pickConfirmCandidate } from "@/lib/page-confirm";

describe("page confirm hook", () => {
  it("refuses to treat a chat Send button as an approval", () => {
    expect(classifyButton({ label: "Send", inDialog: false })).toBeNull();
  });

  it("finds an Approve button inside a dialog", () => {
    const picked = pickConfirmCandidate([
      { label: "Cancel", inDialog: true, role: "button" },
      { label: "Approve", inDialog: true, role: "button", selector: "#ok" },
    ]);
    expect(picked?.label).toBe("Approve");
    expect(picked?.destructive).toBe(false);
  });

  it("marks a delete confirm as destructive", () => {
    const picked = classifyButton({
      label: "Delete project",
      inDialog: true,
      role: "button",
    });
    expect(picked?.destructive).toBe(true);
  });

  it("ignores disabled or cancel actions", () => {
    expect(classifyButton({ label: "Confirm", disabled: true, inDialog: true })).toBeNull();
    expect(classifyButton({ label: "Cancel", inDialog: true })).toBeNull();
  });

  it("does not pick a lone purchase button in the page chrome", () => {
    expect(pickConfirmCandidate([{ label: "Buy now", inDialog: false }])).toBeNull();
  });
});
