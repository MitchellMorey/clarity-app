/**
 * Plain-language, tool-agnostic fix suggestions for the rules Adobe Acrobat's
 * Accessibility Checker reports on.
 *
 * The map is keyed by a normalized rule key: lowercased, stripped of anything
 * that isn't [a-z0-9] (see `ruleKey()` below). Each entry gives a short
 * "Fix" action phrased for a source-file author, not an Acrobat operator —
 * the user told us they'll apply the fix in whatever tool produced the PDF
 * (Word, InDesign, Google Docs, etc.) and then re-export.
 *
 * The fallback string at the bottom is used for any rule we don't recognize.
 * Unknown rules aren't a failure mode — Adobe changes the report wording
 * occasionally, and reasonable guidance is better than silence.
 */

export interface AdobeSuggestion {
  /** Short human-readable rule name used when echoing a friendly label */
  label: string;
  /** Broad category the rule belongs to, for grouping in the UI */
  category: string;
  /**
   * Plain-language fix instruction. Written for a source-file author rather
   * than someone remediating the exported PDF in Acrobat.
   */
  fix: string;
  /** Why this matters for disabled users / screen readers. Optional. */
  why?: string;
}

const SUGGESTIONS: Record<string, AdobeSuggestion> = {
  // ---------- Document ----------
  accessibilitypermissionflag: {
    label: "Accessibility permission flag",
    category: "Document",
    fix: "In your source file's export settings, turn off any password protection or security that blocks content access. Then re-export the PDF so assistive tech is allowed to read the document.",
    why: "If this flag is missing, screen readers can be blocked from reading the PDF at all.",
  },
  imageonlypdf: {
    label: "Image-only PDF",
    category: "Document",
    fix: "Your PDF is a picture of a page rather than real text. Go back to your source file (or OCR a scanned copy) and export a text-based PDF so the text is readable.",
    why: "Screen readers can't read text that's baked into an image.",
  },
  taggedpdf: {
    label: "Tagged PDF",
    category: "Document",
    fix: "In your source tool's export dialog, tick the option to export a tagged / accessible PDF (sometimes called \"Document structure tags for accessibility\"). In Word it's File → Save As → Options → \"Document structure tags for accessibility\".",
    why: "Without tags, assistive tech has no idea what is a heading, paragraph, list item, etc.",
  },
  logicalreadingorder: {
    label: "Logical reading order",
    category: "Document",
    fix: "Review the reading order in your source file: make sure headings, paragraphs, and side content appear in the order you'd read them aloud. Avoid using text boxes for flowing body content — use real paragraphs so the order survives the export.",
    why: "Screen readers follow the tag order; if the source is out of order, the PDF will be too.",
  },
  primarylanguage: {
    label: "Primary language",
    category: "Document",
    fix: "Set the document's language in your source tool (e.g. in Word: File → Info → Properties → Advanced Properties → Language; in InDesign it's on the character/paragraph style). English text in a document set to another language will be mispronounced.",
    why: "Screen readers switch pronunciation rules based on the document language.",
  },
  title: {
    label: "Document title",
    category: "Document",
    fix: "Give your source file a real title in the document properties (Word: File → Info → Title; InDesign: File → File Info → Title). The title should describe the document's purpose, not be the filename.",
    why: "The title is the first thing a screen reader announces; \"document1.docx\" is meaningless.",
  },
  bookmarks: {
    label: "Bookmarks",
    category: "Document",
    fix: "If the document is longer than around 20 pages, use real heading styles in your source so that the export adds bookmarks. In Word, turn on \"Create bookmarks using → Headings\" when exporting to PDF.",
    why: "Bookmarks give keyboard and screen-reader users a clickable table of contents.",
  },
  colorcontrast: {
    label: "Color contrast",
    category: "Document",
    fix: "This rule is always flagged for manual review — check each text/background color pair in your source for at least 4.5:1 contrast (3:1 for text 18pt+ bold). Darken grey body text and re-export.",
    why: "Low contrast is the single most common real-world accessibility problem for sighted users with low vision.",
  },

  // ---------- Page content ----------
  taggedcontent: {
    label: "Tagged content",
    category: "Page content",
    fix: "Remove or tag any floating decorative content in your source. In Word, decorative text boxes, watermarks, and background images should be marked as decorative (right-click → Edit Alt Text → Mark as decorative) so they're tagged as artifacts on export.",
    why: "Untagged content is either missed or read as random noise by screen readers.",
  },
  taggedannotations: {
    label: "Tagged annotations",
    category: "Page content",
    fix: "If you're adding links, comments, or form fields in Acrobat after exporting, add them in the source tool instead — fields added post-export often skip being tagged.",
  },
  taborder: {
    label: "Tab order",
    category: "Page content",
    fix: "In your source, make sure interactive elements (links, form fields) flow in reading order. If you've positioned elements absolutely, set their tab order explicitly before exporting.",
    why: "Keyboard users navigate by Tab — if the order is scrambled, the form is basically unusable.",
  },
  characterencoding: {
    label: "Character encoding",
    category: "Page content",
    fix: "Embed standard Unicode fonts in your source file, and avoid using decorative/symbol fonts for real content. Typing a bullet as a Wingdings character, for example, will render as garbage to a screen reader.",
    why: "Without proper encoding, text comes through to assistive tech as gibberish.",
  },
  taggedmultimedia: {
    label: "Tagged multimedia",
    category: "Page content",
    fix: "Embedded audio/video needs captions or a transcript. Add those in your source file (e.g. YouTube captions, embedded SRT, or a transcript in the body text beside the media).",
  },
  screenflicker: {
    label: "Screen flicker",
    category: "Page content",
    fix: "Remove any content that flashes faster than 3 times per second (animated GIFs, blinking text) — it can trigger seizures. This rule is usually flagged for manual review; confirm no flashing content is in the file.",
  },
  scripts: {
    label: "Scripts",
    category: "Page content",
    fix: "Any JavaScript in the PDF must still let the user accomplish the task without running the script. Test your PDF by disabling scripts; if forms or navigation break, rethink them in the source.",
  },
  timedresponses: {
    label: "Timed responses",
    category: "Page content",
    fix: "If your source file or form enforces a time limit, either remove it or let users request more time. Timeouts disadvantage users with motor or cognitive disabilities.",
  },
  navigationlinks: {
    label: "Navigation links",
    category: "Page content",
    fix: "Use descriptive link text in your source (e.g. \"Annual report PDF\") rather than \"Click here\" or raw URLs. Screen-reader users often navigate by links list and need to tell links apart out of context.",
  },

  // ---------- Forms ----------
  taggedformfields: {
    label: "Tagged form fields",
    category: "Forms",
    fix: "Add form fields in your source tool (e.g. the Developer tab in Word, or InDesign's interactive form controls) before exporting, rather than adding them in Acrobat afterward. That way each field is properly tagged.",
  },
  fielddescriptions: {
    label: "Field descriptions",
    category: "Forms",
    fix: "Give every form field a visible label next to it AND a tooltip / name in the field properties. A blank box with no label is invisible to screen readers.",
  },

  // ---------- Alternate text ----------
  figuresalternatetext: {
    label: "Figures alternate text",
    category: "Alternate text",
    fix: "For every figure or image in your source, add alt text that describes the image's purpose (not its filename). Right-click → Edit Alt Text in Word/PowerPoint; Object Export Options in InDesign. If it's purely decorative, mark it as decorative.",
    why: "Screen readers announce alt text in place of the image itself.",
  },
  nestedalternatetext: {
    label: "Nested alternate text",
    category: "Alternate text",
    fix: "You have alt text on a container element whose children also have alt text, which double-speaks. In your source, move the alt text to the outermost grouped element and remove it from children.",
  },
  associatedwithcontent: {
    label: "Associated with content",
    category: "Alternate text",
    fix: "Make sure every image or figure in your source is anchored to the paragraph it describes (in Word: right-click image → Wrap Text → \"In Line with Text\" is safest). Floating images often lose their caption association on export.",
  },
  hidesannotation: {
    label: "Hides annotation",
    category: "Alternate text",
    fix: "Alt text shouldn't hide a link or annotation underneath the image. In your source, either remove the alt text from the image or move the link to actual visible text next to it.",
  },
  otherelementsalternatetext: {
    label: "Other elements alternate text",
    category: "Alternate text",
    fix: "Non-image elements that convey information (e.g. custom icons drawn with shapes, emoji used as bullets) also need alt text in your source — or should be rewritten as real text.",
  },

  // ---------- Tables ----------
  rows: {
    label: "Table rows",
    category: "Tables",
    fix: "In your source, build tables using the native table feature (not tabs or spaces), with one data point per cell and no merged cells for layout purposes. Adobe needs a clean <TR>/<TH>/<TD> structure to tag properly.",
  },
  thandtd: {
    label: "TH and TD",
    category: "Tables",
    fix: "Mark your table's header row (and header column, if any) explicitly in the source — in Word: Table Design → \"Header Row\" + Table Properties → Row → \"Repeat as header row at the top of each page\".",
  },
  headers: {
    label: "Table headers",
    category: "Tables",
    fix: "Every data table needs header cells so screen readers can announce \"Row 3, Column Q2: 4500\" instead of just \"4500\". Add a header row/column in your source.",
  },
  regularity: {
    label: "Table regularity",
    category: "Tables",
    fix: "Tables should be rectangular — same number of cells per row. In your source, unmerge any layout-hack cells; use a proper data table structure.",
  },
  summary: {
    label: "Table summary",
    category: "Tables",
    fix: "For complex tables (multiple header levels, cross-tabulations), add a caption or summary that describes the table's structure in your source — e.g. \"Quarterly revenue by region, rows are regions, columns are quarters\".",
  },

  // ---------- Lists ----------
  listitems: {
    label: "List items",
    category: "Lists",
    fix: "Use the real bulleted or numbered list feature in your source — don't manually type \"1.\" or \"• \" at the start of paragraphs. Native lists export as proper <L>/<LI> tags; fake lists don't.",
  },
  lblandlbody: {
    label: "Lbl and LBody",
    category: "Lists",
    fix: "This is the tag version of \"use native lists\" — the bullet/number (Lbl) and the item text (LBody) need to be separate. Native lists in your source handle this for you.",
  },

  // ---------- Headings ----------
  appropriatenesting: {
    label: "Heading nesting",
    category: "Headings",
    fix: "Use heading styles in order (H1 → H2 → H3) in your source — don't skip levels. A heading styled as H3 right after an H1 confuses screen-reader outline navigation.",
  },
};

const FALLBACK: AdobeSuggestion = {
  label: "Accessibility rule",
  category: "Other",
  fix: "Open the rule in Adobe Acrobat's accessibility panel to see exactly which element failed, then fix the corresponding element in the source file (Word, InDesign, etc.) and re-export the PDF.",
};

/**
 * Normalize an Adobe rule name so that "Tagged PDF", "tagged PDF",
 * "Tagged-PDF" and "Tagged PDF " all hit the same suggestion entry.
 */
export function ruleKey(raw: string): string {
  return (raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function suggestionFor(rule: string): AdobeSuggestion {
  const entry = SUGGESTIONS[ruleKey(rule)];
  if (entry) return entry;
  return { ...FALLBACK, label: rule || FALLBACK.label };
}

/** Return the category we think a rule belongs to (used when the parser
 *  didn't give us one). */
export function categoryFor(rule: string): string {
  return suggestionFor(rule).category;
}
