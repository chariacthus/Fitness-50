"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbErrorMessage, fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { getAdminOrNull } from "@/lib/auth";
import { BUCKETS, isAllowedVideo } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { publishOutcomeMessage } from "@/lib/announcements/labels";
import {
  ANNOUNCEMENT_FIELDS,
  announcementFormSchema,
  attachMediaSchema,
  intentSchema,
  mediaMoveSchema,
  mediaRefSchema,
  mediaTitleSchema,
} from "@/lib/announcements/schema";
import { moveInOrder } from "@/lib/announcements/text";
import { removeStorageFolder } from "@/lib/profile/storage-cleanup";
import { CHECK_FIELDS, failForm, NOT_ADMIN, readText, readValues, type FormState } from "@/lib/profile/form-state";
import type { TablesUpdate } from "@/lib/database.types";

const idSchema = z.guid("Opslaget blev ikke fundet.");
const NOT_FOUND = "Opslaget blev ikke fundet. Måske er det slettet.";

function revalidateAnnouncement(id: string) {
  revalidatePath("/admin/opslag");
  revalidatePath(`/admin/opslag/${id}`);
  revalidatePath("/opslag");
  revalidatePath(`/opslag/${id}`);
  revalidatePath("/hjem");
}

/**
 * The editor form. intent = "save" (Gem kladde / Gem ændringer), "publish"
 * (Udgiv – saves first, then publish_announcement() which notifies members
 * about important announcements) or "unpublish" (Afpublicér – back to draft).
 */
export async function saveAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminOrNull())) return failForm(NOT_ADMIN);

  const values = readValues(formData, ANNOUNCEMENT_FIELDS);
  const id = idSchema.safeParse(readText(formData, "id"));
  const intent = intentSchema.safeParse(readText(formData, "intent") || "save");
  if (!id.success || !intent.success) return failForm("Opslaget blev ikke fundet. Genindlæs siden, og prøv igen.", undefined, values);

  const parsed = announcementFormSchema.safeParse({
    ...values,
    is_pinned: values.is_pinned === "on",
    is_important: values.is_important === "on",
  });
  if (!parsed.success) return failForm(CHECK_FIELDS, zodFieldErrors(parsed.error.issues), values);

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("announcements")
    .select("id, status, notified_at")
    .eq("id", id.data)
    .maybeSingle();
  if (loadError) return failForm(dbErrorMessage(loadError, "Opslaget kunne ikke hentes. Prøv igen."), undefined, values);
  if (!existing) return failForm(NOT_FOUND, undefined, values);

  const f = parsed.data;
  const update: TablesUpdate<"announcements"> = {
    title: f.title,
    body: f.body,
    video_title: f.video_title,
    video_description: f.video_description,
    location_name: f.location_name,
    location_address: f.location_address,
    map_url: f.map_url,
    is_pinned: f.is_pinned,
    is_important: f.is_important,
  };
  // An empty publication time means "now": for a draft it is decided when it is
  // published (publish_announcement uses now()); a published one gets now().
  if (f.published_at) update.published_at = f.published_at;
  else if (intent.data === "save" && existing.status === "published") update.published_at = new Date().toISOString();
  else update.published_at = null;
  if (intent.data === "unpublish") update.status = "draft";

  const { data: saved, error: saveError } = await supabase.from("announcements").update(update).eq("id", id.data).select("id").maybeSingle();
  if (saveError) return failForm(dbErrorMessage(saveError, "Opslaget kunne ikke gemmes. Prøv igen."), undefined, values);
  if (!saved) return failForm(NOT_FOUND, undefined, values);

  if (intent.data === "publish") {
    const { data: notified, error: publishError } = await supabase.rpc("publish_announcement", { p_announcement: id.data });
    revalidateAnnouncement(id.data);
    if (publishError) {
      return failForm(`Dine ændringer er gemt, men opslaget blev ikke udgivet: ${dbErrorMessage(publishError, "Prøv igen.")}`);
    }
    const { data: after } = await supabase.from("announcements").select("published_at, is_important").eq("id", id.data).maybeSingle();
    return {
      ok: true,
      message: publishOutcomeMessage({
        notified: Number(notified ?? 0),
        isImportant: after?.is_important ?? f.is_important,
        publishedAt: after?.published_at ?? null,
        alreadyNotified: Boolean(existing.notified_at),
      }),
    };
  }

  revalidateAnnouncement(id.data);
  if (intent.data === "unpublish") return { ok: true, message: "Opslaget er afpubliceret og er nu en kladde. Medlemmerne kan ikke længere se det." };
  return { ok: true, message: existing.status === "published" ? "Ændringerne er gemt og kan ses af medlemmerne." : "Kladden er gemt." };
}

