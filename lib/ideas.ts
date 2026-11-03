import { addProjectIdea } from "./db";
import { containsTerm } from "./tailor";
import type { Analysis, Project, ProjectIdea } from "./types";

/* ── "Projects to Build Later" ──────────────────────────────────────────
   When a JD leans on a theme the project library does not cover, one
   build-later idea is recorded for that theme. Ideas are suggestions
   only: they are stored apart from real projects and are NEVER read by
   the resume builder, the ATS engine or Auto-Fix, so they can never
   appear as experience the user does not have. Converting an idea (in
   the Build Later screen) is what turns it into a real project.

   COVERAGE RULE (the threshold): each theme has a set of signal terms.
   We count how many DISTINCT signal terms appear in a project's title,
   description, tags and domains. A theme counts as COVERED when the
   best-matching project hits >= COVERED_MIN_MATCHES (2) signal terms —
   one stray mention is only a weak match and still earns an idea.
   Themes are deduped by their key, so re-analysing a similar JD never
   creates a duplicate idea. At most MAX_IDEAS_PER_ANALYSIS new ideas
   are recorded per analysis. */

export const COVERED_MIN_MATCHES = 2;
export const MAX_IDEAS_PER_ANALYSIS = 2;

interface ThemeDef {
  /** Dedupe key. */
  theme: string;
  title: string;
  description: string;
  /** Domain assigned to the idea (and to the project on conversion). */
  domain: string;
  /** JD terms that signal this theme — also the coverage test set. */
  signals: string[];
  /** Extra stack terms folded into the idea's covered keywords. */
  stack: string[];
}

const THEMES: ThemeDef[] = [
  {
    theme: "recommendation-systems",
    title: "Personalised Recommendation Engine",
    description:
      "Build a recommendation system that ranks items for each user from their behaviour — collaborative filtering plus content-based scoring — served through a small API with a demo UI showing top-N recommendations and offline accuracy (precision@K).",
    domain: "AI/ML",
    signals: [
      "recommendation",
      "recommender",
      "collaborative filtering",
      "personalization",
      "personalisation",
      "content-based filtering",
    ],
    stack: ["Python", "Scikit-learn", "Pandas", "REST APIs"],
  },
  {
    theme: "react-native-mobile",
    title: "Cross-Platform Mobile App with React Native",
    description:
      "Build a complete mobile app with React Native and Expo that runs on Android and iOS from one codebase — navigation, API data fetching, offline caching and a Play Store / TestFlight-ready release build.",
    domain: "Android",
    signals: ["react native", "expo", "cross-platform mobile", "react-native"],
    stack: ["React Native", "JavaScript", "REST APIs", "Android"],
  },
  {
    theme: "ios-mobile",
    title: "Native iOS App with SwiftUI",
    description:
      "Build a native iOS app in Swift with SwiftUI — declarative screens, local persistence, networking against a REST API and a TestFlight build.",
    domain: "Android",
    signals: ["swift", "swiftui", "ios development", "xcode"],
    stack: ["Swift", "SwiftUI", "REST APIs"],
  },
  {
    theme: "graphql-api",
    title: "GraphQL API Service",
    description:
      "Build a GraphQL API with schema design, resolvers, authentication and a typed client demo — the counterpart to the REST APIs already in the library.",
    domain: "Backend",
    signals: ["graphql", "apollo"],
    stack: ["GraphQL", "Node.js", "TypeScript", "REST APIs"],
  },
  {
    theme: "data-pipeline-etl",
    title: "Streaming Data Pipeline with ETL",
    description:
      "Build an end-to-end data pipeline: ingest events, transform them with an ETL workflow (Airflow or Kafka-style streaming), land clean tables in SQL and chart the results on a dashboard.",
    domain: "Data",
    signals: ["etl", "airflow", "kafka", "apache spark", "data pipeline", "data engineering"],
    stack: ["Python", "SQL", "Pandas", "Data Analytics"],
  },
  {
    theme: "devops-cicd",
    title: "CI/CD Pipeline & Containerised Deployment",
    description:
      "Take an existing project and productionise it: Dockerfile, docker-compose, a CI pipeline that tests and builds on every push, and automated deployment to a cloud VM — documented end to end.",
    domain: "Cloud",
    signals: ["kubernetes", "docker", "ci/cd", "terraform", "devops", "jenkins", "github actions"],
    stack: ["Docker", "CI/CD", "AWS", "Linux"],
  },
  {
    theme: "blockchain-web3",
    title: "Smart Contract & dApp Prototype",
    description:
      "Build a small Web3 prototype: a Solidity smart contract with tests, deployed to a testnet, plus a simple web front end that reads and writes to it through a wallet.",
    domain: "Full-Stack",
    signals: ["blockchain", "solidity", "smart contract", "web3", "ethereum"],
    stack: ["Solidity", "JavaScript", "React"],
  },
  {
    theme: "iot-embedded",
    title: "IoT Sensor Dashboard with MQTT",
    description:
      "Build an IoT project: a Raspberry Pi or Arduino publishes sensor readings over MQTT to a small backend that stores them and shows a live dashboard.",
    domain: "On-Device AI",
    signals: ["iot", "internet of things", "raspberry pi", "arduino", "mqtt", "embedded systems"],
    stack: ["Python", "MQTT", "REST APIs"],
  },
  {
    theme: "test-automation",
    title: "End-to-End Test Automation Suite",
    description:
      "Build a test-automation suite for a web app with Playwright or Cypress — page objects, CI integration and an HTML report — covering the critical user journeys.",
    domain: "Full-Stack",
    signals: ["playwright", "cypress", "selenium", "test automation", "qa automation"],
    stack: ["JavaScript", "Unit Testing", "CI/CD"],
  },
  {
    theme: "game-development",
    title: "2D Game with Unity",
    description:
      "Build a complete small 2D game in Unity — game loop, scoring, levels and a playable WebGL build published online.",
    domain: "Full-Stack",
    signals: ["unity", "unreal engine", "game development", "gameplay"],
    stack: ["C#", "Unity"],
  },
];

