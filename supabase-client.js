import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const configurado = SUPABASE_URL.startsWith("https://")
    && !SUPABASE_URL.includes("COLE_")
    && SUPABASE_PUBLISHABLE_KEY.length > 20
    && !SUPABASE_PUBLISHABLE_KEY.includes("COLE_");

export const supabase = configurado
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

export function exigirSupabase() {
    if (!supabase) {
        throw new Error("Configure a URL e a chave pública do Supabase em supabase-config.js.");
    }
    return supabase;
}
