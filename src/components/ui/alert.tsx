import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, string> = {
  info: "border-info bg-info-soft text-ink",
  success: "border-success bg-success-soft text-ink",
  warning: "border-warning bg-warning-soft text-ink",
  danger: "border-danger bg-danger-soft text-ink",
};

const titles: Record<AlertTone, string> = {
  info: "Bemærk",
  success: "Udført",
  warning: "Vigtigt",
  danger: "Der opstod en fejl",
};

/** Message box. Errors are announced immediately (role=alert), others politely. */
export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-md border-l-4 px-4 py-3", tones[tone], className)}
    >
      {title !== null ? <p className="font-semibold">{title ?? titles[tone]}</p> : null}
      {children ? <div className={cn(title !== null && "mt-1")}>{children}</div> : null}
    </div>
  );
}
