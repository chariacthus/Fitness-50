import Link from "next/link";
import { memberDisplayName } from "@/lib/admin/members";

/** Name of a member linking to his admin page. */
export function MemberLink({ id, name, fallback }: { id: string | null | undefined; name?: string | null; fallback?: string }) {
  if (!id) return <span className="text-ink-soft">{fallback ?? "Ukendt medlem"}</span>;
  return (
    <Link href={`/admin/medlemmer/${id}`} className="font-semibold text-brand underline underline-offset-4">
      {memberDisplayName(name, fallback)}
    </Link>
  );
}
