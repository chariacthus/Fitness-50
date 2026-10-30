import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BUCKETS } from "@/lib/storage";
import { signedUrls } from "@/lib/storage-server";
import { sortSessions } from "@/lib/training/week";

// Loads a plan's sessions and exercises with the member's own (RLS) client.
// RLS only returns sessions of the member's own non-draft plans, and
// training-media files are signed with the same client, so storage policies
// decide access as well.

export type ExerciseMedia = { url: string; kind: "image" | "video"; mimeType: string; title: string | null };

export type ExerciseView = {
  id: string;
  name: string;
  instructions: string | null;
  sets: number | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
  notes: string | null;
  videoUrl: string | null;
  media: ExerciseMedia | null;
};

export type SessionView = {
  id: string;
  title: string;
  day_label: string | null;
  description: string | null;
  position: number;
  created_at: string;
  exercises: ExerciseView[];
};

export async function loadPlanSessions(
  supabase: SupabaseClient<Database>,
  planId: string,
): Promise<{ sessions: SessionView[]; error: boolean }> {
  const { data, error } = await supabase
    .from("training_sessions")
    .select(
      "id, title, day_label, description, position, created_at, exercises(id, name, instructions, sets, reps, duration, rest, video_url, media_id, notes, position, created_at)",
    )
    .eq("plan_id", planId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return { sessions: [], error: true };

  const mediaIds = [...new Set(data.flatMap((s) => s.exercises.map((e) => e.media_id)).filter((id): id is string => Boolean(id)))];
  const mediaById = new Map<string, ExerciseMedia>();
  if (mediaIds.length > 0) {
    const { data: media } = await supabase
      .from("media")
      .select("id, bucket, path, kind, mime_type, title")
      .in("id", mediaIds)
      .eq("bucket", BUCKETS.trainingMedia);
    const rows = media ?? [];
    const urls = await signedUrls(
      supabase,
      BUCKETS.trainingMedia,
      rows.map((m) => m.path),
    );
    for (const m of rows) {
      const url = urls.get(m.path);
      if (url && (m.kind === "image" || m.kind === "video")) {
        mediaById.set(m.id, { url, kind: m.kind, mimeType: m.mime_type, title: m.title });
      }
    }
  }

  const sessions = sortSessions(data).map((s) => ({
    id: s.id,
    title: s.title,
    day_label: s.day_label,
    description: s.description,
    position: s.position,
    created_at: s.created_at,
    exercises: sortSessions(s.exercises).map((e) => ({
      id: e.id,
      name: e.name,
      instructions: e.instructions,
      sets: e.sets,
      reps: e.reps,
      duration: e.duration,
      rest: e.rest,
      notes: e.notes,
      videoUrl: e.video_url,
      media: e.media_id ? (mediaById.get(e.media_id) ?? null) : null,
    })),
  }));
  return { sessions, error: false };
}