function projectHaystack(p: Project): string {
  return `${p.title} ${p.description} ${p.tags.join(" ")} ${p.domains.join(" ")}`;
}

/** How many distinct signal terms of a theme one project demonstrates. */
function themeMatchCount(project: Project, def: ThemeDef): number {
  const hay = projectHaystack(project);
  return def.signals.filter((s) => containsTerm(hay, s)).length;
}

export interface ThemeSuggestion {
  theme: string;
  title: string;
  description: string;
  keywords: string[];
  domain: string;
  /** Best project match found (signal terms hit) — below the cover bar. */
  bestMatch: number;
}

function suggestionFor(
  def: ThemeDef,
  jdText: string,
  analysis: Analysis,
  projects: Project[]
): ThemeSuggestion | null {
  const inJd = def.signals.filter((s) => containsTerm(jdText, s));
  if (inJd.length === 0) return null;
  const bestMatch = projects.reduce(
    (m, p) => Math.max(m, themeMatchCount(p, def)),
    0
  );
  if (bestMatch >= COVERED_MIN_MATCHES) return null; // library covers it

  // Covered keywords: the theme's stack + any JD keywords that belong to
  // this theme, deduped, stack first.
  const keywords: string[] = [];
  const push = (k: string) => {
    if (!keywords.some((x) => x.toLowerCase() === k.toLowerCase()))
      keywords.push(k);
  };
  for (const k of def.stack) push(k);
  for (const k of analysis.keywords) {
    if (
      def.signals.some((s) => containsTerm(k, s) || containsTerm(s, k)) ||
      def.stack.some((s) => s.toLowerCase() === k.toLowerCase())
    ) {
      push(k);
    }
  }
  return {
    theme: def.theme,
    title: def.title,
    description: def.description,
    keywords,
    domain: def.domain,
    bestMatch,
  };
}

/**
 * Detect JD themes with no (or only weak) project coverage.
 * Returns at most MAX_IDEAS_PER_ANALYSIS suggestions.
 */
export function detectUncoveredThemes(input: {
  jdText: string;
  analysis: Analysis;
  projects: Project[];
}): ThemeSuggestion[] {
  const out: ThemeSuggestion[] = [];
  for (const def of THEMES) {
    const s = suggestionFor(def, input.jdText, input.analysis, input.projects);
    if (s) out.push(s);
    if (out.length >= MAX_IDEAS_PER_ANALYSIS) return out;
  }

  // Generic fallback: the JD's own primary domain is not represented by
  // any library project at all (no project carries the domain and the
  // best ranked fit is a single keyword at most).
  const { analysis, projects } = input;
  const domainCovered =
    projects.some((p) => p.domains.includes(analysis.domainPrimary)) ||
    (analysis.rankedProjects[0]?.score ?? 0) >= 20;
  if (!domainCovered && out.length < MAX_IDEAS_PER_ANALYSIS) {
    const kws = analysis.keywords.slice(0, 6);
    out.push({
      theme: `domain-${analysis.domainPrimary.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: `${analysis.domainPrimary} Portfolio Project`,
      description: `Build one end-to-end ${analysis.domainPrimary} project that demonstrates ${kws.slice(0, 4).join(", ") || "the core skills in this job description"}, with a public demo and a README explaining the design choices.`,
      keywords: kws,
      domain: analysis.domainPrimary,
      bestMatch: 0,
    });
  }
  return out;
}

/**
 * Detect + persist build-later ideas for one analysed JD. Dedupes by
 * theme (both inside the store and against repeats). Returns only the
 * ideas that were NEWLY added by this call.
 */
export async function recordIdeasForJd(input: {
  jdText: string;
  analysis: Analysis;
  projects: Project[];
  company?: string;
  role?: string;
}): Promise<ProjectIdea[]> {
  const suggestions = detectUncoveredThemes(input);
  const added: ProjectIdea[] = [];
  for (const s of suggestions) {
    const created = await addProjectIdea({
      theme: s.theme,
      title: s.title,
      description: s.description,
      keywords: s.keywords,
      domain: s.domain,
      sourceCompany: input.company?.trim() ?? "",
      sourceRole: input.role?.trim() ?? "",
    });
    if (created) added.push(created);
  }
  return added;
}
