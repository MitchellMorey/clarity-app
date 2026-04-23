/**
 * DOCX accessibility analyzer.
 *
 * Unzips a .docx (OOXML) file, walks paragraphs and runs, and checks for:
 *   - Low-contrast text (WCAG 2.1 contrast ratio < 4.5:1 against document background)
 *   - Body text smaller than recommended (< 12pt warning, < 9pt critical)
 *   - Images missing alt text, or alt text that looks like a filename
 *   - Heading structure: missing top-level heading, or skipped heading levels
 *
 * OOXML reference notes:
 *   - Font sizes live in <w:sz w:val="N"/> where N is half-points (24 = 12pt).
 *   - Colors: <w:color w:val="RRGGBB"/> or "auto" (treated as black).
 *   - Heading styles: paragraphs with <w:pStyle w:val="Heading1"/> (1..9) or
 *     "Title" (treated as H1).
 *   - Images: <w:drawing>/<wp:inline|wp:anchor>/<wp:docPr descr="..."/>.
 *   - Document background: <w:background w:color="RRGGBB"/> at the root of
 *     document.xml (falls back to white).
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { Issue, IssueSeverity } from "./types";

export interface AnalyzeResult {
  issues: Issue[];
  score: number;
  /** Diagnostic info useful for debugging; not rendered to the user. */
  stats: {
    paragraphs: number;
    runs: number;
    images: number;
    headings: number;
    bgColor: string;
  };
}

interface RawXmlNode {
  [k: string]: unknown;
}

const WORD_DOCUMENT_PATH = "word/document.xml";
const WORD_STYLES_PATH = "word/styles.xml";

const HALF_POINT_TO_POINT = 0.5;

// Font-size thresholds (points)
const FONT_CRITICAL_BELOW = 9; // <9pt is critical
const FONT_WARNING_BELOW = 12; // <12pt (and >=9pt) is warning

// WCAG 2.1 AA thresholds
const CONTRAST_AA_NORMAL = 4.5;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // OOXML has attributes with colon prefixes; these are fine as literal keys.
  allowBooleanAttributes: true,
  removeNSPrefix: false,
  parseAttributeValue: false,
  trimValues: false,
  // Preserve arrays where there can legitimately be multiple siblings
  // so we don't have to special-case the "single vs. array" shape at every
  // node. This costs us a little memory but makes traversal straightforward.
  isArray: (name) => {
    return [
      "w:p",
      "w:r",
      "w:tbl",
      "w:tr",
      "w:tc",
      "w:drawing",
      "w:hyperlink",
      "w:sdt",
      "wp:inline",
      "wp:anchor",
      "v:shape",
    ].includes(name);
  },
});

