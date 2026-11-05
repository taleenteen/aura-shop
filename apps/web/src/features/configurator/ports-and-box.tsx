import { Laptop, Cable, Plug, CheckCircle2 } from "lucide-react";
import type { PortsDiagramData, BoxContentItem } from "@/types/api";

interface PortsAndBoxProps {
  portsDiagram?: PortsDiagramData;
  boxContents?: BoxContentItem[];
}

const BOX_ICONS: Record<string, typeof Laptop> = {
  Laptop,
  Cable,
  Plug,
};

/** Icon names the "What's in the Box" list can render. */
export const BOX_ICON_NAMES = Object.keys(BOX_ICONS);

export function PortsAndBox({ portsDiagram, boxContents }: PortsAndBoxProps) {
  const hasPorts =
    portsDiagram &&
    (portsDiagram.left_ports?.length > 0 || portsDiagram.right_ports?.length > 0);
  const hasBox = boxContents && boxContents.length > 0;

  if (!hasPorts && !hasBox) return null;

  return (
    <section className="py-16 border-t border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Ports Diagram Section */}
        {hasPorts && (
          <div>
            <div className="text-center max-w-xl mx-auto mb-10">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Connectivity & Expansion
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white mt-1">
                High-Speed Chassis Ports
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Ports */}
              <div className="p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <span>Left Side Profile</span>
                </div>
                <div className="space-y-3">
                  {portsDiagram?.left_ports?.map((port, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 flex items-start gap-3"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-zinc-900 dark:text-white">
                          {port.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {port.spec}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Ports */}
              <div className="p-6 sm:p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <span>Right Side Profile</span>
                </div>
                <div className="space-y-3">
                  {portsDiagram?.right_ports?.map((port, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80 flex items-start gap-3"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-zinc-900 dark:text-white">
                          {port.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {port.spec}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* What's in the Box Section */}
        {hasBox && (
          <div>
            <div className="text-center max-w-xl mx-auto mb-10">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Package Contents
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-950 dark:text-white mt-1">
                What's in the Box
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {boxContents?.map((item, idx) => {
                const IconComponent = BOX_ICONS[item.icon] || Laptop;
                return (
                  <div
                    key={idx}
                    className="p-6 rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 flex flex-col items-center text-center justify-center space-y-3"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-900 dark:text-white shadow-xs">
                      <IconComponent className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-white max-w-xs">
                      {item.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
