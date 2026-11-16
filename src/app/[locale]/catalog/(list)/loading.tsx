import { Skeleton } from "@/components/ui/Feedback";

/** Shown while the next catalogue page or search results load on the server. */
export default function CatalogLoading() {
  return (
    <div className="container-page py-6 md:py-8" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-5 h-9 w-64" />
      <Skeleton className="mt-5 h-12 w-full max-w-2xl" />
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <Skeleton className="h-56" />
          </li>
        ))}
      </ul>
    </div>
  );
}
