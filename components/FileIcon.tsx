import type { DocType } from "@/lib/types";

const styles: Record<DocType, string> = {
  pdf: "bg-error-soft text-error",
  docx: "bg-[#eff6ff] text-[#1d4ed8]",
  pptx: "bg-[#fff7ed] text-[#c2410c]",
};

export function FileIcon({
  type,
  size = "md",
}: {
  type: DocType;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-11 w-11 text-[13px]" : "h-10 w-10 text-[12px]";
  return (
    <div
      className={`${box} grid place-items-center rounded-lg font-bold ${styles[type]}`}
    >
      {type.toUpperCase()}
    </div>
  );
}
