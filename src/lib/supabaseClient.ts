import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-public-key"
);
