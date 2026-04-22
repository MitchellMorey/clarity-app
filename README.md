# Clarity — Document Accessibility Review

A Next.js 14 (App Router) web app for reviewing document accessibility. Users
upload a Word doc or PowerPoint and get a report covering color contrast, font
size, alt text, and heading structure. After fixing the issues they can
re-upload a revised version to see which have been resolved.

**DOCX reviews are real.** Uploads are POSTed to `/api/review`, which unzips
the Word document, walks its paragraphs and runs, and returns the actual
accessibility issues found. **PPTX reviews are currently a placeholder** — the
report page shows a "Preview analysis" banner and returns a sample issue set.
Real PowerPoint parsing is planned.

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
│   ├── dashboard/page.tsx        Dashboard with reviews
│   ├── upload/page.tsx           Upload + analysis flow
│   ├── reports/[id]/page.tsx     Report detail + re-upload
│   └── api/review/route.ts       POST endpoint — real DOCX analyzer
├── components/                   Shared React components
├── lib/
│   ├── types.ts                  Shared TypeScript types
│   ├── mock-data.ts              PPTX placeholder issues + helpers
│   ├── docx-analyzer.ts          WCAG contrast, font, alt, heading checks
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
text, and heading outlines that skip levels. The score is computed from the
issues found (start at 100, subtract 15 per critical, 5 per warning, 2 per info).

**PPTX uploads** currently return a placeholder issue set from
`lib/mock-data.ts`, and the report page shows a "Preview analysis" banner so
users know the PPTX review isn't real yet.

**Re-review** still uses a heuristic: it resolves ~70% of the previous version's
open issues, prioritizing critical ones. Upgrading re-review to re-analyze the
uploaded file is a follow-up.

State is persisted in `localStorage` under two keys: `clarity_session_v1` holds
the logged-in email, and `clarity_account_v1:<email>` holds that account's
documents. Each email gets its own isolated set of documents. Clear these keys
from your browser's dev tools to reset the app.

## Next steps

Natural follow-ups when you're ready to harden this into a real product:

- Build real PPTX parsing (same jszip pattern as DOCX, walking
  `ppt/slides/slideN.xml` and checking text-run formatting + `<p:pic>` alt text).
- Upgrade re-review to re-analyze the uploaded revised file instead of using the
  heuristic 70%-resolved shortcut.
- Replace placeholder auth with NextAuth (Credentials, GitHub, or magic links).
- Move persistence from `localStorage` to a real database (Postgres via Neon,
  Planetscale, or Supabase).
- Add file storage (Vercel Blob, S3, or UploadThing).
- Export reports as PDF or shareable links.