/** "Slet opslag": removes the announcement, its media rows and its stored files. */
export async function deleteAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminOrNull())) return failForm(NOT_ADMIN);
  const id = idSchema.safeParse(readText(formData, "id"));
  if (!id.success) return failForm("Opslaget blev ikke fundet. Genindlæs siden, og prøv igen.");

  const supabase = await createClient();
  const { data: links, error: linksError } = await supabase
    .from("announcement_media")
    .select("media_id, media(path)")
    .eq("announcement_id", id.data);
  if (linksError) return failForm(dbErrorMessage(linksError, "Opslaget kunne ikke slettes. Prøv igen."));

  const { data: deleted, error } = await supabase.from("announcements").delete().eq("id", id.data).select("id").maybeSingle();
  if (error) return failForm(dbErrorMessage(error, "Opslaget kunne ikke slettes. Prøv igen."));
  if (!deleted) return failForm(NOT_FOUND);

  const mediaIds = (links ?? []).map((l) => l.media_id);
  const paths = (links ?? []).flatMap((l) => (l.media?.path ? [l.media.path] : []));
  let filesRemoved = true;
  if (mediaIds.length > 0) {
    const { error: mediaError } = await supabase.from("media").delete().in("id", mediaIds);
    if (mediaError) filesRemoved = false;
    const { error: storageError } = await supabase.storage.from(BUCKETS.announcements).remove(paths);
    if (storageError) filesRemoved = false;
  }
  // Also files that were uploaded but never attached (e.g. an interrupted save).
  if (!(await removeStorageFolder(supabase, BUCKETS.announcements, id.data))) filesRemoved = false;

  revalidateAnnouncement(id.data);
  redirect(`/admin/opslag?slettet=${filesRemoved ? "1" : "filer"}`);
}

/**
 * Called by the upload field once a file has been uploaded to
 * announcements/<announcement id>/…: registers it and attaches it last.
 */
export async function attachAnnouncementMedia(input: {
  announcementId: string;
  path: string;
  mimeType: string;
  size: number;
}): Promise<ActionResult> {
  const admin = await getAdminOrNull();
  if (!admin) return fail(NOT_ADMIN);
  const parsed = attachMediaSchema.safeParse(input);
  const supabase = await createClient();
  // Removes the just-uploaded file again when it cannot be attached – but only
  // a file directly inside this announcement's own folder.
  const cleanup = async () => {
    const folderId = idSchema.safeParse(input.announcementId);
    const path = typeof input.path === "string" ? input.path : "";
    if (folderId.success && path.startsWith(`${folderId.data}/`) && !path.slice(folderId.data.length + 1).includes("/")) {
      await supabase.storage.from(BUCKETS.announcements).remove([path]);
    }
  };
  if (!parsed.success) {
    await cleanup();
    const sizeIssue = parsed.error.issues.find((i) => i.path[0] === "size");
    return fail(sizeIssue ? "Filen er for stor. Billeder må højst fylde 10 MB og videoer 50 MB." : (parsed.error.issues[0]?.message ?? "Filen kunne ikke tilføjes."));
  }
  const { announcementId, path, mimeType, size } = parsed.data;

  const [{ data: announcement }, { data: last }] = await Promise.all([
    supabase.from("announcements").select("id").eq("id", announcementId).maybeSingle(),
    supabase
      .from("announcement_media")
      .select("position")
      .eq("announcement_id", announcementId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!announcement) {
    await cleanup();
    return fail(NOT_FOUND);
  }

  const { data: media, error: mediaError } = await supabase
    .from("media")
    .insert({
      owner_id: admin.userId,
      bucket: BUCKETS.announcements,
      path,
      kind: isAllowedVideo(mimeType) ? "video" : "image",
      mime_type: mimeType,
      size_bytes: size,
    })
    .select("id")
    .single();
  if (mediaError?.code === "23505") return fail("Filen er allerede tilføjet til opslaget.");
  if (mediaError || !media) {
    await cleanup();
    return fail(dbErrorMessage(mediaError, "Filen blev uploadet, men kunne ikke gemmes på opslaget. Prøv igen."));
  }

  const { error: linkError } = await supabase
    .from("announcement_media")
    .insert({ announcement_id: announcementId, media_id: media.id, position: (last?.position ?? -1) + 1 });
  if (linkError) {
    await supabase.from("media").delete().eq("id", media.id);
    await cleanup();
    return fail(dbErrorMessage(linkError, "Filen kunne ikke tilføjes til opslaget. Prøv igen."));
  }

  revalidateAnnouncement(announcementId);
  return ok(isAllowedVideo(mimeType) ? "Videoen er tilføjet til opslaget." : "Billedet er tilføjet til opslaget.");
}

async function loadLink(supabase: Awaited<ReturnType<typeof createClient>>, announcementId: string, mediaId: string) {
  return supabase
    .from("announcement_media")
    .select("media_id, media(id, path, kind)")
    .eq("announcement_id", announcementId)
    .eq("media_id", mediaId)
    .maybeSingle();
}

/** "Fjern": detaches the file, deletes its media row and the stored object. */
export async function removeAnnouncementMedia(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminOrNull())) return failForm(NOT_ADMIN);
  const parsed = mediaRefSchema.safeParse({ announcementId: readText(formData, "announcementId"), mediaId: readText(formData, "mediaId") });
  if (!parsed.success) return failForm("Filen blev ikke fundet. Genindlæs siden, og prøv igen.");

  const supabase = await createClient();
  const { data: link, error } = await loadLink(supabase, parsed.data.announcementId, parsed.data.mediaId);
  if (error) return failForm(dbErrorMessage(error, "Filen kunne ikke fjernes. Prøv igen."));
  if (!link?.media) return failForm("Filen er allerede fjernet fra opslaget.");

  // Deleting the media row also removes the link (on delete cascade).
  const { error: deleteError } = await supabase.from("media").delete().eq("id", link.media.id);
  if (deleteError) return failForm(dbErrorMessage(deleteError, "Filen kunne ikke fjernes. Prøv igen."));
  const { data: removed, error: storageError } = await supabase.storage.from(BUCKETS.announcements).remove([link.media.path]);

  revalidateAnnouncement(parsed.data.announcementId);
  const what = link.media.kind === "video" ? "Videoen" : "Billedet";
  if (storageError || (removed ?? []).length === 0) {
    return { ok: true, message: `${what} er fjernet fra opslaget, men selve filen kunne ikke slettes fra lageret. Den er ikke synlig for nogen.` };
  }
  return { ok: true, message: `${what} er fjernet fra opslaget.` };
}

