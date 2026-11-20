"use client";
import { useCallback } from "react";
import { searchHistory } from "@/lib/client/search-history";
import { useToast } from "../ui/Toast";
import { useSite } from "./SiteProvider";

// One message per page load is enough: the search itself still works, only the history is not kept.
let saveFailureShown = false;

/** Records a query the visitor submitted; tells them once if the browser refuses to store it. */
export function useRecordSearch() {
  const { t } = useSite();
  const toast = useToast();
  return useCallback(
    (query: string) => {
      if (searchHistory.record(query) || saveFailureShown) return;
      saveFailureShown = true;
      toast(t.search.historySaveFailed, "error");
    },
    [t, toast],
  );
}
