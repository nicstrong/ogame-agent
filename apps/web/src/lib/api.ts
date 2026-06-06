import type { HistoryEntry, Projection } from "@ogame-agent/core";

export interface AccountRef {
  universeId: string;
  playerId: string;
}

export interface ImportResult {
  ok: boolean;
  deduped: boolean;
  id: string;
  source: string;
  universeId: string;
  accountId: AccountRef;
  factCount: number;
  celestialCount: number;
}

const enc = encodeURIComponent;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function listAccounts(): Promise<AccountRef[]> {
  const data = await asJson<{ accounts: AccountRef[] }>(await fetch("/api/accounts"));
  return data.accounts;
}

export async function getProjection(ref: AccountRef): Promise<Projection> {
  return asJson<Projection>(
    await fetch(`/api/accounts/${enc(ref.universeId)}/${enc(ref.playerId)}/projection`),
  );
}

export async function getHistory(ref: AccountRef, path: string): Promise<HistoryEntry[]> {
  const data = await asJson<{ path: string; entries: HistoryEntry[] }>(
    await fetch(
      `/api/accounts/${enc(ref.universeId)}/${enc(ref.playerId)}/history?path=${enc(path)}`,
    ),
  );
  return data.entries;
}

export async function postImport(raw: string): Promise<ImportResult> {
  const res = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
  return asJson<ImportResult>(res);
}

export function sameAccount(a: AccountRef | undefined, b: AccountRef | undefined): boolean {
  return !!a && !!b && a.universeId === b.universeId && a.playerId === b.playerId;
}
