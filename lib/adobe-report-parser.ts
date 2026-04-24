/**
 * Parse the output of Adobe Acrobat's "Accessibility → Accessibility Check"
 * report, whether saved as HTML or PDF.
 *
 * We're interested in the per-rule status table, which in the HTML variant
 * looks roughly like:
 *
 *   <h2>Detailed Report</h2>
 *   <h3>Document</h3>
 *   <table>
 *     <tr><th>Rule Name</th><th>Status</th><th>Description</th></tr>
 *     <tr>
 *       <td><a>Accessibility permission flag</a></td>
 *       <td>Passed</td>
 *       <td>Accessibility permission flag is set</td>
 *     </tr>
 *     ...
 *   </table>
 *
 * The PDF variant has the same rows expressed as document text. We extract
 * text and then pattern-match the "<rule> <status> <description>" rows.
 *
 * The parser's output is a flat array of findings. The API route feeds each
 * one through lib/adobe-suggestions.ts to attach a plain-language fix.
 */

import type { PdfRuleStatus } from "./types";

export interface ParsedFinding {
  category: string;
  rule: string;
  status: PdfRuleStatus;
  description?: string;
}

const STATUS_WORDS: Record<string, PdfRuleStatus> = {
  passed: "passed",
  failed: "failed",
  "needs manual check": "needs-check",
  "needs manual review": "needs-check",
  "not applicable": "not-applicable",
  skipped: "not-applicable",
};

function classifyStatus(raw: string): PdfRuleStatus | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (STATUS_WORDS[v]) return STATUS_WORDS[v];
  // Partial matches — Adobe sometimes wraps "Failed" in other markup.
  for (const [needle, status] of Object.entries(STATUS_WORDS)) {
    if (v === needle) return status;
    if (v.startsWith(needle)) return status;
  }
  return null;
}

/** Normalize whitespace + decode the handful of HTML entities we care about. */
function clean(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return clean(html.replace(/<[^>]*>/g, " "));
}

// ---------- HTML parser ----------

/**
 * Parse an Adobe accessibility report saved as HTML.
 *
 * We walk the document in reading order: every <h2>/<h3> sets the current
 * category, and every subsequent <table> contributes rows of
 * (rule, status, description).
 */
export function parseAdobeReportHtml(html: string): ParsedFinding[] {
  const out: ParsedFinding[] = [];

  let currentCategory = "Other";

  // Find all tables + headings in source order. A simple streaming approach:
  // scan for <h2>/<h3> and <table>...</table> and dispatch as we find them.
  const tokenRegex =
    /<(h[23])[^>]*>([\s\S]*?)<\/\1>|<table[^>]*>([\s\S]*?)<\/table>/gi;

  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(html)) !== null) {
    const [, headingTag, headingInner, tableInner] = m;

    if (headingTag && headingInner !== undefined) {
      const text = stripTags(headingInner);
      // Skip the "Summary" / "Detailed Report" wrapper headings.
      if (/^(detailed report|summary|accessibility report)$/i.test(text)) {
        continue;
      }
      if (text) currentCategory = text;
      continue;
    }

    if (tableInner !== undefined) {
      const rows = extractRows(tableInner);
      for (const cells of rows) {
        if (cells.length < 2) continue;
        const rule = stripTags(cells[0]);
        const statusRaw = stripTags(cells[1]);
        const description = cells[2] ? stripTags(cells[2]) : undefined;

        const status = classifyStatus(statusRaw);
        // Skip header rows and rows whose status we can't recognize.
        if (!status) continue;
        // Skip malformed rule entries.
        if (!rule || rule.toLowerCase() === "rule name") continue;

        out.push({
          category: currentCategory,
          rule,
          status,
          description: description || undefined,
        });
      }
    }
  }

  return out;
}

