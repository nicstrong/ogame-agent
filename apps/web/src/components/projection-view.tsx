import { type Celestial, type Coordinates, paths, type Projection } from "@ogame-agent/core";
import { useAccounts } from "@/lib/accounts-context";
import { camelToLabel, formatNumber } from "@/lib/format";

function formatCoords(coords: Coordinates | undefined): string {
  if (!coords) return "";
  return `[${coords.galaxy}:${coords.system}:${coords.position}]`;
}

/** A grid of `label → value` cells; each cell opens that field's history. */
function StatGrid({
  title,
  entries,
  pathFor,
}: {
  title: string;
  entries: Record<string, number> | undefined;
  pathFor: (key: string) => string;
}) {
  const { openHistory } = useAccounts();
  if (!entries) return null;
  const items = Object.entries(entries).sort(([a], [b]) => a.localeCompare(b));
  if (items.length === 0) return null;

  return (
    <section className="space-y-1">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h4>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {items.map(([key, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => openHistory(pathFor(key))}
            className="hover:bg-muted flex items-center justify-between gap-2 rounded px-2 py-1 text-left"
            title="View history"
          >
            <span className="text-muted-foreground truncate">{camelToLabel(key)}</span>
            <span className="font-medium tabular-nums">{formatNumber(value)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ResourceRow({ id, celestial }: { id: string; celestial: Celestial }) {
  const { openHistory } = useAccounts();
  const resources = celestial.resources;
  if (!resources) return null;
  const order: { key: keyof NonNullable<Celestial["resources"]>; label: string }[] = [
    { key: "metal", label: "Metal" },
    { key: "crystal", label: "Crystal" },
    { key: "deuterium", label: "Deut" },
    { key: "energy", label: "Energy" },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
      {order.map(({ key, label }) => {
        const res = resources[key];
        if (!res || res.amount === undefined) return null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => openHistory(paths.celestial.resource(id, key, "amount"))}
            className="hover:bg-muted flex flex-col rounded px-2 py-1 text-left"
            title="View history"
          >
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-medium tabular-nums">{formatNumber(res.amount)}</span>
          </button>
        );
      })}
    </div>
  );
}

function CelestialCard({ id, celestial }: { id: string; celestial: Celestial }) {
  const isMoon = celestial.type === "moon";
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{celestial.name ?? (isMoon ? "Moon" : "Planet")}</span>
          <span className="text-muted-foreground text-sm">
            {formatCoords(celestial.coordinates)}
          </span>
        </div>
        <span className="text-muted-foreground rounded bg-muted px-1.5 py-0.5 text-xs">
          {isMoon ? "moon" : "planet"} · {id}
        </span>
      </div>
      <div className="space-y-3">
        <ResourceRow id={id} celestial={celestial} />
        <StatGrid
          title="Buildings"
          entries={celestial.buildings}
          pathFor={(k) => paths.celestial.building(id, k)}
        />
        <StatGrid
          title="Ships"
          entries={celestial.ships}
          pathFor={(k) => paths.celestial.ship(id, k)}
        />
        <StatGrid
          title="Defense"
          entries={celestial.defense}
          pathFor={(k) => paths.celestial.defense(id, k)}
        />
      </div>
    </div>
  );
}

function sortCelestials(celestial: Record<string, Celestial>): [string, Celestial][] {
  return Object.entries(celestial).sort(([, a], [, b]) => {
    const ca = a.coordinates;
    const cb = b.coordinates;
    if (!ca || !cb) return 0;
    return (
      ca.galaxy - cb.galaxy ||
      ca.system - cb.system ||
      ca.position - cb.position ||
      (a.type === b.type ? 0 : a.type === "moon" ? 1 : -1)
    );
  });
}

export function ProjectionView({ projection }: { projection: Projection }) {
  const account = projection.account;
  const celestials = projection.celestial ?? {};

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="bg-card rounded-lg border p-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-lg font-semibold">{account?.name ?? "Account"}</span>
          {account?.class !== undefined && (
            <span className="text-muted-foreground text-sm">class {String(account.class)}</span>
          )}
          {account?.rank !== undefined && (
            <span className="text-muted-foreground text-sm">rank {account.rank}</span>
          )}
        </div>
        <StatGrid title="Research" entries={account?.research} pathFor={paths.account.research} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sortCelestials(celestials).map(([id, celestial]) => (
          <CelestialCard key={id} id={id} celestial={celestial} />
        ))}
      </div>
    </div>
  );
}
