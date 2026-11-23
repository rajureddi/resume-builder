import { validStrings } from "./profileValidation";
import type { ProjectStackVariant } from "./types";

export function validStackVariants(value: unknown): value is ProjectStackVariant[] {
  return Array.isArray(value) && value.length <= 8 && value.every(variant => variant && typeof variant.id === "string" && variant.id.length > 0 && variant.id.length <= 100 && typeof variant.label === "string" && variant.label.trim().length > 0 && variant.label.length <= 100 && validStrings(variant.tags, 40, 80) && typeof variant.description === "string" && variant.description.length <= 3000 && validStrings(variant.bullets, 8, 500) && (variant.domains === undefined || validStrings(variant.domains, 20, 80)));
}

export function validProjectFields(value: Record<string, unknown>, partial = false): boolean {
  if ((!partial || value.title !== undefined) && (typeof value.title !== "string" || !value.title.trim() || value.title.length > 200)) return false;
  for (const key of ["tags", "domains", "bullets"]) if (value[key] !== undefined && !validStrings(value[key], key === "bullets" ? 12 : 60, key === "bullets" ? 1000 : 100)) return false;
  for (const key of ["description", "github", "year", "templateId", "highlight"]) if (value[key] !== undefined && (typeof value[key] !== "string" || (value[key] as string).length > (key === "description" ? 4000 : 2000))) return false;
  return value.stackVariants === undefined || validStackVariants(value.stackVariants);
}
