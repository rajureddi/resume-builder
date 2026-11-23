import { containsTerm, skillSupported } from "./terms";
import { projectForVariant } from "./projectContent";
import type { Analysis, Profile, Project } from "./types";

export interface SkillSuggestion { skill: string; source: string; recommended: boolean }
export function buildSkillSuggestions(profile: Profile, projects: Project[], analysis: Pick<Analysis, "keywords" | "mustHave">, selectedIds: string[], variants: Record<string, string>, selectedExperienceIds: string[]): SkillSuggestion[] {
  const pool = new Map<string, { skill: string; source: string }>();
  const add = (skill: string, source: string) => { if (!pool.has(skill.toLowerCase())) pool.set(skill.toLowerCase(), { skill, source }); };
  for (const id of selectedIds) {
    const original = projects.find(project => project.id === id);
    if (original) for (const skill of projectForVariant(original, variants[id]).tags) add(skill, original.title);
  }
  for (const item of profile.experience ?? []) if (selectedExperienceIds.includes(item.id)) for (const skill of item.skills) add(skill, `${item.title} at ${item.company}`);
  for (const group of profile.skillGroups) for (const skill of group.items) add(skill, `Profile · ${group.label}`);
  const values = [...pool.values()];
  const result = values.map(item => ({ ...item, recommended: analysis.keywords.some(keyword => skillSupported(keyword, [item.skill]) || containsTerm(item.skill, keyword)) }));
  for (const keyword of analysis.keywords) if (!values.some(item => skillSupported(keyword, [item.skill]))) result.push({ skill: keyword, source: "Job description", recommended: false });
  return result.sort((a, b) => Number(b.recommended) - Number(a.recommended));
}
