import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <Skeleton className="h-10 w-full max-w-xs rounded-xl" />
      <Skeleton className="h-10 w-full max-w-md rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2.1fr)_minmax(0,0.9fr)]">
        <Skeleton className="h-[560px] rounded-2xl" />
        <Skeleton className="h-[560px] rounded-2xl" />
        <Skeleton className="h-[560px] rounded-2xl" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-[360px] rounded-2xl" />
    </div>
  );
}
