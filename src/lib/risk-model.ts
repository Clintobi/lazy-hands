import { rateCommand, type RiskRating } from "./risk";
import { oneLineCommand } from "./summarize";

export async function rateCommandWithModel(
  command: string,
  opts: { allowRemoteWeights?: boolean } = {},
): Promise<RiskRating> {
  const base = rateCommand(command);
  const model = await oneLineCommand(command, base.blurb, opts);
  if (model.engine === "extractive") return base;
  const blurb = model.text.replace(/\s+/g, " ").trim();
  if (blurb.length < 12) return base;
  return {
    ...base,
    blurb,
    engine: model.engine,
    note: model.note,
  };
}
