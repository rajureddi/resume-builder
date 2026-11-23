import type { ExperienceItem, SkillGroup } from "./types";

export function validSkillGroups(value: unknown): value is SkillGroup[] {
  return Array.isArray(value) && value.length <= 12 && value.every(group => group && typeof group.label === "string" && group.label.trim().length > 0 && group.label.length <= 40 && validStrings(group.items, 60, 80)) && value.reduce((count, group) => count + group.items.length, 0) <= 100;
}

export function validStrings(value: unknown, count: number, length: number): value is string[] {
  return Array.isArray(value) && value.length <= count && value.every(item => typeof item === "string" && item.length <= length);
}

export function validExperience(value: unknown): value is ExperienceItem[] {
  return Array.isArray(value) && value.length <= 20 && new Set(value.map(item => item?.id)).size === value.length && value.every(item => item &&
    typeof item.id === "string" && item.id.length <= 100 && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 150 &&
    typeof item.company === "string" && item.company.trim().length > 0 && item.company.length <= 150 && typeof item.location === "string" && item.location.length <= 150 &&
    typeof item.startDate === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.startDate) && typeof item.endDate === "string" &&
    (item.current || /^\d{4}-(0[1-9]|1[0-2])$/.test(item.endDate) && item.endDate >= item.startDate) && typeof item.current === "boolean" &&
    ["Full-time", "Internship", "Contract", "Part-time", "Freelance", "Volunteer"].includes(item.type) && validStrings(item.bullets, 12, 500) && validStrings(item.skills, 40, 80));
}
