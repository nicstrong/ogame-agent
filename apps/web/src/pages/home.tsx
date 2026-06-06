import { ProjectionView } from "@/components/projection-view";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/accounts-context";

export default function HomePage() {
  const { accounts, projection, loading, error, retry } = useAccounts();

  // Error first: a down API at startup shouldn't masquerade as "No data yet".
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="space-y-1">
          <p className="font-medium">Something went wrong</p>
          <p className="text-muted-foreground max-w-md text-sm">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void retry()}>
          Retry
        </Button>
      </div>
    );
  }

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

  if (!projection || loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return <ProjectionView projection={projection} />;
}
