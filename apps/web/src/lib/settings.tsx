import { DEFAULT_MSU_RATIO, type MsuMode, type MsuRatio } from "@ogame-agent/core";
import { createContext, type ReactNode, use, useEffect, useState } from "react";

/**
 * User display preferences, persisted to localStorage. These are presentation-only knobs
 * (MSU valuation ratio + the empire card's value/rate mode) — they never affect capture.
 */
interface SettingsValue {
  msuRatio: MsuRatio;
  setMsuRatio: (ratio: MsuRatio) => void;
  /** Empire-card display mode; cycles value → perHour → perDay. */
  msuMode: MsuMode;
  setMsuMode: (mode: MsuMode) => void;
}

const RATIO_KEY = "ogame.msuRatio";
const MODE_KEY = "ogame.msuMode";
const MODES: MsuMode[] = ["value", "perHour", "perDay"];

const SettingsContext = createContext<SettingsValue | undefined>(undefined);

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function loadRatio(): MsuRatio {
  try {
    const raw = localStorage.getItem(RATIO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MsuRatio>;
      if (
        isPositiveNumber(parsed.metal) &&
        isPositiveNumber(parsed.crystal) &&
        isPositiveNumber(parsed.deuterium)
      ) {
        return { metal: parsed.metal, crystal: parsed.crystal, deuterium: parsed.deuterium };
      }
    }
  } catch {
    // ignore malformed storage; fall through to the default
  }
  return DEFAULT_MSU_RATIO;
}

function loadMode(): MsuMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw && (MODES as string[]).includes(raw)) return raw as MsuMode;
  } catch {
    // ignore
  }
  return "value";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [msuRatio, setMsuRatio] = useState<MsuRatio>(loadRatio);
  const [msuMode, setMsuMode] = useState<MsuMode>(loadMode);

  useEffect(() => {
    try {
      localStorage.setItem(RATIO_KEY, JSON.stringify(msuRatio));
    } catch {
      // storage may be unavailable (private mode); preferences just won't persist
    }
  }, [msuRatio]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, msuMode);
    } catch {
      // ignore
    }
  }, [msuMode]);

  return (
    <SettingsContext value={{ msuRatio, setMsuRatio, msuMode, setMsuMode }}>
      {children}
    </SettingsContext>
  );
}

export function useSettings(): SettingsValue {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}

/** Next mode in the empire-card cycle (value → perHour → perDay → value). */
export function nextMsuMode(mode: MsuMode): MsuMode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length]!;
}
