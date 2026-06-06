import { ProjectionView } from "@/components/projection-view";
import { useAccounts } from "@/lib/accounts-context";

export default function HomePage() {
  const { accounts, projection, loading, error } = useAccounts();

  if (accounts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="font-medium">No data yet</p>
        <p className="text-muted-foreground text-sm">
          Use <span className="font-medium">Import…</span> in the sidebar to paste an OGLight
          export.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (!projection || loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return <ProjectionView projection={projection} />;
}
