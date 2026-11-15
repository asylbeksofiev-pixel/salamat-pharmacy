"use client";
// Works before JavaScript loads: a plain form POST sets the pharmacy cookie and returns to this page.
// With JavaScript the choice goes through the site context (cart warning, toast, soft refresh).
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "../ui/Button";
import { useSite } from "../site/SiteProvider";

export function SelectPharmacyButton({ id, selected, label }: { id: string; selected: boolean; label?: string }) {
  const { t, selectPharmacy } = useSite();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  if (selected) {
    return (
      <Button variant="secondary" icon="checkCircle" disabled className="disabled:opacity-100">
        {t.pharmacy.selected}
      </Button>
    );
  }
  const back = pathname ?? "/";
  return (
    <form
      method="post"
      action="/api/pharmacy/select"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await selectPharmacy(id);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="pharmacyId" value={id} />
      <input type="hidden" name="back" value={back} />
      <Button type="submit" loading={busy}>
        {label ?? t.pharmacy.select}
      </Button>
    </form>
  );
}
