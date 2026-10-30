import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/ui/layout";
import { NewAnnouncementForm } from "./new-announcement-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nyt opslag" };

export default async function NewAnnouncementPage() {
  await requireAdmin("/admin/opslag/ny");
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nyt opslag"
        description="Start med en overskrift. Opslaget gemmes som kladde, så du kan tilføje billeder, video og sted, før du udgiver det."
        back={{ href: "/admin/opslag", label: "Tilbage til opslag" }}
      />
      <Panel>
        <NewAnnouncementForm />
      </Panel>
    </div>
  );
}
