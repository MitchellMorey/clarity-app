/**
 * Dependency-free, source-side PDF content analyzer.
 *
 * Adobe's accessibility checker flags a few categories ("Color contrast")
 * for manual review and entirely misses others (no font-size check at all).
 * To give users specific, actionable findings we walk the raw PDF and pull
 * out the actual text runs, their detected sizes/colors, and figures that
 * are missing alt text. Clarity then runs WCAG checks on those runs and
 * surfaces concrete offenders in the report.
 *
 * Pragmatic limitations (documented so we know where the gaps are):
 *   - We use a regex-based object scan rather than parsing the cross-ref
 *     table. Modern xref-stream PDFs still expose `<n> <m> obj ... endobj`
 *     pairs in the body, so this works on the files Word/Acrobat produce.
 *   - We only inflate /FlateDecode streams. Other filters (LZW, ASCII85,
 *     etc.) are passed through as bytes and may yield gibberish text.
 *   - Custom font encodings with ToUnicode CMaps aren't reverse-mapped,
 *     so PDFs whose text is stored as raw glyph indices (some
 *     subsetted fonts) may produce garbled previews. Standard Word/
 *     InDesign exports use WinAnsiEncoding which we handle.
 *   - We track Tf size and the text/transform matrices for scale, but
 *     skip more exotic operators (text-rendering modes, color spaces
 *     beyond DeviceGray/DeviceRGB).
 *
 * The output is consumed by lib/pdf-checks.ts to produce findings.
 */

import { inflateRawSync, inflateSync } from "zlib";

export interface PdfTextRun {
  text: string;
  /** Effective rendered font size in points (Tf size × matrix scale). */
  fontSize: number;
  /** Hex color "#rrggbb". Defaults to "#000000" when no fill set. */
  color: string;
  /** Best-effort 1-indexed page number. */
  page: number;
  /** Best-effort font family/typeface name. */
  fontFamily?: string;
}

export interface PdfFigureMeta {
  /** Best-effort 1-indexed page number. */
  page?: number;
  /** True when an /Alt entry was present on the figure's struct element. */
  hasAlt: boolean;
  /** The alt text (if any). */
  alt?: string;
  /** Document-order index of this figure (1-based) for labeling. */
  index: number;
  /**
   * Inline preview of the figure's image, when we can extract one. We pair
   * figures with image XObjects by document order and only inline formats
   * that browsers can render natively (DCTDecode → JPEG, JPXDecode → JP2).
   * Falls back to undefined for images stored in raw pixel streams or for
   * images larger than the inline cap (so localStorage doesn't blow up).
   */
  imageDataUri?: string;
  imageWidth?: number;
  imageHeight?: number;
}

/** Cap on inline-encoded image bytes (per image) to keep localStorage sane. */
const MAX_INLINE_IMAGE_BYTES = 220 * 1024;

export interface PdfContent {
  runs: PdfTextRun[];
  figures: PdfFigureMeta[];
  pageCount: number;
}

interface RawObject {
  id: string; // "<num> <gen>"
  num: number;
  gen: number;
  /** Offset in the buffer where the object dict starts. */
  dictOffset: number;
  /** The raw text of the dict (between << and >>). May be empty. */
  dict: string;
  /** Stream bytes if the object has a stream, else null. */
  stream: Buffer | null;
}

const PDF_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Walk the PDF and produce the text runs + figure metadata Clarity needs
 * to do its checks. Returns empty content for unparseable input rather
 * than throwing — partial coverage is better than none.
 */
