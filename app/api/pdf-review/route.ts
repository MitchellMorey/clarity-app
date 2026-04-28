import { NextRequest, NextResponse } from "next/server";
import { parseAdobeReport } from "@/lib/adobe-report-parser";
import { suggestionFor, ruleKey } from "@/lib/adobe-suggestions";
import { analyzePdfContent } from "@/lib/pdf-content-analyzer";
import { runPdfChecks, type PdfCheckResults } from "@/lib/pdf-checks";
import type { PdfEvidence, PdfFinding, PdfRuleStatus } from "@/lib/types";

// Node runtime — pdf text extraction and HTML parsing both work in Node
// without extra deps, but we want full Buffer/streaming support.
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Score weights per rule status — lower = bigger penalty. */
const SCORE_WEIGHTS: Record<PdfRuleStatus, number> = {
  failed: 10,
  "needs-check": 2,
  passed: 0,
  "not-applicable": 0,
};

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read form upload." },
      { status: 400 },
    );
  }

  const pdf = form.get("pdf");
  const report = form.get("report");

  if (!(pdf instanceof File) || !(report instanceof File)) {
    return NextResponse.json(
      {
        error:
          "Both files are required: the original PDF under 'pdf', and the Adobe accessibility report under 'report'.",
      },
      { status: 400 },
    );
  }

  if (pdf.size === 0 || report.size === 0) {
    return NextResponse.json(
      { error: "One of the uploaded files is empty." },
      { status: 400 },
    );
  }
  if (pdf.size > MAX_UPLOAD_BYTES || report.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Uploaded files must be under 50 MB each." },
      { status: 413 },
    );
  }

  if (!/\.pdf$/i.test(pdf.name)) {
    return NextResponse.json(
      { error: "The first file must be a .pdf." },
      { status: 415 },
    );
  }
  if (!/\.(pdf|html?|txt)$/i.test(report.name)) {
    return NextResponse.json(
      {
        error:
          "The Adobe accessibility report must be a .pdf, .html, .htm, or .txt file.",
      },
      { status: 415 },
    );
  }

  let reportBuffer: Buffer;
  let pdfBuffer: Buffer;
  try {
    reportBuffer = Buffer.from(await report.arrayBuffer());
    pdfBuffer = Buffer.from(await pdf.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Could not read one of the uploaded files." },
      { status: 400 },
    );
  }

  const parsed = parseAdobeReport(reportBuffer, report.name);

  if (!parsed.recognized) {
    return NextResponse.json(
      {
        error:
          "We couldn't find any accessibility rule results in that report. Export the Adobe accessibility check as HTML (File → Save As → HTML) and try again — Adobe's HTML reports have the cleanest structure to parse.",
        format: parsed.format,
      },
      { status: 422 },
    );
  }

  // Source-side scan of the actual PDF. If parsing fails we still return
  // the Adobe findings, just without Clarity's augmentations.
  let pdfChecks: PdfCheckResults | null = null;
  try {
    const content = analyzePdfContent(pdfBuffer);
    pdfChecks = runPdfChecks(content);
  } catch {
    pdfChecks = null;
  }

  // Build the Adobe findings, attaching Clarity evidence where we have it.
  const adobeFindings: PdfFinding[] = parsed.findings.map((f) => {
    const suggestion = suggestionFor(f.rule);
    const finding: PdfFinding = {
      id: "find_" + Math.random().toString(36).slice(2, 9),
      category: f.category || suggestion.category,
      rule: f.rule,
      status: f.status,
      description: f.description,
      suggestion:
        suggestion.fix +
        (suggestion.why ? ` Why it matters: ${suggestion.why}` : ""),
      resolved: false,
      source: "adobe",
    };

    if (pdfChecks) {
      const evidence = adobeEvidenceFor(f.rule, f.status, pdfChecks);
      if (evidence.length > 0) finding.evidence = evidence;

      // Adobe's color contrast rule is *always* "needs-check". If Clarity
      // actually found contrast failures in the PDF we should escalate it
      // to a real failure so the user sees it under the Failed filter.
      if (
        ruleKey(f.rule) === "colorcontrast" &&
        f.status === "needs-check" &&
        pdfChecks.contrastEvidence.length > 0
      ) {
        finding.status = "failed";
      }
    }
    return finding;
  });

  // Anything Clarity caught that Adobe didn't (or that Adobe doesn't even
  // check) — surface as Clarity-source findings.
  const clarityFindings: PdfFinding[] = pdfChecks
    ? buildClarityFindings(pdfChecks, adobeFindings)
    : [];

  const findings = [...adobeFindings, ...clarityFindings];
  const score = computeScore(findings);

  return NextResponse.json({
    pdfName: pdf.name,
    reportName: report.name,
    pdfSize: pdf.size,
    pdfSizeLabel: formatBytes(pdf.size),
    reportFormat: parsed.format,
    findings,
    score,
    totals: countByStatus(findings),
  });
}

