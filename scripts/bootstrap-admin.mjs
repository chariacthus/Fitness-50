// Grants the administrator role to an existing account (server-side only).
// The person must first create an account on the website.
//
// Usage:
//   node --env-file=.env.local scripts/bootstrap-admin.mjs christian@example.com
//
// Alternative without Node: run this in the Supabase SQL editor:
//   select public.bootstrap_admin('christian@example.com');
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Angiv en e-mailadresse: node --env-file=.env.local scripts/bootstrap-admin.mjs navn@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SECRET_KEY skal være sat (f.eks. i .env.local).");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.rpc("bootstrap_admin", { p_email: email });
if (error) {
  console.error(`Kunne ikke gøre ${email} til administrator: ${error.message}`);
  process.exit(1);
}
console.log(`${email} er nu administrator (bruger-id ${data}).`);
