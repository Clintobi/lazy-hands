/**
 * Product naming lives here so a rename is one file, not a hunt.
 * Do not confuse this project with other similarly named tools.
 */
export const brand = {
  name: "Lazy Hands",
  slug: "lazy-hands",
  short: "Lazy Hands",
  tagline: "Watch the film. Leave the remote in the cushions.",
  description:
    "A private, on-device player that reads your hands and your face, then waits for a thumbs-up before it does anything.",
  challenge:
    "DEV Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady",
} as const;

export type Brand = typeof brand;
