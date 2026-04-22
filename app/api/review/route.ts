import { NextRequest, NextResponse } from "next/server";
import { analyzeDocx } from "@/lib/docx-analyzer";

// The analyzer uses JSZip + fast-xml-parser, both of which need Node runtime
// (the Edge runtime doesn't expose the full Buffer API JSZip relies on).
export const runtime = "nodejs";
// Keep uploads short and memory-bounded. The UI caps uploads at 50 MB, and
// analysis typically completes in a few hundred ms on Vercel.
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword", // some browsers report this; still try to parse
  "application/octet-stream", // Safari sometimes sends this for drag-drops
]);

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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file was provided. Attach the document under the 'file' field." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File is ${formatBytes(file.size)}; the 50 MB limit was exceeded.`,
      },
      { status: 413 },
    );
  }

  // Accept based on extension primarily (most reliable), with MIME as a hint.
  const filename = file.name || "document.docx";
  if (!/\.docx$/i.test(filename)) {
    return NextResponse.json(
      { error: "Only .docx files are accepted by this endpoint." },
      { status: 415 },
    );
  }
  if (file.type && !DOCX_MIME_TYPES.has(file.type)) {
    // Not a hard fail — some OSes report odd MIME types — but log for
    // diagnostics. We continue and let the analyzer decide.
    // eslint-disable-next-line no-console
    console.warn(`Unexpected MIME type for .docx upload: ${file.type}`);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded file." },
      { status: 400 },
    );
  }

  try {
    const result = await analyzeDocx(buffer);
    return NextResponse.json({
      filename,
      size: file.size,
      sizeLabel: formatBytes(file.size),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not analyze the document.";
    return NextResponse.json(
      { error: message },
      { status: 422 },
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
