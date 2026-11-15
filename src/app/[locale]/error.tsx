"use client";
import { useParams } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { ErrorState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale: string }>();
  const t = getDictionary(isLocale(params?.locale) ? params.locale : "ru");
  return (
    <div className="container-page py-16">
      <ErrorState title={t.errors.errorTitle} text={t.errors.errorText} action={<Button onClick={reset}>{t.common.retry}</Button>} />
    </div>
  );
}
