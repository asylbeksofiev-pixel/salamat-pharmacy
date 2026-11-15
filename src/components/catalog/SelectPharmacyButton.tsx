"use client";
import { useState } from "react";
import { Button } from "../ui/Button";
import { useSite } from "../site/SiteProvider";

export function SelectPharmacyButton({ id, selected, label }: { id: string; selected: boolean; label?: string }) {
  const { t, selectPharmacy } = useSite();
  const [busy, setBusy] = useState(false);
  if (selected) {
    return (
      <Button variant="secondary" icon="checkCircle" disabled className="disabled:opacity-100">
        {t.pharmacy.selected}
      </Button>
    );
  }
  return (
    <Button
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await selectPharmacy(id);
        } finally {
          setBusy(false);
        }
      }}
    >
      {label ?? t.pharmacy.select}
    </Button>
  );
}
