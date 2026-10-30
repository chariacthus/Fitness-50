import { cn } from "@/components/ui/cn";

/**
 * Decorative topographic contour lines (think: paths, hills, progress).
 * Purely visual – hidden from assistive technology.
 */
export function Contours({ className }: { className?: string }) {
  const lines = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      fill="none"
      stroke="currentColor"
    >
      {lines.map((i) => {
        const r = 70 + i * 52;
        return (
          <path
            key={i}
            strokeWidth={1.2}
            d={`M ${560 - r} 330
                C ${560 - r} ${330 - r * 0.9}, ${560 + r * 0.7} ${330 - r * 1.05}, ${560 + r} ${300 - r * 0.2}
                S ${560 + r * 0.6} ${330 + r * 1.0}, ${560 - r * 0.15} ${340 + r * 0.8}
                S ${560 - r * 1.05} ${330 + r * 0.3}, ${560 - r} 330 Z`}
          />
        );
      })}
    </svg>
  );
}
