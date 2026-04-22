import type { Document, DocType, Issue } from "./types";

function makeIssue(partial: Omit<Issue, "id" | "resolved"> & { resolved?: boolean }): Issue {
  return {
    id: "iss_" + Math.random().toString(36).slice(2, 9),
    resolved: false,
    ...partial,
  };
}

export const INITIAL_DOCUMENTS: Document[] = [
  {
    id: "doc1",
    name: "Q4_marketing_deck.pptx",
    type: "pptx",
    size: "3.4 MB",
    uploadedAt: "2026-04-18",
    versions: [
      {
        version: 1,
        reviewedAt: "April 18, 2026",
        score: 62,
        issues: [
          makeIssue({
            category: "contrast",
            severity: "critical",
            title: "Low contrast on section titles",
            location: "Slide 3 · Title",
            fg: "#9ca3af",
            bg: "#f3f4f6",
            ratio: "2.1:1",
            required: "4.5:1",
            suggestion:
              "Use a darker title color such as #1f2937 to reach 10.8:1 contrast.",
          }),
          makeIssue({
            category: "contrast",
            severity: "warning",
            title: "Body text contrast below AA",
            location: "Slide 5 · Body paragraph",
            fg: "#6b7280",
            bg: "#ffffff",
            ratio: "4.1:1",
            required: "4.5:1",
            suggestion: "Darken body text to at least #4b5563 for AA compliance.",
          }),
          makeIssue({
            category: "font",
            severity: "critical",
            title: "Body text smaller than 18pt",
            location: "Slide 4 · Bullet list",
            detail: "Current: 12pt · Recommended: 18pt+",
            suggestion:
              "Increase bullet text to 18pt. Presentation content should be legible from the back of a room.",
          }),
          makeIssue({
            category: "font",
            severity: "warning",
            title: "Footer text below 10pt",
            location: "All slides · Footer",
            detail: "Current: 8pt",
            suggestion: "Use at least 10pt for footers, or remove if not essential.",
          }),
          makeIssue({
            category: "alt",
            severity: "critical",
            title: "Chart missing alt text",
            location: "Slide 7 · Revenue chart",
            suggestion:
              "Add alt text describing the chart's key insight, e.g. 'Revenue grew 34% year over year, driven by enterprise.'",
          }),
          makeIssue({
            category: "alt",
            severity: "critical",
            title: "Decorative image not marked",
            location: "Slide 2 · Background image",
            suggestion:
              "Mark purely decorative images as decorative so screen readers skip them.",
          }),
          makeIssue({
            category: "alt",
            severity: "warning",
            title: "Logo has generic alt text",
            location: "Slide 1 · Company logo",
            detail: "Current alt: 'image1.png'",
            suggestion: "Replace with meaningful alt text like 'Acme Corp logo'.",
          }),
          makeIssue({
            category: "heading",
            severity: "warning",
            title: "Slide titles missing on section dividers",
            location: "Slides 6, 12",
            suggestion:
              "Add a title placeholder so screen readers can navigate by slide.",
          }),
          makeIssue({
            category: "heading",
            severity: "info",
            title: "Inconsistent title hierarchy",
            location: "Across deck",
            suggestion: "Use the slide master to keep title sizes consistent.",
          }),
        ],
      },
    ],
  },
  {
    id: "doc2",
    name: "2026_Annual_Report.pdf",
    type: "pdf",
    size: "8.1 MB",
    uploadedAt: "2026-04-15",
    versions: [
      {
        version: 1,
        reviewedAt: "April 15, 2026",
        score: 78,
        issues: [
          makeIssue({
            category: "contrast",
            severity: "warning",
            title: "Caption color below AA",
            location: "Page 4 · Figure caption",
            fg: "#a1a1aa",
            bg: "#ffffff",
            ratio: "3.2:1",
            required: "4.5:1",
            suggestion: "Use #52525b for captions (7.0:1 contrast).",
          }),
          makeIssue({
            category: "font",
            severity: "warning",
            title: "Footnotes below 9pt",
            location: "Pages 6, 9, 12",
            detail: "Current: 7pt",
            suggestion: "Increase footnote size to at least 9pt.",
          }),
          makeIssue({
            category: "alt",
            severity: "critical",
            title: "Figure 2 missing alt text",
            location: "Page 6 · Market share chart",
            suggestion:
              "Describe the chart: 'Acme holds 42% market share, a 5-point gain over 2025.'",
          }),
          makeIssue({
            category: "heading",
            severity: "warning",
            title: "H3 follows H1 (skipped level)",
            location: "Page 8",
            suggestion:
              "Replace skipped heading with an H2 to keep the outline intact.",
          }),
        ],
      },
    ],
  },
  {
    id: "doc3",
    name: "Employee_Handbook_2026.docx",
    type: "docx",
    size: "1.2 MB",
    uploadedAt: "2026-04-10",
    versions: [
      {
        version: 1,
        reviewedAt: "April 10, 2026",
        score: 88,
        issues: [
          makeIssue({
            category: "contrast",
            severity: "info",
            title: "Link color has low contrast on visited state",
            location: "Throughout · Hyperlinks",
            fg: "#a78bfa",
            bg: "#ffffff",
            ratio: "3.4:1",
            required: "4.5:1",
            suggestion: "Darken visited link color to #6d28d9.",
          }),
          makeIssue({
            category: "alt",
            severity: "warning",
            title: "Org chart image uses filename as alt",
            location: "Page 14 · Org structure",
            detail: "Current alt: 'IMG_2031.png'",
            suggestion:
              "Describe the org chart's structure and reporting relationships.",
          }),
          makeIssue({
            category: "heading",
            severity: "info",
            title: "Heading 1 used for styling, not structure",
            location: "Page 3",
            suggestion: "Reserve H1 for the document title. Use H2 for section titles.",
          }),
        ],
      },
    ],
  },
];

