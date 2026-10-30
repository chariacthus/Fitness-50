import { cn } from "@/components/ui/cn";

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-6 w-6 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

/** Plain list of features separated by thin lines. */
export function FeatureList({ items, columns = 1, className }: { items: string[]; columns?: 1 | 2; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul role="list" className={cn("grid gap-x-10 border-t border-line", columns === 2 && "md:grid-cols-2", className)}>
      {items.map((item) => (
        <li key={item} className="border-b border-line py-3 text-lg">
          {item}
        </li>
      ))}
    </ul>
  );
}
