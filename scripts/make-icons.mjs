import { createWriteStream } from "node:fs";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

mkdirSync("extension/icons", { recursive: true });
for (const size of [16, 48, 128]) {
  execFileSync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=#b64a28:s=${size}x${size}`,
    "-f",
    "lavfi",
    "-i",
    `color=c=#fbf3e4:s=${Math.max(2, Math.round(size * 0.35))}x${Math.max(2, Math.round(size * 0.18))}`,
    "-filter_complex",
    "overlay=(W-w)/2:(H-h)/2",
    "-frames:v",
    "1",
    `extension/icons/${size}.png`,
  ]);
}
void createWriteStream;