export function inferType(filename: string): DocType {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "pptx" || ext === "ppt") return "pptx";
  return "docx";
}

export function todayString(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function generateMockIssuesFor(type: DocType): Issue[] {
  const locPrefix = type === "pptx" ? "Slide" : "Page";
  return [
    makeIssue({
      category: "contrast",
      severity: "critical",
      title: "Low contrast on headings",
      location:
        type === "pptx" ? "Slide 2 · Title" : `${locPrefix} 2 · Section heading`,
      fg: "#b1b5bc",
      bg: "#ffffff",
      ratio: "2.6:1",
      required: "4.5:1",
      suggestion: "Darken heading color to #1f2937 for 13:1 contrast.",
    }),
    makeIssue({
      category: "contrast",
      severity: "warning",
      title: "Caption contrast below AA",
      location:
        type === "pptx"
          ? "Slide 6 · Image caption"
          : `${locPrefix} 5 · Figure caption`,
      fg: "#a1a1aa",
      bg: "#ffffff",
      ratio: "3.2:1",
      required: "4.5:1",
      suggestion: "Use #52525b instead.",
    }),
    makeIssue({
      category: "font",
      severity: "critical",
      title:
        type === "pptx" ? "Body text too small for slides" : "Body text below 12pt",
      location: type === "pptx" ? "Slide 4 · Bullets" : "Throughout",
      detail:
        type === "pptx"
          ? "Current: 11pt · Recommended: 18pt+"
          : "Current: 9pt · Recommended: 12pt+",
      suggestion:
        type === "pptx"
          ? "Increase body text to 18pt."
          : "Increase body text to at least 12pt.",
    }),
    makeIssue({
      category: "alt",
      severity: "critical",
      title: "Image missing alt text",
      location:
        type === "pptx" ? "Slide 3 · Hero image" : `${locPrefix} 3 · Cover image`,
      suggestion: "Add a concise description of the image's purpose.",
    }),
    makeIssue({
      category: "alt",
      severity: "warning",
      title: "Alt text is the filename",
      location:
        type === "pptx" ? "Slide 8 · Diagram" : `${locPrefix} 7 · Diagram`,
      detail: "Current alt: 'diagram_final_v3.png'",
      suggestion: "Describe what the diagram shows, not its filename.",
    }),
    makeIssue({
      category: "heading",
      severity: "warning",
      title: "Heading levels skip from H1 to H3",
      location: type === "pptx" ? "Deck structure" : `${locPrefix} 4`,
      suggestion:
        "Use H2 between H1 and H3 so assistive tech can navigate the outline.",
    }),
  ];
}
