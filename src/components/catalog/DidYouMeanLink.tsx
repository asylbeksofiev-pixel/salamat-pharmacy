"use client";
// "Did you mean …?" link under the search results: following it is a search, so it goes to this browser's history.
import Link from "next/link";
import { searchHistory } from "@/lib/client/search-history";

export function DidYouMeanLink({ href, query, label }: { href: string; query: string; label: string }) {
  return (
    <Link href={href} onClick={() => searchHistory.add(query)} aria-label={label} className="font-semibold break-words text-brand-700 underline underline-offset-2 hover:text-brand-800">
      {query}
    </Link>
  );
}
