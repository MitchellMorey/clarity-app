# Clarity — Document Accessibility Review

A Next.js 14 (App Router) web app with two accessibility-review workflows,
both accessible from the dashboard:

1. **Review Document Accessibility** — upload a DOCX or PPTX, get a report
   covering color contrast, font size, alt text, and heading/title structure.
   Re-upload a revised version to see which issues have been resolved.
2. **Review Adobe Accessibility Report** — upload the original PDF and the
   Adobe Acrobat accessibility report (HTML or PDF). Clarity parses the
   report and turns every flagged rule into a plain-language, tool-agnostic
   suggestion for what to change in the source file before re-exporting.

DOCX and PPTX uploads both go to `/api/review`, which unzips the OOXML
package, walks paragraphs/runs (DOCX) or slides/shapes (PPTX), and returns
the real accessibility issues found. PDF reviews POST to `/api/pdf-review`,
which parses the Adobe report (HTML or PDF) and attaches a plain-language
fix suggestion to each rule.

Authentication is a placeholder (any email/password works). App state persists
in the browser via `localStorage`.

## Stack

- Next.js 14 (App Router) with TypeScript
- Tailwind CSS for styling
- React Context + `localStorage` for document persistence
- `jszip` + `fast-xml-parser` for real DOCX parsing inside a Next.js API route
- No external backend — deploys cleanly to Vercel

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev

# 3. Open http://localhost:3000
```

To produce a production build:

```bash
npm run build
npm start
```

## Project layout

```
clarity-app/
├── app/
│   ├── layout.tsx                Root layout + providers
│   ├── globals.css               Tailwind + component classes
│   ├── page.tsx                  Landing / login
│   ├── dashboard/page.tsx        Dashboard with the two CTAs + history
│   ├── upload/page.tsx           DOCX/PPTX upload + analysis flow
│   ├── reports/[id]/page.tsx     DOCX/PPTX report + re-upload
│   ├── pdf-review/page.tsx      Adobe-report upload (PDF + report)
│   ├── pdf-reports/[id]/page.tsx Adobe-report results + fix suggestions
│   ├── api/review/route.ts       POST endpoint — DOCX + PPTX analyzers
│   └── api/pdf-review/route.ts   POST endpoint — Adobe-report parser
├── components/                   Shared React components
├── lib/
│   ├── types.ts                  Shared TypeScript types
│   ├── mock-data.ts              Sample-file helpers
│   ├── docx-analyzer.ts          WCAG contrast, font, alt, heading checks (DOCX)
│   ├── pptx-analyzer.ts          Same checks, slide by slide (PPTX)
│   ├── adobe-report-parser.ts    Parses Adobe accessibility reports (HTML + PDF)
│   ├── adobe-suggestions.ts      Plain-language fix for each Adobe rule
│   └── store.tsx                 App-wide state (Context + localStorage)
└── ...                           Config files
```

## Deploy to GitHub and Vercel

### 1. Create a new GitHub repo

Option A — with the `gh` CLI:

```bash
cd clarity-app
git init
git add .
git commit -m "Initial Clarity prototype"
gh repo create clarity-app --public --source=. --remote=origin --push
```

Option B — via the GitHub web UI:

1. Go to <https://github.com/new>, create an empty repo named `clarity-app`
   (do not add a README, `.gitignore`, or license — the project already has them).
2. In your terminal:
   ```bash
   cd clarity-app
   git init
   git add .
   git commit -m "Initial Clarity prototype"
   git branch -M main
   git remote add origin https://github.com/<your-username>/clarity-app.git
   git push -u origin main
   ```

### 2. Deploy to Vercel

1. Go to <https://vercel.com/new>.
2. Click **Import Git Repository** and select the `clarity-app` repo you just
   pushed.
3. Vercel auto-detects Next.js. Leave all defaults (Framework: Next.js, Build
   Command: `next build`, Output: `.next`) and click **Deploy**.
4. When the build finishes you'll get a live URL like
   `https://clarity-app.vercel.app`.

Every push to `main` will trigger a new production deploy. Pull requests get
preview URLs automatically.

### Optional: deploy from the command line

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production deploy
```

## How reviews work

New accounts start with an empty dashboard and a welcome state.

**DOCX uploads** POST the file to `/api/review`, which runs `lib/docx-analyzer.ts`:
it unzips the DOCX, parses `word/document.xml` and `word/styles.xml`, walks
paragraphs and runs, and flags real issues — text whose WCAG contrast ratio is
below 4.5:1, font sizes under 12pt, images with missing or filename-style alt
text, and heading outlines that skip levels.

**PPTX uploads** use the same endpoint and dispatch to `lib/pptx-analyzer.ts`,
which walks each slide's shape tree in `ppt/slides/slideN.xml`, checks run
properties (size in hundredths of a point, color via `<a:solidFill>`, font via
`<a:latin>`), and reports the same issue categories with "Slide N" locators.
Font thresholds are tighter on slides (18pt warn, 14pt critical) since decks
are read from farther away. Slides missing a title placeholder get an
informational "no title" issue.

The score is computed from the issues found (start at 100, subtract 15 per
critical, 5 per warning, 2 per info).

**Re-review** (DOCX and PPTX) runs a fresh accessibility analysis on the
revised file and diffs it against the previous version. Issues are matched by
a stable fingerprint (e.g. a contrast issue fingerprints on its fg/bg color
pair), so any issue from v1 whose fingerprint is missing from v2's analysis
is marked resolved. Newly-introduced issues appear as open items in v2, and
previously-resolved items are carried forward so the full fix history stays
visible.

**Adobe PDF reviews** POST both the PDF and the accessibility report to
`/api/pdf-review`. For HTML reports we walk the rule tables in source order
and pull out each `(rule, status, description)` row; for PDF reports we run
a dependency-free text extraction over the PDF stream and match the
well-known Adobe rule names. Every rule is then fed through
`lib/adobe-suggestions.ts`, which maps it to a plain-language, tool-agnostic
fix written for a source-file author (Word, InDesign, Google Docs, etc.)
rather than for someone remediating the exported PDF in Acrobat. The results
page lets the user check off each finding as resolved.

State is persisted in `localStorage` under two keys: `clarity_session_v1` holds
the logged-in email, and `clarity_account_v1:<email>` holds that account's
documents and PDF reviews. Each email gets its own isolated set. Clear these
keys from your browser's dev tools to reset the app.

## Next steps

Natural follow-ups when you're ready to harden this into a real product:

- Replace placeholder auth with NextAuth (Credentials, GitHub, or magic links).
- Move persistence from `localStorage` to a real database (Postgres via Neon,
  Planetscale, or Supabase).
- Add file storage (Vercel Blob, S3, or UploadThing).
- Swap the PDF text extractor for `pdfjs-dist` for more robust parsing of
  non-Latin fonts and unusually-encoded Adobe reports.
- Export reports as PDF or shareable links.
