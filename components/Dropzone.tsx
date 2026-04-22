"use client";

import { useRef, useState } from "react";

interface DropzoneProps {
  onFile: (file: File | { name: string; size: number }) => void;
  accept?: string;
  suggestedFile?: string;
}

export function Dropzone({
  onFile,
  accept = ".docx,.pptx,.ppt",
  suggestedFile,
}: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className={`rounded-lg2 border-2 border-dashed bg-surface px-8 py-14 text-center transition-colors ${
        dragging
          ? "border-accent bg-accent-soft"
          : "border-border-strong"
      }`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <div className="mx-auto mb-3.5 grid h-14 w-14 place-items-center rounded-lg2 bg-accent-soft text-[22px] text-accent">
        ↑
      </div>
      <h3 className="m-0 text-[18px]">
        Drop your file here, or click to browse
      </h3>
      <p className="mb-4 mt-1 text-muted">
        Supported formats: DOCX, PPTX
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => inputRef.current?.click()}
      >
        Choose a file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {suggestedFile ? (
        <div className="mt-3.5 text-[13px] text-subtle">
          Or try:{" "}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => onFile({ name: suggestedFile, size: 2_100_000 })}
          >
            {suggestedFile}
          </button>
        </div>
      ) : null}
    </div>
  );
}
