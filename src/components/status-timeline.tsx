import { cn, ORDER_PIPELINE, ORDER_STATUS_LABELS } from "@/lib/utils";

export function StatusTimeline({ status }: { status: string }) {
  const currentIndex = ORDER_PIPELINE.indexOf(status as (typeof ORDER_PIPELINE)[number]);
  const isDisputed = status === "DISPUTED";

  return (
    <div className="w-full overflow-x-auto">
      <ol className="flex min-w-max items-center">
        {ORDER_PIPELINE.map((step, i) => {
          const done = !isDisputed && i <= currentIndex;
          const active = !isDisputed && i === currentIndex;
          return (
            <li key={step} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
                    done
                      ? "border-[#1E7A3D] bg-[#1E7A3D] text-white"
                      : "border-neutral-300 bg-white text-neutral-400",
                    active && "ring-2 ring-[#1E7A3D]/30"
                  )}
                >
                  {i + 1}
                </div>
                <span
                  className={cn(
                    "w-20 text-center text-[11px] leading-tight",
                    done ? "text-neutral-800 font-medium" : "text-neutral-400"
                  )}
                >
                  {ORDER_STATUS_LABELS[step]}
                </span>
              </div>
              {i < ORDER_PIPELINE.length - 1 && (
                <div
                  className={cn(
                    "mx-1 h-0.5 w-8 sm:w-12",
                    i < currentIndex ? "bg-[#1E7A3D]" : "bg-neutral-200"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      {isDisputed && (
        <p className="mt-2 text-xs font-medium text-red-600">
          This order is flagged as DISPUTED — pipeline paused pending admin review.
        </p>
      )}
    </div>
  );
}