/** "Flyt op" / "Flyt ned". */
export async function moveAnnouncementMedia(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminOrNull())) return failForm(NOT_ADMIN);
  const parsed = mediaMoveSchema.safeParse({
    announcementId: readText(formData, "announcementId"),
    mediaId: readText(formData, "mediaId"),
    direction: readText(formData, "direction"),
  });
  if (!parsed.success) return failForm("Filen blev ikke fundet. Genindlæs siden, og prøv igen.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcement_media")
    .select("media_id, position")
    .eq("announcement_id", parsed.data.announcementId)
    .order("position", { ascending: true });
  if (error) return failForm(dbErrorMessage(error, "Rækkefølgen kunne ikke ændres. Prøv igen."));

  const rows = data ?? [];
  const order = moveInOrder(
    rows.map((r) => r.media_id),
    parsed.data.mediaId,
    parsed.data.direction,
  );
  if (!order) return failForm(parsed.data.direction === "up" ? "Filen er allerede den første." : "Filen er allerede den sidste.");

  const current = new Map(rows.map((r) => [r.media_id, r.position]));
  const changes = order.map((mediaId, position) => ({ mediaId, position })).filter((c) => current.get(c.mediaId) !== c.position);
  const results = await Promise.all(
    changes.map((c) =>
      supabase
        .from("announcement_media")
        .update({ position: c.position })
        .eq("announcement_id", parsed.data.announcementId)
        .eq("media_id", c.mediaId),
    ),
  );
  revalidateAnnouncement(parsed.data.announcementId);
  const failed = results.find((r) => r.error);
  if (failed) return failForm(dbErrorMessage(failed.error, "Rækkefølgen kunne ikke gemmes helt. Genindlæs siden, og prøv igen."));
  return { ok: true, message: parsed.data.direction === "up" ? "Filen er flyttet op." : "Filen er flyttet ned." };
}

/** Description of an image (used as its alternative text for screen readers). */
export async function saveMediaTitle(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getAdminOrNull())) return failForm(NOT_ADMIN);
  const values = readValues(formData, ["title"]);
  const parsed = mediaTitleSchema.safeParse({
    announcementId: readText(formData, "announcementId"),
    mediaId: readText(formData, "mediaId"),
    title: values.title,
  });
  if (!parsed.success) return failForm(CHECK_FIELDS, zodFieldErrors(parsed.error.issues), values);

  const supabase = await createClient();
  const { data: link, error } = await loadLink(supabase, parsed.data.announcementId, parsed.data.mediaId);
  if (error) return failForm(dbErrorMessage(error, "Beskrivelsen kunne ikke gemmes. Prøv igen."), undefined, values);
  if (!link?.media) return failForm("Filen er fjernet fra opslaget.", undefined, values);

  const { error: updateError } = await supabase.from("media").update({ title: parsed.data.title }).eq("id", parsed.data.mediaId);
  if (updateError) return failForm(dbErrorMessage(updateError, "Beskrivelsen kunne ikke gemmes. Prøv igen."), undefined, values);

  revalidateAnnouncement(parsed.data.announcementId);
  return { ok: true, message: parsed.data.title ? "Beskrivelsen er gemt." : "Beskrivelsen er fjernet." };
}
