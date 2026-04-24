/**
 * PPTX accessibility analyzer.
 *
 * Unzips a .pptx (OOXML DrawingML) file, walks each slide's shape tree and
 * checks for the same categories of issues the DOCX analyzer reports:
 *   - Low-contrast text (WCAG 2.1 contrast ratio < 4.5:1 against slide bg)
 *   - Text smaller than recommended for projection
 *     (<18pt warning, <14pt critical — slides are read from across the room)
 *   - Pictures missing alt text, or alt text that looks like a filename
 *   - Slides missing a title placeholder with real text content
 *
 * OOXML/DrawingML reference notes:
 *   - Slides live at ppt/slides/slide{N}.xml
 *   - Slide ordering lives in ppt/presentation.xml → <p:sldIdLst>/<p:sldId r:id="rIdN"/>
 *     resolved via ppt/_rels/presentation.xml.rels
 *   - Shapes: <p:sp> has <p:nvSpPr>/<p:nvPr>/<p:ph type="title|ctrTitle|body|..."/>
 *     and <p:txBody>/<a:p>/<a:r>/<a:t> for text
 *   - Pictures: <p:pic>/<p:nvPicPr>/<p:cNvPr descr="..." name="..." title="..."/>
 *   - Run props: <a:rPr sz="1800" b="1" i="1"> where sz is hundredths of a point
 *     (1800 = 18pt). Color: <a:solidFill>/<a:srgbClr val="RRGGBB"/>. Font:
 *     <a:latin typeface="..."/>.
 *   - Slide background: <p:cSld>/<p:bg>/<p:bgPr>/<a:solidFill>/<a:srgbClr>.
 *     We fall back to white if not explicitly set — theme/master background
 *     inheritance is out of scope for a first cut.
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { Issue, IssueSeverity, IssuePreview } from "./types";

export interface AnalyzeResult {
  issues: Issue[];
  score: number;
  stats: {
    slides: number;
    runs: number;
    images: number;
    titles: number;
    bgColor: string;
  };
}

interface RawXmlNode {
  [k: string]: unknown;
}

const PRESENTATION_PATH = "ppt/presentation.xml";
const PRESENTATION_RELS_PATH = "ppt/_rels/presentation.xml.rels";

// Centipoints → points (DrawingML uses hundredths of a point for sz).
const HUNDREDTH_POINT_TO_POINT = 0.01;

// Slide font-size thresholds (points). Slides are read at a distance so the
// bar is higher than for Word documents.
const FONT_CRITICAL_BELOW = 14; // <14pt is critical on slides
const FONT_WARNING_BELOW = 18; // <18pt (and >=14pt) is warning

const CONTRAST_AA_NORMAL = 4.5;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  removeNSPrefix: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) => {
    return [
      "p:sp",
      "p:pic",
      "p:grpSp",
      "a:p",
      "a:r",
      "p:sldId",
      "Relationship",
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

export async function analyzePptx(
  buffer: ArrayBuffer | Buffer,
): Promise<AnalyzeResult> {
  const zip = await JSZip.loadAsync(buffer);

  // Resolve the slide order from the presentation + its rels file. If either
  // is missing, fall back to any slide files in the zip, sorted numerically.
  const slidePaths = await resolveSlideOrder(zip);
  if (slidePaths.length === 0) {
    throw new Error("This doesn't look like a valid PPTX file (no slides found).");
  }

  // Deck-level default background — most decks store bg per master/theme,
  // which is heavy to resolve. Start with white and let each slide override.
  const deckBg = "#ffffff";

  const stats = {
    slides: slidePaths.length,
    runs: 0,
    images: 0,
    titles: 0,
    bgColor: deckBg,
  };

  const issues: Issue[] = [];

  const contrastBuckets = new Map<
    string,
    {
      ratio: number;
      slides: number[];
      severity: IssueSeverity;
      preview?: IssuePreview;
    }
  >();
  const smallFontBuckets = new Map<
    string,
    {
      size: number;
      slides: number[];
      severity: IssueSeverity;
      preview?: IssuePreview;
    }
  >();
  const missingTitleSlides: number[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const slideNumber = i + 1;
    const path = slidePaths[i];
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async("string");
    const parsed = xmlParser.parse(xml) as RawXmlNode;

    const slideRoot = getNested(parsed, ["p:sld"]) as RawXmlNode | undefined;
    const cSld = getNested(slideRoot, ["p:cSld"]) as RawXmlNode | undefined;
    const slideBg =
      extractSlideBackground(cSld) ?? deckBg;

    // Walk every shape descendant (including group shapes) for text + pictures.
    const shapes = collectDescendants(cSld, new Set(["p:sp"]));
    const pictures = collectDescendants(cSld, new Set(["p:pic"]));

    let hasTitleText = false;

    for (const sp of shapes) {
      const isTitle = isTitlePlaceholder(sp);

      const txBody = getNested(sp, ["p:txBody"]) as RawXmlNode | undefined;
      if (!txBody) continue;

      // Shape-level run-prop default lives in <p:txBody>/<a:lstStyle>/<a:defRPr>
      // — technically it varies per indent level; for a first cut we only
      // read <a:lvl1pPr>/<a:defRPr> as a deck-ish default.
      const shapeDefault = readDefaultRunProps(txBody);

      const paras = asArray(txBody["a:p"]);
      for (const para of paras) {
        const paraText = extractParagraphText(para as RawXmlNode);

        // Paragraph-level default props: <a:pPr>/<a:defRPr>
        const paraDefaultRPr = getNested(para, ["a:pPr", "a:defRPr"]) as
          | RawXmlNode
          | undefined;
        const paraDefault: RunProps = {
          ...shapeDefault,
          ...readRunProps(paraDefaultRPr),
        };

        const runs = asArray((para as RawXmlNode)["a:r"]);
        for (const run of runs) {
          stats.runs++;
          const rPr = getNested(run, ["a:rPr"]) as RawXmlNode | undefined;
          const effective: RunProps = {
            ...paraDefault,
            ...readRunProps(rPr),
          };

          const text = extractRunText(run as RawXmlNode);
          if (!text.trim()) continue;
          if (isTitle) hasTitleText = true;

          // Contrast
          const fg = effective.color ?? "#000000";
          const bg = effective.shd ?? slideBg;
          if (fg && bg && fg !== bg) {
            const ratio = contrastRatio(fg, bg);
            if (ratio < CONTRAST_AA_NORMAL) {
              const key = `${fg}|${bg}`;
              const severity: IssueSeverity = ratio < 3 ? "critical" : "warning";
              const existing = contrastBuckets.get(key);
              if (existing) {
                if (!existing.slides.includes(slideNumber)) {
                  existing.slides.push(slideNumber);
                }
                if (severity === "critical") existing.severity = "critical";
              } else {
                const sample = pickSampleText(text, paraText);
                contrastBuckets.set(key, {
                  ratio,
                  slides: [slideNumber],
                  severity,
                  preview: buildPreview(sample, effective, slideBg),
                });
              }
            }
          }

          // Font size
          if (effective.sizePt != null) {
            const pt = effective.sizePt;
            // Titles are read from further away and generally larger — we
            // apply the body thresholds uniformly for now but skip flagging
            // title-size issues if the title is >=18pt (common default).
            if (pt < FONT_WARNING_BELOW) {
              const key = String(pt);
              const severity: IssueSeverity =
                pt < FONT_CRITICAL_BELOW ? "critical" : "warning";
              const existing = smallFontBuckets.get(key);
              if (existing) {
                if (!existing.slides.includes(slideNumber)) {
                  existing.slides.push(slideNumber);
                }
                if (severity === "critical") existing.severity = "critical";
              } else {
                const sample = pickSampleText(text, paraText);
                smallFontBuckets.set(key, {
                  size: pt,
                  slides: [slideNumber],
                  severity,
                  preview: buildPreview(sample, effective, slideBg),
                });
              }
            }
          }
        }
      }
    }

    // Title placeholder check. If the slide has no title placeholder or its
    // title placeholder has no text, flag it. Section-divider decks often
    // have title-only slides, so this is "info" severity.
    const titleShape = shapes.find(isTitlePlaceholder);
    if (titleShape) stats.titles++;
    if (!hasTitleText) {
      missingTitleSlides.push(slideNumber);
    }

    // Pictures
    for (const pic of pictures) {
      stats.images++;
      const alt = readPicAlt(pic);
      const issue = classifyAltText(alt.alt, slideNumber, alt.name);
      if (issue) issues.push(issue);
    }
  }

  // Flatten contrast buckets
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
        location: locationLabel("Slide", bucket.slides),
        fg,
        bg,
        ratio: formatRatio(bucket.ratio),
        required: "4.5:1",
        suggestion: contrastSuggestion(bucket.ratio, fg, bg),
        preview: bucket.preview,
      }),
    );
  }

  // Flatten small-font buckets
  for (const [, bucket] of smallFontBuckets) {
    issues.push(
      makeIssue({
        category: "font",
        severity: bucket.severity,
        title:
          bucket.severity === "critical"
            ? `Text at ${bucket.size}pt is too small for slides`
            : `Text at ${bucket.size}pt is below the recommended 18pt for slides`,
        location: locationLabel("Slide", bucket.slides),
        detail: `Current: ${bucket.size}pt · Recommended: 18pt+ for body, 24pt+ for titles`,
        suggestion:
          bucket.severity === "critical"
            ? "Increase slide text to at least 18pt. Anything below 14pt is unreadable for viewers in the back of a room or using a small screen."
            : "Bump slide body text up to 18pt or larger. People read slides from much farther away than they read a document on their lap.",
        preview: bucket.preview,
      }),
    );
  }

  // Missing title slides
  if (missingTitleSlides.length > 0) {
    issues.push(
      makeIssue({
        category: "heading",
        severity: missingTitleSlides.length > slidePaths.length / 2 ? "warning" : "info",
        title:
          missingTitleSlides.length === 1
            ? `Slide ${missingTitleSlides[0]} has no title`
            : `${missingTitleSlides.length} slides have no title`,
        location: locationLabel("Slide", missingTitleSlides),
        suggestion:
          "Give each slide a descriptive title in the title placeholder — screen readers use slide titles to let users navigate the deck.",
      }),
    );
  }

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
  if (bg.toLowerCase() === "#ffffff") {
    return `Darken the text color (e.g. #1f2937 gives ~12:1 contrast on white). Current ratio ${formatRatio(ratio)} is below the 4.5:1 required for AA.`;
  }
  return `Current contrast is ${formatRatio(ratio)} between ${fg} and ${bg}. Adjust one of the colors to reach at least 4.5:1.`;
}

// ---------- Slide ordering ----------

async function resolveSlideOrder(zip: JSZip): Promise<string[]> {
  const presentationFile = zip.file(PRESENTATION_PATH);
  const relsFile = zip.file(PRESENTATION_RELS_PATH);

  if (presentationFile && relsFile) {
    try {
      const presentationXml = await presentationFile.async("string");
      const relsXml = await relsFile.async("string");
      const presentation = xmlParser.parse(presentationXml) as RawXmlNode;
      const rels = xmlParser.parse(relsXml) as RawXmlNode;

      const relMap = new Map<string, string>();
      const relationships = asArray(
        getNested(rels, ["Relationships", "Relationship"]),
      );
      for (const rel of relationships) {
        const id = getAttr(rel, "@_Id");
        const target = getAttr(rel, "@_Target");
        if (id && target) relMap.set(id, target);
      }

      const sldIds = asArray(
        getNested(presentation, ["p:presentation", "p:sldIdLst", "p:sldId"]),
      );
      const paths: string[] = [];
      for (const sld of sldIds) {
        const rid = getAttr(sld, "@_r:id");
        if (!rid) continue;
        const target = relMap.get(rid);
        if (!target) continue;
        paths.push(normalizeSlidePath(target));
      }
      if (paths.length > 0) return paths;
    } catch {
      // Fall through to filename heuristic.
    }
  }

  // Fallback: enumerate ppt/slides/slide*.xml and sort by number.
  const found: { n: number; path: string }[] = [];
  zip.forEach((p) => {
    const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(p);
    if (m) found.push({ n: parseInt(m[1], 10), path: p });
  });
  return found.sort((a, b) => a.n - b.n).map((x) => x.path);
}

function normalizeSlidePath(target: string): string {
  // Targets in presentation rels are relative to the rels file's directory,
  // e.g. "slides/slide1.xml" → "ppt/slides/slide1.xml".
  if (target.startsWith("ppt/")) return target;
  if (target.startsWith("/")) return target.slice(1);
  return "ppt/" + target.replace(/^\.\//, "");
}

// ---------- Backgrounds ----------

function extractSlideBackground(cSld: RawXmlNode | undefined): string | null {
  if (!cSld) return null;
  const bg = getNested(cSld, ["p:bg"]) as RawXmlNode | undefined;
  if (!bg) return null;
  // Either bgPr/solidFill/srgbClr or a direct bgRef. We only handle direct
  // srgbClr here; themed fills fall back to the deck default (white).
  const solid = getNested(bg, ["p:bgPr", "a:solidFill"]) as RawXmlNode | undefined;
  if (!solid) return null;
  const srgb = getNested(solid, ["a:srgbClr"]) as RawXmlNode | undefined;
  if (!srgb) return null;
  const val = getAttr(srgb, "@_val");
  return normalizeHex(val);
}

// ---------- Title placeholder detection ----------

function isTitlePlaceholder(sp: RawXmlNode): boolean {
  const ph = getNested(sp, ["p:nvSpPr", "p:nvPr", "p:ph"]) as
    | RawXmlNode
    | undefined;
  if (!ph) return false;
  const type = getAttr(ph, "@_type") || "";
  // Common title placeholder types
  return type === "title" || type === "ctrTitle";
}

// ---------- Run properties ----------

interface RunProps {
  color?: string; // normalized #rrggbb
  sizePt?: number; // in points (converted from centipoints)
  shd?: string; // unused for now — a:highlight could be added later
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
}

function readRunProps(rPr: RawXmlNode | undefined): RunProps {
  if (!rPr) return {};
  const out: RunProps = {};

  // Color: <a:solidFill>/<a:srgbClr val="RRGGBB"/>
  const srgb = getNested(rPr, ["a:solidFill", "a:srgbClr"]) as
    | RawXmlNode
    | undefined;
  const normalized = srgb ? normalizeHex(getAttr(srgb, "@_val")) : null;
  if (normalized) out.color = normalized;

  // Size: sz is in hundredths of a point, e.g. sz="1800" = 18pt
  const sz = getAttr(rPr, "@_sz");
  if (sz) {
    const n = parseInt(sz, 10);
    if (!Number.isNaN(n) && n > 0) {
      out.sizePt = Math.round(n * HUNDREDTH_POINT_TO_POINT * 10) / 10;
    }
  }

  // Font family: <a:latin typeface="Calibri"/>
  const latin = getNested(rPr, ["a:latin"]) as RawXmlNode | undefined;
  const typeface = latin ? getAttr(latin, "@_typeface") : undefined;
  if (typeface && typeface.trim()) out.fontFamily = typeface.trim();

  // Bold/italic toggles live as attributes on a:rPr
  const b = getAttr(rPr, "@_b");
  if (b !== undefined) out.bold = !(b === "0" || b === "false");
  const i = getAttr(rPr, "@_i");
  if (i !== undefined) out.italic = !(i === "0" || i === "false");

  return out;
}

/**
 * Pull a text-body-level default from <a:lstStyle>/<a:lvl1pPr>/<a:defRPr>.
 * This is the closest analogue to a "style default" for the body — enough to
 * capture the common case of a single deck-wide font/size on a placeholder.
 */