function makeId(prefix = "iss"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

function makeIssue(partial: Omit<Issue, "id" | "resolved"> & { resolved?: boolean }): Issue {
  return {
    id: makeId(),
    resolved: false,
    ...partial,
  };
}

// ---------- Color + contrast utilities ----------

function normalizeHex(input: string | undefined | null): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (v === "auto" || v === "") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(v);
  if (!m) return null;
  return "#" + m[1].toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(fgHex: string, bgHex: string): number {
  const L1 = relativeLuminance(hexToRgb(fgHex));
  const L2 = relativeLuminance(hexToRgb(bgHex));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRatio(r: number): string {
  return r.toFixed(1) + ":1";
}

// ---------- Analyzer ----------

export async function analyzeDocx(buffer: ArrayBuffer | Buffer): Promise<AnalyzeResult> {
  const zip = await JSZip.loadAsync(buffer);

  const documentFile = zip.file(WORD_DOCUMENT_PATH);
  if (!documentFile) {
    throw new Error("This doesn't look like a valid DOCX file (missing word/document.xml).");
  }
  const documentXml = await documentFile.async("string");
  const stylesXml = (await zip.file(WORD_STYLES_PATH)?.async("string")) ?? "";

  const docParsed = xmlParser.parse(documentXml) as RawXmlNode;
  const stylesParsed = stylesXml ? (xmlParser.parse(stylesXml) as RawXmlNode) : {};

  const styleIndex = indexStyles(stylesParsed);

  const docRoot = getNested(docParsed, ["w:document"]) as RawXmlNode | undefined;
  const body = getNested(docRoot, ["w:body"]) as RawXmlNode | undefined;
  const bgColor = extractDocumentBackground(docRoot) ?? "#ffffff";

  if (!body) {
    throw new Error("Could not read document body.");
  }

  const stats = {
    paragraphs: 0,
    runs: 0,
    images: 0,
    headings: 0,
    bgColor,
  };

  const issues: Issue[] = [];

  // Deduplicate similar issues so a single repeated problem (e.g. the same
  // low-contrast color used throughout the doc) shows as one line item,
  // with its location summarizing the earliest occurrences.
  const contrastBuckets = new Map<string, { ratio: number; paragraphs: number[]; severity: IssueSeverity }>();
  const smallFontBuckets = new Map<string, { size: number; paragraphs: number[]; severity: IssueSeverity }>();
  const headingOrder: { level: number; paragraphIndex: number; text: string }[] = [];

  const paragraphs = asArray(body["w:p"]);
  paragraphs.forEach((p, paragraphIndex) => {
    stats.paragraphs++;
    const pStyleId = getAttr(getNested(p, ["w:pPr", "w:pStyle"]), "@_w:val") || "";
    const headingLevel = headingLevelFromStyle(pStyleId, styleIndex);
    if (headingLevel !== null) {
      stats.headings++;
      headingOrder.push({
        level: headingLevel,
        paragraphIndex,
        text: extractParagraphText(p).slice(0, 80) || "(empty)",
      });
    }

    // Effective paragraph-level formatting (from pPr/rPr + style chain)
    const paragraphRunProps: RunProps = {
      ...styleRunProps(pStyleId, styleIndex),
      ...readRunProps(getNested(p, ["w:pPr", "w:rPr"]) as RawXmlNode | undefined),
    };

    // Walk runs
    const runs = asArray(p["w:r"]);
    // Also walk runs nested in hyperlinks
    const hyperlinks = asArray(p["w:hyperlink"]);
    for (const hl of hyperlinks) {
      for (const r of asArray((hl as RawXmlNode)["w:r"])) {
        runs.push(r);
      }
    }

    for (const r of runs) {
      stats.runs++;
      const rPr = getNested(r, ["w:rPr"]) as RawXmlNode | undefined;
      const rStyleId = getAttr(getNested(rPr, ["w:rStyle"]), "@_w:val") || "";
      const effective: RunProps = {
        ...paragraphRunProps,
        ...styleRunProps(rStyleId, styleIndex),
        ...readRunProps(rPr),
      };

      const text = extractRunText(r as RawXmlNode);
      if (!text.trim()) continue;

      // Contrast check
      const fg = effective.color ?? "#000000";
      const bg = effective.shd ?? bgColor;
      if (fg && bg && fg !== bg) {
        const ratio = contrastRatio(fg, bg);
        if (ratio < CONTRAST_AA_NORMAL) {
          const key = `${fg}|${bg}`;
          const severity: IssueSeverity = ratio < 3 ? "critical" : "warning";
          const existing = contrastBuckets.get(key);
          if (existing) {
            if (!existing.paragraphs.includes(paragraphIndex + 1)) {
              existing.paragraphs.push(paragraphIndex + 1);
            }
            // Keep the worst severity
            if (severity === "critical") existing.severity = "critical";
          } else {
            contrastBuckets.set(key, {
              ratio,
              paragraphs: [paragraphIndex + 1],
              severity,
            });
          }
        }
      }

      // Font size check
      if (effective.sizeHalfPt != null) {
        const pt = effective.sizeHalfPt * HALF_POINT_TO_POINT;
        if (pt < FONT_WARNING_BELOW) {
          const key = String(effective.sizeHalfPt);
          const severity: IssueSeverity = pt < FONT_CRITICAL_BELOW ? "critical" : "warning";
          const existing = smallFontBuckets.get(key);
          if (existing) {
            if (!existing.paragraphs.includes(paragraphIndex + 1)) {
              existing.paragraphs.push(paragraphIndex + 1);
            }
            if (severity === "critical") existing.severity = "critical";
          } else {
            smallFontBuckets.set(key, {
              size: pt,
              paragraphs: [paragraphIndex + 1],
              severity,
            });
          }
        }
      }
    }

    // Images in this paragraph
    const drawings = collectDrawingImages(p);
    for (const img of drawings) {
      stats.images++;
      const altIssue = classifyAltText(img.alt, paragraphIndex + 1);
      if (altIssue) issues.push(altIssue);
    }
  });

  // Flatten contrast buckets into issues
  for (const [key, bucket] of contrastBuckets) {
    const [fg, bg] = key.split("|");
    issues.push(
      makeIssue({
        category: "contrast",
        severity: bucket.severity,
        title:
          bucket.severity === "critical"
            ? "Very low contrast text"
            : "Text contrast below WCAG AA (4.5:1)",
        location: locationLabel("Paragraph", bucket.paragraphs),
        fg,
        bg,
        ratio: formatRatio(bucket.ratio),
        required: "4.5:1",
        suggestion: contrastSuggestion(bucket.ratio, fg, bg),
      }),
    );
  }

  // Flatten small-font buckets into issues
  for (const [, bucket] of smallFontBuckets) {
    issues.push(
      makeIssue({
        category: "font",
        severity: bucket.severity,
        title:
          bucket.severity === "critical"
            ? `Body text at ${bucket.size}pt is too small to read`
            : `Body text at ${bucket.size}pt is below the recommended 12pt`,
        location: locationLabel("Paragraph", bucket.paragraphs),
        detail: `Current: ${bucket.size}pt · Recommended: 12pt+`,
        suggestion:
          bucket.severity === "critical"
            ? "Increase body text to at least 12pt. 9pt is too small for most readers and fails accessibility guidelines."
            : "Use at least 12pt for body text so readers don't have to zoom in.",
      }),
    );
  }

  // Heading structure checks
  issues.push(...evaluateHeadings(headingOrder));

  // Score: start at 100, subtract weighted by severity, floor at 0.
  const score = computeScore(issues);

  return { issues, score, stats };
}

function computeScore(issues: Issue[]): number {
  const weights: Record<IssueSeverity, number> = {
    critical: 15,
    warning: 5,
    info: 2,
  };
  let score = 100;
  for (const i of issues) score -= weights[i.severity];
  return Math.max(0, Math.min(100, Math.round(score)));
}

function locationLabel(kind: string, indices: number[]): string {
  if (indices.length === 0) return kind;
  const unique = Array.from(new Set(indices)).sort((a, b) => a - b);
  if (unique.length === 1) return `${kind} ${unique[0]}`;
  if (unique.length <= 4) return `${kind}s ${unique.join(", ")}`;
  return `${kind}s ${unique.slice(0, 3).join(", ")}, +${unique.length - 3} more`;
}

function contrastSuggestion(ratio: number, fg: string, bg: string): string {
  // Give a concrete nudge: for text on white, darkening to #1f2937 or #111827
  // hits very high contrast; for text on dark bg we can't give a safe default
  // so we just describe the gap.
  if (bg.toLowerCase() === "#ffffff") {
    return `Darken the text color (e.g. #1f2937 gives ~12:1 contrast on white). Current ratio ${formatRatio(ratio)} is below the 4.5:1 required for AA.`;
  }
  return `Current contrast is ${formatRatio(ratio)} between ${fg} and ${bg}. Adjust one of the colors to reach at least 4.5:1.`;
}

// ---------- Styles + style resolution ----------

interface StyleEntry {
  id: string;
  basedOn: string | null;
  headingLevel: number | null;
  rPr: RawXmlNode | undefined;
}

type StyleIndex = Record<string, StyleEntry>;

function indexStyles(stylesParsed: RawXmlNode): StyleIndex {
  const out: StyleIndex = {};
  const styles = asArray(getNested(stylesParsed, ["w:styles", "w:style"]));
  for (const s of styles) {
    const id = getAttr(s, "@_w:styleId") || "";
    if (!id) continue;
    const basedOn = getAttr(getNested(s, ["w:basedOn"]), "@_w:val") || null;
    const rPr = getNested(s, ["w:rPr"]) as RawXmlNode | undefined;

    // Heading level: either name = "heading N" or pPr has outlineLvl
    const name = getAttr(getNested(s, ["w:name"]), "@_w:val") || "";
    let headingLevel: number | null = null;
    const nameLower = name.toLowerCase();
    const m = /^heading\s*(\d+)$/i.exec(nameLower);
    if (m) headingLevel = Math.max(1, Math.min(9, parseInt(m[1], 10)));
    else if (nameLower === "title") headingLevel = 1;
    else {
      // Fallback: match common style IDs like "Heading1"
      const idMatch = /^heading(\d+)$/i.exec(id);
      if (idMatch) headingLevel = Math.max(1, Math.min(9, parseInt(idMatch[1], 10)));
      else if (id.toLowerCase() === "title") headingLevel = 1;
    }

    out[id] = { id, basedOn, headingLevel, rPr };
  }
  return out;
}

function headingLevelFromStyle(styleId: string, styles: StyleIndex): number | null {
  if (!styleId) return null;
  const visited = new Set<string>();
  let cur: StyleEntry | undefined = styles[styleId];
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    if (cur.headingLevel != null) return cur.headingLevel;
    cur = cur.basedOn ? styles[cur.basedOn] : undefined;
  }
  // Heuristic fallback: match style ID like "Heading1" even if not indexed
  const idMatch = /^heading(\d+)$/i.exec(styleId);
  if (idMatch) return Math.max(1, Math.min(9, parseInt(idMatch[1], 10)));
  if (styleId.toLowerCase() === "title") return 1;
  return null;
}

/**
 * Resolve a style's effective run properties by walking the basedOn chain
 * (parent first, child wins).
 */
function styleRunProps(styleId: string, styles: StyleIndex): RunProps {
  if (!styleId) return {};
  const chain: RawXmlNode[] = [];
  const visited = new Set<string>();
  let cur: StyleEntry | undefined = styles[styleId];
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id);
    if (cur.rPr) chain.unshift(cur.rPr); // parent-first
    cur = cur.basedOn ? styles[cur.basedOn] : undefined;
  }
  let merged: RunProps = {};
  for (const rPr of chain) {
    merged = { ...merged, ...readRunProps(rPr) };
  }
  return merged;
}

