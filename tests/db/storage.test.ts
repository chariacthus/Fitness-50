import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createAdmin,
  createMember,
  createUser,
  expectRlsViolation,
  rowCountAs,
  rowsAs,
  setupDatabase,
  sql,
  teardownDatabase,
  uniqueEmail,
} from "./helpers";

// Storage policies on storage.objects (Supabase Storage checks these on every
// upload, download/signed URL and delete). Paths are "<user id>/<file>".

let admin: string;
let member: string;
let other: string;
let outsider: string;
let suspended: string;

beforeAll(async () => {
  await setupDatabase();
  admin = await createAdmin();
  member = await createMember("lager", "Jens Hansen");
  other = await createMember("lager-other", "Ole Olsen");
  outsider = await createUser(uniqueEmail("lager-outsider"), "Uden Medlemskab");
  suspended = await createMember("lager-suspended");
  await asUser(admin, (c) => c.query("select public.set_community_suspension($1, true)", [suspended]));
});
afterAll(teardownDatabase);

const upload = (userId: string, bucket: string, name: string) =>
  asUser(userId, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, userId]));
const canSee = async (userId: string, bucket: string, name: string) =>
  (await rowsAs(userId, "select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name])).length === 1;
const ownerFile = (bucket: string, name: string) => sql("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
// Members only see announcement files attached to a published announcement.
async function attachToPublishedAnnouncement(name: string) {
  const announcement = (
    await sql<{ id: string }>("insert into public.announcements (title, status, published_at) values ('Opslag', 'published', now() - interval '1 hour') returning id")
  )[0].id;
  const media = (
    await sql<{ id: string }>("insert into public.media (bucket, path, kind, mime_type) values ('announcements', $1, 'image', 'image/jpeg') returning id", [name])
  )[0].id;
  await sql("insert into public.announcement_media (announcement_id, media_id) values ($1, $2)", [announcement, media]);
}

describe("avatars", () => {
  it("a user uploads into his own folder only", async () => {
    await upload(member, "avatars", `${member}/profil.jpg`);
    await expectRlsViolation(upload(member, "avatars", `${other}/profil.jpg`));
    await expectRlsViolation(upload(member, "avatars", "profil.jpg"));
  });

  it("an upload cannot be moved into someone else's folder", async () => {
    await expectRlsViolation(
      asUser(member, (c) =>
        c.query("update storage.objects set name = $2 where bucket_id = 'avatars' and name = $1", [`${member}/profil.jpg`, `${other}/profil.jpg`]),
      ),
    );
  });

  it("entitled members can see avatars; a non-member only his own", async () => {
    await upload(outsider, "avatars", `${outsider}/mig.jpg`);
    expect(await canSee(other, "avatars", `${member}/profil.jpg`)).toBe(true);
    expect(await canSee(outsider, "avatars", `${outsider}/mig.jpg`)).toBe(true);
    expect(await canSee(outsider, "avatars", `${member}/profil.jpg`)).toBe(false);
  });

  it("only the owner (or an admin) can delete an avatar", async () => {
    await upload(other, "avatars", `${other}/a.jpg`);
    expect(await rowCountAs(member, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${other}/a.jpg`])).toBe(0);
    expect(await rowCountAs(other, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${other}/a.jpg`])).toBe(1);
    expect(await rowCountAs(admin, "delete from storage.objects where bucket_id = 'avatars' and name = $1", [`${outsider}/mig.jpg`])).toBe(1);
  });
});

describe("community images", () => {
  it("require community access and the uploader's own folder", async () => {
    await upload(member, "community", `${member}/billede.jpg`);
    await expectRlsViolation(upload(member, "community", `${other}/billede.jpg`));
    await expectRlsViolation(upload(outsider, "community", `${outsider}/billede.jpg`));
    await expectRlsViolation(upload(suspended, "community", `${suspended}/billede.jpg`));
  });

  it("are readable with community access only", async () => {
    // Other members only see images of visible messages.
    expect(await canSee(other, "community", `${member}/billede.jpg`)).toBe(false);
    await sql("insert into public.community_messages (author_id, body, image_path) values ($1, 'Billede', $2)", [member, `${member}/billede.jpg`]);
    expect(await canSee(other, "community", `${member}/billede.jpg`)).toBe(true);
    expect(await canSee(admin, "community", `${member}/billede.jpg`)).toBe(true);
    expect(await canSee(outsider, "community", `${member}/billede.jpg`)).toBe(false);
    expect(await canSee(suspended, "community", `${member}/billede.jpg`)).toBe(false);
  });

  it("can be deleted by the owner or an admin, not by other members", async () => {
    await upload(other, "community", `${other}/x.jpg`);
    expect(await rowCountAs(member, "delete from storage.objects where bucket_id = 'community' and name = $1", [`${other}/x.jpg`])).toBe(0);
    expect(await rowCountAs(admin, "delete from storage.objects where bucket_id = 'community' and name = $1", [`${other}/x.jpg`])).toBe(1);
  });
});

for (const bucket of ["announcements", "training-media"]) {
  describe(`${bucket} bucket`, () => {
    it("members cannot upload, update or delete; admins can upload", async () => {
      await expectRlsViolation(upload(member, bucket, `${member}/video.mp4`));
      await upload(admin, bucket, "opslag/video.mp4");
      expect(await rowCountAs(member, "update storage.objects set name = 'x/y.mp4' where bucket_id = $1", [bucket])).toBe(0);
      expect(await rowCountAs(member, "delete from storage.objects where bucket_id = $1", [bucket])).toBe(0);
    });

    it("files are readable for entitled members only", async () => {
      if (bucket === "announcements") await attachToPublishedAnnouncement("opslag/video.mp4");
      expect(await canSee(member, bucket, "opslag/video.mp4")).toBe(true);
      expect(await canSee(suspended, bucket, "opslag/video.mp4")).toBe(true);
      expect(await canSee(outsider, bucket, "opslag/video.mp4")).toBe(false);
    });

    it("admins can delete", async () => {
      expect(await rowCountAs(admin, "delete from storage.objects where bucket_id = $1 and name = 'opslag/video.mp4'", [bucket])).toBe(1);
    });
  });
}

describe("site bucket (public marketing images)", () => {
  it("only admins can upload, replace or delete", async () => {
    await expectRlsViolation(upload(member, "site", "logo.png"));
    await expectRlsViolation(upload(member, "site", `${member}/logo.png`));
    await upload(admin, "site", "logo.png");
    // Listing through the API is admin-only; visitors use the public URL.
    expect(await canSee(admin, "site", "logo.png")).toBe(true);
    expect(await canSee(member, "site", "logo.png")).toBe(false);
    expect(await rowCountAs(member, "update storage.objects set name = 'hacket.png' where bucket_id = 'site'")).toBe(0);
    expect(await rowCountAs(member, "delete from storage.objects where bucket_id = 'site'")).toBe(0);
    expect(await rowCountAs(admin, "update storage.objects set name = 'logo-ny.png' where bucket_id = 'site' and name = 'logo.png'")).toBe(1);
    expect(await rowCountAs(admin, "delete from storage.objects where bucket_id = 'site' and name = 'logo-ny.png'")).toBe(1);
  });

  it("is the only public bucket", async () => {
    const buckets = await sql<{ id: string; public: boolean }>("select id, public from storage.buckets order by id");
    expect(buckets.filter((b) => b.public).map((b) => b.id)).toEqual(["site"]);
    expect(buckets.map((b) => b.id).sort()).toEqual(["announcements", "avatars", "community", "site", "training-media"]);
  });
});

describe("files uploaded by the server", () => {
  it("are still protected by the read policies", async () => {
    await ownerFile("announcements", "server/billede.jpg");
    await attachToPublishedAnnouncement("server/billede.jpg");
    expect(await canSee(outsider, "announcements", "server/billede.jpg")).toBe(false);
    expect(await canSee(member, "announcements", "server/billede.jpg")).toBe(true);
  });
});