function readDefaultRunProps(txBody: RawXmlNode): RunProps {
  const defRPr = getNested(txBody, ["a:lstStyle", "a:lvl1pPr", "a:defRPr"]) as
    | RawXmlNode
    | undefined;
  return readRunProps(defRPr);
}

// ---------- Pictures + alt text ----------

interface PicAlt {
  alt: string | null;
  name?: string;
}

function readPicAlt(pic: RawXmlNode): PicAlt {
  const cNvPr = getNested(pic, ["p:nvPicPr", "p:cNvPr"]) as RawXmlNode | undefined;
  if (!cNvPr) return { alt: null };
  const descr = (getAttr(cNvPr, "@_descr") ?? "").trim();
  const title = (getAttr(cNvPr, "@_title") ?? "").trim();
  const name = (getAttr(cNvPr, "@_name") ?? "").trim() || undefined;
  const alt = descr || title || null;
  return { alt, name };
}

function classifyAltText(
  alt: string | null,
  slideNumber: number,
  name?: string,
): Issue | null {
  const locator = name
    ? `Slide ${slideNumber} · ${name}`
    : `Slide ${slideNumber}`;
  if (!alt) {
    return makeIssue({
      category: "alt",
      severity: "critical",
      title: "Image missing alt text",
      location: locator,
      suggestion:
        "In PowerPoint, right-click the image → View Alt Text, and describe the image's purpose. If it's purely decorative, mark it as decorative.",
    });
  }
  const looksLikeFilename =
    /\.(png|jpe?g|gif|bmp|tiff?|webp|svg)$/i.test(alt) ||
    /^(image|img|picture|photo|screenshot|dsc|scan)[\s_-]*\d+$/i.test(alt) ||
    /^(image|img)\d+$/i.test(alt);
  if (looksLikeFilename) {
    return makeIssue({
      category: "alt",
      severity: "warning",
      title: "Alt text is a filename or generic placeholder",
      location: locator,
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
      location: locator,
      detail: `Current alt: "${alt}"`,
      suggestion:
        "Use a full phrase describing the image. One or two characters usually can't convey the image's purpose.",
    });
  }
  return null;
}

