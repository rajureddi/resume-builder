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
  saved, on every path (rule composer, Groq rewrite, Auto-Fix).
  The profile's static summary is never copied into a generated resume, and
  previously saved resumes keep their own summaries untouched. Groq polishes
  the wording when a key is set; the rule-based composer is the fallback.
  Auto-Fix-created resumes get a fresh per-role summary too.
- **Downloads** — every saved resume (including the one you land on right
  after generating) has a **Download** area: **PDF**, **DOCX** and **TXT** —
  real files generated from that resume's own content via
  `GET /api/applications/<id>/download?format=pdf|docx|txt`, named like
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
- **Your own Groq key** — AI tailoring runs through Groq
  (`openai/gpt-oss-120b` by default) via an env var or the in-app Settings
  page. xAI / OpenAI / any OpenAI-compatible endpoint also works. Rule-based
  fallback keeps everything running with no key.
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

Without any env vars the app uses a local JSON file store (`data/db.json`) —
fine for local use. For Vercel, set the env vars below so data persists.

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
> local data file. **Never commit a real API key.**

## Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the
   GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Root directory: the repo
   root. No build settings need changing.
3. Add the **Environment Variables** below (Production + Preview).
4. **Deploy.** Every later `git push` redeploys automatically.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | **For saved data on Vercel** | Neon Postgres connection string. Tables auto-create and seed on first run. Without it resumes/profile changes use temporary storage and will NOT persist between instances, deploys or restarts. AI can use environment variables without a database. |
| `APP_PASSWORD` | **Strongly recommended** | Site lock. The Vercel URL is public — anyone with the link must enter this password. Without it the site (and your data + API key usage) is open to anyone. |
| `SESSION_SECRET` | Recommended | Long random string used to sign the login cookie. |
| `GROQ_API_KEY` | Optional | Your Groq key (`gsk_…`, from console.groq.com → API Keys) as an env fallback. You can instead paste the key inside the app (More → AI Settings); the in-app key is saved to the database. |
| `LLM_API_KEY` | Optional | Key for any OpenAI-compatible provider. Takes precedence over `GROQ_API_KEY`. Stored only on the server. |
| `LLM_PROVIDER` | Optional | `custom`, `groq`, `xai` or `openai`. Defaults to `custom` with `LLM_API_KEY`, otherwise `groq`. |
| `LLM_BASE_URL` | Required for `custom` | API base URL, without `/chat/completions`. Other providers use their preset URL when omitted. |
| `LLM_MODEL` | Required for `custom` | Model supported by your endpoint. Other providers use their preset model when omitted. |
| `DATA_FILE` | Optional | Path for the JSON fallback store (local dev only). |

## AI on Vercel without a database

Vercel's temporary file store is not shared reliably between requests. An API
key pasted into the app can appear saved, then disappear when Test Connection
runs on another instance. On Vercel without `DATABASE_URL`, in-app AI saving is
disabled and AI settings come from environment variables instead.

For a custom endpoint, add these variables under **Vercel → Project → Settings
→ Environment Variables**, with the Production scope (and Preview if needed):

```dotenv
LLM_API_KEY=your_actual_provider_key
LLM_PROVIDER=custom
LLM_BASE_URL=https://your-provider.example/api/v1
LLM_MODEL=your_model_name
```

Deploy the updated code, then redeploy after changing environment variables.
Open **More → AI Settings → Test Connection** to verify the provider replies.
The Configured badge means a key is present; the connection test verifies it.
You do not need a database for this AI configuration. Saved resumes and profile
changes still need `DATABASE_URL` to persist on Vercel.

## Set up Neon (free Postgres)

1. Go to [neon.tech](https://neon.tech) → sign up → **Create project**
   (name it e.g. `resume-studio`, region close to you).
2. In the project dashboard open **Connection Details** and copy the
   **pooled** connection string (it starts with `postgres://…` and contains
   `-pooler` in the host).
3. Paste it as `DATABASE_URL` in Vercel (and in `.env.local` if you want your
   local run to use the same database).
4. Nothing else to do — the app creates its table (`rb_store`) and seeds your
   profile + projects automatically on first request.

## After deploying — checklist

1. Open your Vercel URL and log in with `APP_PASSWORD`.
2. Go to **More → AI Settings** — Groq is pre-selected with model
   `openai/gpt-oss-120b`. Paste your Groq key → **Save** → **Test
   Connection**. You should see a success message with the model's reply.
   (If you set `GROQ_API_KEY` as an env var instead, the badge already shows
   "Groq Configured".)
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
- To reset all data in Postgres, delete the rows of the `rb_store` table (or
  drop it) — the app re-seeds on the next request.
