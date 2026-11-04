import type { SpecCategoryGroup } from "@/types/api";

interface FullSpecMatrixProps {
  specGroups?: SpecCategoryGroup[];
}

export function FullSpecMatrix({ specGroups = [] }: FullSpecMatrixProps) {
  if (!specGroups || specGroups.length === 0) return null;

  return (
    <section className="py-16 border-t border-zinc-200 dark:border-zinc-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Technical Overview
          </span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white mt-1">
            Complete Technical Specifications
          </h2>
        </div>

        <div className="space-y-8">
          {specGroups.map((group) => (
            <div
              key={group.category}
              className="rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-xs"
            >
              <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 font-bold text-xs uppercase tracking-wider text-zinc-900 dark:text-white">
                {group.category}
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {group.rows?.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-3 px-6 py-3.5 text-xs hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="font-semibold text-zinc-500 dark:text-zinc-400">
                      {row.label}
                    </div>
                    <div className="sm:col-span-2 text-zinc-900 dark:text-zinc-100 font-medium">
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
