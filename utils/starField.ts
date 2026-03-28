export interface Star { x: number; y: number; r: number; o: number; }
export interface StarFieldOptions { seed?: number; count?: number; opacityVariation?: number; }

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateStars(width: number, height: number, options: StarFieldOptions = {}): Star[] {
  const { seed = 42, count = 200, opacityVariation = 0.15 } = options;
  const rng = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({ x: rng() * width, y: rng() * height, r: 0.25 + rng() * 0.75, o: 0.05 + rng() * opacityVariation });
  }
  return stars;
}
