import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { firstParam, isUuid } from "@/lib/admin/forms";
import { memberDisplayName } from "@/lib/admin/members";
import { loadNames } from "@/lib/admin/queries";
import { ActionForm } from "@/components/admin/action-form";
import { MemberLink } from "@/components/admin/member-link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";
import { markContactHandled } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Kontaktbeskeder" };

const FILTERS = [
  { value: "", label: "Ikke håndteret" },
  { value: "haandterede", label: "Håndteret" },
  { value: "alle", label: "Alle" },
] as const;

export default async function AdminContactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/kontakt");
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.value === firstParam(params.vis)) ?? FILTERS[0];
  const handledParam = firstParam(params.haandteret);
  const supabase = await createClient();

  let query = supabase
    .from("contact_messages")
    .select("id, name, email, phone, message, user_id, handled_at, handled_by, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.value === "") query = query.is("handled_at", null);
  if (filter.value === "haandterede") query = query.not("handled_at", "is", null);

  const [{ data, error }, { data: justHandled }] = await Promise.all([
    query,
    isUuid(handledParam)
      ? supabase.from("contact_messages").select("name, handled_at").eq("id", handledParam).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rows = data ?? [];
  const names = await loadNames(
    supabase,
    rows.flatMap((r) => [r.handled_by, r.user_id]),
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Kontaktbeskeder" description="Beskeder sendt via kontaktformularen på hjemmesiden. Den nyeste står øverst." />

      {justHandled?.handled_at ? (
        <Alert tone="success" title={null}>
          Beskeden fra {justHandled.name} er markeret som håndteret.
        </Alert>
      ) : null}

      <nav aria-label="Vis kontaktbeskeder" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.value === filter.value;
          return (
            <Link
              key={f.value}
              href={f.value ? `/admin/kontakt?vis=${f.value}` : "/admin/kontakt"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md border-2 px-4 font-semibold",
                active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink hover:border-brand",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <Alert tone="danger">Beskederne kunne ikke hentes lige nu. Genindlæs siden om lidt.</Alert>
      ) : rows.length === 0 ? (
        <EmptyState title={filter.value === "" ? "Ingen beskeder venter" : "Ingen beskeder"}>
          {filter.value === "" ? "Alle kontaktbeskeder er håndteret." : "Der er ingen beskeder at vise her."}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {rows.map((m) => (
            <li key={m.id}>
              <article aria-labelledby={`kontakt-${m.id}`} className="space-y-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 id={`kontakt-${m.id}`} className="text-xl font-semibold">
                      {m.name}
                    </h2>
                    <p className="text-ink-soft">{formatDateTime(m.created_at)}</p>
                  </div>
                  {m.handled_at ? <Badge tone="success">Håndteret</Badge> : <Badge tone="warning">Ikke håndteret</Badge>}
                </header>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-ink-soft">E-mail</dt>
                    <dd>
                      <a href={`mailto:${m.email}`} className="break-all font-semibold text-brand underline underline-offset-4">
                        {m.email}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-soft">Telefon</dt>
                    <dd>
                      {m.phone ? (
                        <a href={`tel:${m.phone.replace(/\s+/g, "")}`} className="font-semibold text-brand underline underline-offset-4">
                          {m.phone}
                        </a>
                      ) : (
                        "Ikke oplyst"
                      )}
                    </dd>
                  </div>
                  {m.user_id ? (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-ink-soft">Konto</dt>
                      <dd>
                        <MemberLink id={m.user_id} name={names.get(m.user_id)} />
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div>
                  <h3 className="font-semibold text-ink-soft">Besked</h3>
                  <p className="max-w-prose whitespace-pre-line">{m.message}</p>
                </div>
                {m.handled_at ? (
                  <p className="text-ink-soft">
                    Håndteret {formatDateTime(m.handled_at)}
                    {m.handled_by ? ` af ${memberDisplayName(names.get(m.handled_by), "en administrator")}` : ""}.
                  </p>
                ) : (
                  <ActionForm action={markContactHandled} hidden={{ id: m.id, vis: filter.value }} pendingText="Gemmer…" className="space-y-3 border-t border-line pt-4">
                    <SubmitButton variant="secondary">
                      Markér som håndteret<span className="sr-only">: besked fra {m.name}</span>
                    </SubmitButton>
                  </ActionForm>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
