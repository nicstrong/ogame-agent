import { detect, foldImports, parse, type Projection, projectionSchema } from "@ogame-agent/core";
import { DownloadIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { useAccounts } from "@/lib/accounts-context";
import { postImport } from "@/lib/api";

type Preview =
  | null
  | { ok: false; error: string }
  | {
      ok: true;
      source: string;
      universeId: string;
      playerId: string;
      factCount: number;
      celestialCount: number;
      projection: Projection;
    };

/** Client-side preview: detect + parse + fold so the user sees what will be imported. */
function analyze(raw: string): Preview {
  if (!raw.trim()) return null;
  const source = detect(raw);
  if (!source) {
    return { ok: false, error: "Could not detect a known source (expected an OGLight export)." };
  }
  try {
    const imp = parse(raw);
    const { state } = foldImports([imp]);
    const projection = projectionSchema.parse(state);
    return {
      ok: true,
      source: imp.source,
      universeId: imp.universeId,
      playerId: imp.accountId.playerId,
      factCount: imp.facts.length,
      celestialCount: Object.keys(projection.celestial ?? {}).length,
      projection,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function ImportDialog() {
  const { onImported } = useAccounts();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | undefined>(undefined);

  const preview = useMemo(() => analyze(content), [content]);

  const handleImport = async () => {
    if (!preview?.ok) return;
    setImporting(true);
    setImportError(undefined);
    try {
      const result = await postImport(content);
      await onImported(result.accountId);
      setContent("");
      setOpen(false);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <SidebarMenuButton tooltip="Import...">
          <DownloadIcon />
          <span>Import...</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            Paste an OGLight export below. It is previewed in your browser, then sent to the server
            on import.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          autoFocus
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Paste an OGLight export (JSON) here..."
          className="h-40 shrink-0 resize-none overflow-auto font-mono text-xs"
        />

        {preview?.ok === false && (
          <p className="text-destructive shrink-0 text-sm" role="alert">
            {preview.error}
          </p>
        )}

        {preview?.ok && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                <span className="text-muted-foreground">Source:</span> {preview.source}
              </span>
              <span>
                <span className="text-muted-foreground">Universe:</span> {preview.universeId}
              </span>
              <span>
                <span className="text-muted-foreground">Player:</span> {preview.playerId}
              </span>
              <span>
                <span className="text-muted-foreground">Facts:</span> {preview.factCount}
              </span>
              <span>
                <span className="text-muted-foreground">Celestials:</span> {preview.celestialCount}
              </span>
            </div>
            <pre className="bg-muted min-h-0 flex-1 overflow-auto rounded-md p-3 text-xs">
              {JSON.stringify(preview.projection, null, 2)}
            </pre>
          </div>
        )}

        {importError && (
          <p className="text-destructive shrink-0 text-sm" role="alert">
            {importError}
          </p>
        )}

        <DialogFooter className="shrink-0">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleImport} disabled={!preview?.ok || importing}>
            {importing ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
