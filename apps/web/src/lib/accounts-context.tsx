import type { Projection } from "@ogame-agent/core";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { type AccountRef, getProjection, listAccounts, sameAccount } from "@/lib/api";

interface AccountsContextValue {
  accounts: AccountRef[];
  selected: AccountRef | undefined;
  projection: Projection | undefined;
  loading: boolean;
  error: string | undefined;
  select: (ref: AccountRef) => void;
  refreshAccounts: () => Promise<AccountRef[]>;
  /** Re-fetch the account list, clearing any prior error (used by the error Retry). */
  retry: () => Promise<void>;
  /** After a successful import: reload the list, select the account, load its projection. */
  onImported: (ref: AccountRef) => Promise<void>;
  /** Path currently shown in the history panel (undefined = closed). */
  historyPath: string | undefined;
  openHistory: (path: string) => void;
  closeHistory: () => void;
}

const AccountsContext = createContext<AccountsContextValue | undefined>(undefined);

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountRef[]>([]);
  const [selected, setSelected] = useState<AccountRef | undefined>(undefined);
  const [projection, setProjection] = useState<Projection | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [historyPath, setHistoryPath] = useState<string | undefined>(undefined);

  const refreshAccounts = useCallback(async () => {
    const list = await listAccounts();
    setAccounts(list);
    setSelected((current) =>
      current && list.some((a) => sameAccount(a, current)) ? current : list[0],
    );
    return list;
  }, []);

  useEffect(() => {
    refreshAccounts().catch((err: unknown) => setError((err as Error).message));
  }, [refreshAccounts]);

  // Load the projection whenever the selected account changes.
  useEffect(() => {
    if (!selected) {
      setProjection(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    getProjection(selected)
      .then((p) => {
        if (!cancelled) setProjection(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const select = useCallback((ref: AccountRef) => setSelected(ref), []);

  const retry = useCallback(async () => {
    setError(undefined);
    try {
      await refreshAccounts();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [refreshAccounts]);

  const onImported = useCallback(
    async (ref: AccountRef) => {
      await refreshAccounts();
      setSelected(ref);
    },
    [refreshAccounts],
  );

  const openHistory = useCallback((path: string) => setHistoryPath(path), []);
  const closeHistory = useCallback(() => setHistoryPath(undefined), []);

  return (
    <AccountsContext
      value={{
        accounts,
        selected,
        projection,
        loading,
        error,
        select,
        refreshAccounts,
        retry,
        onImported,
        historyPath,
        openHistory,
        closeHistory,
      }}
    >
      {children}
    </AccountsContext>
  );
}

export function useAccounts(): AccountsContextValue {
  const ctx = use(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within an AccountsProvider");
  return ctx;
}
