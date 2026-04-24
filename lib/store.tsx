"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Document,
  DocType,
  Issue,
  PdfFinding,
  PdfReview,
} from "./types";
import { todayString } from "./mock-data";

const SESSION_KEY = "clarity_session_v1";
const ACCOUNT_KEY_PREFIX = "clarity_account_v1:";

function accountKey(email: string | null) {
  if (!email) return null;
  return ACCOUNT_KEY_PREFIX + email.trim().toLowerCase();
}

interface SessionState {
  isAuthed: boolean;
  userEmail: string | null;
}

interface AccountState {
  documents: Document[];
  pdfReviews: PdfReview[];
  justReviewedDocId: string | null;
  justReviewedPdfId: string | null;
}

interface Toast {
  id: string;
  message: string;
}

interface AppContextValue {
  hydrated: boolean;
  isAuthed: boolean;
  userEmail: string | null;
  documents: Document[];
  pdfReviews: PdfReview[];
  justReviewedDocId: string | null;
  justReviewedPdfId: string | null;
  toasts: Toast[];
  login: (email: string) => void;
  logout: () => void;
  pushToast: (message: string) => void;
  dismissToast: (id: string) => void;
  clearJustReviewed: () => void;
  addReviewedDocument: (payload: AddReviewPayload) => string;
  addReReview: (docId: string, payload: ReReviewPayload) => void;
  addPdfReview: (payload: AddPdfReviewPayload) => string;
  togglePdfFindingResolved: (reviewId: string, findingId: string) => void;
  deletePdfReview: (reviewId: string) => void;
}

export interface AddReviewPayload {
  name: string;
  type: DocType;
  size: string;
  score: number;
  issues: Issue[];
}

/**
 * A re-review reuses the document's existing id, type, and name but replaces
 * the file size with whatever the revised upload reports, and diffs the new
 * analyzer output against the previous version to figure out which issues
 * have actually been fixed.
 */
export interface ReReviewPayload {
  size: string;
  score: number;
  issues: Issue[];
}

export interface AddPdfReviewPayload {
  pdfName: string;
  reportName: string;
  pdfSize: string;
  score: number;
  findings: PdfFinding[];
}

const AppContext = createContext<AppContextValue | null>(null);

function emptyAccount(): AccountState {
  return {
    documents: [],
    pdfReviews: [],
    justReviewedDocId: null,
    justReviewedPdfId: null,
  };
}

function loadSession(): SessionState {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      return {
        isAuthed: !!parsed.isAuthed,
        userEmail: parsed.userEmail ?? null,
      };
    }
  } catch {
    // ignore parse errors
  }
  return { isAuthed: false, userEmail: null };
}

