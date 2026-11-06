import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

declare const __BUILD_ID__: string;

const inputSchema = z.object({
  token: z.string().min(8).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Dados de uma TV: só o setor vinculado ao token, só o dia pedido. */
export const fetchTvScreen = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { token, date } = data;

    const { data: tv, error: tvErr } = await supabaseAdmin
      .from("tv_screens")
      .select("id, name, active, area_id")
      .eq("token", token)
      .maybeSingle();
    if (tvErr) throw new Error(tvErr.message);
    if (!tv || !tv.active) {
      throw new Error("Esta TV foi desativada ou o link é inválido.");
    }

    const [areaR, machinesR] = await Promise.all([
      supabaseAdmin.from("areas").select("id, name").eq("id", tv.area_id).maybeSingle(),
      supabaseAdmin
        .from("machines")
        .select("id, area_id, name, sort_order")
        .eq("area_id", tv.area_id)
        .order("sort_order"),
    ]);
    if (areaR.error) throw new Error(areaR.error.message);
    if (machinesR.error) throw new Error(machinesR.error.message);

    const machines = machinesR.data ?? [];
    const ids = machines.map((m) => m.id);
    if (!ids.length) {
      return { build: __BUILD_ID__, tvName: tv.name, areaName: areaR.data?.name ?? "", machines, goals: [], entries: [], operators: [], overtime: false };
    }

    const [goalsR, entriesR, operatorsR, overtimeR] = await Promise.all([
      supabaseAdmin.from("production_goals").select("machine_id, goal").eq("goal_date", date).in("machine_id", ids),
      supabaseAdmin
        .from("production_entries")
        .select("machine_id, hour_slot, quantity")
        .eq("entry_date", date)
        .in("machine_id", ids),
      supabaseAdmin.from("machine_operators").select("machine_id, operator_name").eq("log_date", date).in("machine_id", ids),
      supabaseAdmin.from("overtime_days").select("enabled").eq("day", date).maybeSingle(),
    ]);
    for (const r of [goalsR, entriesR, operatorsR]) {
      if (r.error) throw new Error(r.error.message);
    }

    return {
      build: __BUILD_ID__,
      tvName: tv.name,
      areaName: areaR.data?.name ?? "",
      machines,
      goals: goalsR.data ?? [],
      entries: entriesR.data ?? [],
      operators: operatorsR.data ?? [],
      overtime: !!overtimeR.data?.enabled,
    };
  });