export function analyzePdfContent(buffer: Buffer): PdfContent {
  if (!buffer || buffer.length === 0 || buffer.length > PDF_MAX_BYTES) {
    return { runs: [], figures: [], pageCount: 0 };
  }

  const objects = extractObjects(buffer);
  if (objects.length === 0) {
    return { runs: [], figures: [], pageCount: 0 };
  }

  // Identify page objects in document order so we can attach text runs to
  // page numbers. /Type /Page (not /Pages) marks a leaf page.
  const pageObjects = objects.filter((o) =>
    /\/Type\s*\/Page(?!s)\b/.test(o.dict),
  );
  const pageCount = pageObjects.length;

  // Map each page → its content stream object IDs (resolving "<num> <gen> R"
  // references in the page dict's /Contents entry).
  const runs: PdfTextRun[] = [];
  pageObjects.forEach((page, idx) => {
    const pageNum = idx + 1;
    const contentRefs = parseContentRefs(page.dict);
    const fontMap = parseFontResources(page.dict, objects);

    for (const ref of contentRefs) {
      const stream = objects.find((o) => o.id === ref);
      if (!stream || !stream.stream) continue;
      const decoded = decodeStream(stream);
      if (!decoded) continue;
      const pageRuns = walkContentStream(decoded, pageNum, fontMap);
      runs.push(...pageRuns);
    }
  });

  // If we couldn't resolve content streams via page dicts (some PDFs
  // synthesize them differently), fall back to walking *every* stream that
  // looks like content and tagging it with page=1. The text checks still
  // work; only the page locator is approximate.
  if (runs.length === 0) {
    objects.forEach((obj) => {
      if (!obj.stream) return;
      const decoded = decodeStream(obj);
      if (!decoded) return;
      // A page content stream nearly always contains BT/ET; skip everything
      // else (font programs, image data, etc.) to avoid false positives.
      if (!/\bBT\b/.test(decoded)) return;
      const pageRuns = walkContentStream(decoded, 1, new Map());
      runs.push(...pageRuns);
    });
  }

  const figures = extractFigures(objects);

  return { runs, figures, pageCount };
}

// ---------- Object extraction ----------

/**
 * Pull every `<n> <m> obj ... endobj` block out of the buffer.
 *
 * We work on the latin1 string representation for the structural bits
 * (which are pure ASCII in PDFs) but keep stream payloads as Buffer slices
 * so binary data isn't mangled.
 */
