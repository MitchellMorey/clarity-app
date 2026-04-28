/**
 * Clarity-side accessibility checks that run against the parsed PDF
 * content. These complement the Adobe report parse:
 *
 *   - Adobe never measures contrast — every PDF gets "needs manual check"
 *     for color contrast. We compute real WCAG ratios.
 *   - Adobe doesn't flag tiny fonts at all. We flag anything below the
 *     same thresholds the DOCX analyzer uses (< 9pt critical, < 12pt warn).
 *   - We also collect figure metadata so the API route can attach evidence
 *     to Adobe's "Figures alternate text" failure.
 */

import type { PdfContent, PdfTextRun, PdfFigureMeta } from "./pdf-content-analyzer";
import type { PdfEvidence } from "./types";

// Same thresholds we use on DOCX so reviewers see consistent rules.
const FONT_CRITICAL_BELOW = 9; // < 9pt is critical
const FONT_WARNING_BELOW = 12; // < 12pt and >= 9pt is a warning
const CONTRAST_AA_NORMAL = 4.5;
const CONTRAST_AA_LARGE = 3.0;
const LARGE_TEXT_PT = 18; // 18pt+ counts as "large text" under WCAG

export interface PdfCheckResults {
  contrastEvidence: PdfEvidence[];
  fontEvidence: PdfEvidence[];
  fontHasCritical: boolean;
  altEvidence: PdfEvidence[];
  /** True when at least one figure has missing alt. */
  hasMissingAlt: boolean;
  /** Total number of figures we detected. */
  figureCount: number;
}

export function runPdfChecks(content: PdfContent): PdfCheckResults {
  return {
    contrastEvidence: checkContrast(content.runs),
    ...checkFontSize(content.runs),
    ...checkFigures(content.figures),
  };
}

// ---------- Contrast ----------

function checkContrast(runs: PdfTextRun[]): PdfEvidence[] {
  const out: PdfEvidence[] = [];
  // Group by (page, color, fontSize, fontFamily) and emit one evidence row
  // per unique problem so a paragraph rendered as 100 separate Tj calls
  // doesn't spam the report.
  const seen = new Map<string, PdfEvidence>();

  for (const run of runs) {
    if (!run.text) continue;
    const ratio = contrastRatio(run.color, "#ffffff");
    const required = isLargeText(run.fontSize) ? CONTRAST_AA_LARGE : CONTRAST_AA_NORMAL;
    if (ratio >= required) continue;
    // Skip black-on-white-ish text — even slightly off-pure black still has
    // ratio well above 4.5; only flag genuine low-contrast issues.
    if (ratio >= 7) continue;

    const key = `${run.page}|${run.color}|${run.fontSize}|${run.fontFamily ?? ""}`;
    const existing = seen.get(key);
    if (existing) {
      // Concatenate up to ~120 chars so the preview stays readable.
      if (existing.text && existing.text.length < 120 && run.text.length > 0) {
        existing.text = `${existing.text} ${run.text}`.slice(0, 160);
      }
      continue;
    }
    const ev: PdfEvidence = {
      id: `clarity_contrast_${out.length + 1}`,
      kind: "text",
      page: run.page,
      text: run.text.slice(0, 160),
      fontSize: run.fontSize,
      fontFamily: run.fontFamily,
      fg: run.color,
      bg: "#ffffff",
      ratio: `${ratio.toFixed(2)}:1`,
      required: `${required.toFixed(1)}:1`,
    };
    seen.set(key, ev);
    out.push(ev);
  }

  return out;
}

function isLargeText(sizePt: number): boolean {
  return sizePt >= LARGE_TEXT_PT;
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const fg = hexToRgbLuminance(fgHex);
  const bg = hexToRgbLuminance(bgHex);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgbLuminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return 0;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  // sRGB → linear → relative luminance per WCAG 2.1.
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// ---------- Font size ----------

function checkFontSize(
  runs: PdfTextRun[],
): { fontEvidence: PdfEvidence[]; fontHasCritical: boolean } {
  const out: PdfEvidence[] = [];
  let critical = false;
  // Bucket by (page, size, color, family) so identical small-text instances
  // don't each produce their own row.
  const seen = new Map<string, PdfEvidence>();

  for (const run of runs) {
    if (!run.text) continue;
    if (run.fontSize >= FONT_WARNING_BELOW) continue;
    if (run.fontSize <= 0) continue;

    if (run.fontSize < FONT_CRITICAL_BELOW) critical = true;

    const sizeBucket = run.fontSize.toFixed(1);
    const key = `${run.page}|${sizeBucket}|${run.color}|${run.fontFamily ?? ""}`;
    const existing = seen.get(key);
    if (existing) {
      if (existing.text && existing.text.length < 120 && run.text.length > 0) {
        existing.text = `${existing.text} ${run.text}`.slice(0, 160);
      }
      continue;
    }
    const ev: PdfEvidence = {
      id: `clarity_font_${out.length + 1}`,
      kind: "text",
      page: run.page,
      text: run.text.slice(0, 160),
      fontSize: run.fontSize,
      fontFamily: run.fontFamily,
      fg: run.color,
      bg: "#ffffff",
      detail: `Current: ${formatPt(run.fontSize)} · Recommended: ${FONT_WARNING_BELOW}pt+`,
    };
    seen.set(key, ev);
    out.push(ev);
  }

  return { fontEvidence: out, fontHasCritical: critical };
}

function formatPt(n: number): string {
  // Pretty-print sizes: integers as "1pt", half-points as "8.5pt".
  return Number.isInteger(n) ? `${n}pt` : `${n.toFixed(1)}pt`;
}

// ---------- Figures / alt text ----------

function checkFigures(
  figures: PdfFigureMeta[],
): { altEvidence: PdfEvidence[]; hasMissingAlt: boolean; figureCount: number } {
  const missing = figures.filter((f) => !f.hasAlt);
  const evidence: PdfEvidence[] = missing.map((f, i) => ({
    id: `clarity_alt_${i + 1}`,
    kind: "image",
    page: f.page ?? 0,
    imageLabel: `Figure ${f.index}`,
    detail: f.page
      ? `Figure ${f.index} on page ${f.page} has no alt text.`
      : `Figure ${f.index} has no alt text.`,
  }));
  return {
    altEvidence: evidence,
    hasMissingAlt: missing.length > 0,
    figureCount: figures.length,
  };
}
