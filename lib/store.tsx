"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Document, DocType, Issue } from "./types";
import { SEVERITY_ORDER } from "./types";
import {
  INITIAL_DOCUMENTS,
  generateMockIssuesFor,
  inferType,
  todayString,
} from "./mock-data";

const STORAGE_KEY = "clarity_state_v1";

interface PersistedState {
  isAuthed: boolean;
  userEmail: string | null;
  documents: Document[];
  justReviewedDocId: string | null;
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
  justReviewedDocId: string | null;
  toasts: Toast[];
  login: (email: string) => void;
  logout: () => void;
  pushToast: (message: string) => void;
  dismissToast: (id: string) => void;
  clearJustReviewed: () => void;
  addReviewedDocument: (filename: string) => string;
  addReReview: (docId: string) => void;
  resetDemoData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function defaultState(): PersistedState {
  return {
    isAuthed: false,
    userEmail: null,
    documents: INITIAL_DOCUMENTS,
    justReviewedDocId: null,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<PersistedState>(defaultState);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        setState({
          isAuthed: !!parsed.isAuthed,
          userEmail: parsed.userEmail ?? null,
          documents:
            Array.isArray(parsed.documents) && parsed.documents.length
              ? parsed.documents
              : INITIAL_DOCUMENTS,
          justReviewedDocId: parsed.justReviewedDocId ?? null,
        });
      }
    } catch {
      // ignore parse errors, fall back to defaults
    }
    setHydrated(true);
  }, []);

  // Persist on change (only after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or unavailable — ignore
    }
  }, [state, hydrated]);

  const login = useCallback((email: string) => {
    setState((s) => ({ ...s, isAuthed: true, userEmail: email || null }));
  }, []);

  const logout = useCallback(() => {
    setState((s) => ({ ...s, isAuthed: false, userEmail: null }));
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
    setState((s) =>
      s.justReviewedDocId ? { ...s, justReviewedDocId: null } : s,
    );
  }, []);

  const addReviewedDocument = useCallback((filename: string) => {
    const type: DocType = inferType(filename);
    const newDoc: Document = {
      id: "doc_" + Math.random().toString(36).slice(2, 7),
      name: filename,
      type,
      size: "2.1 MB",
      uploadedAt: todayString(),
      versions: [
        {
          version: 1,
          reviewedAt: todayString(),
          score: 71,
          issues: generateMockIssuesFor(type),
        },
      ],
    };
    setState((s) => ({
      ...s,
      documents: [newDoc, ...s.documents],
      justReviewedDocId: newDoc.id,
    }));
    return newDoc.id;
  }, []);

  const addReReview = useCallback((docId: string) => {
    setState((s) => {
      const docs = s.documents.map((d) => {
        if (d.id !== docId) return d;
        const prev = d.versions[d.versions.length - 1];
        const open = prev.issues.filter((i) => !i.resolved);
        // Resolve ~70% of open issues, prioritizing critical
        const toResolveCount = Math.max(1, Math.floor(open.length * 0.7));
        const sorted = [...open].sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
        );
        const resolveIds = new Set(sorted.slice(0, toResolveCount).map((i) => i.id));
        const newIssues: Issue[] = prev.issues.map((i) =>
          i.resolved || resolveIds.has(i.id) ? { ...i, resolved: true } : i,
        );
        const resolvedNow = newIssues.filter((i) => i.resolved).length;
        const total = newIssues.length;
        const newScore = Math.min(
          100,
          Math.round(60 + (resolvedNow / total) * 40),
        );
        return {
          ...d,
          versions: [
            ...d.versions,
            {
              version: prev.version + 1,
              reviewedAt: todayString(),
              score: newScore,
              issues: newIssues,
              resolvedSinceLast: toResolveCount,
            },
          ],
        };
      });
      return { ...s, documents: docs, justReviewedDocId: docId };
    });
  }, []);

  const resetDemoData = useCallback(() => {
    setState((s) => ({ ...s, documents: INITIAL_DOCUMENTS, justReviewedDocId: null }));
  }, []);

  const value: AppContextValue = useMemo(
    () => ({
      hydrated,
      isAuthed: state.isAuthed,
      userEmail: state.userEmail,
      documents: state.documents,
      justReviewedDocId: state.justReviewedDocId,
      toasts,
      login,
      logout,
      pushToast,
      dismissToast,
      clearJustReviewed,
      addReviewedDocument,
      addReReview,
      resetDemoData,
    }),
    [
      hydrated,
      state,
      toasts,
      login,
      logout,
      pushToast,
      dismissToast,
      clearJustReviewed,
      addReviewedDocument,
      addReReview,
      resetDemoData,
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
