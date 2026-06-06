import type { Json } from "@ogame-agent/core";

/** `metalMine` → `Metal Mine`. */
export function camelToLabel(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** Render any fact value for display (objects as compact JSON). */
export function formatValue(value: Json | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