/**
 * Pick out the Clarity-side evidence relevant to a given Adobe rule so
 * the user can see which actual element triggered the failure.
 */
function adobeEvidenceFor(
  rule: string,
  status: PdfRuleStatus,
  checks: PdfCheckResults,
): PdfEvidence[] {
  // Only attach evidence when the rule needs attention. Don't muddy passed
  // rules with extra rows.
  if (status !== "failed" && status !== "needs-check") return [];

  const key = ruleKey(rule);
  if (key === "colorcontrast") return checks.contrastEvidence;
  if (key === "figuresalternatetext") return checks.altEvidence;
  return [];
}

/**
 * Compose the additional findings that come from Clarity's source-side scan
 * (font size always; contrast/alt only when Adobe's report didn't already
 * cover the rule).
 */
function buildClarityFindings(
  checks: PdfCheckResults,
  adobeFindings: PdfFinding[],
): PdfFinding[] {
  const out: PdfFinding[] = [];
  const adobeRuleKeys = new Set(adobeFindings.map((f) => ruleKey(f.rule)));

  // Font size — Adobe never checks this, so always emit if we found any.
  if (checks.fontEvidence.length > 0) {
    out.push({
      id: "find_" + Math.random().toString(36).slice(2, 9),
      category: "Page content",
      rule: "Text font size",
      status: checks.fontHasCritical ? "failed" : "needs-check",
      description: `Clarity found ${checks.fontEvidence.length} text block${
        checks.fontEvidence.length === 1 ? "" : "s"
      } below the 12pt readable threshold.`,
      suggestion:
        "Increase the font size in the source file to at least 12pt for body text (9pt is the floor for any printed text). Adobe's accessibility checker doesn't measure font size, but unreadable text is one of the most common real-world accessibility problems.",
      resolved: false,
      source: "clarity",
      evidence: checks.fontEvidence,
    });
  }

  // Contrast — only add as a separate Clarity finding if Adobe didn't
  // include color contrast at all (rare). Otherwise the Adobe finding
  // already carries Clarity's evidence (above).
  if (
    checks.contrastEvidence.length > 0 &&
    !adobeRuleKeys.has("colorcontrast")
  ) {
    out.push({
      id: "find_" + Math.random().toString(36).slice(2, 9),
      category: "Document",
      rule: "Color contrast",
      status: "failed",
      description: `Clarity found ${checks.contrastEvidence.length} text element${
        checks.contrastEvidence.length === 1 ? "" : "s"
      } below the WCAG 2.1 contrast threshold.`,
      suggestion:
        "Darken low-contrast text in the source file so it meets the 4.5:1 minimum (3:1 for 18pt+ bold). Re-export the PDF after fixing.",
      resolved: false,
      source: "clarity",
      evidence: checks.contrastEvidence,
    });
  }

  // Missing alt text — only add if Adobe didn't already report it.
  if (
    checks.hasMissingAlt &&
    !adobeRuleKeys.has("figuresalternatetext")
  ) {
    out.push({
      id: "find_" + Math.random().toString(36).slice(2, 9),
      category: "Alternate text",
      rule: "Figures alternate text",
      status: "failed",
      description: `Clarity found ${checks.altEvidence.length} figure${
        checks.altEvidence.length === 1 ? "" : "s"
      } in the PDF without alt text.`,
      suggestion:
        "For every figure or image in your source, add alt text that describes the image's purpose (not its filename). Right-click → Edit Alt Text in Word/PowerPoint; Object Export Options in InDesign.",
      resolved: false,
      source: "clarity",
      evidence: checks.altEvidence,
    });
  }

  return out;
}

function computeScore(findings: PdfFinding[]): number {
  let score = 100;
  for (const f of findings) score -= SCORE_WEIGHTS[f.status] ?? 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function countByStatus(findings: PdfFinding[]) {
  const out: Record<PdfRuleStatus, number> = {
    passed: 0,
    failed: 0,
    "needs-check": 0,
    "not-applicable": 0,
  };
  for (const f of findings) out[f.status]++;
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
