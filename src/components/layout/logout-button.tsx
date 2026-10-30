import { LogoutIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/** Logs out through a POST form (no JavaScript needed). */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action="/log-ud" method="post">
      <button
        type="submit"
        className={cn("inline-flex min-h-12 w-full items-center gap-3 rounded-md px-3 font-semibold text-ink hover:bg-muted", className)}
      >
        <LogoutIcon />
        Log ud
      </button>
    </form>
  );
}
