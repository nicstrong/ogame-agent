import { type Celestial, celestialMsu, type Coordinates } from "@ogame-agent/core";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { useAccounts } from "@/lib/accounts-context";
import { formatCompact } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

function coordStr(c: Coordinates | undefined): string {
  return c ? `[${c.galaxy}:${c.system}:${c.position}]` : "";
}

function byCoords([, a]: [string, Celestial], [, b]: [string, Celestial]): number {
  const ca = a.coordinates;
  const cb = b.coordinates;
  if (!ca || !cb) return 0;
  return ca.galaxy - cb.galaxy || ca.system - cb.system || ca.position - cb.position;
}

/** Header control: shows the active planet and opens a jump-to-planet grid (name, coords, MSU). */
export function PlanetSwitcher() {
  const { projection, activeCelestialId, setActiveCelestial } = useAccounts();
  const { msuRatio } = useSettings();
  const [open, setOpen] = useState(false);

  const celestial = projection?.celestial ?? {};
  const planets = Object.entries(celestial)
    .filter(([, c]) => c.type !== "moon")
    .sort(byCoords);
  if (planets.length === 0) return null;

  const active = activeCelestialId ? celestial[activeCelestialId] : undefined;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-left"
      >
        <span className="font-medium">{active?.name ?? "Select planet"}</span>
        <span className="text-muted-foreground font-mono text-xs">
          {coordStr(active?.coordinates)}
        </span>
        <span className="bg-muted text-muted-foreground ml-1 rounded px-1.5 py-0.5 text-xs">
          {planets.length} planets
        </span>
        <ChevronDownIcon className="text-muted-foreground size-3.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close planet menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="bg-popover absolute top-full left-0 z-50 mt-1 w-[min(34rem,90vw)] rounded-lg border p-2 shadow-md">
            <div className="text-muted-foreground px-2 py-1 text-xs font-medium tracking-wide uppercase">
              Jump to planet
            </div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {planets.map(([id, c]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveCelestial(id);
                    setOpen(false);
                  }}
                  className={cn(
                    "hover:bg-muted flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left",
                    id === activeCelestialId && "bg-muted",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name ?? "Planet"}</div>
                    <div className="text-muted-foreground font-mono text-[11px]">
                      {coordStr(c.coordinates)}
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatCompact(celestialMsu(c, msuRatio, "value").total)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
