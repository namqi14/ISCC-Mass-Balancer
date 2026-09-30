import { createClient } from "@supabase/supabase-js";

// Ensure these are set in your Render / deployment environment variables
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || ""; // Ideally the Service Role Key since this is the backend

export const supabase = createClient(supabaseUrl, supabaseKey);
