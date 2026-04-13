import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in .env");
}

const db = createClient(supabaseUrl, supabaseKey);

export { db };
