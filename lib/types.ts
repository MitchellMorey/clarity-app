export type DocType = "docx" | "pptx";

export type IssueCategory = "contrast" | "font" | "alt" | "heading";
export type IssueSeverity = "critical" | "warning" | "info";

export interface Issue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  location: string;
  detail?: string;
  suggestion?: string;
  // Contrast-specific fields
  fg?: string;
  bg?: string;
  ratio?: string;
  required?: string;
  resolved: boolean;
}

export interface ReviewVersion {
  version: number;
  reviewedAt: string;
  score: number;
  issues: Issue[];
  /** Number resolved since the previous version */
  resolvedSinceLast?: number;
}

export interface Document {
  id: string;
  name: string;
  type: DocType;
  size: string;
  uploadedAt: string;
  versions: ReviewVersion[];
}

export const ISSUE_CATEGORY_META: Record<
  IssueCategory,
  { label: string; description: string }
> = {
  contrast: {
    label: "Color contrast",
    description:
      "Text does not meet the WCAG 2.1 minimum contrast ratio against its background.",
  },
  font: {
    label: "Font size",
    description: "Text is smaller than recommended for accessible reading.",
  },
  alt: {
    label: "Missing alt text",
    description:
      "Images are missing descriptive alternative text for screen readers.",
  },
  heading: {
    label: "Heading structure",
    description: "Headings are missing, mis-ordered, or skip levels.",
  },
};

export const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};