function extractRows(tableInner: string): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(tableInner)) !== null) {
    const cells: string[] = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rm[1])) !== null) {
      cells.push(cm[1]);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// ---------- PDF-as-text parser ----------

/**
 * Parse an Adobe report saved as a PDF by pattern-matching rule lines against
 * text extracted from the PDF. We accept any extractor's output (pdfjs,
 * pdf-parse, naive text stream scan) — we just need a reasonable linearization
 * of the report's text.
 *
 * The report always lists each rule on its own line/row in the form:
 *   "<Rule Name> <Status> <Description>"
 * The set of rules is well-known, so we scan for each one's exact name and
 * read the status + description that follow it.
 */
export function parseAdobeReportText(text: string): ParsedFinding[] {
  const normalized = text.replace(/\r\n?/g, "\n");

  // Categories + their known rules, in the order Adobe lists them. The
  // category we attach to a finding comes from whichever section block it
  // showed up under in the raw text — but if we can't tell, we fall back
  // to the canonical mapping below.
  const RULE_CATEGORIES: [string, string[]][] = [
    ["Document", [
      "Accessibility permission flag",
      "Image-only PDF",
      "Tagged PDF",
      "Logical Reading Order",
      "Primary language",
      "Title",
      "Bookmarks",
      "Color contrast",
    ]],
    ["Page Content", [
      "Tagged content",
      "Tagged annotations",
      "Tab order",
      "Character encoding",
      "Tagged multimedia",
      "Screen flicker",
      "Scripts",
      "Timed responses",
      "Navigation links",
    ]],
    ["Forms", [
      "Tagged form fields",
      "Field descriptions",
    ]],
    ["Alternate Text", [
      "Figures alternate text",
      "Nested alternate text",
      "Associated with content",
      "Hides annotation",
      "Other elements alternate text",
    ]],
    ["Tables", [
      "Rows",
      "TH and TD",
      "Headers",
      "Regularity",
      "Summary",
    ]],
    ["Lists", [
      "List items",
      "Lbl and LBody",
    ]],
    ["Headings", [
      "Appropriate nesting",
    ]],
  ];

  const findings: ParsedFinding[] = [];

  // For each rule, search for its name in the text and grab the status word
  // that follows (plus any description up to the next newline or rule).
  for (const [category, rules] of RULE_CATEGORIES) {
    for (const rule of rules) {
      const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Rule name, optional whitespace/newlines, status word, optional
      // description until a newline or another rule boundary.
      const pattern = new RegExp(
        `${escaped}[\\s\\u00A0]*(Passed|Failed|Needs manual check|Needs manual review|Not applicable|Skipped)\\b([^\\n]*)`,
        "i",
      );
      const m = pattern.exec(normalized);
      if (!m) continue;
      const status = classifyStatus(m[1]);
      if (!status) continue;

      const description = (m[2] || "").trim() || undefined;

      findings.push({
        category,
        rule,
        status,
        description,
      });
    }
  }

  return findings;
}

// ---------- PDF text extraction ----------

/**
 * Best-effort, dependency-free text extraction from a raw PDF buffer.
 *
 * We look for the "BT ... ET" (Begin Text / End Text) blocks and pull out
 * the operand strings inside TJ/Tj operators. This won't handle every PDF
 * encoding cleanly — CID-based fonts with custom ToUnicode maps are the
 * usual foot-gun — but Adobe's own accessibility reports are exported with
 * standard fonts and come through readably. If this ever proves too thin we
 * can add pdfjs-dist as an opt-in dep.
 */
export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const textChunks: string[] = [];

  // Match text-showing operators inside BT...ET:
  //   (hello world) Tj
  //   [(he)10(llo)] TJ
  const showRegex = /\(((?:[^()\\]|\\.|\\\n)*)\)\s*(Tj|TJ|'|")/g;
  const arrayTjRegex = /\[([^\]]+)\]\s*TJ/g;

  const btEtRegex = /BT\s([\s\S]*?)\sET/g;
  let block: RegExpExecArray | null;
  while ((block = btEtRegex.exec(raw)) !== null) {
    const body = block[1];

    // Extract any array-form TJ parts: [(foo)123(bar)] TJ → "foobar"
    let arr: RegExpExecArray | null;
    const collected: string[] = [];
    const mergedBody = body;
    while ((arr = arrayTjRegex.exec(mergedBody)) !== null) {
      const inside = arr[1];
      const pieces = [...inside.matchAll(/\(((?:[^()\\]|\\.|\\\n)*)\)/g)].map(
        (m) => decodePdfString(m[1]),
      );
      collected.push(pieces.join(""));
    }

    // Extract plain-form Tj/'/"/TJ parts
    let m: RegExpExecArray | null;
    while ((m = showRegex.exec(mergedBody)) !== null) {
      collected.push(decodePdfString(m[1]));
    }

    if (collected.length) textChunks.push(collected.join(" "));
  }

  // Adobe's accessibility reports have each rule on its own logical line.
  // Re-inserting newlines between text-showing blocks keeps that structure
  // so the line-based parser above can grep rule names.
  return textChunks.join("\n");
}

function decodePdfString(encoded: string): string {
  // Handle the small set of PDF string escape sequences.
  return encoded
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

// ---------- Entry point: accept either format ----------

export interface ParseResult {
  findings: ParsedFinding[];
  /** Whether anything was parsed. False when the upload wasn't a recognizable Adobe report. */
  recognized: boolean;
  /** The source format we interpreted the upload as. */
  format: "html" | "pdf" | "text";
}

/**
 * Parse an Adobe accessibility report from an uploaded file's bytes.
 * `filename` is used only to pick between the HTML and PDF code paths.
 */
export function parseAdobeReport(
  buffer: Buffer,
  filename: string,
): ParseResult {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (ext === "htm" || ext === "html") {
    const html = buffer.toString("utf8");
    const findings = parseAdobeReportHtml(html);
    return {
      findings,
      recognized: findings.length > 0,
      format: "html",
    };
  }

  if (ext === "pdf") {
    const text = extractPdfText(buffer);
    const findings = parseAdobeReportText(text);
    return {
      findings,
      recognized: findings.length > 0,
      format: "pdf",
    };
  }

  // Fallback: treat as plain text.
  const text = buffer.toString("utf8");
  const findings = parseAdobeReportText(text);
  return { findings, recognized: findings.length > 0, format: "text" };
}
