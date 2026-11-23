"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { buildSkillSuggestions } from "@/lib/buildSkills";
import { projectForVariant, recommendedVariant } from "@/lib/projectContent";
import type { Analysis, Application, Profile, Project, ProjectIdea } from "@/lib/types";
import { BackBtn, OrbPanel, useStepCycle } from "./StudioUI";
import BuildSkillSelection from "./BuildSkillSelection";
import ProjectTemplateGallery from "./ProjectTemplateGallery";

const ANALYZE_STEPS = [
  "Detecting domain…",
  "Extracting keywords…",
  "Selecting projects…",
  "Scoring project fit…",
];
const GENERATE_STEPS = [
  "Writing your summary…",
  "Tailoring project bullets…",
  "Ordering skills for this JD…",
  "Scoring the new resume…",
];

export default function BuildView({
  projects,
  profile,
  draft,
  onDraft,
  onTemplate,
  onCreated,
  goHome,
  showToast,
}: {
  projects: Project[];
  profile: Profile;
  draft: { company: string; role: string; jd: string };
  onDraft: (draft: { company: string; role: string; jd: string }) => void;
  onTemplate: (project: Project) => void;
  onCreated: (a: Application) => void;
  goHome: () => void;
  showToast: (m: string) => void;
}) {
  const [company, setCompany] = useState(draft.company);
  const [role, setRole] = useState(draft.role);
  const [jd, setJd] = useState(draft.jd);
  const [phase, setPhase] = useState<"form" | "analyzing" | "select" | "skills" | "generating">("form");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ideasAdded, setIdeasAdded] = useState<ProjectIdea[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [skills, setSkills] = useState<string[]>([]);
  const [experienceIds, setExperienceIds] = useState((profile.experience ?? []).map(item => item.id));
  const [showTemplates, setShowTemplates] = useState(false);
  useEffect(() => { onDraft({ company, role, jd }); }, [company, role, jd, onDraft]);
  const reviewSkills = () => {
    if (!analysis || !selected.length && !experienceIds.length) { showToast("Select a project or experience entry"); return; }
    const suggestions = buildSkillSuggestions(profile, projects, analysis, selected, variants, experienceIds);
    const recommended = suggestions.filter(item => item.recommended).map(item => item.skill);
    setSkills(recommended.length ? recommended : suggestions.filter(item => item.source !== "Job description").slice(0, 10).map(item => item.skill));
    setPhase("skills");
  };
  const [error, setError] = useState("");
  const step = useStepCycle(ANALYZE_STEPS, phase === "analyzing");
  const genStep = useStepCycle(GENERATE_STEPS, phase === "generating");

  const analyze = async () => {
    setError("");
    if (!company.trim() || !role.trim()) {
      setError("Enter the company and the role first.");
      return;
    }
    if (jd.trim().length < 30) {
      setError("Paste the full job description — at least a few lines.");
      return;
    }
    setPhase("analyzing");
    try {
      const [data] = await Promise.all([
        api<{ analysis: Analysis; ideasAdded?: ProjectIdea[] }>("/api/analyze-job", {
          method: "POST",
          json: { jdText: jd, company: company.trim(), role: role.trim() },
        }),
        new Promise((r) => setTimeout(r, 1400)),
      ]);
      setAnalysis(data.analysis);
      setVariants(Object.fromEntries(data.analysis.rankedProjects.map(item => [item.project.id, recommendedVariant(item.project, data.analysis.keywords)])));
      setIdeasAdded(data.ideasAdded ?? []);
      const top = data.analysis.rankedProjects
        .filter((r) => r.score > 0)
        .slice(0, (profile.experience ?? []).length ? 3 : 4)
        .map((r) => r.project.id);
      setSelected(top.length ? top : data.analysis.rankedProjects.slice(0, 3).map((r) => r.project.id));
      setPhase("select");
    } catch (e) {
      setPhase("form");
      setError(e instanceof Error ? e.message : "Analysis failed. Try again.");
    }
  };

  const generate = async () => {
    if (!selected.length && !experienceIds.length) {
      showToast("Select at least one project");
      return;
    }
    setPhase("generating");
    try {
      const data = await api<{ application: Application }>("/api/tailor-resume", {
        method: "POST",
        json: { company, role, jdText: jd, selectedProjectIds: selected, projectVariants: Object.fromEntries(selected.map(id => [id, variants[id] ?? ""])), selectedSkills: skills, selectedExperienceIds: experienceIds, analysis },
      });
      showToast(`New resume created — ATS ${data.application.atsScore}/100`);
      onCreated(data.application);
    } catch (e) {
      setPhase("skills");
      showToast(e instanceof Error ? e.message : "Generation failed. Try again.");
    }
  };

  return (
    <div>
      <BackBtn label="Home" onClick={goHome} />
      <p className="eyebrow">Build a new resume</p>
      <h1 className="page-title">New application</h1>
      <div className="steps">
        <span className={`step-dot ${phase === "form" || phase === "analyzing" ? "active" : "done"}`}>01 · Job details</span>
        <span className={`step-dot ${phase === "select" ? "active" : (phase === "skills" || phase === "generating") ? "done" : ""}`}>02 · Domain & projects</span>
        <span className={`step-dot ${phase === "skills" ? "active" : phase === "generating" ? "done" : ""}`}>03 · Skills & experience</span>
        <span className={`step-dot ${phase === "generating" ? "active" : ""}`}>04 · Generate resume</span>
      </div>

      {(phase === "form" || phase === "analyzing") && (
        <>
          <label className="field">
            <span>Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Freshworks" />
          </label>
          <label className="field">
            <span>Role</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. AI Engineer Intern" />
          </label>
          <label className="field">
            <span>Full job description</span>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the complete job description here…"
              style={{ minHeight: 190 }}
            />
            <span className="hint">{jd.trim() ? `${jd.trim().split(/\s+/).length} words` : "The domain and projects are chosen from this text."}</span>
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          {phase === "analyzing" ? (
            <OrbPanel state="searching" text={step} sub="Reading the job description like a recruiter would" />
          ) : (
            <button className="btn btn-primary btn-block" onClick={analyze}>
              Analyse JD — detect domain & pick projects
            </button>
          )}
        </>
      )}

      {phase === "select" && analysis && (
        <>
          <p>
            Detected domain{" "}
            <span className="chip forest">{analysis.domainPrimary}</span>
            {analysis.domainSecondary ? (
              <>
                {" "}· secondary <span className="chip">{analysis.domainSecondary}</span>
              </>
            ) : null}{" "}
            <span className="chip">{analysis.engine === "llm" ? "AI analysis" : "Built-in analysis"}</span>
          </p>
          {analysis.keywords.length > 0 && (
            <p className="small muted">
              JD keywords found: {analysis.keywords.slice(0, 14).join(", ")}
              {analysis.keywords.length > 14 ? ` +${analysis.keywords.length - 14} more` : ""}
            </p>
          )}
          <p className="eyebrow section-gap">Projects selected for this domain — change if you want</p>
          <div>{analysis.rankedProjects.map(item => {
            const active = selected.includes(item.project.id);
            const source = projectForVariant(item.project, variants[item.project.id]);
            return <div className="build-project-card" key={item.project.id}>
              <label className="checkbox-row"><input type="checkbox" checked={active} onChange={event => setSelected(event.target.checked ? [...selected, item.project.id] : selected.filter(id => id !== item.project.id))} /><span className="row-main"><strong>{item.project.title}</strong><span className="row-sub" style={{ display: "block" }}>{item.reasons.join(" · ") || "Additional project"}</span></span></label>
              {active && <div className="build-project-detail"><p className="small muted">{source.tags.join(", ")}</p>
                {item.project.stackVariants?.length ? <label className="field"><span>Project stack version</span><select value={variants[item.project.id] ?? ""} onChange={event => setVariants({ ...variants, [item.project.id]: event.target.value })}><option value="">Original — {item.project.tags.slice(0, 3).join(" + ")}</option>{item.project.stackVariants.map(variant => <option value={variant.id} key={variant.id}>{variant.label}</option>)}</select></label> : null}
                <ul className="project-points">{source.bullets.slice(0, 3).map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
              </div>}
            </div>;
          })}</div>
          <button className="btn section-gap" onClick={() => setShowTemplates(value => !value)}>{showTemplates ? "Hide project templates" : "Browse project templates"}</button>
          {showTemplates && <div className="section-gap"><ProjectTemplateGallery domain={analysis.domainPrimary} onChoose={onTemplate} /></div>}
          {ideasAdded.length > 0 && (
            <div className="idea-note">
              <strong>Added to Build Later:</strong>{" "}
              {ideasAdded.map((i) => i.title).join(" · ")} — this JD asks for
              something your project library doesn't cover yet. The idea is
              saved under More → Build Later. It is <strong>not</strong> in
              this resume — ideas only count once you actually build the
              project and convert it.
            </div>
          )}
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setPhase("form")}>‹ Back to job details</button>
            <button className="btn btn-primary" onClick={reviewSkills}>
              Next: skills & experience
            </button>
          </div>
          <p className="small muted">A brand-new resume is saved for this job. Your other resumes are never overwritten.</p>
        </>
      )}

      {phase === "skills" && analysis && <BuildSkillSelection profile={profile} projects={projects} analysis={analysis} selectedProjects={selected} variants={variants} skills={skills} onSkills={setSkills} experienceIds={experienceIds} onExperience={setExperienceIds} onBack={() => setPhase("select")} onGenerate={generate} />}

      {phase === "generating" && (
        <OrbPanel state="composing" text={genStep} sub={`Building ${company} — ${role}`} />
      )}
      <p className="small muted" style={{ marginTop: 10 }}>{projects.length} projects in your library are considered for every JD.</p>
    </div>
  );
}
