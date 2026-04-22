import type { DocType, Issue } from "./types";

function makeIssue(partial: Omit<Issue, "id" | "resolved"> & { resolved?: boolean }): Issue {
  return {
    id: "iss_" + Math.random().toString(36).slice(2, 9),
    resolved: false,
    ...partial,
  };
}

export function inferType(filename: string): DocType {
  const ext = (filename.split(".").pop() || "").toLowerCase();
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

export function bytesToLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Placeholder issue set used for PPTX uploads until real PPTX parsing is
 * implemented. The PPTX report page shows a "Preview analysis" banner so
 * users know this isn't a real review.
 */
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