// ---------- Preview helpers ----------

const PREVIEW_MAX_LEN = 140;
const PREVIEW_MIN_LEN = 40;

function pickSampleText(runText: string, paragraphText: string): string {
  const run = runText.trim();
  const para = paragraphText.trim();
  let sample = run;
  if (sample.length < PREVIEW_MIN_LEN && para.length > sample.length) {
    sample = para;
  }
  if (sample.length > PREVIEW_MAX_LEN) {
    sample = sample.slice(0, PREVIEW_MAX_LEN).trimEnd() + "…";
  }
  return sample;
}

function buildPreview(
  text: string,
  props: RunProps,
  slideBg: string,
): IssuePreview {
  const preview: IssuePreview = { text };
  if (props.color) preview.fg = props.color;
  preview.bg = props.shd ?? slideBg;
  if (props.sizePt != null) preview.sizePt = props.sizePt;
  if (props.fontFamily) preview.fontFamily = props.fontFamily;
  if (props.bold) preview.bold = true;
  if (props.italic) preview.italic = true;
  return preview;
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
  const t = run["a:t"];
  if (t == null) return "";
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    return t
      .map((x) =>
        typeof x === "string" ? x : getAttr(x as RawXmlNode, "#text") ?? "",
      )
      .join("");
  }
  if (typeof t === "object") {
    return getAttr(t as RawXmlNode, "#text") ?? "";
  }
  return "";
}

function extractParagraphText(p: RawXmlNode): string {
  const parts: string[] = [];
  for (const r of asArray(p["a:r"])) {
    parts.push(extractRunText(r as RawXmlNode));
  }
  return parts.join("").trim();
}

/**
 * Recursively collect every descendant node whose key is one of `names`.
 * Once a node matches, we don't recurse into it — this keeps group shapes
 * from double-counting pictures that are already top-level.
 */
function collectDescendants(
  node: unknown,
  names: Set<string>,
  out: RawXmlNode[] = [],
): RawXmlNode[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectDescendants(item, names, out);
    return out;
  }
  if (typeof node !== "object") return out;
  const obj = node as RawXmlNode;
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("@_") || key === "#text") continue;
    if (names.has(key)) {
      const arr = Array.isArray(value) ? value : [value];
      for (const v of arr) {
        if (v && typeof v === "object") out.push(v as RawXmlNode);
      }
    } else {
      collectDescendants(value, names, out);
    }
  }
  return out;
}
