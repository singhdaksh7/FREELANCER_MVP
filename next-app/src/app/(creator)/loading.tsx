/** Shown while a creator page's database query is in flight. Shared across all five creator routes via the route group. */
export default function CreatorRouteGroupLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <div className="h-24 animate-pulse rounded-lg border border-line bg-surface-card" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-md border border-line bg-surface-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-line bg-surface-card" />
    </div>
  );
}
