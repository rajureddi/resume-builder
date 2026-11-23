function escapeTerm(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeTerm(term.toLowerCase())}([^a-z0-9]|$)`).test(text.toLowerCase());
}

export function skillSupported(skill: string, pool: string[]): boolean {
  const aliases: Record<string, string> = { nodejs: "node.js", nextjs: "next.js", "react.js": "react", sklearn: "scikit-learn", tflite: "tensorflow lite", postgres: "postgresql", "tailwind css": "tailwindcss", "rest api": "rest apis" };
  const canonical = (value: string) => aliases[value.toLowerCase().trim()] ?? value.toLowerCase().trim();
  return pool.some(item => canonical(item) === canonical(skill));
}
