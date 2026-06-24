import {
  accountClassName,
  type Celestial,
  celestialMsu,
  type Coordinates,
  empireMsu,
  lifeformName,
  lifeformOfOgameId,
  type MsuMode,
  ogameIdForKey,
  paths,
  type Projection,
} from "@ogame-agent/core";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { PlanetVisual } from "@/components/planet-visual";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/accounts-context";
import { formatCompact, formatNumber, formatRate } from "@/lib/format";
import { nextMsuMode, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

function coordStr(c: Coordinates | undefined): string {
  return c ? `[${c.galaxy}:${c.system}:${c.position}]` : "";
}

function planetCount(projection: Projection): number {
  return Object.values(projection.celestial ?? {}).filter((c) => c.type !== "moon").length;
}

/** Min/max temperature label; OGLight stores the minimum, OGame max = min + 40. */
function tempRange(temperature: unknown): string | undefined {
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return undefined;
  return `${temperature}° to ${temperature + 40}°`;
}

function activeLifeform(celestial: Celestial): number | undefined {
  const n = Number(celestial.lifeform);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : undefined;
}

function Stat({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted rounded px-1.5 py-1 text-left"
    >
      {inner}
    </button>
  ) : (
    <div className="px-1.5 py-1">{inner}</div>
  );
}

function AccountCard({ projection }: { projection: Projection }) {
  const { openHistory } = useAccounts();
  const account = projection.account;
  const score = account?.score;
  const className = accountClassName(account?.class);
  const classLine = [className, account?.class !== undefined ? `Class ${account.class}` : undefined]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="bg-card rounded-lg border p-4">
      <h3 className="text-amber-500/80 text-xs font-medium tracking-wide uppercase">Account</h3>
      <div className="mt-2">
        <div className="truncate text-xl font-semibold">{account?.name ?? "—"}</div>
        {classLine && <div className="text-muted-foreground text-sm">{classLine}</div>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1">
        <Stat
          label="Points"
          value={score?.global !== undefined ? formatCompact(score.global) : "—"}
          onClick={
            score?.global !== undefined
              ? () => openHistory(paths.account.score("global"))
              : undefined
          }
        />
        <Stat
          label="Rank"
          value={account?.rank !== undefined ? `#${account.rank}` : "—"}
          onClick={
            account?.rank !== undefined ? () => openHistory(paths.account.rank()) : undefined
          }
        />
        <Stat label="Planets" value={String(planetCount(projection))} />
      </div>
    </section>
  );
}

const MODE_LABEL: Record<MsuMode, string> = {
  value: "Total MSU",
  perHour: "Total MSU/h",
  perDay: "Total MSU/day",
};

function rawResourceTotals(projection: Projection, mode: MsuMode) {
  const acc = { metal: 0, crystal: 0, deuterium: 0 };
  for (const c of Object.values(projection.celestial ?? {})) {
    for (const key of ["metal", "crystal", "deuterium"] as const) {
      const r = c.resources?.[key];
      if (!r) continue;
      acc[key] +=
        mode === "value" ? (r.amount ?? 0) : (r.production ?? 0) * (mode === "perDay" ? 24 : 1);
    }
  }
  return acc;
}

function EmpireCard({ projection }: { projection: Projection }) {
  const { msuRatio, msuMode, setMsuMode } = useSettings();
  const totals = empireMsu(projection, msuRatio, msuMode);
  const raw = rawResourceTotals(projection, msuMode);

  return (
    <button
      type="button"
      onClick={() => setMsuMode(nextMsuMode(msuMode))}
      title="Click to cycle stored value → per hour → per day"
      className="bg-card flex flex-col items-start rounded-lg border border-amber-500/25 p-4 text-left transition-colors hover:border-amber-500/50"
    >
      <div className="text-amber-500/80 text-xs font-medium tracking-wide uppercase">
        Empire · {MODE_LABEL[msuMode]}
      </div>
      <div className="mt-1 text-3xl font-semibold text-amber-500 tabular-nums">
        {formatCompact(totals.total)}
      </div>
      <div className="text-muted-foreground mt-3 grid grid-cols-3 gap-1 text-sm">
        {(["metal", "crystal", "deuterium"] as const).map((key) => (
          <div key={key} className="px-1">
            <div className="text-[11px] tracking-wide uppercase">
              {key === "deuterium" ? "Deut" : key}
            </div>
            <div className="text-foreground tabular-nums">{formatCompact(raw[key])}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

function ResearchPanel({
  research,
  className,
}: {
  research: Record<string, number> | undefined;
  className?: string;
}) {
  const { label, openHistory } = useAccounts();
  const items = Object.entries(research ?? {}).sort(([a], [b]) => label(a).localeCompare(label(b)));

  return (
    <section className={cn("bg-card rounded-lg border p-4", className)}>
      <h3 className="text-amber-500/80 text-xs font-medium tracking-wide uppercase">Research</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">No research yet.</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 md:grid-cols-3 xl:grid-cols-4">
          {items.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => openHistory(paths.account.research(key))}
              className="hover:bg-muted -mx-1 flex items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-sm"
              title="View history"
            >
              <span className="text-muted-foreground truncate">{label(key)}</span>
              <span className="tabular-nums">{formatNumber(value)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** A titled list of `label → level` rows, ordered by OGame id, each opening its history. */
function LevelColumn({
  title,
  entries,
  pathFor,
  lifeform,
  showTotal,
}: {
  title: string;
  entries: Record<string, number> | undefined;
  pathFor: (key: string) => string;
  /** When set, keep only ids belonging to this lifeform (the planet's active one). */
  lifeform?: number;
  showTotal?: boolean;
}) {
  const { label, openHistory } = useAccounts();
  if (!entries) return null;
  let items = Object.entries(entries);
  if (lifeform !== undefined) {
    // Keep only this lifeform's ids that the universe catalog actually names — the `1L2xx`
    // range has empty slots (no real tech, always 0, unnamed) we don't want to render.
    items = items.filter(
      ([key]) => lifeformOfOgameId(ogameIdForKey(key) ?? -1) === lifeform && label.has(key),
    );
  }
  items.sort(
    ([a], [b]) => (ogameIdForKey(a) ?? 1e9) - (ogameIdForKey(b) ?? 1e9) || a.localeCompare(b),
  );
  if (items.length === 0) return null;
  const total = showTotal ? items.reduce((sum, [, v]) => sum + v, 0) : undefined;

  return (
    <section className="space-y-1.5">
      <h4 className="text-amber-500/80 text-xs font-medium tracking-wide uppercase">{title}</h4>
      <div className="space-y-0.5">
        {items.map(([key, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => openHistory(pathFor(key))}
            className="hover:bg-muted -mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-sm"
            title="View history"
          >
            <span className="text-muted-foreground truncate">{label(key)}</span>
            <span className="tabular-nums">{formatNumber(value)}</span>
          </button>
        ))}
        {total !== undefined && (
          <div className="mt-1 flex items-center justify-between gap-2 border-t px-1 pt-1 text-sm font-medium">
            <span className="text-muted-foreground">Total</span>
            <span className="tabular-nums">{formatNumber(total)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

const RESOURCE_ROWS = [
  { key: "metal", label: "Metal" },
  { key: "crystal", label: "Crystal" },
  { key: "deuterium", label: "Deuterium" },
] as const;

function ResourcesCard({ id, celestial }: { id: string; celestial: Celestial }) {
  const { openHistory } = useAccounts();
  const { msuRatio } = useSettings();
  const res = celestial.resources;
  if (!res) return null;
  const energy = res.energy?.amount;

  return (
    <div className="space-y-3">
      <h4 className="text-amber-500/80 text-xs font-medium tracking-wide uppercase">
        Resources in store
      </h4>
      {RESOURCE_ROWS.map(({ key, label }) => {
        const r = res[key];
        if (!r || r.amount === undefined) return null;
        const pct = r.storage ? Math.min(100, (r.amount / r.storage) * 100) : 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => openHistory(paths.celestial.resource(id, key, "amount"))}
            className="block w-full text-left"
            title="View history"
          >
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              {r.production !== undefined && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatRate(r.production)}
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium tabular-nums">{formatNumber(r.amount)}</span>
              {r.storage !== undefined && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  / {formatCompact(r.storage)}
                </span>
              )}
            </div>
            <div className="bg-muted mt-1 h-1 overflow-hidden rounded">
              <div className="bg-foreground/40 h-full" style={{ width: `${pct}%` }} />
            </div>
          </button>
        );
      })}
      <div className="text-muted-foreground flex items-center justify-between gap-4 pt-1 text-sm">
        {energy !== undefined && (
          <span>
            Energy{" "}
            <span className="text-foreground tabular-nums">
              {energy > 0 ? "+" : ""}
              {formatNumber(energy)}
            </span>
          </span>
        )}
        <span className="ml-auto">
          Value{" "}
          <span className="text-foreground tabular-nums">
            {formatCompact(celestialMsu(celestial, msuRatio, "value").total)}
          </span>
        </span>
      </div>
    </div>
  );
}

function PlanetDetail({ id, celestial }: { id: string; celestial: Celestial }) {
  const { removeCelestial } = useAccounts();
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isMoon = celestial.type === "moon";
  const lifeform = lifeformName(celestial.lifeform);
  const temp = tempRange(celestial.temperature);
  const fields = celestial.fields;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeCelestial(id);
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  };

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start gap-4">
        <PlanetVisual id={id} size={84} isMoon={isMoon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-lg font-semibold">
              {celestial.name ?? (isMoon ? "Moon" : "Planet")}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {coordStr(celestial.coordinates)}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">
            {isMoon ? "moon" : "planet"}
            {fields?.max !== undefined && (
              <>
                {" · "}
                {fields.used ?? "?"}/{fields.max} fields
              </>
            )}
            {temp && <> · {temp}</>}
          </div>
          {lifeform && (
            <span className="mt-1.5 inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400">
              Lifeform · {lifeform}
            </span>
          )}
        </div>
        {confirming ? (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="destructive" disabled={removing} onClick={handleRemove}>
              {removing ? "Removing…" : "Remove"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={removing}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            className="shrink-0"
            title="Remove (emits a tombstone; history is kept)"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>
      <ResourcesCard id={id} celestial={celestial} />
    </section>
  );
}

export function ProjectionView({ projection }: { projection: Projection }) {
  const { activeCelestialId } = useAccounts();
  const celestials = projection.celestial ?? {};
  const active = activeCelestialId ? celestials[activeCelestialId] : undefined;
  const lifeform = active ? activeLifeform(active) : undefined;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 lg:p-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <AccountCard projection={projection} />
        <EmpireCard projection={projection} />
        <ResearchPanel research={projection.account?.research} className="lg:col-span-2" />
      </div>

      {active && activeCelestialId ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <PlanetDetail id={activeCelestialId} celestial={active} />
          <div className="bg-card grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border p-4 sm:grid-cols-3 xl:grid-cols-5">
            <LevelColumn
              title="Buildings"
              entries={active.buildings}
              pathFor={(k) => paths.celestial.building(activeCelestialId, k)}
            />
            <LevelColumn
              title="Fleet"
              entries={active.ships}
              pathFor={(k) => paths.celestial.ship(activeCelestialId, k)}
            />
            <LevelColumn
              title="Defense"
              entries={active.defense}
              pathFor={(k) => paths.celestial.defense(activeCelestialId, k)}
              showTotal
            />
            <LevelColumn
              title="LF Buildings"
              entries={active.lifeformBuildings}
              pathFor={(k) => paths.celestial.lifeformBuilding(activeCelestialId, k)}
              lifeform={lifeform}
            />
            <LevelColumn
              title="LF Research"
              entries={active.lifeformResearch}
              pathFor={(k) => paths.celestial.lifeformResearch(activeCelestialId, k)}
              lifeform={lifeform}
            />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground p-4 text-sm">No planet selected.</p>
      )}
    </div>
  );
}
