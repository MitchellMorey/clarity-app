"use client";

import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg2 bg-surface p-6 shadow-[0_20px_40px_rgba(15,23,42,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 mb-1.5 text-[18px] font-semibold">{title}</h2>
        {children}
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
