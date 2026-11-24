"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Orb from "./Orb";
import { api } from "@/lib/apiClient";
import { BackBtn, OrbPanel, useStepCycle } from "./StudioUI";
import BuildView from "./BuildView";
import ExperienceView from "./ExperienceView";
import SkillsView from "./SkillsView";
import ProjectEditor from "./ProjectEditor";
import ProjectTemplateGallery from "./ProjectTemplateGallery";
import ResumePreview from "./ResumePreview";
import ResumeEditor, { type ResumeEdits } from "./ResumeEditor";
import SettingsView from "./SettingsView";
import { getLocalPublicSettings, LOCAL_LLM_SETTINGS_KEY } from "@/lib/localLlmSettings";
import { downloadResume } from "@/lib/resumeDownload";
import { BROWSER_STUDIO_KEY } from "@/lib/browserDb";
import BrowserStorageTools from "./BrowserStorageTools";
import type {
  Application,
  AtsCheck,
  FixEntry,
  LlmSettingsPublic,
  MissingItem,
  Profile,
  Project,
  ProjectIdea,
} from "@/lib/types";

/* ───────────────────────── helpers ───────────────────────── */

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type View =
  | "home" | "build" | "resumes" | "resume" | "ats" | "ats-result"
  | "more" | "projects" | "project-form" | "build-later" | "profile" | "settings" | "iphone" | "skills" | "experience";

/* ───────────────────────── icons (SVG line) ───────────────────────── */

const ic = (paths: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const IconHome = () => ic(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></>);
const IconDoc = () => ic(<><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h7M9 17h7" /></>);
const IconGauge = () => ic(<><path d="M4 14a8 8 0 1 1 16 0" /><path d="M12 14l4.5-4.5" /><path d="M2.5 19h19" /></>);
const IconList = () => ic(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>);
const IconDots = () => ic(<><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>);
const IconUpload = () => ic(<><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>);
const IconPlus = () => ic(<><path d="M12 5v14M5 12h14" /></>);
const IconBrief = () => ic(<><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3" /></>);

/* ───────────────────────── small components ───────────────────────── */

function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(score), 60);
    return () => clearTimeout(t);
  }, [score]);
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E4DFD2" strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="#0C5B3E" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.max(0, Math.min(100, shown))) / 100}
          style={{ transition: "stroke-dashoffset 0.9s ease" }}
        />
      </svg>
      <div className="ring-label" style={{ fontSize: size / 3.6 }}>{score}</div>
    </div>
  );
}

function MiniScore({ score }: { score: number }) {
  return (
    <span className="chip solid" title="ATS score">
      ATS {score}
    </span>
  );
}

/* ───────────────────────── App shell ───────────────────────── */

