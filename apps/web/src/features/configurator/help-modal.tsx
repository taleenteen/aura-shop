import { motion, AnimatePresence } from "motion/react";
import { X, HelpCircle, CheckCircle2 } from "lucide-react";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "memory" | "storage";
}

export function HelpModal({ isOpen, onClose, type }: HelpModalProps) {
  if (!isOpen) return null;

  const content =
    type === "memory"
      ? {
          title: "How much unified memory is right for you?",
          subtitle:
            "Unified memory is faster and more efficient than traditional RAM. All CPU and GPU cores access the same pool instantly.",
          recommendations: [
            {
              tier: "16GB – 24GB",
              idealFor:
                "Everyday multitasking, large spreadsheets, multiple browser workspaces, photo editing, and standard 4K video cuts.",
            },
            {
              tier: "32GB – 48GB",
              idealFor:
                "Pro content creators, multi-track audio engineering, 8K ProRes video grading, Docker containers, and local LLM models.",
            },
            {
              tier: "64GB – 128GB",
              idealFor:
                "Extreme 3D rendering (Cinema 4D, Blender), complex virtual machines, massive codebases, and production-scale AI workloads.",
            },
          ],
        }
      : {
          title: "How much storage is right for you?",
          subtitle:
            "Fast NVMe solid-state storage (SSD) gives you instant app launches and massive bandwidth for reading pro media files.",
          recommendations: [
            {
              tier: "512GB",
              idealFor:
                "Standard documents, cloud-synced files, photos, and a balanced suite of productivity applications.",
            },
            {
              tier: "1TB",
              idealFor:
                "Recommended for creative workflows, large RAW photo libraries, offline 4K video caches, and games.",
            },
            {
              tier: "2TB+",
              idealFor:
                "Uncompressed video archives, extensive sample libraries, multi-boot environments, and high-capacity portable project storage.",
            },
          ],
        };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 overflow-hidden z-10"
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2.5 text-zinc-950 dark:text-white">
              <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <h3 className="font-bold text-lg leading-tight">
                {content.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
            {content.subtitle}
          </p>

          <div className="space-y-4">
            {content.recommendations.map((rec) => (
              <div
                key={rec.tier}
                className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-950 dark:text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{rec.tier}</span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed pl-5.5">
                  {rec.idealFor}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold cursor-pointer hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
