import { useAccounts } from "@/lib/accounts-context";
import type { AccountRef } from "@/lib/api";

function key(ref: AccountRef): string {
  return `${ref.universeId}/${ref.playerId}`;
}

export function AccountSwitcher() {
  const { accounts, selected, select } = useAccounts();
  if (accounts.length === 0) return null;

  return (
    <select
      aria-label="Select account"
      className="border-input bg-background h-8 rounded-md border px-2 text-sm"
      value={selected ? key(selected) : ""}
      onChange={(event) => {
        const ref = accounts.find((a) => key(a) === event.target.value);
        if (ref) select(ref);
      }}
    >
      {accounts.map((account) => (
        <option key={key(account)} value={key(account)}>
          {account.universeId} · {account.playerId}
        </option>
      ))}
    </select>
  );
}