interface Boot {
  profile: Profile;
  projects: Project[];
  llm: LlmSettingsPublic;
  counts: { applications: number; atsChecks: number; projectIdeas: number };
  authEnabled: boolean;
}

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootError, setBootError] = useState("");
  const [view, setView] = useState<View>("home");
  const [toast, setToast] = useState("");
  const [currentApp, setCurrentApp] = useState<Application | null>(null);
  const [currentCheck, setCurrentCheck] = useState<AtsCheck | null>(null);
  const [projectReturn, setProjectReturn] = useState<View>("projects");
  const [buildDraft, setBuildDraft] = useState({ company: "", role: "", jd: "" });
  const [editingProject, setEditingProject] = useState<Project | "new" | null>(null);
  const [atsPrefill, setAtsPrefill] = useState<{ resumeText: string; resumeName: string; sourceType: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3400);
  }, []);

  const refreshBoot = useCallback(async () => {
    const [data, site] = await Promise.all([
      api<Boot & { ok: boolean }>("/api/bootstrap"),
      api<{ authEnabled: boolean }>("/api/site-config").catch(() => ({ authEnabled: false })),
    ]);
    const next = { ...data, authEnabled: site.authEnabled, llm: getLocalPublicSettings() };
    setBoot(next);
    return next;
  }, []);

  useEffect(() => {
    Promise.all([refreshBoot(), new Promise((r) => setTimeout(r, 1000))]).catch(
      (e) => setBootError(e instanceof Error ? e.message : "Failed to load the app")
    );
  }, [refreshBoot]);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === LOCAL_LLM_SETTINGS_KEY || event.key === BROWSER_STUDIO_KEY || event.key === null) refreshBoot().catch(() => undefined);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [refreshBoot]);

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  if (bootError) {
    return (
      <main className="shell">
        <div className="empty">
          <h1 className="page-title">Something went wrong</h1>
          <p className="lede">{bootError}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </main>
    );
  }

  if (!boot) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#141310" }}>
        <div style={{ textAlign: "center", color: "#F2EFE6" }}>
          <div style={{ display: "grid", placeItems: "center", marginBottom: 14 }}>
            <Orb state="connecting" size={64} theme="dark" />
          </div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>Resume Studio</div>
          <div style={{ color: "#A49E8C", fontSize: 13, marginTop: 4 }}>Loading your studio…</div>
        </div>
      </main>
    );
  }

  const navView: View = ["more", "projects", "build-later", "profile", "settings", "iphone", "skills", "experience"].includes(view) ? "more" : view === "project-form" ? (projectReturn === "build" ? "build" : "more") : view === "resume" ? "resumes" : view === "ats-result" ? "ats" : view;
  const navItem = (v: View, label: string, icon: React.ReactNode) => (
    <button key={v} className={navView === v ? "active" : ""} aria-current={navView === v ? "page" : undefined} onClick={() => go(v)}>
      <span className="nav-ic">{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      <header className="band">
        <div className="band-inner">
          <div className="band-orb">
            <Orb state="breathing" size={64} theme="dark" />
          </div>
          <div className="band-titles">
            <p className="wordmark">Resume Studio</p>
            <p className="wordmark-sub">Raju Bandam — ATS Resume Builder</p>
          </div>
          <button
            className={`status-pill ${boot.llm.hasKey ? "on" : ""}`}
            onClick={() => go("settings")}
            title="AI settings"
          >
            {boot.llm.statusLabel}
          </button>
        </div>
      </header>

      <main className="shell">
        {view === "home" && (
          <HomeView
            boot={boot}
            go={go}
            openApp={(a) => { setCurrentApp(a); go("resume"); }}
          />
        )}
        {view === "build" && (
          <BuildView
            projects={boot.projects}
            profile={boot.profile}
            draft={buildDraft}
            onDraft={setBuildDraft}
            onTemplate={(project) => { setEditingProject(project); setProjectReturn("build"); go("project-form"); }}
            showToast={showToast}
            onCreated={(a) => { setCurrentApp(a); refreshBoot(); go("resume"); }}
            goHome={() => go("home")}
          />
        )}
        {view === "resumes" && (
          <ResumesView
            goHome={() => go("home")}
            openApp={(a) => { setCurrentApp(a); go("resume"); }}
            showToast={showToast}
          />
        )}
        {view === "resume" && currentApp && (
          <ResumeDetailView
            app={currentApp}
            profile={boot.profile}
            goBack={() => go("resumes")}
            showToast={showToast}
            onSaved={(a) => setCurrentApp(a)}
            checkThis={(a) => {
              setAtsPrefill({ resumeText: a.text, resumeName: `${a.company} — ${a.role}`, sourceType: "saved" });
              go("ats");
            }}
            onDeleted={() => { refreshBoot(); go("resumes"); }}
          />
        )}
        {view === "ats" && (
          <AtsView
            prefill={atsPrefill}
            clearPrefill={() => setAtsPrefill(null)}
            goHome={() => go("home")}
            showResult={(c) => { setCurrentCheck(c); go("ats-result"); }}
            showToast={showToast}
          />
        )}
        {view === "ats-result" && currentCheck && (
          <AtsResultView
            check={currentCheck}
            goBack={() => go("ats")}
            goHome={() => go("home")}
            showToast={showToast}
            onUpdated={(c) => setCurrentCheck(c)}
            openFixedResume={(a) => { setCurrentApp(a); refreshBoot(); go("resume"); }}
          />
        )}
        {view === "more" && (
          <MoreView go={go} authEnabled={boot.authEnabled} refresh={refreshBoot} />
        )}
        {view === "projects" && (
          <ProjectsView
            projects={boot.projects}
            goBack={() => go("more")}
            edit={(p) => { setEditingProject(p); setProjectReturn("projects"); go("project-form"); }}
          />
        )}
        {view === "build-later" && (
          <BuildLaterView
            goBack={() => go("more")}
            goHome={() => go("home")}
            refresh={refreshBoot}
            showToast={showToast}
          />
        )}
        {view === "project-form" && editingProject !== null && (
          <ProjectEditor
            project={editingProject === "new" ? null : editingProject}
            goBack={() => go(projectReturn)}
            refresh={refreshBoot}
            showToast={showToast}
          />
        )}
        {view === "profile" && (
          <ProfileView
            profile={boot.profile}
            goBack={() => go("more")}
            goHome={() => go("home")}
            refresh={refreshBoot}
            showToast={showToast}
          />
        )}
        {view === "experience" && <ExperienceView profile={boot.profile} goBack={() => go("more")} refresh={refreshBoot} showToast={showToast} />}
        {view === "skills" && <SkillsView profile={boot.profile} goBack={() => go("more")} refresh={refreshBoot} showToast={showToast} />}
        {view === "settings" && (
          <SettingsView
            llm={boot.llm}
            goBack={() => go("more")}
            goHome={() => go("home")}
            refresh={refreshBoot}
            showToast={showToast}
          />
        )}
        {view === "iphone" && <IphoneView goBack={() => go("more")} />}
      </main>

      <nav className="bottom-nav">
        {navItem("home", "Home", <IconHome />)}
        {navItem("build", "Build", <IconDoc />)}
        {navItem("ats", "ATS Check", <IconGauge />)}
        {navItem("resumes", "Resumes", <IconList />)}
        {navItem("more", "More", <IconDots />)}
      </nav>

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}

/* ───────────────────────── Home ───────────────────────── */

function HomeView({ boot, go, openApp }: { boot: Boot; go: (v: View) => void; openApp: (a: Application) => void }) {
  const [recent, setRecent] = useState<Application[]>([]);
  useEffect(() => {
    api<{ applications: Application[] }>("/api/applications")
      .then((d) => setRecent(d.applications.slice(0, 3)))
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <p className="eyebrow">Welcome back</p>
      <h1 className="page-title">One job. One tailored resume.</h1>
      <p className="lede">
        Paste a job description and the studio detects the domain, picks your
        most relevant projects, and builds a fresh ATS resume for that job —
        every time, never overwriting the last one.
      </p>

      <div className="feature-grid">
        <button className="feature" onClick={() => go("build")}>
          <div className="f-icon"><IconBrief /></div>
          <h3>Build a New Resume</h3>
          <p>Paste a JD → domain detected → projects auto-selected → new tailored resume with its own ATS score.</p>
          <span className="go">Start building →</span>
        </button>
        <button className="feature dark" onClick={() => go("ats")}>
          <div className="f-icon"><IconGauge /></div>
          <h3>Check ATS Score</h3>
          <p>Upload any resume file and see exactly what an ATS reads — a deterministic score out of 100, with proof for every point.</p>
          <span className="go">Check a resume →</span>
        </button>
      </div>

      <hr className="rule" />
      <p className="eyebrow">Your studio</p>
      <div>
        <button className="row-item" onClick={() => go("resumes")}>
          <span className="row-main">
            <span className="row-title">{boot.counts.applications} tailored resumes</span>
            <span className="row-sub" style={{ display: "block" }}>One per job application, saved separately</span>
          </span>
        </button>
        <button className="row-item" onClick={() => go("projects")}>
          <span className="row-main">
            <span className="row-title">{boot.projects.length} projects in your library</span>
            <span className="row-sub" style={{ display: "block" }}>The studio picks from these for every JD</span>
          </span>
        </button>
        <button className="row-item" onClick={() => go("ats")}>
          <span className="row-main">
            <span className="row-title">{boot.counts.atsChecks} ATS checks run</span>
            <span className="row-sub" style={{ display: "block" }}>History is saved under ATS Check</span>
          </span>
        </button>
        <button className="row-item" onClick={() => go("build-later")}>
          <span className="row-main">
            <span className="row-title">{boot.counts.projectIdeas ?? 0} projects to build later</span>
            <span className="row-sub" style={{ display: "block" }}>Ideas from JDs your library doesn't cover yet</span>
          </span>
        </button>
      </div>

      {recent.length > 0 && (
        <>
          <p className="eyebrow section-gap">Recent resumes</p>
          <div>
            {recent.map((a) => (
              <button key={a.id} className="row-item" onClick={() => openApp(a)}>
                <span className="row-main">
                  <span className="row-title">{a.company} — {a.role}</span>
                  <span className="row-sub" style={{ display: "block" }}>
                    {a.domainPrimary} · {fmtDate(a.createdAt)}
                  </span>
                </span>
                <MiniScore score={a.atsScore} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Build flow ───────────────────────── */

/* ───────────────────────── Resumes ───────────────────────── */

function ResumesView({
  goHome,
  openApp,
  showToast,
}: {
  goHome: () => void;
  openApp: (a: Application) => void;
  showToast: (m: string) => void;
}) {
  const [apps, setApps] = useState<Application[] | null>(null);
  useEffect(() => {
    api<{ applications: Application[] }>("/api/applications")
      .then((d) => setApps(d.applications))
      .catch((e) => showToast(e instanceof Error ? e.message : "Could not load resumes"));
  }, [showToast]);

  return (
    <div>
      <BackBtn label="Home" onClick={goHome} />
      <p className="eyebrow">My resumes</p>
      <h1 className="page-title">Every job, its own resume</h1>
      {apps === null ? (
        <OrbPanel state="connecting" text="Loading your resumes…" />
      ) : apps.length === 0 ? (
        <div className="empty">
          <div className="orb-holder"><Orb state="breathing" size={64} /></div>
          <p className="lede" style={{ margin: "0 auto" }}>No resumes yet. Build your first one from a job description.</p>
        </div>
      ) : (
        <div>
          {apps.map((a) => (
            <button key={a.id} className="row-item" onClick={() => openApp(a)}>
              <span className="row-main">
                <span className="row-title">{a.company} — {a.role}</span>
                <span className="row-sub" style={{ display: "block" }}>
                  {a.domainPrimary}{a.domainSecondary ? ` · ${a.domainSecondary}` : ""} · {fmtDate(a.createdAt)} · {a.status}
                </span>
              </span>
              <MiniScore score={a.atsScore} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumeDetailView({
  app,
  profile,
  goBack,
  checkThis,
  onDeleted,
  onSaved,
  showToast,
}: {
  app: Application;
  profile: Profile;
  goBack: () => void;
  checkThis: (a: Application) => void;
  onDeleted: () => void;
  onSaved: (app: Application) => void;
  showToast: (m: string) => void;
}) {
  const [status, setStatus] = useState(app.status);
  const [previewReady, setPreviewReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveChanges = async (changes: Partial<ResumeEdits> & { resumeTemplate?: string }) => {
    setSaving(true);
    try {
      const data = await api<{ application: Application }>(`/api/applications/${app.id}`, { method: "PATCH", json: changes });
      onSaved(data.application);
      setEditing(false);
      showToast("Resume updated — preview and downloads refreshed");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save changes");
    } finally { setSaving(false); }
  };
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const download = async (format: "pdf" | "docx" | "txt") => {
    setDownloading(true);
    try { await downloadResume(app.id, format); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not download the resume"); }
    finally { setDownloading(false); }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(app.text);
      showToast("Resume copied as plain text");
    } catch {
      showToast("Copy failed — long-press the resume text instead");
    }
  };

  const changeStatus = async (s: string) => {
    try {
      const data = await api<{ application: Application }>(`/api/applications/${app.id}`, { method: "PATCH", json: { status: s } });
      setStatus(s);
      onSaved(data.application);
      showToast(`Status: ${s}`);
    } catch {
      showToast("Could not save the status");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the ${app.company} resume? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api(`/api/applications/${app.id}`, { method: "DELETE" });
      onDeleted();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete the resume");
      setDeleting(false);
    }
  };

  return (
    <div>
      <BackBtn label="My Resumes" onClick={goBack} />
      <p className="eyebrow">{app.company} · {fmtDate(app.createdAt)}</p>
      <h1 className="page-title" style={{ fontSize: 28 }}>{app.role}</h1>
      <p>
        <span className="chip forest">{app.domainPrimary}</span>{" "}
        {app.domainSecondary ? <span className="chip">{app.domainSecondary}</span> : null}{" "}
        <MiniScore score={app.atsScore} />
      </p>

      <div className="btn-row" style={{ margin: "14px 0 18px" }}>
        <button className="btn btn-primary" disabled={!previewReady} onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="btn" onClick={() => setEditing(true)}>Edit resume</button>
        <button className="btn" onClick={copyText}>Copy as text</button>
        <button className="btn btn-ghost" onClick={() => checkThis(app)}>Check this resume&apos;s ATS score</button>
      </div>

      <p className="eyebrow">Download this resume</p>
      <div className="btn-row" style={{ margin: "8px 0 6px" }}>
        <button className="btn btn-forest" disabled={downloading} onClick={() => download("pdf")}>PDF</button>
        <button className="btn" disabled={downloading} onClick={() => download("docx")}>DOCX</button>
        <button className="btn" disabled={downloading} onClick={() => download("txt")}>TXT</button>
      </div>
      <p className="small muted" style={{ margin: "0 0 18px" }}>
        The PDF matches the preview below. DOCX is an editable copy; TXT contains the resume text.
      </p>

      <label className="field" style={{ maxWidth: 260 }}>
        <span>Application status</span>
        <select value={status} onChange={(e) => changeStatus(e.target.value)}>
          {["Saved", "Applied", "Interview", "Offer", "Rejected"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <label className="field" style={{ maxWidth: 300 }}>
        <span>Resume layout</span>
        <select aria-label="Resume layout" value={app.resumeTemplate ?? "compact"} disabled={saving} onChange={event => saveChanges({ resumeTemplate: event.target.value })}>
          <option value="compact">ATS Standard (recommended)</option>
          <option value="classic">Classic Academic</option>
          <option value="modern">Modern Professional</option>
        </select>
      </label>
      {editing && <ResumeEditor app={app} profile={profile} saving={saving} onSave={saveChanges} onCancel={() => setEditing(false)} />}
      <ResumePreview app={app} onReady={setPreviewReady} />

      <div className="btn-row">
        <button className="btn btn-danger" disabled={deleting} onClick={remove}>Delete this resume</button>
      </div>
    </div>
  );
}

/* ───────────────────────── ATS Check ───────────────────────── */

function AtsView({
  prefill,
  clearPrefill,
  goHome,
  showResult,
  showToast,
}: {
  prefill: { resumeText: string; resumeName: string; sourceType: string } | null;
  clearPrefill: () => void;
  goHome: () => void;
  showResult: (c: AtsCheck) => void;
  showToast: (m: string) => void;
}) {
  const [source, setSource] = useState<"upload" | "saved" | "paste">("upload");
  const [upload, setUpload] = useState<{ fileName: string; text: string; charCount: number; wordCount: number } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [savedApps, setSavedApps] = useState<Application[]>([]);
  const [savedId, setSavedId] = useState("");
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Omit<AtsCheck, "resumeText" | "jdText">[]>([]);
  const step = useStepCycle(
    ["Reading resume…", "Parsing like an ATS…", "Matching keywords…", "Scoring every section…"],
    running
  );

  const loadHistory = useCallback(() => {
    api<{ checks: Omit<AtsCheck, "resumeText" | "jdText">[] }>("/api/ats-checks")
      .then((d) => setHistory(d.checks))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadHistory();
    api<{ applications: Application[] }>("/api/applications")
      .then((d) => setSavedApps(d.applications))
      .catch(() => undefined);
    if (prefill) {
      setSource("saved");
      setPasteText(prefill.resumeText);
      setSource("paste");
      showToast(`Loaded: ${prefill.resumeName}`);
      clearPrefill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (file: File) => {
    setUploadError("");
    setUpload(null);
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-resume", { method: "POST", body: fd });
      const data = await res.json();
      await new Promise((r) => setTimeout(r, 700));
      if (data.ok) {
        setUpload({ fileName: data.fileName, text: data.text, charCount: data.charCount, wordCount: data.wordCount });
      } else {
        setUploadError(data.error ?? "That file could not be read.");
      }
    } catch {
      setUploadError("Upload failed — check your connection and try again.");
    } finally {
      setExtracting(false);
    }
  };

  const currentResume = (): { text: string; name: string } | null => {
    if (source === "upload") {
      return upload ? { text: upload.text, name: upload.fileName } : null;
    }
    if (source === "saved") {
      const a = savedApps.find((x) => x.id === savedId);
      return a ? { text: a.text, name: `${a.company} — ${a.role}` } : null;
    }
    return pasteText.trim().length >= 20
      ? { text: pasteText, name: "Pasted resume" }
      : null;
  };

  const run = async () => {
    const r = currentResume();
    if (!r) {
      showToast(
        source === "upload"
          ? "Upload a resume file first"
          : source === "saved"
            ? "Pick a saved resume first"
            : "Paste your resume text first"
      );
      return;
    }
    setRunning(true);
    try {
      const [data] = await Promise.all([
        api<{ check: AtsCheck }>("/api/check-ats", {
          method: "POST",
          json: {
            resumeText: r.text,
            jdText: jd,
            sourceType: source,
            resumeName: r.name,
            applicationId: source === "saved" ? savedId || null : null,
          },
        }),
        new Promise((res) => setTimeout(res, 1300)),
      ]);
      showResult(data.check);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "The check failed. Try again.");
    } finally {
      setRunning(false);
    }
  };

  const openHistory = async (id: string) => {
    try {
      const data = await api<{ check: AtsCheck }>(`/api/ats-checks/${id}`);
      showResult(data.check);
    } catch {
      showToast("Could not open that check");
    }
  };

  return (
    <div>
      <BackBtn label="Home" onClick={goHome} />
      <p className="eyebrow">Separate feature — no build needed</p>
      <h1 className="page-title">ATS Score Check</h1>
      <p className="lede">
        This checker scores a resume the way a real ATS parses it. The score is
        calculated from fixed rules — the same resume and JD always give the
        same score, and every point shows its evidence.
      </p>
      <p className="small muted" style={{ marginTop: -8 }}>
        Score note: different companies&apos; ATS systems weight things
        slightly differently, so no checker can promise the identical number on
        every company system. This one shows the evidence behind every point
        so you can fix real issues.
      </p>

      <div className="steps">
        <span className="step-dot active">Step 1 · Your resume</span>
        <span className="step-dot">Step 2 · Job description (optional)</span>
        <span className="step-dot">Step 3 · Score</span>
      </div>

      <div className="segmented" role="tablist">
        <button className={source === "upload" ? "active" : ""} onClick={() => setSource("upload")}>Upload Resume</button>
        <button className={source === "saved" ? "active" : ""} onClick={() => setSource("saved")}>Saved Resume</button>
        <button className={source === "paste" ? "active" : ""} onClick={() => setSource("paste")}>Paste Text</button>
      </div>

      {source === "upload" && (
        <div>
          <label className="upload-area" style={{ display: "block", cursor: "pointer" }}>
            <span style={{ color: "#0C5B3E", display: "grid", placeItems: "center" }}><IconUpload /></span>
            <strong>Upload Resume — PDF, DOCX or TXT</strong>
            <span className="muted">Tap to choose a file (max 8 MB). The text is read from the file itself.</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {extracting && <OrbPanel state="working" text="Reading your file…" sub="Extracting the text an ATS would see" />}
          {uploadError ? <p className="form-error" style={{ marginTop: 12 }}>{uploadError}</p> : null}
          {upload && !extracting && (
            <div style={{ marginTop: 12 }}>
              <p className="form-ok">
                Resume ready — {upload.fileName} · {upload.wordCount} words · {upload.charCount} characters
              </p>
              <pre className="extract-preview">{upload.text.slice(0, 600)}…</pre>
              <button className="btn btn-ghost" onClick={() => setUpload(null)}>Remove / replace file</button>
            </div>
          )}
        </div>
      )}

      {source === "saved" && (
        <label className="field">
          <span>Choose a saved resume</span>
          <select value={savedId} onChange={(e) => setSavedId(e.target.value)}>
            <option value="">— Select —</option>
            {savedApps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.company} — {a.role} ({fmtDate(a.createdAt)})
              </option>
            ))}
          </select>
          {savedApps.length === 0 && <span className="hint">No saved resumes yet — build one first, or use Upload / Paste.</span>}
        </label>
      )}

      {source === "paste" && (
        <label className="field">
          <span>Resume text</span>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the full resume text here…" style={{ minHeight: 180 }} />
        </label>
      )}

      <label className="field" style={{ marginTop: 18 }}>
        <span>Step 2 — Job description (optional)</span>
        <textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the JD to score keyword match — or leave empty for a general ATS health score" style={{ minHeight: 130 }} />
      </label>

      {running ? (
        <OrbPanel state="solving" text={step} sub="Deterministic scoring — no AI involved in the number" />
      ) : (
        <button className="btn btn-primary btn-block" onClick={run}>Run ATS Check</button>
      )}

      {history.length > 0 && (
        <>
          <p className="eyebrow section-gap">Check history</p>
          <div>
            {history.map((c) => (
              <button key={c.id} className="row-item" onClick={() => openHistory(c.id)}>
                <span className="row-main">
                  <span className="row-title" style={{ fontSize: 15.5 }}>{c.resumeName}</span>
                  <span className="row-sub" style={{ display: "block" }}>{fmtDate(c.createdAt)} · {c.sourceType}</span>
                </span>
                <MiniScore score={c.score} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── ATS Result ───────────────────────── */

interface FixOutcome {
  improved: boolean;
  beforeScore: number;
  afterScore: number;
  fixes: FixEntry[];
  remainingGaps: MissingItem[];
  manualSuggestions: string[];
  message: string;
  applicationId: string | null;
  application: Application | null;
}

function AtsResultView({
  check,
  goBack,
  goHome,
  showToast,
  onUpdated,
  openFixedResume,
}: {
  check: AtsCheck;
  goBack: () => void;
  goHome: () => void;
  showToast: (m: string) => void;
  onUpdated: (c: AtsCheck) => void;
  openFixedResume: (a: Application) => void;
}) {
  const [notes, setNotes] = useState<string | null>(check.aiNotes);
  const [notesMsg, setNotesMsg] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [additionalSkills, setAdditionalSkills] = useState<string[]>([]);
  const [fixOutcome, setFixOutcome] = useState<FixOutcome | null>(null);
  const [missing, setMissing] = useState<MissingItem[] | null>(
    check.missingItems ?? null
  );

  // Checks saved before missingItems existed: classify on demand.
  useEffect(() => {
    if (missing !== null || !check.hasJd) return;
    let cancelled = false;
    api<{ missingItems: MissingItem[] }>("/api/missing-items", {
      method: "POST",
      json: { resumeText: check.resumeText, jdText: check.jdText },
    })
      .then((d) => {
        if (!cancelled) setMissing(d.missingItems);
      })
      .catch(() => {
        if (!cancelled) setMissing([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addableItems = (missing ?? []).filter((m) => m.addable);
  const gapItems = (missing ?? []).filter((m) => !m.addable);
  const addablePoints =
    Math.round(addableItems.reduce((a, m) => a + m.points, 0) * 10) / 10;
  const gapPoints =
    Math.round(gapItems.reduce((a, m) => a + m.points, 0) * 10) / 10;

  const getNotes = async () => {
    setNotesBusy(true);
    setNotesMsg("");
    try {
      const data = await api<{ aiReview: string | null; message?: string }>("/api/ats-ai-notes", {
        method: "POST",
        json: { checkId: check.id, resumeText: check.resumeText, jdText: check.jdText, score: check.score },
      });
      if (data.aiReview) {
        setNotes(data.aiReview);
        onUpdated({ ...check, aiNotes: data.aiReview });
      } else {
        setNotesMsg(data.message ?? "AI notes unavailable. Your score is unaffected.");
      }
    } catch {
      setNotesMsg("AI notes unavailable right now. Your score is unaffected.");
    } finally {
      setNotesBusy(false);
    }
  };

  const autoFix = async () => {
    setFixBusy(true);
    setFixOutcome(null);
    try {
      const data = await api<FixOutcome>("/api/auto-fix-ats", {
        method: "POST",
        json: {
          checkId: check.id,
          resumeText: check.resumeText,
          jdText: check.jdText,
          sourceType: check.sourceType,
          resumeName: check.resumeName,
          applicationId: check.applicationId ?? null,
          additionalSkills,
        },
      });
      setFixOutcome(data);
      showToast(
        data.applicationId
          ? `Auto-fix: ${data.beforeScore} → ${data.afterScore} — new resume saved`
          : "Resume refreshed"
      );
    } catch {
      showToast("Auto-fix failed. Try again.");
    } finally {
      setFixBusy(false);
    }
  };

  const viewFixed = async () => {
    if (fixOutcome?.application) {
      openFixedResume(fixOutcome.application);
      return;
    }
    if (fixOutcome?.applicationId) {
      try {
        const data = await api<{ application: Application }>(
          `/api/applications/${fixOutcome.applicationId}`
        );
        openFixedResume(data.application);
      } catch {
        showToast("Could not open the fixed resume — find it under Resumes");
      }
    }
  };

  return (
    <div>
      <div className="back-row">
        <button className="back-btn" onClick={goBack}><span className="chev">‹</span> ATS Check</button>
        <button className="home-btn" onClick={goHome}><IconHome /> Home</button>
      </div>
      <p className="eyebrow">{check.resumeName} · {fmtDate(check.createdAt)}</p>
      <h1 className="page-title">Your ATS score</h1>

      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", margin: "10px 0 6px" }}>
        <ScoreRing score={check.score} />
        <div style={{ flex: "1 1 260px" }}>
          {check.categories.map((cat) => (
            <div key={cat.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <strong>{cat.label}</strong>
                <span className="check-points">{cat.score}/{cat.maxScore}</span>
              </div>
              <div className="cat-bar">
                <div className="cat-fill" style={{ width: `${(cat.score / cat.maxScore) * 100}%` }} />
              </div>
            </div>
          ))}
          {!check.hasJd && <p className="small muted">No JD was given — the score is the general health score (non-keyword categories scaled to 100).</p>}
        </div>
      </div>

      <hr className="rule" />
      <p className="eyebrow">What the ATS extracted</p>
      <dl className="kv card" style={{ padding: 16 }}>
        <dt>Name</dt><dd>{check.parsed.name ?? "— not found"}</dd>
        <dt>Email</dt><dd>{check.parsed.email ?? "— not found"}</dd>
        <dt>Phone</dt><dd>{check.parsed.phone ?? "— not found"}</dd>
        <dt>LinkedIn</dt><dd>{check.parsed.linkedin ?? "— not found"}</dd>
        <dt>GitHub</dt><dd>{check.parsed.github ?? "— not found"}</dd>
        <dt>Skills read</dt><dd>{check.parsed.skills.length ? check.parsed.skills.join(", ") : "— none parsed"}</dd>
        <dt>Projects read</dt><dd>{check.parsed.projectLines.length ? check.parsed.projectLines.join(" · ") : "— none parsed"}</dd>
      </dl>

      {check.hasJd && (
        <>
          <p className="eyebrow section-gap">Keywords</p>
          <p className="small" style={{ marginBottom: 6 }}>
            <strong style={{ color: "#0C5B3E" }}>Matched:</strong>{" "}
            {check.matchedKeywords.length ? check.matchedKeywords.join(", ") : "none"}
          </p>

          {missing === null && (
            <p className="small muted">Checking missing JD keywords…</p>
          )}

          {addableItems.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: 16 }}>
                Can be added from your profile (+{addablePoints} pts)
              </p>
              <p className="small muted" style={{ marginTop: -4 }}>
                These keywords are missing from this resume, but your own profile
                and projects already include them — Auto-Fix adds them to this resume.
              </p>
              <div>
                {addableItems.map((m) => (
                  <div key={m.keyword} className="row-item" style={{ cursor: "default" }}>
                    <span className="row-main">
                      <span className="row-title" style={{ fontSize: 15 }}>
                        {m.keyword}
                        {m.mustHave ? <span className="chip" style={{ marginLeft: 8 }}>must-have</span> : null}
                      </span>
                      <span className="row-sub" style={{ display: "block" }}>
                        Evidence: {m.evidence ?? "Your profile"}
                      </span>
                    </span>
                    <span className="chip solid">+{m.points} pts</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {gapItems.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: 16 }}>
                Additional JD skills ({gapPoints} pts)
              </p>
              <p className="small muted" style={{ marginTop: -4 }}>
                Select the skills you want to include in this resume. You can also edit the skill list after Auto-Fix.
              </p>
              <div>
                {gapItems.map((m) => (
                  <label key={m.keyword} className="checkbox-row">
                    <input type="checkbox" aria-label={`Include ${m.keyword}`} checked={additionalSkills.includes(m.keyword)} onChange={event => setAdditionalSkills(skills => event.target.checked ? [...skills, m.keyword] : skills.filter(skill => skill !== m.keyword))} />
                    <span className="row-main">
                      <span className="row-title" style={{ fontSize: 15 }}>
                        {m.keyword}
                        {m.mustHave ? <span className="chip" style={{ marginLeft: 8 }}>must-have</span> : null}
                      </span>
                      <span className="row-sub" style={{ display: "block" }}>
                        Select to include in Technical Skills
                      </span>
                    </span>
                    <span className="chip danger">−{m.points} pts</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {missing !== null && addableItems.length === 0 && gapItems.length === 0 && (
            <p className="small" style={{ color: "#0C5B3E" }}>
              <strong>No keywords missing</strong> — this resume covers every keyword in the JD.
            </p>
          )}
        </>
      )}

      <p className="eyebrow section-gap">Every check, with evidence</p>
      <div className="card" style={{ padding: "6px 20px" }}>
        {check.categories.flatMap((cat) =>
          cat.checks.map((c) => (
            <div key={c.id} className="check-line">
              <span className={`check-ic ${c.status}`}>{c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✗"}</span>
              <span className="check-body">
                <strong>{c.label}</strong>
                <span className="check-ev" style={{ display: "block" }}>{c.evidence}</span>
              </span>
              <span className="check-points">{c.points}/{c.maxPoints}</span>
            </div>
          ))
        )}
      </div>

      {check.issues.length > 0 && (
        <>
          <p className="eyebrow section-gap">Fix these first (biggest impact first)</p>
          <div>
            {check.issues.slice(0, 8).map((issue, i) => (
              <div key={i} className="row-item" style={{ cursor: "default" }}>
                <span className="row-main">
                  <span className="row-title" style={{ fontSize: 15 }}>{issue.label}</span>
                  <span className="row-sub" style={{ display: "block" }}>{issue.fix}</span>
                </span>
                <span className="chip">−{issue.impact} pts</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="btn-row">
        {fixBusy ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Orb state="shaping" size={20} /> Building your fixed resume…
          </span>
        ) : (
          <button className="btn btn-main" onClick={autoFix}>
            Auto-Fix — improve & save resume
          </button>
        )}
        <button className="btn" onClick={getNotes} disabled={notesBusy}>
          {notesBusy ? "Asking the AI…" : "Get AI judgement notes"}
        </button>
      </div>

      {fixBusy && (
        <div style={{ marginTop: 14 }}>
          <OrbPanel state="working" text="Building your fixed resume…" sub="Rewriting the summary and bullets, updating selected skills and applying the PDF layout." />
        </div>
      )}
      {fixOutcome && (
        <div className="fix-report">
          <p className="eyebrow" style={{ margin: 0 }}>Fix report</p>
          <div className="fix-score" style={{ marginTop: 8 }}>
            <span>{fixOutcome.beforeScore}</span>
            <span className="fix-arrow">→</span>
            <span>{fixOutcome.afterScore}</span>
            {fixOutcome.afterScore > fixOutcome.beforeScore && (
              <span className="fix-delta">+{fixOutcome.afterScore - fixOutcome.beforeScore} pts recovered</span>
            )}
          </div>
          <p className="small" style={{ marginTop: 8 }}>{fixOutcome.message}</p>

          {fixOutcome.fixes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {fixOutcome.fixes.map((f, i) => (
                <div key={i} className="row-item" style={{ cursor: "default" }}>
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 14.5 }}>{f.label}</span>
                  </span>
                  <span className="chip solid">{f.points === 0 ? "Content" : `${f.points > 0 ? "+" : ""}${f.points} pts`}</span>
                </div>
              ))}
            </div>
          )}

          {fixOutcome.remainingGaps.length > 0 && (
            <p className="small" style={{ marginTop: 12 }}>
              <strong style={{ color: "#A4261F" }}>Other JD requirements:</strong>{" "}
              {fixOutcome.remainingGaps.map((g) => `${g.keyword} (−${g.points} pts)`).join(", ")}
            </p>
          )}
          {fixOutcome.manualSuggestions.length > 0 && !fixOutcome.applicationId && (
            <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {fixOutcome.manualSuggestions.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}

          {fixOutcome.applicationId && (
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button className="btn btn-forest" onClick={viewFixed}>
                <IconDoc /> View Fixed Resume
              </button>
              <span className="small muted" style={{ alignSelf: "center" }}>
                Saved under Resumes — open it to print or save as PDF.
              </span>
            </div>
          )}
        </div>
      )}
      {notesMsg ? <p className="form-warn" style={{ marginTop: 12 }}>{notesMsg}</p> : null}
      {notes && (
        <div className="card section-gap">
          <p className="eyebrow">AI judgement notes (do not change the score)</p>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{notes}</p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── More ───────────────────────── */

function MoreView({ go, authEnabled, refresh }: { go: (v: View) => void; authEnabled: boolean; refresh: () => Promise<unknown> }) {
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  };
  const item = (v: View, title: string, sub: string) => (
    <button className="row-item" onClick={() => go(v)}>
      <span className="row-main">
        <span className="row-title">{title}</span>
        <span className="row-sub" style={{ display: "block" }}>{sub}</span>
      </span>
      <span style={{ fontSize: 20, color: "#0C5B3E", fontWeight: 800 }}>›</span>
    </button>
  );
  return (
    <div>
      <p className="eyebrow">More</p>
      <h1 className="page-title">Studio settings</h1>
      <p className="small muted">Everything is saved in this browser on this device. Clearing site data removes your studio; other browsers and devices keep separate data.</p>
      <div>
        {item("projects", "Project Library", "Add, edit or remove the projects the studio picks from")}
        {item("build-later", "Build Later", "Project ideas from JDs you don't cover yet — build one, then convert it into a real project")}
        {item("experience", "Experience", "Work roles, internships, dates and accomplishments")}
        {item("skills", "Skills", "Maintain your skill library and choose skills per resume")}
        {item("profile", "My Profile", "Name, contact, summary, skills, education, certifications")}
        {item("settings", "AI Settings", "API key, provider and model — powers the AI tailoring")}
        {item("iphone", "Add to iPhone", "Put Resume Studio on your Home Screen like a real app")}
      </div>
      <BrowserStorageTools refresh={refresh} />
      {authEnabled && (
        <>
          <hr className="rule" />
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Projects ───────────────────────── */

function ProjectsView({ projects, goBack, edit }: { projects: Project[]; goBack: () => void; edit: (project: Project | "new") => void }) {
  const [templates, setTemplates] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = projects.filter(project => `${project.title} ${project.tags.join(" ")} ${project.domains.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <div>
    <BackBtn label="More" onClick={goBack} /><p className="eyebrow">Project library</p><h1 className="page-title">Your projects</h1>
    <div className="btn-row"><button className={`btn ${!templates ? "btn-primary" : ""}`} onClick={() => setTemplates(false)}>My projects</button><button className={`btn ${templates ? "btn-primary" : ""}`} onClick={() => setTemplates(true)}>Project templates</button></div>
    {templates ? <ProjectTemplateGallery onChoose={edit} /> : <>
      <p className="small muted">Choose your source projects and their available stack versions. Bullet emphasis is adjusted for each job.</p>
      <button className="btn btn-primary" onClick={() => edit("new")}>Add a project</button>
      <label className="field section-gap"><span>Search my projects</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, domain or technology" /></label>
      {filtered.map(project => <article className="build-project-card" key={project.id}>
        <div className="editor-heading"><strong>{project.title}</strong><button className="btn btn-ghost" onClick={() => edit(project)}>Edit</button></div>
        <p className="small muted">{project.tags.join(", ")}</p>
        <ul className="project-points">{project.bullets.slice(0, 3).map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>
        <p className="small muted">{project.domains.join(" · ")}{project.year ? ` · ${project.year}` : ""}{project.stackVariants?.length ? ` · ${project.stackVariants.length} stack versions` : ""}</p>
      </article>)}
      {!filtered.length && <p className="empty">No matching projects.</p>}
    </>}
  </div>;
}

function BuildLaterView({
  goBack,
  goHome,
  refresh,
  showToast,
}: {
  goBack: () => void;
  goHome: () => void;
  refresh: () => Promise<unknown>;
  showToast: (m: string) => void;
}) {
  const [ideas, setIdeas] = useState<ProjectIdea[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<{ ideas: ProjectIdea[] }>("/api/project-ideas");
    setIdeas(d.ideas);
  }, []);

  useEffect(() => {
    load().catch((e) =>
      showToast(e instanceof Error ? e.message : "Could not load ideas")
    );
  }, [load, showToast]);

  const convert = async (idea: ProjectIdea) => {
    setBusyId(idea.id);
    try {
      const d = await api<{ project: Project }>(
        `/api/project-ideas/${idea.id}/convert`,
        { method: "POST", json: {} }
      );
      setIdeas((list) => (list ?? []).filter((x) => x.id !== idea.id));
      await refresh();
      showToast(`Converted — "${d.project.title}" is now a real project in your library`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (idea: ProjectIdea) => {
    if (!window.confirm(`Delete the idea "${idea.title}"?`)) return;
    setBusyId(idea.id);
    try {
      await api(`/api/project-ideas/${idea.id}`, { method: "DELETE" });
      setIdeas((list) => (list ?? []).filter((x) => x.id !== idea.id));
      await refresh();
      showToast("Idea deleted");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <BackBtn label="More" onClick={goBack} />
      <p className="eyebrow">Build later</p>
      <h1 className="page-title">Projects to build</h1>
      <p className="lede">
        When a job description asks for something your project library
        doesn't cover yet, one idea for that gap lands here automatically.
      </p>
      <div className="idea-note">
        Ideas are <strong>not</strong> real projects: they never appear in
        a resume, an ATS score or Auto-Fix. Build the project for real,
        then tap <strong>Convert to project</strong> — from that moment it
        counts like every other project in your library.
      </div>

      {ideas === null ? (
        <OrbPanel state="connecting" text="Loading your build-later list…" />
      ) : ideas.length === 0 ? (
        <div className="empty">
          <div className="orb-holder"><Orb state="breathing" size={64} /></div>
          <p className="lede" style={{ margin: "0 auto" }}>
            Nothing here yet. Analyse a job description that needs a skill
            or project type you don't have, and the idea will appear here.
          </p>
          <button className="btn btn-ghost" onClick={goHome} style={{ marginTop: 12 }}>‹ Home</button>
        </div>
      ) : (
        <div>
          {ideas.map((idea) => (
            <div key={idea.id} className="idea-card">
              <div className="idea-title">{idea.title}</div>
              <p className="idea-desc">{idea.description}</p>
              {idea.keywords.length > 0 && (
                <div className="idea-kws">
                  {idea.keywords.map((k) => (
                    <span key={k} className="chip">{k}</span>
                  ))}
                  {idea.domain ? <span className="chip forest">{idea.domain}</span> : null}
                </div>
              )}
              <p className="idea-meta">
                {idea.sourceCompany || idea.sourceRole
                  ? `Spotted in: ${[idea.sourceCompany, idea.sourceRole].filter(Boolean).join(" — ")} · `
                  : ""}
                {fmtDate(idea.createdAt)}
              </p>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={() => convert(idea)}
                  disabled={busyId === idea.id}
                >
                  {busyId === idea.id ? "Working…" : "Convert to project"}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => remove(idea)}
                  disabled={busyId === idea.id}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Profile ───────────────────────── */

function ProfileView({
  profile,
  goBack,
  goHome,
  refresh,
  showToast,
}: {
  profile: Profile;
  goBack: () => void;
  goHome: () => void;
  refresh: () => Promise<unknown>;
  showToast: (m: string) => void;
}) {
  const [p, setP] = useState<Profile>(profile);
  const [skillsText, setSkillsText] = useState(
    profile.skillGroups.map((g) => `${g.label}: ${g.items.join(", ")}`).join("\n")
  );
  const [eduText, setEduText] = useState(
    profile.education.map((e) => `${e.title} | ${e.org} | ${e.period} | ${e.detail}`).join("\n")
  );
  const [certText, setCertText] = useState(profile.certifications.join("\n"));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setP((v) => ({ ...v, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    const skillGroups = skillsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [label, rest] = l.split(/:(.*)/s).filter((_, i) => i < 2);
        return {
          label: (label ?? "Skills").trim(),
          items: (rest ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        };
      })
      .filter((g) => g.items.length);
    const education = eduText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [title = "", org = "", period = "", detail = ""] = l.split("|").map((s) => s.trim());
        return { title, org, period, detail };
      });
    try {
      await api("/api/profile", {
        method: "PUT",
        json: { ...p, skillGroups, education, certifications: certText.split("\n").map((s) => s.trim()).filter(Boolean) },
      });
      await refresh();
      showToast("Profile saved");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="back-row">
        <button className="back-btn" onClick={goBack}><span className="chev">‹</span> More</button>
        <button className="home-btn" onClick={goHome}><IconHome /> Home</button>
      </div>
      <p className="eyebrow">Master profile</p>
      <h1 className="page-title" style={{ fontSize: 28 }}>Your details — used in every resume</h1>
      <label className="field"><span>Full name</span><input value={p.name} onChange={set("name")} /></label>
      <label className="field"><span>Title</span><input value={p.title} onChange={set("title")} /></label>
      <label className="field"><span>Phone</span><input value={p.phone} onChange={set("phone")} /></label>
      <label className="field"><span>Email</span><input value={p.email} onChange={set("email")} /></label>
      <label className="field"><span>GitHub</span><input value={p.github} onChange={set("github")} /></label>
      <label className="field"><span>LinkedIn</span><input value={p.linkedin} onChange={set("linkedin")} /></label>
      <label className="field"><span>Portfolio</span><input value={p.portfolio} onChange={set("portfolio")} /></label>
      <label className="field"><span>Professional summary (base)</span><textarea value={p.summary} onChange={set("summary")} /></label>
      <label className="field">
        <span>Skill groups — one group per line: Label: skill, skill</span>
        <textarea value={skillsText} onChange={(e) => setSkillsText(e.target.value)} style={{ minHeight: 120 }} />
      </label>
      <label className="field">
        <span>Education — one per line: Title | Institution | Period | Detail</span>
        <textarea value={eduText} onChange={(e) => setEduText(e.target.value)} />
      </label>
      <label className="field">
        <span>Certifications — one per line</span>
        <textarea value={certText} onChange={(e) => setCertText(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    </div>
  );
}

/* ───────────────────────── iPhone help ───────────────────────── */

function IphoneView({ goBack }: { goBack: () => void }) {
  return (
    <div>
      <BackBtn label="More" onClick={goBack} />
      <p className="eyebrow">iPhone</p>
      <h1 className="page-title" style={{ fontSize: 28 }}>Add Resume Studio to your Home Screen</h1>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
          <li>Open this site in <strong>Safari</strong> on your iPhone (not Chrome).</li>
          <li>Tap the <strong>Share</strong> button (square with an up arrow) at the bottom.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Keep the name “Resume Studio” and tap <strong>Add</strong>.</li>
          <li>Done — the app now sits on your Home Screen and opens full-screen like a real app.</li>
        </ol>
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Tip: if the site is password-locked, log in once in Safari first — the
        Home Screen app will remember you for a week.
      </p>
    </div>
  );
}
