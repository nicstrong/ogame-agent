import type { Projection, ServerCatalogEntry } from "@ogame-agent/core";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type AccountRef,
  getProjection,
  getUniverseCatalog,
  listAccounts,
  removeCelestial as removeCelestialApi,
  sameAccount,
} from "@/lib/api";
import { type Labeler, makeLabeler } from "@/lib/labels";

interface AccountsContextValue {
  accounts: AccountRef[];
  selected: AccountRef | undefined;
  projection: Projection | undefined;
  /** Localized label resolver for the selected account's universe (camelCase fallback). */
  label: Labeler;
  /** Celestial currently shown in the planet detail (defaults to the first planet). */
  activeCelestialId: string | undefined;
  setActiveCelestial: (id: string) => void;
  loading: boolean;
  error: string | undefined;
  select: (ref: AccountRef) => void;
  refreshAccounts: () => Promise<AccountRef[]>;
  /** Re-fetch the account list, clearing any prior error (used by the error Retry). */
  retry: () => Promise<void>;
  /** Re-fetch the selected account's projection (after a mutation). */
  reloadProjection: () => Promise<void>;
  /** Remove a celestial (tombstone) then reload the projection. */
  removeCelestial: (celestialId: string) => Promise<void>;
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
  const [catalog, setCatalog] = useState<ServerCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [historyPath, setHistoryPath] = useState<string | undefined>(undefined);
  const [activeCelestialId, setActiveCelestialId] = useState<string | undefined>(undefined);

  const label = useMemo(() => makeLabeler(catalog), [catalog]);

  // Keep the active celestial valid: default to the first planet (by coordinates) whenever the
  // projection changes and the current selection is gone (account switch, tombstone, first load).
  useEffect(() => {
    const celestial = projection?.celestial ?? {};
    setActiveCelestialId((current) => {
      if (current && celestial[current]) return current;
      const planets = Object.entries(celestial)
        .filter(([, c]) => c.type !== "moon")
        .sort(([, a], [, b]) => {
          const ca = a.coordinates;
          const cb = b.coordinates;
          if (!ca || !cb) return 0;
          return ca.galaxy - cb.galaxy || ca.system - cb.system || ca.position - cb.position;
        });
      return planets[0]?.[0];
    });
  }, [projection]);

  const setActiveCelestial = useCallback((id: string) => setActiveCelestialId(id), []);

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

  // Load the per-universe localized-name catalog when the selected universe changes.
  // Best-effort: a missing/failed catalog just falls back to camelCase labels.
  useEffect(() => {
    const universeId = selected?.universeId;
    if (!universeId) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    getUniverseCatalog(universeId)
      .then((c) => {
        if (!cancelled) setCatalog(c.entries);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.universeId]);

  const select = useCallback((ref: AccountRef) => setSelected(ref), []);

  const retry = useCallback(async () => {
    setError(undefined);
    try {
      await refreshAccounts();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [refreshAccounts]);

  const reloadProjection = useCallback(async () => {
    if (!selected) return;
    try {
      setProjection(await getProjection(selected));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [selected]);

  const removeCelestial = useCallback(
    async (celestialId: string) => {
      if (!selected) return;
      await removeCelestialApi(selected, celestialId);
      await reloadProjection();
    },
    [selected, reloadProjection],
  );

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
        label,
        activeCelestialId,
        setActiveCelestial,
        loading,
        error,
        select,
        refreshAccounts,
        retry,
        reloadProjection,
        removeCelestial,
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