function extractObjects(buffer: Buffer): RawObject[] {
  const text = buffer.toString("latin1");
  const out: RawObject[] = [];
  // PDFs that store xref streams still use this header for body objects.
  const objHeaderRe = /(\d+)\s+(\d+)\s+obj\b/g;

  let m: RegExpExecArray | null;
  while ((m = objHeaderRe.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    const gen = parseInt(m[2], 10);
    const headerEnd = objHeaderRe.lastIndex;
    const endIdx = text.indexOf("endobj", headerEnd);
    if (endIdx === -1) continue;

    const body = text.slice(headerEnd, endIdx);
    const dict = extractDict(body);

    // Find the stream payload, if any. The stream operator is followed by
    // a single CRLF or LF, then bytes, then a newline + "endstream".
    let stream: Buffer | null = null;
    const streamIdx = body.indexOf("stream");
    if (streamIdx !== -1) {
      // Bytes start right after the newline that follows "stream".
      let dataStart = headerEnd + streamIdx + "stream".length;
      // Skip exactly one EOL.
      if (text[dataStart] === "\r" && text[dataStart + 1] === "\n") {
        dataStart += 2;
      } else if (text[dataStart] === "\n" || text[dataStart] === "\r") {
        dataStart += 1;
      }
      const endStreamIdx = text.indexOf("endstream", dataStart);
      if (endStreamIdx !== -1) {
        // Trim the trailing EOL before "endstream".
        let dataEnd = endStreamIdx;
        if (text[dataEnd - 1] === "\n") dataEnd -= 1;
        if (text[dataEnd - 1] === "\r") dataEnd -= 1;
        stream = buffer.slice(dataStart, dataEnd);
      }
    }

    out.push({
      id: `${num} ${gen}`,
      num,
      gen,
      dictOffset: m.index,
      dict,
      stream,
    });

    // Resume scanning right after this object's endobj to avoid catching
    // nested numeric tokens as object headers.
    objHeaderRe.lastIndex = endIdx + "endobj".length;
  }

  return out;
}

/**
 * Extract the top-level dictionary from an object's body, balancing nested
 * `<<` and `>>` so we don't trip over interior dicts (like /Resources).
 */
function extractDict(body: string): string {
  const start = body.indexOf("<<");
  if (start === -1) return "";
  let depth = 0;
  let i = start;
  while (i < body.length) {
    if (body[i] === "<" && body[i + 1] === "<") {
      depth++;
      i += 2;
      continue;
    }
    if (body[i] === ">" && body[i + 1] === ">") {
      depth--;
      i += 2;
      if (depth === 0) {
        return body.slice(start, i);
      }
      continue;
    }
    i++;
  }
  return body.slice(start);
}

// ---------- Page → content stream mapping ----------

/**
 * Parse the /Contents entry of a page dict, returning a list of object IDs.
 * /Contents may be a single ref ("4 0 R") or an array of refs ("[4 0 R 5 0 R]").
 */
function parseContentRefs(dict: string): string[] {
  const refs: string[] = [];
  // Match "/Contents <something>" then walk to figure out if it's a ref or array.
  const m = /\/Contents\s+(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(dict);
  if (!m) return refs;
  const value = m[1].trim();
  const refRe = /(\d+)\s+(\d+)\s+R/g;
  let r: RegExpExecArray | null;
  while ((r = refRe.exec(value)) !== null) {
    refs.push(`${r[1]} ${r[2]}`);
  }
  return refs;
}

/**
 * Build a map from a page's font resource names (e.g. "F1") to the font's
 * BaseFont name (e.g. "Helvetica-Bold"). This lets us label previews with
 * something more meaningful than "F3".
 */
function parseFontResources(
  pageDict: string,
  objects: RawObject[],
): Map<string, string> {
  const out = new Map<string, string>();
  // /Font may be inline ( /Font << /F1 5 0 R >> ) or a ref to a separate
  // resource dict ( /Font 7 0 R ).
  const inlineMatch = /\/Font\s*<<([\s\S]*?)>>/.exec(pageDict);
  let fontDict = inlineMatch ? inlineMatch[1] : "";
  if (!fontDict) {
    const refMatch = /\/Font\s+(\d+)\s+(\d+)\s+R/.exec(pageDict);
    if (refMatch) {
      const ref = `${refMatch[1]} ${refMatch[2]}`;
      const obj = objects.find((o) => o.id === ref);
      if (obj) fontDict = obj.dict;
    }
  }
  if (!fontDict) return out;

  const entryRe = /\/(\w+)\s+(\d+)\s+(\d+)\s+R/g;
  let e: RegExpExecArray | null;
  while ((e = entryRe.exec(fontDict)) !== null) {
    const resourceName = e[1];
    const ref = `${e[2]} ${e[3]}`;
    const fontObj = objects.find((o) => o.id === ref);
    if (!fontObj) continue;
    const baseMatch = /\/BaseFont\s*\/([A-Za-z0-9_+\-]+)/.exec(fontObj.dict);
    if (baseMatch) {
      // Subsetted fonts are prefixed with "ABCDEF+RealName"; strip that.
      const base = baseMatch[1].replace(/^[A-Z]{6}\+/, "");
      out.set(resourceName, base);
    }
  }
  return out;
}

// ---------- Stream decoding ----------

function decodeStream(obj: RawObject): string | null {
  if (!obj.stream) return null;
  const filterMatch = /\/Filter\s*(\/\w+|\[[^\]]*\])/.exec(obj.dict);
  const filter = filterMatch ? filterMatch[1] : "";

  if (filter.includes("FlateDecode")) {
    return decompressFlate(obj.stream);
  }
  // No filter, or one we don't handle — try the raw bytes as latin1.
  return obj.stream.toString("latin1");
}

function decompressFlate(input: Buffer): string | null {
  // Try standard zlib first, then raw deflate as a fallback (some producers
  // omit the zlib wrapper).
  try {
    return inflateSync(input).toString("latin1");
  } catch {
    try {
      return inflateRawSync(input).toString("latin1");
    } catch {
      return null;
    }
  }
}

// ---------- Content stream walking ----------

interface GraphicsState {
  /** Current font resource name (matches keys in the font map). */
  fontResource: string | null;
  /** Current Tf size in user units (before matrix scaling). */
  fontSize: number;
  /** Current text matrix [a b c d e f]; a/d carry the scale. */
  tm: [number, number, number, number, number, number];
  /** Current transformation matrix from cm operators (also affects scale). */
  cm: [number, number, number, number, number, number];
  /** Current fill color in 0..1 components. */
  fillRgb: [number, number, number];
  /**
   * Cumulative y-offset of the current text-line baseline, in TLM units.
   * Reset to 0 on BT and on every Tm. Updated by Td/TD by their `ty`
   * operand. Used to decide whether a positioning op is a same-line
   * shuffle (kerning / justified spacing) or a real line break — only
   * line breaks should split previews into separate blocks.
   */
  tlmY: number;
}

const IDENTITY: [number, number, number, number, number, number] = [
  1, 0, 0, 1, 0, 0,
];

function newState(): GraphicsState {
  return {
    fontResource: null,
    fontSize: 12,
    tm: [...IDENTITY] as GraphicsState["tm"],
    cm: [...IDENTITY] as GraphicsState["cm"],
    fillRgb: [0, 0, 0],
    tlmY: 0,
  };
}

function multiplyMatrix(
  a: [number, number, number, number, number, number],
  b: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

/**
 * A "logical text block" we accumulate while walking the content stream.
 *
 * We emit one PdfTextRun per block. Continuous Tj/TJ calls within the same
 * visual *line* and same formatting are merged into a single block — even
 * across horizontal-only positioning ops like a `Td <dx> 0`, which PDFs
 * routinely emit between every word for kerning / justified spacing.
 *
 * We flush + start a new block on:
 *   - any positioning operator that actually moves to a new line — i.e.
 *     `Td`/`TD` with a non-zero `ty`, `T*`, `'`, `"`, or a `Tm` whose
 *     translation `f` differs from the current line baseline
 *   - any formatting change (Tf, rg, g, k, sc, scn)
 *   - BT/ET boundaries and graphics state save/restore (q/Q)
 *
 * That way two adjacent paragraphs that share size/color produce two
 * separate evidence rows instead of being joined into one merged preview,
 * while a single line whose words are individually `Td`-shuffled stays
 * a single preview.
 */
interface PendingBlock {
  text: string;
  fontSize: number;
  color: string;
  fontResource: string | null;
  page: number;
}

/**
 * Walk a content stream and emit one PdfTextRun per logical text block.
 * Same-line/same-format Tj sequences are merged; positioning or formatting
 * changes flush the current block before starting a new one.
 */
function walkContentStream(
  content: string,
  page: number,
  fontMap: Map<string, string>,
): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  const stateStack: GraphicsState[] = [];
  let state = newState();
  let pending: PendingBlock | null = null;

  const flush = () => {
    if (!pending) return;
    if (pending.text && /\S/.test(pending.text)) {
      const fontFamily = pending.fontResource
        ? fontMap.get(pending.fontResource)
        : undefined;
      runs.push({
        text: collapseWs(pending.text),
        fontSize: round1(pending.fontSize),
        color: pending.color,
        page: pending.page,
        fontFamily,
      });
    }
    pending = null;
  };

  // Tokenize into a flat list of operators with their operands. We keep a
  // simple linear scanner since content streams are operand-prefix RPN.
  const tokens = tokenize(content);

  let inText = false;
  const operands: string[] = [];

  // When we merge across a horizontal-only Td (kerning / justified spacing),
  // we need a separator between the previous and next text chunks so words
  // don't run together. Idempotent — only adds a space when there's a
  // pending block whose tail isn't already whitespace.
  const ensureTrailingSpace = () => {
    if (pending && pending.text && !/\s$/.test(pending.text)) {
      pending.text += " ";
    }
  };

  const appendText = (raw: string) => {
    if (!raw) return;
    if (!inText) return;
    const effective = effectiveSize(state);
    const color = rgbToHex(state.fillRgb);
    if (
      pending &&
      pending.fontSize === effective &&
      pending.color === color &&
      pending.fontResource === state.fontResource &&
      pending.page === page
    ) {
      pending.text += raw;
      return;
    }
    flush();
    pending = {
      text: raw,
      fontSize: effective,
      color,
      fontResource: state.fontResource,
      page,
    };
  };

  for (const tok of tokens) {
    if (tok.startsWith("(") || tok.startsWith("<") || tok.startsWith("[")) {
      operands.push(tok);
      continue;
    }
    if (isNumber(tok)) {
      operands.push(tok);
      continue;
    }
    if (tok.startsWith("/")) {
      operands.push(tok);
      continue;
    }
    // Operator
    switch (tok) {
      case "q":
        flush();
        stateStack.push(cloneState(state));
        break;
      case "Q":
        flush();
        if (stateStack.length > 0) {
          state = stateStack.pop() as GraphicsState;
        }
        break;
      case "cm": {
        if (operands.length >= 6) {
          flush();
          const m = popMatrix(operands);
          state.cm = multiplyMatrix(m, state.cm);
        }
        break;
      }
      case "BT":
        flush();
        inText = true;
        state.tm = [...IDENTITY] as GraphicsState["tm"];
        state.tlmY = 0;
        break;
      case "ET":
        flush();
        inText = false;
        break;
      case "Tf": {
        // Operands: /Name size
        if (operands.length >= 2) {
          const size = parseFloat(operands[operands.length - 1]);
          const name = operands[operands.length - 2];
          const newName =
            typeof name === "string" && name.startsWith("/")
              ? name.slice(1)
              : state.fontResource;
          if (
            (Number.isNaN(size) ? state.fontSize : size) !== state.fontSize ||
            newName !== state.fontResource
          ) {
            flush();
          }
          if (!Number.isNaN(size)) state.fontSize = size;
          if (newName !== null) state.fontResource = newName;
        }
        break;
      }
      case "Tm": {
        if (operands.length >= 6) {
          const m = popMatrix(operands);
          // Only flush when the new matrix moves to a different baseline.
          // PDFs emit Tm at the start of a paragraph and reuse the same
          // matrix for runs on that line, so comparing the y translation
          // to the current line baseline is enough to distinguish a real
          // line break from a no-op formatting refresh.
          if (m[5] !== state.tlmY) flush();
          state.tm = m;
          state.tlmY = m[5];
        }
        break;
      }
      case "Td":
      case "TD": {
        // Td tx ty / TD tx ty: translate the text-line matrix by (tx, ty).
        // ty != 0 → real line break, flush. ty == 0 → horizontal-only
        // shuffle (kerning / justified spacing); keep the current block
        // open and just make sure the next text is separated from the
        // previous chunk by a space so words don't run together.
        if (operands.length >= 2) {
          const ty = parseFloat(operands[operands.length - 1]);
          if (Number.isFinite(ty) && ty !== 0) {
            flush();
            state.tlmY += ty;
          } else {
            ensureTrailingSpace();
          }
        } else {
          // Malformed — be conservative.
          flush();
        }
        break;
      }
      case "T*":
        // Move to start of next line (using leading) — always a line break.
        flush();
        break;
      case "rg": {
        if (operands.length >= 3) {
          const b = parseFloat(operands[operands.length - 1]);
          const g = parseFloat(operands[operands.length - 2]);
          const r = parseFloat(operands[operands.length - 3]);
          const next: [number, number, number] = [
            isFinite(r) ? r : 0,
            isFinite(g) ? g : 0,
            isFinite(b) ? b : 0,
          ];
          if (!sameRgb(state.fillRgb, next)) flush();
          state.fillRgb = next;
        }
        break;
      }
      case "g": {
        if (operands.length >= 1) {
          const gv = parseFloat(operands[operands.length - 1]);
          const v = isFinite(gv) ? gv : 0;
          const next: [number, number, number] = [v, v, v];
          if (!sameRgb(state.fillRgb, next)) flush();
          state.fillRgb = next;
        }
        break;
      }
      case "k": {
        if (operands.length >= 4) {
          const k = clamp01(parseFloat(operands[operands.length - 1]));
          const y = clamp01(parseFloat(operands[operands.length - 2]));
          const mg = clamp01(parseFloat(operands[operands.length - 3]));
          const c = clamp01(parseFloat(operands[operands.length - 4]));
          const next: [number, number, number] = [
            (1 - c) * (1 - k),
            (1 - mg) * (1 - k),
            (1 - y) * (1 - k),
          ];
          if (!sameRgb(state.fillRgb, next)) flush();
          state.fillRgb = next;
        }
        break;
      }
      case "sc":
      case "scn": {
        const nums = operands
          .map((o) => parseFloat(o))
          .filter((n) => !Number.isNaN(n));
        let next: [number, number, number] | null = null;
        if (nums.length >= 3) {
          next = [
            clamp01(nums[nums.length - 3]),
            clamp01(nums[nums.length - 2]),
            clamp01(nums[nums.length - 1]),
          ];
        } else if (nums.length === 1) {
          const v = clamp01(nums[0]);
          next = [v, v, v];
        }
        if (next) {
          if (!sameRgb(state.fillRgb, next)) flush();
          state.fillRgb = next;
        }
        break;
      }
      case "Tj": {
        if (!inText) break;
        const last = operands[operands.length - 1];
        if (typeof last === "string" && last.startsWith("(")) {
          appendText(decodePdfString(last.slice(1, -1)));
        } else if (typeof last === "string" && last.startsWith("<")) {
          appendText(decodeHexString(last.slice(1, -1)));
        }
        break;
      }
      case "'":
      case '"': {
        // The ' and " operators move to a new line *and* show text — flush
        // first so the new line becomes its own block.
        if (!inText) break;
        flush();
        const last = operands[operands.length - 1];
        if (typeof last === "string" && last.startsWith("(")) {
          appendText(decodePdfString(last.slice(1, -1)));
        } else if (typeof last === "string" && last.startsWith("<")) {
          appendText(decodeHexString(last.slice(1, -1)));
        }
        break;
      }
      case "TJ": {
        if (!inText) break;
        const last = operands[operands.length - 1];
        if (typeof last === "string" && last.startsWith("[")) {
          appendText(collectArrayTjText(last));
        }
        break;
      }
      default:
        // Unknown operator — drop operands and move on.
        break;
    }
    operands.length = 0;
  }

  flush();
  return runs;
}

function effectiveSize(state: GraphicsState): number {
  const tmScale = Math.sqrt(Math.abs(state.tm[0] * state.tm[3])) || 1;
  const cmScale = Math.sqrt(Math.abs(state.cm[0] * state.cm[3])) || 1;
  const eff = state.fontSize * tmScale * cmScale;
  return isFinite(eff) && eff > 0 ? eff : state.fontSize;
}

function sameRgb(
  a: [number, number, number],
  b: [number, number, number],
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function cloneState(s: GraphicsState): GraphicsState {
  return {
    fontResource: s.fontResource,
    fontSize: s.fontSize,
    tm: [...s.tm] as GraphicsState["tm"],
    cm: [...s.cm] as GraphicsState["cm"],
    fillRgb: [...s.fillRgb] as GraphicsState["fillRgb"],
    tlmY: s.tlmY,
  };
}

function popMatrix(
  operands: string[],
): [number, number, number, number, number, number] {
  const slice = operands.slice(-6).map((o) => parseFloat(o));
  return [
    isFinite(slice[0]) ? slice[0] : 1,
    isFinite(slice[1]) ? slice[1] : 0,
    isFinite(slice[2]) ? slice[2] : 0,
    isFinite(slice[3]) ? slice[3] : 1,
    isFinite(slice[4]) ? slice[4] : 0,
    isFinite(slice[5]) ? slice[5] : 0,
  ];
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isNumber(tok: string): boolean {
  return /^-?\d*\.?\d+$/.test(tok);
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function rgbToHex(rgb: [number, number, number]): string {
  const toByte = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(rgb[0])}${toByte(rgb[1])}${toByte(rgb[2])}`;
}

// ---------- Tokenizer for content streams ----------

/**
 * Split a PDF content stream into a flat list of tokens (operators,
 * operands, names, literal strings, hex strings, and array literals).
 * Strings keep their delimiters so the operator handler can tell the
 * forms apart.
 */
function tokenize(content: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    if (c === undefined) break;

    // Skip whitespace
    if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\f") {
      i++;
      continue;
    }
    // Skip comments to end of line
    if (c === "%") {
      while (i < n && content[i] !== "\n" && content[i] !== "\r") i++;
      continue;
    }
    // Literal string: ( ... ) with balanced parens and \ escapes
    if (c === "(") {
      const start = i;
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = content[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (depth === 0) {
          i++;
          break;
        }
        i++;
      }
      tokens.push(content.slice(start, i));
      continue;
    }
    // Hex string: < ... >
    if (c === "<" && content[i + 1] !== "<") {
      const start = i;
      i++;
      while (i < n && content[i] !== ">") i++;
      i++;
      tokens.push(content.slice(start, i));
      continue;
    }
    // Dict open/close → emit as their own tokens
    if (c === "<" && content[i + 1] === "<") {
      tokens.push("<<");
      i += 2;
      continue;
    }
    if (c === ">" && content[i + 1] === ">") {
      tokens.push(">>");
      i += 2;
      continue;
    }
    // Array: [ ... ]
    if (c === "[") {
      const start = i;
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = content[i];
        if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        // Skip nested literal strings inside arrays so their parens don't
        // throw the depth count off.
        else if (ch === "(") {
          let pd = 1;
          i++;
          while (i < n && pd > 0) {
            const pc = content[i];
            if (pc === "\\") {
              i += 2;
              continue;
            }
            if (pc === "(") pd++;
            else if (pc === ")") pd--;
            i++;
          }
          continue;
        }
        i++;
      }
      tokens.push(content.slice(start, i));
      continue;
    }
    // Name
    if (c === "/") {
      const start = i;
      i++;
      while (i < n && !/[\s/<>\[\]()]/.test(content[i])) i++;
      tokens.push(content.slice(start, i));
      continue;
    }
    // Number or operator
    {
      const start = i;
      while (i < n && !/[\s/<>\[\]()]/.test(content[i])) i++;
      const tok = content.slice(start, i);
      if (tok) tokens.push(tok);
    }
  }
  return tokens;
}

// ---------- TJ / hex / literal string decoding ----------

function collectArrayTjText(arrayLiteral: string): string {
  // arrayLiteral looks like "[ (Hello) -250 (World) ]". We just want the
  // concatenated text of every (..) and <..> piece.
  const out: string[] = [];
  let i = 0;
  const n = arrayLiteral.length;
  while (i < n) {
    const c = arrayLiteral[i];
    if (c === "(") {
      let depth = 1;
      const start = ++i;
      while (i < n && depth > 0) {
        const ch = arrayLiteral[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) break;
        }
        i++;
      }
      out.push(decodePdfString(arrayLiteral.slice(start, i)));
      i++;
      continue;
    }
    if (c === "<") {
      const start = ++i;
      while (i < n && arrayLiteral[i] !== ">") i++;
      out.push(decodeHexString(arrayLiteral.slice(start, i)));
      i++;
      continue;
    }
    i++;
  }
  return out.join("");
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8)),
    );
}

function decodeHexString(s: string): string {
  const cleaned = s.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i < cleaned.length; i += 2) {
    const byte = cleaned.slice(i, i + 2).padEnd(2, "0");
    const code = parseInt(byte, 16);
    if (!Number.isNaN(code)) out += String.fromCharCode(code);
  }
  return out;
}

// ---------- Figure / alt-text extraction ----------

interface RawImage {
  /** Object ID like "5 0" */
  id: string;
  /** Filter name from /Filter, or "" if none. */
  filter: string;
  width?: number;
  height?: number;
  /** Inline data URI when feasible (DCTDecode/JPXDecode within size cap). */
  dataUri?: string;
}

/**
 * Pull every image XObject out of the PDF in document order, inlining the
 * payload as a data URI when it's a browser-renderable format and small
 * enough not to bloat localStorage.
 */
function extractImages(objects: RawObject[]): RawImage[] {
  const out: RawImage[] = [];
  for (const obj of objects) {
    if (!obj.stream) continue;
    if (!/\/Subtype\s*\/Image\b/.test(obj.dict)) continue;
    const filter = (
      /\/Filter\s*(\/[A-Za-z0-9]+|\[[^\]]*\])/.exec(obj.dict)?.[1] ?? ""
    ).trim();
    const width = parseIntOrUndef(/\/Width\s+(\d+)/.exec(obj.dict)?.[1]);
    const height = parseIntOrUndef(/\/Height\s+(\d+)/.exec(obj.dict)?.[1]);

    let dataUri: string | undefined;
    if (filter.includes("DCTDecode") && obj.stream.length <= MAX_INLINE_IMAGE_BYTES) {
      // /DCTDecode payloads are JPEG bytes ready to embed as-is.
      dataUri = `data:image/jpeg;base64,${obj.stream.toString("base64")}`;
    } else if (
      filter.includes("JPXDecode") &&
      obj.stream.length <= MAX_INLINE_IMAGE_BYTES
    ) {
      // /JPXDecode = JPEG 2000. Modern browsers don't all render this, but
      // Safari does and most Chromium builds do via the OS codec — worth
      // shipping rather than dropping.
      dataUri = `data:image/jp2;base64,${obj.stream.toString("base64")}`;
    }
    // Other filters (FlateDecode raw pixel data, LZW, etc.) would require
    // a PNG encoder — out of scope for this dependency-free pass.

    out.push({ id: obj.id, filter, width, height, dataUri });
  }
  return out;
}

function parseIntOrUndef(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Scan the structure tree for /Figure elements and check whether each
 * carries an /Alt entry. We don't fully rebuild the struct tree — we just
 * pattern-match `/S /Figure` + the surrounding dict's /Alt presence, which
 * matches what Adobe writes when exporting tagged PDFs.
 *
 * Each figure is paired with one extracted image XObject by document order
 * (1st figure → 1st image, etc.). This isn't always exact — figures can
 * group multiple images, and not every image lives under a figure tag —
 * but for typical "one image per figure" PDFs it gives the user a real
 * preview of which image needs alt text.
 */
function extractFigures(objects: RawObject[]): PdfFigureMeta[] {
  const figures: PdfFigureMeta[] = [];
  const figureRe = /<<([^<>]*\/S\s*\/Figure\b[^<>]*)>>/g;
  const pageObjs = objects.filter((o) =>
    /\/Type\s*\/Page(?!s)\b/.test(o.dict),
  );
  const images = extractImages(objects);

  for (const obj of objects) {
    let m: RegExpExecArray | null;
    while ((m = figureRe.exec(obj.dict)) !== null) {
      const dict = m[1];
      const altMatch = /\/Alt\s*\(([^)]*)\)/.exec(dict);
      const alt = altMatch ? decodePdfString(altMatch[1]) : undefined;
      const pageMatch = /\/Pg\s+(\d+)\s+(\d+)\s+R/.exec(dict);
      let page: number | undefined;
      if (pageMatch) {
        const ref = `${pageMatch[1]} ${pageMatch[2]}`;
        const idx = pageObjs.findIndex((o) => o.id === ref);
        if (idx >= 0) page = idx + 1;
      }
      const figIndex = figures.length + 1;
      const matchedImage = images[figures.length];
      figures.push({
        page,
        hasAlt: !!alt && alt.trim().length > 0,
        alt,
        index: figIndex,
        imageDataUri: matchedImage?.dataUri,
        imageWidth: matchedImage?.width,
        imageHeight: matchedImage?.height,
      });
    }
  }

  // If no /Figure structure elements exist but the PDF has untagged
  // image XObjects, emit them as figures so we still surface "image
  // without alt text" findings — an untagged image is the worst case.
  if (figures.length === 0 && images.length > 0) {
    images.forEach((img, i) => {
      figures.push({
        hasAlt: false,
        index: i + 1,
        imageDataUri: img.dataUri,
        imageWidth: img.width,
        imageHeight: img.height,
      });
    });
  }

  return figures;
}
