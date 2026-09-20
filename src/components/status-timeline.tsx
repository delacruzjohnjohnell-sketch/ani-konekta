import { cn, ORDER_PIPELINE, ORDER_STATUS_LABELS } from "@/lib/utils";

export function StatusTimeline({ status }: { status: string }) {
  const currentIndex = ORDER_PIPELINE.indexOf(status as (typeof ORDER_PIPELINE)[number]);
  const isDisputed = status === "DISPUTED";

  return (
    <div className="w-full overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start">
        {ORDER_PIPELINE.map((step, i) => {
          const done = !isDisputed && i <= currentIndex;
          const active = !isDisputed && i === currentIndex;
          const completed = done && !active;
          return (
            <li key={step} className="flex items-start">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    done
                      ? "border-brand-green-700 bg-gradient-to-br from-brand-green-500 to-brand-green-800 text-white"
                      : "border-neutral-300 bg-white text-neutral-400",
                    active && "ring-4 ring-brand-gold-500/30"
                  )}
                >
                  {completed ? "✓" : i + 1}
                </div>
                <span
                  className={cn(
                    "w-20 text-center text-[11px] leading-tight",
                    done ? "font-medium text-brand-green-950" : "text-neutral-400"
                  )}
                >
                  {ORDER_STATUS_LABELS[step]}
                </span>
              </div>
              {i < ORDER_PIPELINE.length - 1 && (
                <div
                  className={cn(
                    // mt-[15px]: centres the connector on the 32px dot, not on the dot+label column.
                    "mx-1 mt-[15px] h-0.5 w-8 rounded-full sm:w-12",
                    i < currentIndex ? "bg-brand-green-700" : "bg-neutral-200"
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
