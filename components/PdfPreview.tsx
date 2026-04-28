import type { PdfEvidence } from "@/lib/types";

/**
 * Renders a single piece of evidence behind a PDF finding. The component
 * intentionally renders only one tile — the surrounding "AS IT APPEARS IN
 * YOUR PDF" paper-style box is owned by the parent so multiple instances
 * of the same problem stack inside one container instead of producing
 * a wall of separate paper cards.
 */

const PT_TO_PX = 1.25; // approximate 100% zoom in our preview

function fontStack(family: string | undefined): string {
  // Reuse the same logic shape as DocPreview: name the detected font first,
  // fall back to the closest open-source / system equivalents.
  if (!family) return "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";
  const lower = family.toLowerCase();
  if (lower.includes("calibri")) {
    return `"${family}", Calibri, Carlito, "Segoe UI", Arial, sans-serif`;
  }
  if (lower.includes("times") || lower.includes("cambria")) {
    return `"${family}", Cambria, "Times New Roman", Times, serif`;
  }
  if (
    lower.includes("courier") ||
    lower.includes("consolas") ||
    lower.includes("mono")
  ) {
    return `"${family}", Consolas, "Courier New", monospace`;
  }
  if (
    lower.includes("arial") ||
    lower.includes("helvetica") ||
    lower.includes("sans")
  ) {
    return `"${family}", Arial, Helvetica, sans-serif`;
  }
  return `"${family}", Calibri, Carlito, Arial, sans-serif`;
}

/**
 * Outer wrapper that mimics a slice of the PDF page — owns the title row
 * and the paper-style background. Children are individual evidence tiles
 * stacked vertically.
 */
export function PdfPreviewBox({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11.5px] uppercase tracking-wide text-subtle">
        As it appears in your PDF
        {count > 1 ? (
          <span className="ml-2 normal-case tracking-normal text-subtle/80">
            · {count} instances
          </span>
        ) : null}
      </div>
      <div
        className="rounded-md border border-border bg-[#f3f3f1] p-3 shadow-soft-sm"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #f6f6f4 0%, #f2f2f0 100%)",
        }}
      >
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

export function PdfPreview({ evidence }: { evidence: PdfEvidence }) {
  if (evidence.kind === "image") {
    return <ImageEvidence evidence={evidence} />;
  }
  return <TextEvidence evidence={evidence} />;
}

function TextEvidence({ evidence }: { evidence: PdfEvidence }) {
  const fg = evidence.fg ?? "#000000";
  const bg = evidence.bg ?? "#ffffff";
  const sizePt = evidence.fontSize ?? 11;
  // Clamp display size so that 1pt previews are still legible while
  // preserving relative smallness vs. a 12pt baseline.
  const displayPx = Math.max(8, Math.min(sizePt * PT_TO_PX, 28));

  const detailBits: string[] = [];
  if (evidence.fontFamily) detailBits.push(evidence.fontFamily);
  if (evidence.fontSize !== undefined) {
    detailBits.push(
      Number.isInteger(evidence.fontSize)
        ? `${evidence.fontSize}pt`
        : `${evidence.fontSize.toFixed(1)}pt`,
    );
  }
  if (evidence.page) detailBits.push(`Page ${evidence.page}`);

  return (
    <div className="rounded-[3px] border border-black/5 bg-white">
      <div
        style={{
          fontFamily: fontStack(evidence.fontFamily),
          fontSize: `${displayPx}px`,
          lineHeight: 1.4,
          color: fg,
          backgroundColor: bg,
          padding: "10px 14px",
          borderRadius: 3,
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {evidence.text || "(no text captured)"}
      </div>
      {detailBits.length > 0 || evidence.ratio || evidence.detail ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-black/5 px-3 py-1.5 text-[12px] text-muted">
          {detailBits.length > 0 ? (
            <span className="text-subtle">{detailBits.join(" · ")}</span>
          ) : null}
          {evidence.ratio && evidence.required ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[12px] font-medium"
              style={{ background: bg, color: fg }}
            >
              <span
                className="h-3 w-3 rounded-sm border border-black/10"
                style={{ background: fg }}
              />
              <span>
                {fg} on {bg}
              </span>
              <span className="ml-1.5 text-muted">
                Ratio {evidence.ratio} (needs {evidence.required})
              </span>
            </span>
          ) : null}
          {evidence.detail ? <span>{evidence.detail}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ImageEvidence({ evidence }: { evidence: PdfEvidence }) {
  const hasImage = !!evidence.imageDataUri;
  return (
    <div className="rounded-[3px] border border-black/5 bg-white px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={evidence.imageDataUri}
              alt={
                evidence.imageLabel
                  ? `Preview of ${evidence.imageLabel}`
                  : "Figure preview"
              }
              className="max-h-[180px] max-w-[260px] rounded-md border border-border bg-surface-alt object-contain"
              loading="lazy"
            />
          ) : (
            <div className="grid h-[120px] w-[160px] place-items-center rounded-md border border-dashed border-border-strong bg-surface-alt text-[11.5px] uppercase tracking-wide text-subtle">
              No preview
            </div>
          )}
        </div>
        <div className="flex-1 text-[13px]">
          <div className="font-semibold text-text">
            {evidence.imageLabel || "Untitled figure"}
            {evidence.page ? (
              <span className="ml-2 text-[12px] font-medium text-muted">
                · Page {evidence.page}
              </span>
            ) : null}
          </div>
          {evidence.imageWidth && evidence.imageHeight ? (
            <div className="mt-0.5 text-[12px] text-subtle">
              {evidence.imageWidth} × {evidence.imageHeight} px
            </div>
          ) : null}
          {evidence.detail ? (
            <div className="mt-1.5 text-muted">{evidence.detail}</div>
          ) : null}
          {!hasImage ? (
            <div className="mt-1.5 text-[12px] text-subtle">
              Couldn&apos;t inline a preview of this image (likely stored as
              raw pixel data or larger than the inline cap). Look for it on
              the listed page in your source file.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
