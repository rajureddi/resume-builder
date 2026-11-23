import { containsTerm } from "./terms";
import type { Project, TailoredProject } from "./types";

const ACTION = /^(?:I\s+|We\s+)?(?:built|developed|designed|implemented|engineered|integrated|created|deployed|trained|optimized|optimised|delivered|automated|tested|maintained|led|launched|enabled|kept|improved|reduced|achieved|fine-tuned|wrote|shipped)\b/i;
const clean = (text: string) => text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const identity = (text: string) => clean(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const linkIdentity = (text: string) => text.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

export function projectForVariant(project: Project, variantId?: string): Project {
  const variant = project.stackVariants?.find(variant => variant.id === variantId);
  return variant ? { ...project, tags: [...variant.tags], description: variant.description || project.description, bullets: [...variant.bullets], domains: variant.domains ?? project.domains } : project;
}

export function recommendedVariant(project: Project, keywords: string[]): string {
  const score = (tags: string[]) => keywords.filter(keyword => tags.some(tag => containsTerm(tag, keyword))).length;
  const base = score(project.tags);
  const variants = (project.stackVariants ?? []).map(variant => ({ id: variant.id, score: score(variant.tags) })).sort((a, b) => b.score - a.score);
  return variants[0]?.score > base ? variants[0].id : "";
}

export function distinctBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  return bullets.map(bullet => clean(bullet.replace(/^[•*▪-]\s*/, ""))).filter(bullet => {
    const key = identity(bullet);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function actionBullet(text: string): string {
  const normalized = clean(text).replace(/^(?:I|We)\s+/i, "");
  const result = ACTION.test(normalized) ? normalized : `Developed ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
  return `${result.charAt(0).toUpperCase()}${result.slice(1).replace(/[.!?]$/, "")}.`;
}

/** First point describes the project; following points highlight relevant implementation. */
export function roleProjectBullets(project: Project, role: string, keywords: string[]): string[] {
  const original = distinctBullets(project.bullets);
  const description = clean(project.description).split(/(?<=[.!?])\s+/)[0];
  const overview = original[0] || description || `Built ${project.title}`;
  const emphasis = `${role} ${keywords.join(" ")}`;
  const rank = (bullet: string) => keywords.filter(keyword => containsTerm(bullet, keyword)).length * 3 +
    (/frontend|react|flutter|mobile|ui/i.test(emphasis) && /frontend|interface|react|flutter|mobile|ui|client/i.test(bullet) ? 2 : 0) +
    (/backend|database|sql|api/i.test(emphasis) && /backend|database|sql|api|query|server/i.test(bullet) ? 2 : 0) +
    (/rag|llm|machine learning|data/i.test(emphasis) && /retrieval|rag|model|training|data|inference/i.test(bullet) ? 2 : 0);
  const rest = original.slice(1).sort((a, b) => rank(b) - rank(a));
  if (!rest.length && project.tags.length) {
    const stack = [...project.tags].sort((a, b) => Number(keywords.some(keyword => containsTerm(b, keyword))) - Number(keywords.some(keyword => containsTerm(a, keyword)))).slice(0, 4);
    rest.push(`Implemented the project using ${stack.join(", ")} for its core functionality`);
  }
  return distinctBullets([overview, ...rest]).slice(0, 3).map(actionBullet);
}

export function projectRewriteBullets(project: Project, proposed: string[], role: string, keywords: string[]): string[] {
  const baseline = roleProjectBullets(project, role, keywords);
  const rewritten = distinctBullets([baseline[0], ...proposed.slice(1)]);
  return distinctBullets(rewritten.length < 2 ? [...rewritten, ...baseline.slice(1)] : rewritten).slice(0, 3);
}

export function canonicalProject(source: TailoredProject, library: Project[]): TailoredProject {
  const project = library.find(project => project.id === source.projectId) ?? library.find(project => identity(project.title) === identity(source.title)) ?? library.find(project => source.tech.toLowerCase().startsWith(project.title.toLowerCase())) ?? library.find(project => project.github && source.github && linkIdentity(project.github) === linkIdentity(source.github));
  if (!project) return { ...source, bullets: distinctBullets(source.bullets) };
  const selected = projectForVariant(project, source.variantId);
  return { ...source, projectId: project.id, title: project.title, tech: selected.tags.join(", "), github: project.github, bullets: distinctBullets(selected.bullets) };
}

/** Only headings open a new project. Action sentences and wrapped prose remain bullets. */
export function parseProjectBlocks(lines: string[], library: Project[] = []): TailoredProject[] {
  const projects: TailoredProject[] = [];
  const create = (title: string, tech = "", project?: Project) => {
    const item: TailoredProject = { projectId: project?.id ?? `ext-${projects.length}`, title: project?.title ?? title, tech, bullets: [], github: "" };
    projects.push(item); return item;
  };
  let current: TailoredProject | undefined;
  let lastWasBullet = false;
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    if (/^(?:github:|https?:\/\/github\.com\/)/i.test(line)) {
      const href = line.replace(/^github:\s*/i, "");
      if (current) {
        current.github = href;
        const known = library.find(project => project.github && linkIdentity(project.github) === linkIdentity(href));
        if (known && current.projectId.startsWith("ext-")) { current.projectId = known.id; current.title = known.title; }
      }
      lastWasBullet = false; continue;
    }
    const isBullet = /^[•*▪-]\s/.test(line);
    if (isBullet || ACTION.test(line)) {
      current ??= create("Selected Project");
      current.bullets.push(line.replace(/^[•*▪-]\s*/, "")); lastWasBullet = true; continue;
    }
    const heading = line.replace(/^#{1,6}\s*/, "");
    const parts = heading.match(/^(.+)\s+\(([^)]+)\)$/);
    const title = parts?.[1] ?? heading;
    const known = library.find(project => identity(title) === identity(project.title) || identity(title) === identity(project.title.split("—")[0]) || title.length >= 16 && project.title.toLowerCase().startsWith(title.toLowerCase()));
    if (known) { current = create(known.title, parts?.[2] ?? "", known); lastWasBullet = false; continue; }
    if (current && !current.bullets.length && /[,|]/.test(line) && line.length < 240 && !/[.!?]\s/.test(line)) {
      current.tech = line.replace(/^(?:stack|technologies|tech):\s*/i, ""); continue;
    }
    if (current && lastWasBullet && (/^[a-z(0-9]/.test(line) || line.length > 100)) {
      current.bullets[current.bullets.length - 1] += ` ${line}`; continue;
    }
    if (current && !current.bullets.length && library.some(project => project.id === current!.projectId && project.title.includes(line))) continue;
    const looksLikeHeading = title.length <= 100 && title.split(/\s+/).length <= 12 && !/[.!?](?:\s|$)/.test(title);
    if (!current || looksLikeHeading && (current.github || current.bullets.length || !current.tech)) {
      current = create(title, parts?.[2] ?? ""); lastWasBullet = false;
    } else { current.bullets.push(line); lastWasBullet = true; }
  }
  return projects.map(project => ({ ...project, bullets: distinctBullets(project.bullets) }));
}

export function validRewrittenBullets(source: Project, proposed: unknown, knownSkills: string[], minimum = source.tags.length ? 2 : 1): proposed is string[] {
  if (!Array.isArray(proposed) || proposed.length < minimum || proposed.length > 3 || !proposed.every(bullet => typeof bullet === "string" && bullet.trim().length > 10 && bullet.length <= 500) || distinctBullets(proposed).length < minimum) return false;
  const facts = `${source.description} ${source.tags.join(" ")} ${source.bullets.join(" ")}`;
  const numbers = new Set(facts.match(/\d[\d,.]*(?:%|\+)?/g) ?? []);
  return (proposed as string[]).every(bullet => (bullet.match(/\d[\d,.]*(?:%|\+)?/g) ?? []).every(number => numbers.has(number)) && knownSkills.filter(skill => containsTerm(bullet, skill)).every(skill => containsTerm(facts, skill)));
}
