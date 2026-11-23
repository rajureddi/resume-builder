# Project, skills and experience improvements

Completed locally on 23 November 2026.

- Project blocks use one bold title, a separate technology row, two or three bullets, and the project's own GitHub link. The first point explains the project; later points emphasize implementation relevant to the role.
- Imported action sentences and wrapped descriptions remain bullet content. Project identity restores the correct title, stack and link during Auto-Fix.
- More → Project Library → Project templates provides 26 editable starter and real-world examples across Flutter, AI/ML, computer vision, NLP/RAG, React, full-stack, databases, backend, data, cloud/DevOps, FinTech, on-device AI and testing. Domain, level and text filters are available.
- Templates show suggested skills and available stack versions. Adapting an alternate stack keeps the other implementations available in the editor and builder.
- Build now includes a Skills & experience review step. Skill recommendations identify their project, experience, profile or job-description source. Selected skills can be removed or added before generation.
- More → Skills maintains profile skill categories. More → Experience stores jobs, internships, dates, locations, accomplishments and technologies. Saved experience is selected by default during building and can be excluded per resume.
- Selected experience appears consistently in preview, TXT, PDF and DOCX. A fresher profile can omit it entirely.
- The More navigation remains active on its child pages. Job-description fields are retained when returning from template adaptation.

Validation: all 30 automated tests and the production build passed. Tests cover role-specific points, imported project parsing, stable links, stack isolation, template persistence, skill suggestions, optional experience, profile field preservation, API validation and export consistency.

Live verification used the existing saved key and genuine library projects. Job analysis returned `llm`; resume generation returned `ai`. The review resume retained four source titles and GitHub links, exactly nine selected skills, and two or three distinct points per project. PDF and preview both contained one A4 page. Every project bullet was verified in the downloaded PDF and DOCX.

Browser checks covered the More controls, Skills and Experience pages, Flutter/Starter and RAG filters, alternate RAG stack points, template adaptation and the final saved resume. The browser's automatic permission review timed out on the Analyse JD action; live analysis and generation were verified through the local app API instead.

The review store's profile, employment and library were not populated with synthetic entries. The generated review application is saved separately. No credential is included in these artifacts.

Local preview: http://127.0.0.1:3001

[Sample PDF](project-review.pdf) · [Sample DOCX](project-review.docx) · [Screenshot](project-review-ui.jpg) · [Verification evidence](project-review-evidence.json)

The live verification can be rerun with `node audit/verify-live-projects.cjs` while the review server is running; it creates another review application.
