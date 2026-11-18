import { Spinner } from "../ui/Button";

export function SearchSubmitLabel({ pending, children }: { pending: boolean; children: string }) {
  return (
    <span className="inline-grid place-items-center align-middle">
      <span data-pending={pending || undefined} className="sal-search-label col-start-1 row-start-1">{children}</span>
      {pending ? (
        <span className="sal-search-spinner col-start-1 row-start-1"><Spinner /></span>
      ) : null}
    </span>
  );
}