// ---------- Run props ----------

interface RunProps {
  color?: string; // normalized #rrggbb
  sizeHalfPt?: number;
  shd?: string; // background shading, normalized hex
}

function readRunProps(rPr: RawXmlNode | undefined): RunProps {
  if (!rPr) return {};
  const out: RunProps = {};
  const color = getAttr(getNested(rPr, ["w:color"]), "@_w:val");
  const normalized = normalizeHex(color);
  if (normalized) out.color = normalized;

  const sz = getAttr(getNested(rPr, ["w:sz"]), "@_w:val");
  if (sz) {
    const n = parseInt(sz, 10);
    if (!Number.isNaN(n) && n > 0) out.sizeHalfPt = n;
  }

  const shdFill = getAttr(getNested(rPr, ["w:shd"]), "@_w:fill");
  const shdNorm = normalizeHex(shdFill);
  if (shdNorm) out.shd = shdNorm;

  return out;
}

// ---------- Images + alt text ----------

interface ImageAlt {
  alt: string | null;
}

function collectDrawingImages(paragraph: RawXmlNode): ImageAlt[] {
  const out: ImageAlt[] = [];
  const drawings = asArray(paragraph["w:drawing"]);
  for (const d of drawings) {
    const inlines = asArray(getNested(d, ["wp:inline"]));
    const anchors = asArray(getNested(d, ["wp:anchor"]));
    for (const container of [...inlines, ...anchors]) {
      const docPr = getNested(container, ["wp:docPr"]) as RawXmlNode | undefined;
      if (!docPr) continue;
      const descr = (getAttr(docPr, "@_descr") ?? "").trim();
      const title = (getAttr(docPr, "@_title") ?? "").trim();
      // Prefer descr; fall back to title.
      const alt = descr || title || null;
      out.push({ alt });
    }
  }
  // Also collect older VML-era images with v:shape alt="..."
  for (const r of asArray(paragraph["w:r"])) {
    const shapes = asArray(getNested(r, ["w:pict", "v:shape"]));
    for (const s of shapes) {
      const alt = (getAttr(s, "@_alt") ?? "").trim() || null;
      out.push({ alt });
    }
  }
  return out;
}

