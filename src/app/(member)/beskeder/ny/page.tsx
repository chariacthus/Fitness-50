import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage } from "@/lib/action-result";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { BackLink, PageHeader } from "@/components/ui/layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ny besked" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Problem({ message }: { message: string }) {
  return (
    <>
      <PageHeader title="Samtalen kunne ikke åbnes" />
      <div className="space-y-6">
        <Alert tone="danger" title={null}>
          {message}
        </Alert>
        <BackLink href="/beskeder">Til dine beskeder</BackLink>
      </div>
    </>
  );
}

/**
 * /beskeder/ny?til=<userId> – finds or creates the direct conversation with
 * that person and sends the viewer there. The database function decides
 * whether the two may write to each other.
 */
export default async function NewConversationPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = typeof sp.til === "string" ? sp.til.trim() : "";
  const viewer = await requireViewer(raw ? `/beskeder/ny?til=${encodeURIComponent(raw)}` : "/beskeder");

  const parsed = z.guid().safeParse(raw);
  if (!parsed.success) {
    return <Problem message="Linket er ikke gyldigt. Gå tilbage, og vælg den person, du vil skrive til, igen." />;
  }
  if (parsed.data === viewer.userId) {
    return <Problem message="Du kan ikke sende en besked til dig selv." />;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_or_create_direct_conversation", { p_other: parsed.data });
  if (error || !data) {
    return <Problem message={dbErrorMessage(error, "Samtalen kunne ikke åbnes. Prøv igen om lidt.")} />;
  }

  redirect(`/beskeder/${data}`);
}
