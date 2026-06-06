import type { HistoryEntry } from "@ogame-agent/core";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAccounts } from "@/lib/accounts-context";
import { getHistory } from "@/lib/api";
import { formatTimestamp, formatValue } from "@/lib/format";

export function HistorySheet() {
  const { historyPath, closeHistory, selected } = useAccounts();
  const [entries, setEntries] = useState<HistoryEntry[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!historyPath || !selected) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setEntries(undefined);
    getHistory(selected, historyPath)
      .then((e) => {
        if (!cancelled) setEntries(e);
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
  }, [historyPath, selected]);

  return (
    <Sheet
      open={Boolean(historyPath)}
      onOpenChange={(open) => {
        if (!open) closeHistory();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Field history</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">{historyPath}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          {loading && <p className="text-muted-foreground">Loading…</p>}
          {error && <p className="text-destructive">{error}</p>}
          {entries && entries.length === 0 && <p className="text-muted-foreground">No history.</p>}
          {entries && entries.length > 0 && (
            <ol className="space-y-2">
              {[...entries].reverse().map((entry, i) => (
                <li key={`${entry.importedAt}-${i}`} className="rounded-md border p-2">
                  <div className="text-muted-foreground text-xs">
                    {formatTimestamp(entry.importedAt)}
                  </div>
                  <div className="font-mono text-sm">
                    {entry.kind === "tombstone" ? "(removed)" : formatValue(entry.value)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
