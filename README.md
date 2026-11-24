# Resume Studio — AI ATS Resume Builder

A standalone **Next.js** app (App Router + TypeScript) that builds a tailored,
ATS-friendly resume for **every** job application:

- **Per-JD new resume, never overwritten** — paste a job description, the app
  detects the domain (AI/ML, Computer Vision, NLP, Android, Full-Stack,
  FinTech, Data, Cloud, On-Device AI…), auto-selects your 3–4 most relevant
  projects with reasons (you can override), rewrites the summary and bullets
  truthfully, reorders skills, and saves a brand-new resume.
- **Deterministic ATS scoring** — fixed rules (Format 20 + Keywords vs JD 40 +
  Sections 15 + Bullets 15 + Contact 10). Same resume + same JD = same score,
  every time, with evidence for every point. The score never depends on an LLM.
- **Standalone ATS Check feature** — upload a resume file (PDF / DOCX / TXT,
  text is extracted from the file itself), pick a saved resume, or paste text.
  Shows what an ATS actually extracts, matched/missing keywords, issues sorted
  by impact with exact fixes, truthful Auto-Fix & re-check, and a saved history.
- **Fresh summary for every resume** — each new application gets a
  professional summary composed for that JD: the role, the detected domain,
  the JD keywords you can truthfully claim, and the selected projects lead
  it (a Computer Vision application reads differently from an Android one).
  Summaries are **short — 3–4 sentences (~55–75 words)** — and a hard cap
  trims any summary to its first 4 sentences before an application is
  saved, on every path (rule composer, AI rewrite, Auto-Fix).
  The profile's static summary is never copied into a generated resume, and
  previously saved resumes keep their own summaries untouched. AI polishes
  the wording when a key is set; the rule-based composer is the fallback.
  Auto-Fix-created resumes get a fresh per-role summary too.
- **Downloads** — every saved resume (including the one you land on right
  after generating) has a **Download** area: **PDF**, **DOCX** and **TXT** —
  real files generated from that resume's own content via
  a request containing the resume saved in your browser, named like
  `Raju-Bandam-Resume-<Company>-<Role>.pdf`. The PDF is generated
  server-side with pdf-lib (clean single-column A4, same content as the
  paper view) and downloads directly as a file — clicking **PDF** never
  opens the print flow. (A separate **Print / Save as PDF** button remains
  for printing a paper copy; it is not part of the Download area.)
- **Build Later list** — when a JD leans on a theme your project library
  doesn't cover (no project matching that theme's signal terms, or only a
  weak one-term match), the app automatically saves one project idea for
  that theme under **More → Build Later** (title, what to build, the JD
  keywords it would cover, and the company/role that asked for it).
  Re-analysing a similar JD never duplicates an idea. **Ideas are not real
  projects** — they never appear in resumes, ATS evidence or Auto-Fix.
  Once you've actually built one, tap **Convert to project** and it joins
  your library like any other project; you can also delete ideas.
- **Your own API key** — choose Groq, xAI, OpenAI or any OpenAI-compatible
  endpoint in **More → AI Settings**, then choose **Save on this device**.
  Change the provider, API key, base URL or model whenever needed. Rule-based
  fallback keeps the app working without an API key.
- **Browser storage** — profile, projects, skills, experience, saved resumes,
  ATS history, project ideas and API settings stay in this browser's local
  storage. Reloading the page or restarting Vercel does not erase them.
- **Premium solid design** — warm ivory, ink black, one deep-forest accent, no
  gradients, thinking-orbs loading animations, back arrows on every
  sub-screen, bottom nav, iPhone Add to Home Screen, and a **dedicated print
  rendering** so Print / Save-as-PDF always produces a clean one-page A4
  resume (never a blank page).

Seeded with Raju Bandam's real profile and 15 projects — all editable in the
app under More → Profile / Project Library.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

No database or AI environment variables are needed. The app saves your data
in browser local storage both locally and on Vercel.

## Push to GitHub

```bash
cd resume-builder-vercel
git init
git add .
git commit -m "Resume Studio — Vercel-ready"
```

Create an empty repository on github.com (e.g. `resume-studio`), then:

```bash
git remote add origin https://github.com/<your-username>/resume-studio.git
git branch -M main
git push -u origin main
```

> `.gitignore` already excludes `.env*.local`, `node_modules`, `.next` and the
> generated files. **Never commit a real API key.**

## Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** and import
   the GitHub repository.
2. Use the **Next.js** framework preset and repository root. No build
   settings need changing.
3. Optionally add `APP_PASSWORD` and `SESSION_SECRET` to lock access to the
   app. Copy `.env.example` for a local site lock if wanted.
4. Deploy. Later GitHub pushes redeploy automatically.

`DATABASE_URL`, `DATA_FILE`, `GROQ_API_KEY` and `LLM_*` environment variables
are no longer used for storage or AI settings. Enter your API settings in
the app instead; changing them does not require redeployment.

## Where your data is saved

The app saves profile details, projects, skills, experience, generated
resumes, ATS history, Build Later ideas and API settings in **local storage
on the current browser and device**. Vercel does not store these records.

AI and document processing still need server requests. The browser sends a
snapshot of the relevant data for the current calculation or export. When
an AI action runs, it also sends the saved API key for that request so the
server can forward it to the selected provider. The server processes the
request in memory and returns the result; it does not save the data or key.
The browser saves the result locally.

Data is separate for each website origin: localhost, a Vercel preview URL
and the production URL each have their own storage. Other browsers and
devices need their own data and settings. Clearing site data removes local
records and the saved API key. Private browsing storage may disappear when
that browsing session closes. Browser storage must be enabled to save.

## After deploying — checklist

1. Open your Vercel URL and log in if you configured `APP_PASSWORD`.
2. Go to **More → AI Settings**, choose your provider, base URL and model,
   then paste the API key and choose **Save on this device** → **Test
   Connection**. For a custom API URL, choose **Custom (OpenAI-compatible)**.
   The Configured badge means a key is saved; the connection test verifies
   that the provider replies. Use **Remove saved key** to clear API settings.
3. Run your first check: **ATS Check → Upload** your current resume PDF →
   paste a JD → **Run ATS Check**.
4. Build your first tailored resume: **Build** → company, role, paste JD →
   Analyse → confirm the selected projects → Generate.
5. On the resume page, under **Download this resume** tap **PDF** and
   confirm a real PDF file downloads (named
   `Raju-Bandam-Resume-<Company>-<Role>.pdf`) containing only the resume —
   no app buttons or menus. (The separate **Print / Save as PDF** button
   uses a dedicated A4 print rendering if you want a paper copy.)
6. **iPhone:** open the site in Safari → Share → **Add to Home Screen** —
   Resume Studio now works like a real app.

## Notes on limits

- Vercel serverless functions cap request duration; AI generation routes set
  `maxDuration = 60` and every LLM call has a hard timeout with a rule-based
  fallback, so a slow provider can never hang a page.
- File uploads are capped at 8 MB (resumes are far smaller). Scanned/image
  PDFs have no readable text — the app tells you plainly, because a real ATS
  fails on them too.
- Saved data uses your browser's storage quota. If saving fails because
  storage is blocked or full, the app reports the failure instead of
  claiming the data was saved.
