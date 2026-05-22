import { supabase } from "@/integrations/supabase/client";

export type Area = { id: string; name: string; slug: string; sort_order: number };
export type Machine = { id: string; area_id: string; name: string; sort_order: number };
export type Goal = { id: string; machine_id: string; goal_date: string; goal: number };
export type Operator = { id: string; machine_id: string; log_date: string; operator_name: string };
export type Entry = {
  id: string;
  machine_id: string;
  entry_date: string;
  hour_slot: number;
  quantity: number;
  observation: string | null;
};

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from("areas")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data as Area[];
}

export async function fetchMachines(areaIds?: string[]): Promise<Machine[]> {
  let q = supabase.from("machines").select("*").order("sort_order");
  if (areaIds && areaIds.length) q = q.in("area_id", areaIds);
  const { data, error } = await q;
  if (error) throw error;
  return data as Machine[];
}

export async function fetchGoalsForDate(date: string, machineIds?: string[]): Promise<Goal[]> {
  let q = supabase.from("production_goals").select("*").eq("goal_date", date);
  if (machineIds && machineIds.length) q = q.in("machine_id", machineIds);
  const { data, error } = await q;
  if (error) throw error;
  return data as Goal[];
}

export async function fetchGoalsRange(from: string, to: string, machineIds?: string[]): Promise<Goal[]> {
  let q = supabase
    .from("production_goals")
    .select("*")
    .gte("goal_date", from)
    .lte("goal_date", to);
  if (machineIds && machineIds.length) q = q.in("machine_id", machineIds);
  const { data, error } = await q;
  if (error) throw error;
  return data as Goal[];
}

export async function fetchOperatorsForDate(date: string, machineIds?: string[]): Promise<Operator[]> {
  let q = supabase.from("machine_operators").select("*").eq("log_date", date);
  if (machineIds && machineIds.length) q = q.in("machine_id", machineIds);
  const { data, error } = await q;
  if (error) throw error;
  return data as Operator[];
}

export async function fetchEntriesForDate(date: string, machineIds?: string[]): Promise<Entry[]> {
  let q = supabase.from("production_entries").select("*").eq("entry_date", date);
  if (machineIds && machineIds.length) q = q.in("machine_id", machineIds);
  const { data, error } = await q;
  if (error) throw error;
  return data as Entry[];
}

export async function fetchEntriesRange(from: string, to: string, machineIds?: string[]): Promise<Entry[]> {
  let q = supabase
    .from("production_entries")
    .select("*")
    .gte("entry_date", from)
    .lte("entry_date", to);
  if (machineIds && machineIds.length) q = q.in("machine_id", machineIds);
  const { data, error } = await q;
  if (error) throw error;
  return data as Entry[];
}

export async function upsertGoal(machine_id: string, goal_date: string, goal: number, user_id: string) {
  const { error } = await supabase
    .from("production_goals")
    .upsert(
      { machine_id, goal_date, goal, created_by: user_id, updated_at: new Date().toISOString() },
      { onConflict: "machine_id,goal_date" },
    );
  if (error) throw error;
}

export async function upsertOperator(machine_id: string, log_date: string, operator_name: string) {
  const { error } = await supabase
    .from("machine_operators")
    .upsert(
      { machine_id, log_date, operator_name, updated_at: new Date().toISOString() },
      { onConflict: "machine_id,log_date" },
    );
  if (error) throw error;
}

export async function upsertEntry(
  machine_id: string,
  entry_date: string,
  hour_slot: number,
  quantity: number,
  observation: string | null,
  user_id: string,
) {
  const { error } = await supabase
    .from("production_entries")
    .upsert(
      {
        machine_id,
        entry_date,
        hour_slot,
        quantity,
        observation,
        created_by: user_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "machine_id,entry_date,hour_slot" },
    );
  if (error) throw error;
}

export type OvertimeDay = { id: string; day: string; enabled: boolean };

export async function fetchOvertime(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("overtime_days")
    .select("enabled")
    .eq("day", date)
    .maybeSingle();
  if (error) throw error;
  return !!data?.enabled;
}

export async function setOvertime(date: string, enabled: boolean, user_id: string) {
  const { error } = await supabase
    .from("overtime_days")
    .upsert(
      { day: date, enabled, created_by: user_id, updated_at: new Date().toISOString() },
      { onConflict: "day" },
    );
  if (error) throw error;
}

export type MetaJustification = {
  id: string;
  machine_id: string;
  justification_date: string;
  justification: string;
};

export async function fetchJustificationsForDate(
  date: string,
  machineIds?: string[],
): Promise<MetaJustification[]> {
  let q = supabase
    .from("meta_justifications")
    .select("id,machine_id,justification_date,justification")
    .eq("justification_date", date);
  if (machineIds && machineIds.length) q = q.in("machine_id", machineIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MetaJustification[];
}

export async function upsertJustification(
  machine_id: string,
  justification_date: string,
  justification: string,
  user_id: string,
) {
  const { error } = await supabase
    .from("meta_justifications")
    .upsert(
      {
        machine_id,
        justification_date,
        justification,
        created_by: user_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "machine_id,justification_date" },
    );
  if (error) throw error;
}