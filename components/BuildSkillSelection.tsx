"use client";

import { useState } from "react";
import { buildSkillSuggestions } from "@/lib/buildSkills";
import { experiencePeriod } from "@/lib/experience";
import type { Analysis, Profile, Project } from "@/lib/types";

export default function BuildSkillSelection({ profile, projects, analysis, selectedProjects, variants, skills, onSkills, experienceIds, onExperience, onBack, onGenerate }: {
  profile: Profile; projects: Project[]; analysis: Analysis; selectedProjects: string[]; variants: Record<string, string>;
  skills: string[]; onSkills: (skills: string[]) => void; experienceIds: string[]; onExperience: (ids: string[]) => void; onBack: () => void; onGenerate: () => void;
}) {
  const [manual, setManual] = useState("");
  const suggestions = buildSkillSuggestions(profile, projects, analysis, selectedProjects, variants, experienceIds);
  const manualSuggestions = skills.filter(skill => !suggestions.some(item => item.skill === skill)).map(skill => ({ skill, source: "Added for this resume", recommended: false }));
  const rows = [...suggestions, ...manualSuggestions];
  const toggle = (skill: string, enabled: boolean) => onSkills(enabled ? [...new Set([...skills, skill])] : skills.filter(item => item !== skill));
  return <div>
    <h2 className="section-title">Skills for this resume</h2>
    <p className="small muted">Recommended skills come from the job description and your selected project versions or experience. Choose the list that should appear in Technical Skills.</p>
    <div className="btn-row"><button className="btn" onClick={() => onSkills(suggestions.filter(item => item.recommended).map(item => item.skill))}>Use recommended skills</button><button className="btn btn-ghost" onClick={() => onSkills([])}>Clear skills</button><span className="chip">{skills.length} selected</span></div>
    <div className="build-skill-list">{rows.map(item => <label className="checkbox-row" key={item.skill}>
      <input type="checkbox" checked={skills.includes(item.skill)} onChange={event => toggle(item.skill, event.target.checked)} />
      <span className="row-main"><span className="row-title" style={{ fontSize: 15 }}>{item.skill} {item.recommended && <span className="chip forest">Recommended</span>}</span><span className="row-sub" style={{ display: "block" }}>{item.source}</span></span>
    </label>)}</div>
    <div className="skill-add-row"><input aria-label="Additional resume skills" value={manual} onChange={event => setManual(event.target.value)} placeholder="Add a skill, e.g. GraphQL" /><button className="btn" disabled={!manual.trim()} onClick={() => { onSkills([...new Set([...skills, ...manual.split(",").map(skill => skill.trim()).filter(Boolean)])]); setManual(""); }}>Add</button></div>
    <h2 className="section-title">Experience to include</h2>
    {(profile.experience ?? []).length ? <div>{profile.experience!.map(item => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={experienceIds.includes(item.id)} onChange={event => onExperience(event.target.checked ? [...experienceIds, item.id] : experienceIds.filter(id => id !== item.id))} /><span className="row-main"><strong>{item.title}</strong><span className="row-sub" style={{ display: "block" }}>{item.company} · {experiencePeriod(item)}</span></span></label>)}</div> : <p className="small muted">No experience added. You can add internships or work roles under More → Experience.</p>}
    {skills.length > 60 && <p className="form-error">Select up to 60 skills for one resume.</p>}
    <div className="btn-row section-gap"><button className="btn btn-ghost" onClick={onBack}>‹ Back to projects</button><button className="btn btn-primary" disabled={skills.length > 60} onClick={onGenerate}>Generate resume ({selectedProjects.length} projects)</button></div>
  </div>;
}
