import type { Application, Profile, SkillGroup } from "./types";

const EXTRA_GROUPS: Record<string, string[]> = {
  Languages: ["TypeScript", "Dart", "C++", "SQL", "HTML", "CSS"],
  Frameworks: ["Flutter", "Spring Boot", "Django", "FastAPI", "React Native"],
  "ML/AI": ["TensorFlow Lite", "MNN", "MediaPipe", "BERT", "ResNet34", "LLM", "RAG", "OCR", "Inference", "Object Detection", "Face Recognition"],
  Platforms: ["Android", "ARCore", "On-Device AI", "Mobile Development", "Computer Vision"],
};

export function groupedResumeSkills(profile: Profile, app: Pick<Application, "skills" | "skillGroups">): SkillGroup[] {
  const available = new Map(app.skills.map(skill => [skill.toLowerCase(), skill]));
  const groups: SkillGroup[] = [];
  for (const source of app.skillGroups ?? profile.skillGroups) {
    const items = source.items.map(item => available.get(item.toLowerCase())).filter((item): item is string => Boolean(item));
    for (const item of items) available.delete(item.toLowerCase());
    if (items.length) groups.push({ label: source.label, items });
  }
  for (const skill of available.values()) {
    const label = Object.entries(EXTRA_GROUPS).find(([, items]) => items.some(item => item.toLowerCase() === skill.toLowerCase()))?.[0] ?? "Tools";
    const group = groups.find(group => group.label === label);
    if (group) group.items.push(skill); else groups.push({ label, items: [skill] });
  }
  return groups;
}
