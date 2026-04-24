import { NextRequest, NextResponse } from "next/server";
import { parseAdobeReport } from "@/lib/adobe-report-parser";
import { suggestionFor } from "@/lib/adobe-suggestions";
import type { PdfFinding, PdfRuleStatus } from "@/lib/types";

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
  try {
    reportBuffer = Buffer.from(await report.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Could not read the accessibility report file." },
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

  const findings: PdfFinding[] = parsed.findings.map((f) => {
    const suggestion = suggestionFor(f.rule);
    return {
      id: "find_" + Math.random().toString(36).slice(2, 9),
      category: f.category || suggestion.category,
      rule: f.rule,
      status: f.status,
      description: f.description,
      suggestion:
        suggestion.fix +
        (suggestion.why ? ` Why it matters: ${suggestion.why}` : ""),
      resolved: false,
    };
  });

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
