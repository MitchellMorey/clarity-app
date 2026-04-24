import type { IssuePreview } from "@/lib/types";

/**
 * Renders a small "page-like" snippet of the offending text using the
 * formatting we detected in the DOCX (font family, size, weight, colors).
 * The idea is to make the problem visually recognizable — if the user scans
 * their Word document for text that looks like this, they'll find it.
 *
 * We approximate Calibri (the default Word body font since 2007) with Carlito,
 * an open-source metric-compatible match loaded via next/font. If the doc uses
 * a different font, we pass it first in the stack and fall back to Carlito
 * only if the user doesn't have the named font installed.
 */

// Common Microsoft-era fonts have open-source near-matches we can add to the
// fallback stack so previews look right even when the user's browser doesn't
// have the original installed. Carlito (loaded via next/font in the root
// layout) is metric-compatible with Calibri, so the preview lines up with
// what Word would render at the same point size.
function fontStack(family: string | undefined): string {
  const calibriFallback =
    '"Calibri", "Carlito", "Segoe UI", Arial, sans-serif';
  if (!family) return calibriFallback;
  const lower = family.toLowerCase();
  if (lower.includes("calibri")) {
    return calibriFallback;
  }
  if (lower.includes("cambria") || lower.includes("times")) {
    return `"${family}", "Cambria", "Times New Roman", Times, serif`;
  }
  if (lower.includes("consolas") || lower.includes("courier")) {
    return `"${family}", "Consolas", "Courier New", monospace`;
  }
  if (lower.includes("arial") || lower.includes("helvetica")) {
    return `"${family}", Arial, Helvetica, sans-serif`;
  }
  // Unknown family: use it first, then fall through to Calibri-likes.
  return `"${family}", ${calibriFallback}`;
}

export function DocPreview({
  preview,
  label = "As it appears in your document",
}: {
  preview: IssuePreview;
  label?: string;
}) {
  const fg = preview.fg ?? "#000000";
  const bg = preview.bg ?? "#ffffff";
  const size = preview.sizePt ?? 11;
  const isHeading = preview.headingLevel != null;

  // Clamp display size so very small previews are still legible in the UI
  // while preserving their relative smallness vs. the 11pt baseline.
  // Word renders 1pt ≈ 1.333px at 100% zoom; we tighten that a hair so the
  // preview card isn't dominated by huge headings.
  const pxPerPt = 1.25;
  const displayPx = Math.max(10, Math.min(size * pxPerPt, 28));

  const textStyle: React.CSSProperties = {
    fontFamily: fontStack(preview.fontFamily),
    fontSize: `${displayPx}px`,
    lineHeight: isHeading ? 1.25 : 1.4,
    color: fg,
    backgroundColor: bg,
    fontWeight: preview.bold || isHeading ? 700 : 400,
    fontStyle: preview.italic ? "italic" : "normal",
    padding: "10px 14px",
    borderRadius: 4,
    // A tiny inset shadow helps read very-low-contrast colors against the
    // page, without changing the rendered ratio of the text itself.
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  // The container mimics a tiny slice of a Word page: soft shadow, cream
  // off-white outer margin, faint rule marks. Purely decorative.
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11.5px] uppercase tracking-wide text-subtle">
        {label}
        {preview.fontFamily ? (
          <span className="ml-2 normal-case tracking-normal text-subtle/80">
            · {preview.fontFamily} {size}pt
            {preview.bold ? " · bold" : ""}
            {preview.italic ? " · italic" : ""}
            {isHeading ? ` · Heading ${preview.headingLevel}` : ""}
          </span>
        ) : null}
      </div>
      <div
        className="rounded-md border border-border bg-[#f3f3f1] p-3 shadow-soft-sm"
        style={{
          // Faint paper texture via a layered gradient — very subtle.
          backgroundImage:
            "linear-gradient(180deg, #f6f6f4 0%, #f2f2f0 100%)",
        }}
      >
        <div
          className="rounded-[3px] border border-black/5"
          style={{ background: "#ffffff" }}
        >
          <div style={textStyle}>{preview.text || "(no text)"}</div>
        </div>
      </div>
    </div>
  );
}