function classifyAltText(alt: string | null, paragraphIndex: number): Issue | null {
  if (!alt) {
    return makeIssue({
      category: "alt",
      severity: "critical",
      title: "Image missing alt text",
      location: `Paragraph ${paragraphIndex}`,
      suggestion:
        "In Word, right-click the image → View Alt Text, and describe the image's purpose. If it's purely decorative, mark it as decorative.",
    });
  }
  // Heuristic: alt equals a filename / generic placeholder
  const looksLikeFilename = /\.(png|jpe?g|gif|bmp|tiff?|webp|svg)$/i.test(alt) ||
    /^(image|img|picture|photo|screenshot|dsc|scan)[\s_-]*\d+$/i.test(alt) ||
    /^(image|img)\d+$/i.test(alt);
  if (looksLikeFilename) {
    return makeIssue({
      category: "alt",
      severity: "warning",
      title: "Alt text is a filename or generic placeholder",
      location: `Paragraph ${paragraphIndex}`,
      detail: `Current alt: "${alt}"`,
      suggestion:
        "Replace the filename with a short description of what the image shows and why it's there (e.g. 'Revenue grew 34% year over year').",
    });
  }
  if (alt.length < 3) {
    return makeIssue({
      category: "alt",
      severity: "warning",
      title: "Alt text is too short to be meaningful",
      location: `Paragraph ${paragraphIndex}`,
      detail: `Current alt: "${alt}"`,
      suggestion:
        "Use a full phrase describing the image. One or two characters usually can't convey the image's purpose.",
    });
  }
  return null;
}

