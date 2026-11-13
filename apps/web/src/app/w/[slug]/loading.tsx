import { Card, Skeleton } from "@orbit/ui";

export default function Loading() {
  return (
    <div className="flex h-full md:gap-3" role="status" aria-label="Loading">
      <div className="flex h-full w-full flex-col gap-4 p-4 md:w-[340px] md:shrink-0 md:p-2 lg:w-[380px]">
        <Skeleton className="mt-12 h-10 w-40" />
        <Card className="flex flex-col gap-4 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </Card>
      </div>
      <Card className="hidden h-full flex-1 md:block" />
    </div>
  );
}
