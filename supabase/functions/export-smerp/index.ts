import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPORT_TOKEN = "smerp_export_7f3a9c2e8b14d6f05a1c9e2b";

const TABLES = [
  "areas",
  "machines",
  "profiles",
  "user_roles",
  "user_areas",
  "production_goals",
  "machine_operators",
  "production_entries",
  "viewer_tokens",
  "overtime_days",
  "meta_justifications",
  "production_deviations",
  "collaborators",
];

const BUCKETS = ["deviation-photos"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-export-token");
  if (token !== EXPORT_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const resource = url.searchParams.get("resource") ?? "tables";

  try {
    if (resource === "users") {
      const users: unknown[] = [];
      let page = 1;
      while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return json({ error: error.message }, 500);
        users.push(
          ...data.users.map((u) => ({
            id: u.id,
            email: u.email,
            phone: u.phone,
            created_at: u.created_at,
            email_confirmed_at: u.email_confirmed_at,
            last_sign_in_at: u.last_sign_in_at,
            raw_user_meta_data: u.user_metadata,
            raw_app_meta_data: u.app_metadata,
          })),
        );
        if (data.users.length < 1000) break;
        page++;
      }
      return json({ resource: "users", count: users.length, users });
    }

    if (resource === "storage") {
      const result: Record<string, unknown[]> = {};
      for (const bucket of BUCKETS) {
        const files: { path: string; signedUrl: string }[] = [];
        const walk = async (prefix: string) => {
          const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
          if (error) return;
          for (const item of data) {
            const full = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id === null) {
              await walk(full);
            } else {
              const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(full, 60 * 60);
              if (signed?.signedUrl) files.push({ path: full, signedUrl: signed.signedUrl });
            }
          }
        };
        await walk("");
        result[bucket] = files;
      }
      return json({ resource: "storage", buckets: result });
    }

    const out: Record<string, unknown[]> = {};
    for (const t of TABLES) {
      const rows: unknown[] = [];
      let from = 0;
      const size = 1000;
      while (true) {
        const { data, error } = await supabase.from(t).select("*").range(from, from + size - 1);
        if (error) return json({ table: t, error: error.message }, 500);
        rows.push(...data);
        if (data.length < size) break;
        from += size;
      }
      out[t] = rows;
    }
    return json({ resource: "tables", tables: out });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});