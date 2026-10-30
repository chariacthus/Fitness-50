import { describe, expect, it } from "vitest";
import {
  adminSettingsSchema,
  exerciseSchema,
  mealSchema,
  newTrainingPlanSchema,
  resolveReportSchema,
  sessionSchema,
  siteImageSchema,
  siteSettingsSchema,
  suspensionSchema,
  uploadedVideoSchema,
} from "@/lib/admin/schemas";
import { zodFieldErrors } from "@/lib/action-result";

const ID = "00000000-0000-4000-8000-000000000002";

const exercise = { name: "Squat", sets: "", reps: "", duration: "", rest: "", instructions: "", notes: "", video_url: "" };

describe("exerciseSchema", () => {
  it("turns empty sets into null and numbers into integers", () => {
    expect(exerciseSchema.parse(exercise).sets).toBeNull();
    expect(exerciseSchema.parse({ ...exercise, sets: " 3 " }).sets).toBe(3);
  });

  it("rejects sets outside 1–50 and non-numbers with a Danish message", () => {
    for (const sets of ["0", "51", "3,5", "tre"]) {
      const result = exerciseSchema.safeParse({ ...exercise, sets });
      expect(result.success).toBe(false);
      if (!result.success) expect(zodFieldErrors(result.error.issues).sets).toMatch(/helt tal/);
    }
  });

  it("only accepts https video links", () => {
    expect(exerciseSchema.safeParse({ ...exercise, video_url: "https://www.youtube.com/watch?v=abc" }).success).toBe(true);
    for (const url of ["http://example.com/video", "javascript:alert(1)", "www.youtube.com", "https://"]) {
      expect(exerciseSchema.safeParse({ ...exercise, video_url: url }).success).toBe(false);
    }
  });

  it("requires a name", () => {
    const result = exerciseSchema.safeParse({ ...exercise, name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(zodFieldErrors(result.error.issues).name).toBe("Skriv øvelsens navn.");
  });

  it("enforces the database length limits", () => {
    expect(exerciseSchema.safeParse({ ...exercise, reps: "x".repeat(41) }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...exercise, name: "x".repeat(161) }).success).toBe(false);
  });
});

describe("plan, session and meal schemas", () => {
  it("requires a valid member and a title for a new plan", () => {
    const result = newTrainingPlanSchema.safeParse({ member_id: "", title: "", goal: "", description: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodFieldErrors(result.error.issues);
      expect(errors.member_id).toMatch(/medlem/);
      expect(errors.title).toMatch(/titel/);
    }
    expect(newTrainingPlanSchema.safeParse({ member_id: ID, title: "Styrke", goal: "", description: "" }).success).toBe(true);
  });

  it("trims session fields", () => {
    expect(sessionSchema.parse({ title: "  Dag 1 ", day_label: " Mandag ", description: "" })).toEqual({
      title: "Dag 1",
      day_label: "Mandag",
      description: "",
    });
  });

  it("only allows the meal types the database knows", () => {
    expect(mealSchema.safeParse({ meal_type: "frokost", title: "Rugbrød", description: "" }).success).toBe(true);
    expect(mealSchema.safeParse({ meal_type: "brunch", title: "Rugbrød", description: "" }).success).toBe(false);
  });
});

describe("uploads", () => {
  it("accepts only paths the upload component creates", () => {
    const base = { exerciseId: ID, mimeType: "video/mp4", size: 1000, name: "squat.mp4" };
    expect(uploadedVideoSchema.safeParse({ ...base, path: "exercises/123e4567-e89b-42d3-a456-426614174000.mp4" }).success).toBe(true);
    for (const path of ["../avatars/x.mp4", "exercises/../../x.mp4", "brand/123e4567-e89b-42d3-a456-426614174000.mp4", "exercises/x.exe"]) {
      expect(uploadedVideoSchema.safeParse({ ...base, path }).success).toBe(false);
    }
    expect(uploadedVideoSchema.safeParse({ ...base, path: "exercises/123e4567-e89b-42d3-a456-426614174000.mp4", mimeType: "image/png" }).success).toBe(false);
  });

  it("only lets brand images be saved into the three image fields", () => {
    expect(siteImageSchema.safeParse({ field: "logo_path", path: "brand/123e4567-e89b-42d3-a456-426614174000.png" }).success).toBe(true);
    expect(siteImageSchema.safeParse({ field: "brand_color", path: "brand/123e4567-e89b-42d3-a456-426614174000.png" }).success).toBe(false);
    expect(siteImageSchema.safeParse({ field: "logo_path", path: "exercises/123e4567-e89b-42d3-a456-426614174000.png" }).success).toBe(false);
  });
});

describe("moderation", () => {
  it("requires a reason when pausing community access, not when restoring it", () => {
    const pause = suspensionSchema.safeParse({ user_id: ID, suspend: true, reason: " " });
    expect(pause.success).toBe(false);
    if (!pause.success) expect(zodFieldErrors(pause.error.issues).reason).toMatch(/hvorfor/);
    expect(suspensionSchema.safeParse({ user_id: ID, suspend: false, reason: "" }).success).toBe(true);
  });

  it("only resolves or dismisses reports", () => {
    expect(resolveReportSchema.safeParse({ report_id: ID, status: "resolved", note: "" }).success).toBe(true);
    expect(resolveReportSchema.safeParse({ report_id: ID, status: "open", note: "" }).success).toBe(false);
  });
});

const site = {
  business_name: "Stærk50",
  slogan: "Mere styrke.",
  coach_name: "Christian",
  coach_badge_label: "Christian · Træner",
  coach_short_bio: "",
  coach_bio: "",
  contact_email: "",
  contact_phone: "",
  company_name: "",
  cvr_number: "",
  company_address: "",
  brand_color: "#4f5d3a",
  membership_description: "",
  nutrition_description: "",
  community_welcome_message: "Velkommen, {navn}!",
};

describe("siteSettingsSchema", () => {
  it("normalises the brand colour", () => {
    expect(siteSettingsSchema.parse({ ...site, brand_color: "4f5d3a" }).brand_color).toBe("#4F5D3A");
    expect(siteSettingsSchema.parse({ ...site, brand_color: "#abc" }).brand_color).toBe("#AABBCC");
  });

  it("rejects invalid colours, e-mails, phone numbers and CVR numbers", () => {
    const result = siteSettingsSchema.safeParse({
      ...site,
      brand_color: "grøn",
      contact_email: "ikke-en-email",
      contact_phone: "ring til mig",
      cvr_number: "1234",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodFieldErrors(result.error.issues);
      expect(Object.keys(errors).sort()).toEqual(["brand_color", "contact_email", "contact_phone", "cvr_number"]);
    }
  });

  it("accepts a CVR number with spaces and stores it without", () => {
    expect(siteSettingsSchema.parse({ ...site, cvr_number: "12 34 56 78" }).cvr_number).toBe("12345678");
  });

  it("requires the names and the welcome message", () => {
    const result = siteSettingsSchema.safeParse({ ...site, business_name: "", coach_name: " ", community_welcome_message: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(zodFieldErrors(result.error.issues)).sort()).toEqual(["business_name", "coach_name", "community_welcome_message"]);
    }
  });
});

describe("adminSettingsSchema", () => {
  const base = {
    grace_period_days: "7",
    email_notifications_enabled: true,
    admin_notification_email: "",
    max_image_mb: "10",
    max_video_mb: "50",
    data_retention_months: "24",
  };

  it("parses whole numbers", () => {
    expect(adminSettingsSchema.parse(base)).toMatchObject({ grace_period_days: 7, max_video_mb: 50, data_retention_months: 24 });
  });

  it("uses the same ranges as the database", () => {
    for (const [field, value] of [
      ["grace_period_days", "61"],
      ["grace_period_days", "-1"],
      ["max_image_mb", "0"],
      ["max_image_mb", "51"],
      ["max_video_mb", "5001"],
      ["data_retention_months", "121"],
      ["data_retention_months", "1,5"],
    ] as const) {
      const result = adminSettingsSchema.safeParse({ ...base, [field]: value });
      expect(result.success, `${field}=${value}`).toBe(false);
    }
  });
});
