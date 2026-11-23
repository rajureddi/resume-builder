import { containsTerm } from "./terms";
import type { ExperienceItem } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (value: string) => /^\d{4}-\d{2}$/.test(value) ? `${MONTHS[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}` : value;
export function experiencePeriod(item: ExperienceItem): string { return `${month(item.startDate)} – ${item.current ? "Present" : month(item.endDate)}`; }
export function experienceTitle(item: ExperienceItem): string {
  const type = item.type !== "Full-time" && !/intern|freelance|contract|volunteer|part-time/i.test(item.title) ? ` (${item.type})` : "";
  return `${item.title}${type} — ${item.company}`;
}
export function tailorExperience(items: ExperienceItem[], keywords: string[], selectedIds?: string[]): ExperienceItem[] {
  return items.filter(item => selectedIds === undefined || selectedIds.includes(item.id)).map(item => ({ ...item, skills: [...item.skills], bullets: [...item.bullets].sort((a, b) => keywords.filter(keyword => containsTerm(b, keyword)).length - keywords.filter(keyword => containsTerm(a, keyword)).length) })).sort((a, b) => (b.current ? "9999" : b.endDate).localeCompare(a.current ? "9999" : a.endDate));
}
