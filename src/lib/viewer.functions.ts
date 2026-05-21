import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({
  token: z.string().min(8).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const fetchViewerDashboard = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { token, date } = data;

    const { data: tk, error: tkErr } = await supabaseAdmin
      .from("viewer_tokens")
      .select("id, name, active")
      .eq("token", token)
      .maybeSingle();
    if (tkErr) throw new Error(tkErr.message);
    if (!tk || !tk.active) {
      throw new Error("Link de visualização inválido ou desativado.");
    }

    const [areasR, machinesR, goalsR, entriesR, operatorsR, overtimeR] = await Promise.all([
      supabaseAdmin.from("areas").select("*").order("sort_order"),
      supabaseAdmin.from("machines").select("*").order("sort_order"),
      supabaseAdmin.from("production_goals").select("*").eq("goal_date", date),
      supabaseAdmin.from("production_entries").select("*").eq("entry_date", date),
      supabaseAdmin.from("machine_operators").select("*").eq("log_date", date),
      supabaseAdmin.from("overtime_days").select("enabled").eq("day", date).maybeSingle(),
    ]);
    for (const r of [areasR, machinesR, goalsR, entriesR, operatorsR]) {
      if (r.error) throw new Error(r.error.message);
    }

    return {
      viewerName: tk.name,
      areas: areasR.data ?? [],
      machines: machinesR.data ?? [],
      goals: goalsR.data ?? [],
      entries: entriesR.data ?? [],
      operators: operatorsR.data ?? [],
      overtime: !!overtimeR.data?.enabled,
    };
  });