function loadAccount(email: string | null): AccountState {
  const key = accountKey(email);
  if (!key) return emptyAccount();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccountState>;
      return {
        documents: Array.isArray(parsed.documents) ? parsed.documents : [],
        pdfReviews: Array.isArray(parsed.pdfReviews) ? parsed.pdfReviews : [],
        justReviewedDocId: parsed.justReviewedDocId ?? null,
        justReviewedPdfId: parsed.justReviewedPdfId ?? null,
      };
    }
  } catch {
    // ignore parse errors
  }
  return emptyAccount();
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<SessionState>({
    isAuthed: false,
    userEmail: null,
  });
  const [account, setAccount] = useState<AccountState>(emptyAccount);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Track the account key we're currently persisting under so we don't
  // accidentally write an empty account over someone else's data during
  // a login handoff.
  const activeAccountKeyRef = useRef<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const s = loadSession();
    setSession(s);
    const acc = loadAccount(s.userEmail);
    setAccount(acc);
    activeAccountKeyRef.current = accountKey(s.userEmail);
    setHydrated(true);
  }, []);

  // Persist session state when it changes (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // ignore
    }
  }, [session, hydrated]);

  // Persist account state when it changes (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    const key = activeAccountKeyRef.current;
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(account));
    } catch {
      // ignore
    }
  }, [account, hydrated]);

  const login = useCallback((email: string) => {
    const normalized = (email || "").trim() || "guest@example.com";
    const key = accountKey(normalized);
    // Load that account's stored data before flipping the ref, so the
    // write-on-change effect doesn't clobber the new account with stale data.
    const loaded = loadAccount(normalized);
    activeAccountKeyRef.current = key;
    setAccount(loaded);
    setSession({ isAuthed: true, userEmail: normalized });
  }, []);

  const logout = useCallback(() => {
    // Keep account data in localStorage so the user can log back in and see it.
    activeAccountKeyRef.current = null;
    setAccount(emptyAccount());
    setSession({ isAuthed: false, userEmail: null });
  }, []);

  const pushToast = useCallback((message: string) => {
    const id = "t_" + Math.random().toString(36).slice(2, 8);
    setToasts((arr) => [...arr, { id, message }]);
    setTimeout(() => {
      setToasts((arr) => arr.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const clearJustReviewed = useCallback(() => {
    setAccount((s) => {
      if (!s.justReviewedDocId && !s.justReviewedPdfId) return s;
      return { ...s, justReviewedDocId: null, justReviewedPdfId: null };
    });
  }, []);

  const addReviewedDocument = useCallback((payload: AddReviewPayload) => {
    const newDoc: Document = {
      id: "doc_" + Math.random().toString(36).slice(2, 7),
      name: payload.name,
      type: payload.type,
      size: payload.size,
      uploadedAt: todayString(),
      versions: [
        {
          version: 1,
          reviewedAt: todayString(),
          score: payload.score,
          issues: payload.issues,
        },
      ],
    };
    setAccount((s) => ({
      ...s,
      documents: [newDoc, ...s.documents],
      justReviewedDocId: newDoc.id,
    }));
    return newDoc.id;
  }, []);

  const addReReview = useCallback(
    (docId: string, payload: ReReviewPayload) => {
      setAccount((s) => {
        const docs = s.documents.map((d) => {
          if (d.id !== docId) return d;
          const prev = d.versions[d.versions.length - 1];

          // Fingerprint an issue by the properties that remain stable across
          // versions. Two issues with the same fingerprint represent the same
          // real-world problem — e.g. a "same color pair" contrast issue will
          // fingerprint identically even if the affected paragraph count or
          // ordering changed between versions.
          const fp = (i: Issue): string => {
            if (i.category === "contrast") {
              return `contrast|${i.fg ?? ""}|${i.bg ?? ""}`;
            }
            if (i.category === "font") {
              // Detail includes "Current: 10pt · Recommended: 12pt+" which
              // uniquely identifies the offending size bucket.
              return `font|${i.detail ?? ""}`;
            }
            if (i.category === "alt") {
              // Location includes the picture name, so this matches the same
              // picture across versions.
              return `alt|${i.location}`;
            }
            // heading: title encodes e.g. "Heading levels skip from H1 to H3"
            return `heading|${i.title}`;
          };

          const newFps = new Set(payload.issues.map(fp));

          // Previously-open issues whose fingerprint is gone from the new
          // analysis → these are the ones the user fixed.
          const prevOpen = prev.issues.filter((i) => !i.resolved);
          const newlyResolved = prevOpen
            .filter((i) => !newFps.has(fp(i)))
            .map((i) => ({ ...i, resolved: true as const }));

          // Previously-resolved issues stay resolved, unless the new analysis
          // shows them reappearing (then the new open entry takes over).
          const previouslyResolved = prev.issues.filter((i) => i.resolved);
          const stillResolved = previouslyResolved.filter(
            (i) => !newFps.has(fp(i)),
          );

          // All open issues in v2 come from the new analysis. Resolved items
          // are carried over so the user can see exactly what they fixed.
          const mergedIssues: Issue[] = [
            ...payload.issues,
            ...newlyResolved,
            ...stillResolved,
          ];

          return {
            ...d,
            // Reflect the revised file's size in the document header.
            size: payload.size || d.size,
            versions: [
              ...d.versions,
              {
                version: prev.version + 1,
                reviewedAt: todayString(),
                score: payload.score,
                issues: mergedIssues,
                resolvedSinceLast: newlyResolved.length,
              },
            ],
          };
        });
        return { ...s, documents: docs, justReviewedDocId: docId };
      });
    },
    [],
  );

  const addPdfReview = useCallback((payload: AddPdfReviewPayload) => {
    const newReview: PdfReview = {
      id: "pdf_" + Math.random().toString(36).slice(2, 7),
      pdfName: payload.pdfName,
      reportName: payload.reportName,
      pdfSize: payload.pdfSize,
      uploadedAt: todayString(),
      score: payload.score,
      findings: payload.findings,
    };
    setAccount((s) => ({
      ...s,
      pdfReviews: [newReview, ...s.pdfReviews],
      justReviewedPdfId: newReview.id,
    }));
    return newReview.id;
  }, []);

  const togglePdfFindingResolved = useCallback(
    (reviewId: string, findingId: string) => {
      setAccount((s) => ({
        ...s,
        pdfReviews: s.pdfReviews.map((r) =>
          r.id !== reviewId
            ? r
            : {
                ...r,
                findings: r.findings.map((f) =>
                  f.id === findingId ? { ...f, resolved: !f.resolved } : f,
                ),
              },
        ),
      }));
    },
    [],
  );

  const deletePdfReview = useCallback((reviewId: string) => {
    setAccount((s) => ({
      ...s,
      pdfReviews: s.pdfReviews.filter((r) => r.id !== reviewId),
      justReviewedPdfId:
        s.justReviewedPdfId === reviewId ? null : s.justReviewedPdfId,
    }));
  }, []);

  const value: AppContextValue = useMemo(
    () => ({
      hydrated,
      isAuthed: session.isAuthed,
      userEmail: session.userEmail,
      documents: account.documents,
      pdfReviews: account.pdfReviews,
      justReviewedDocId: account.justReviewedDocId,
      justReviewedPdfId: account.justReviewedPdfId,
      toasts,
      login,
      logout,
      pushToast,
      dismissToast,
      clearJustReviewed,
      addReviewedDocument,
      addReReview,
      addPdfReview,
      togglePdfFindingResolved,
      deletePdfReview,
    }),
    [
      hydrated,
      session,
      account,
      toasts,
      login,
      logout,
      pushToast,
      dismissToast,
      clearJustReviewed,
      addReviewedDocument,
      addReReview,
      addPdfReview,
      togglePdfFindingResolved,
      deletePdfReview,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function currentVersionOf(doc: Document) {
  return doc.versions[doc.versions.length - 1];
}

export function initialsOf(email: string | null): string {
  if (!email) return "U";
  const handle = email.split("@")[0] || email;
  return (
    handle
      .split(/[._-]/)
      .map((s) => s[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"
  );
}
