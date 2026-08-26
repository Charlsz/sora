/**
 * Friendly teammate names — short contact-style labels, never the product brand.
 * Inspired by OpenMausBot’s name pool.
 */
const NAMES = [
  "Scout",
  "Pixel",
  "Atlas",
  "Nova",
  "Juno",
  "Koda",
  "Miso",
  "Mochi",
  "Pepper",
  "Clover",
  "Ember",
  "Willow",
  "Comet",
  "Orbit",
  "Echo",
  "Sage",
  "Zephyr",
  "Maple",
  "Cosmo",
  "Luna",
  "Otto",
  "Ivy",
  "Finch",
  "Wren",
  "Basil",
  "Hazel",
  "Nimbus",
  "Pearl",
  "Quill",
  "Rocket",
  "Sunny",
  "Vega",
  "Olive",
  "Cocoa",
  "Fig",
  "Juniper",
  "Moss",
  "Pebble",
  "Rio",
  "Skye",
  "Yuki",
  "Momo",
  "Kiwi",
  "Plum",
  "Sprout",
];

/** Reserved — product name must never be used as a teammate identity. */
const RESERVED = new Set(["sora", "openmausbot", "rakazo", "maus"]);

export function pickTeammateName(taken: Iterable<string>): string {
  const used = new Set(
    [...taken].map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  for (const r of RESERVED) used.add(r);
  const free = NAMES.filter((n) => !used.has(n.toLowerCase()));
  if (free.length > 0) {
    return free[Math.floor(Math.random() * free.length)]!;
  }
  const base = NAMES[Math.floor(Math.random() * NAMES.length)]!;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export function isReservedTeammateName(name: string): boolean {
  return RESERVED.has(name.trim().toLowerCase());
}
