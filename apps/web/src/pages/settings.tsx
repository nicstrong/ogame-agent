import { msuWeights } from "@ogame-agent/core";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/lib/settings";

const RESOURCES = [
  { key: "metal", label: "Metal" },
  { key: "crystal", label: "Crystal" },
  { key: "deuterium", label: "Deuterium" },
] as const;

export default function SettingsPage() {
  const { msuRatio, setMsuRatio } = useSettings();
  const weights = msuWeights(msuRatio);

  const update = (key: (typeof RESOURCES)[number]["key"], raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    setMsuRatio({ ...msuRatio, [key]: value });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <section className="max-w-md space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-medium">MSU ratio</h2>
          <p className="text-muted-foreground text-sm">
            Trade value ratio for metal&#8239;:&#8239;crystal&#8239;:&#8239;deuterium. Empire totals
            convert every resource to metal-equivalent units using this ratio.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {RESOURCES.map(({ key, label }) => (
            <label key={key} className="space-y-1 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={msuRatio[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          Weights: metal ×{weights.metal}, crystal ×{weights.crystal}, deuterium ×
          {weights.deuterium}
        </p>
      </section>
    </div>
  );
}