// ---------- Heading evaluation ----------

function evaluateHeadings(
  headings: { level: number; paragraphIndex: number; text: string }[],
): Issue[] {
  const issues: Issue[] = [];
  if (headings.length === 0) return issues;

  // Skipped levels
  let prevLevel = 0;
  const skips: { from: number; to: number; paragraphIndex: number; text: string }[] = [];
  for (const h of headings) {
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      skips.push({
        from: prevLevel,
        to: h.level,
        paragraphIndex: h.paragraphIndex,
        text: h.text,
      });
    }
    prevLevel = h.level;
  }
  if (skips.length > 0) {
    const first = skips[0];
    issues.push(
      makeIssue({
        category: "heading",
        severity: "warning",
        title: `Heading levels skip from H${first.from} to H${first.to}`,
        location: `Paragraph ${first.paragraphIndex + 1} · "${first.text}"`,
        detail: skips.length > 1 ? `${skips.length} similar skips in the document.` : undefined,
        suggestion:
          "Use consecutive heading levels so screen-reader users can navigate the outline. If H3 follows H1, promote it to H2.",
      }),
    );
  }

  // No H1 present
  const hasH1 = headings.some((h) => h.level === 1);
  if (!hasH1) {
    issues.push(
      makeIssue({
        category: "heading",
        severity: "info",
        title: "Document has no H1 heading",
        location: "Document outline",
        suggestion:
          "Add a Heading 1 style to the document title so assistive tech can identify the top of the outline.",
      }),
    );
  }

  // Multiple H1s — informational only (some house styles prefer one H1 per doc)
  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count > 1) {
    issues.push(
      makeIssue({
        category: "heading",
        severity: "info",
        title: `Document has ${h1Count} H1 headings`,
        location: "Document outline",
        suggestion:
          "Best practice is one H1 per document (the document title). Demote other top-level headings to H2.",
      }),
    );
  }

  return issues;
}

// ---------- XML helpers ----------

function asArray<T = RawXmlNode>(v: unknown): T[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v as T[];
  return [v as T];
}

function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as RawXmlNode)[key];
  }
  return cur;
}

function getAttr(node: unknown, attr: string): string | undefined {
  if (node == null || typeof node !== "object") return undefined;
  const v = (node as RawXmlNode)[attr];
  return typeof v === "string" ? v : undefined;
}

function extractRunText(run: RawXmlNode): string {
  // <w:t> can be a string or an object { "#text": "...", "@_xml:space": "preserve" }
  const t = run["w:t"];
  if (t == null) return "";
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t
      .map((x) => (typeof x === "string" ? x : getAttr(x as RawXmlNode, "#text") ?? ""))
      .join("");
  }
  if (typeof t === "object") {
    return getAttr(t as RawXmlNode, "#text") ?? "";
  }
  return "";
}

function extractParagraphText(p: RawXmlNode): string {
  const parts: string[] = [];
  for (const r of asArray(p["w:r"])) {
    parts.push(extractRunText(r as RawXmlNode));
  }
  return parts.join("").trim();
}

function extractDocumentBackground(docRoot: RawXmlNode | undefined): string | null {
  if (!docRoot) return null;
  const bg = getNested(docRoot, ["w:background"]) as RawXmlNode | undefined;
  if (!bg) return null;
  const color = getAttr(bg, "@_w:color");
  return normalizeHex(color);
}
