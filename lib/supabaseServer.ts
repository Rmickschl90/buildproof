import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment (.env.local)");
}

if (!serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in environment (.env.local). " +
      "Add: SUPABASE_SERVICE_ROLE_KEY=sb_secret_... then restart `npm run dev`."
  );
}

// Server-only client. DO NOT import this in any 'use client' component.
export const supabaseServer = createClient(supabaseUrl, serviceRoleKey);
