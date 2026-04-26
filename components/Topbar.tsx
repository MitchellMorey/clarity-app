"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import { initialsOf, useApp } from "@/lib/store";

export function Topbar() {
  const { userEmail, logout, pushToast } = useApp();
  const router = useRouter();
  const initials = initialsOf(userEmail);

  const handleLogout = () => {
    logout();
    pushToast("Signed out");
    router.push("/");
  };

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-7 py-3.5">
      <Link href="/dashboard" className="hover:opacity-90">
        <BrandMark />
      </Link>
      <div className="flex items-center gap-4 text-[14px] text-muted">
        <Link
          href="/dashboard"
          className="rounded-md px-2 py-1.5 hover:bg-surface-alt hover:text-text"
        >
          Dashboard
        </Link>
        <UploadMenu />
        <div
          className="grid h-[30px] w-[30px] place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-hover"
          title={userEmail || undefined}
        >
          {initials}
        </div>
        <button onClick={handleLogout} className="btn btn-ghost btn-sm">
          Sign out
        </button>
      </div>
    </div>
  );
}

function UploadMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover-close delay: gives the user time to move from the trigger down
  // into the menu without it vanishing under their cursor. Re-entering
  // the wrapper cancels the pending close.
  const HOVER_CLOSE_DELAY_MS = 250;

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  };

  const openNow = () => {
    cancelClose();
    setOpen(true);
  };

  // Cleanup any pending timer on unmount.
  useEffect(() => () => cancelClose(), []);

  // Click outside / Esc to close — hover open is the primary affordance, but
  // these handle the case where someone clicks the trigger or tabs in.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        cancelClose();
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelClose();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onFocus={openNow}
      onBlur={(e) => {
        // Only close if focus actually leaves the menu (not when moving
        // between trigger and items).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          cancelClose();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-surface-alt hover:text-text"
      >
        Upload
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M3 4.5l3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          // pt-1 + -mt-1 keeps the dropdown visually offset from the trigger
          // while preserving an unbroken hoverable surface from button → menu,
          // so the cursor never crosses dead space that would trigger close.
          className="absolute right-0 top-full z-20 -mt-1 w-[260px] overflow-hidden rounded-card border border-border bg-surface pt-1 shadow-soft-md"
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
        >
          <Link
            role="menuitem"
            href="/upload"
            className="block px-4 py-3 text-[13.5px] text-text hover:bg-surface-alt"
            onClick={() => {
              cancelClose();
              setOpen(false);
            }}
          >
            <div className="font-semibold">Review a new document</div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              Upload a Word doc or PowerPoint deck
            </div>
          </Link>
          <Link
            role="menuitem"
            href="/pdf-review"
            className="block border-t border-border px-4 py-3 text-[13.5px] text-text hover:bg-surface-alt"
            onClick={() => {
              cancelClose();
              setOpen(false);
            }}
          >
            <div className="font-semibold">Review an accessibility report</div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              Upload a PDF + Adobe accessibility report
            </div>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
