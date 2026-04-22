# Clarity — Document Accessibility Review

A Next.js 14 (App Router) web app for reviewing document accessibility. Users
upload a Word doc, PowerPoint, or PDF and get a report covering color contrast,
font size, alt text, and heading structure. After fixing the issues they can
re-upload a revised version to see which have been resolved.

This build uses mocked analysis (no real document parsing yet) and placeholder
authentication (any email/password works). State is persisted in the browser
via `localStorage`.

## Stack

- Next.js 14 (App Router) with TypeScript
- Tailwind CSS for styling
- React Context + `localStorage` for mock persistence
- No backend — deploys cleanly to Vercel as a static-rendered Next.js app

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
│   ├── layout.tsx              Root layout + providers
│   ├── globals.css             Tailwind + component classes
│   ├── page.tsx                Landing / login
│   ├── dashboard/page.tsx      Dashboard with reviews
│   ├── upload/page.tsx         Upload + analysis flow
│   └── reports/[id]/page.tsx   Report detail + re-upload
├── components/                 Shared React components
├── lib/
│   ├── types.ts                Shared TypeScript types
│   ├── mock-data.ts            Seed documents + issue generators
│   └── store.tsx               App-wide state (Context + localStorage)
└── ...                         Config files
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

## Mock data

Three seed documents are shown on the dashboard on first load
(`lib/mock-data.ts`). Uploaded files add a new document with generated mock
issues; re-uploading a revised version marks ~70% of open issues as resolved
(prioritizing critical ones) and bumps the score.

State is persisted under the `clarity_state_v1` key in `localStorage`. Clear it
from your browser's dev tools to reset the app.

## Next steps

Natural follow-ups when you're ready to harden this into a real product:

- Wire up real document parsing in API routes (`pdfjs-dist`, `mammoth`,
  `jszip`/`xml2js` for PPTX).
- Replace placeholder auth with NextAuth (Credentials, GitHub, or magic links).
- Move persistence from `localStorage` to a real database (Postgres via Neon,
  Planetscale, or Supabase).
- Add file storage (Vercel Blob, S3, or UploadThing).
- Export reports as PDF or shareable links.
