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

export async function fetchOperatorsRange(from: string, to: string, machineIds?: string[]): Promise<Operator[]> {
  let q = supabase
    .from("machine_operators")
    .select("*")
    .gte("log_date", from)
    .lte("log_date", to);
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

/**
 * Substitui o conjunto de operadores de uma máquina em um dia específico
 * pela lista informada (multi-seleção). Remove todos os registros do dia
 * e insere os novos.
 */
export async function setOperatorsForDate(
  machine_id: string,
  log_date: string,
  operator_names: string[],
) {
  const cleaned = Array.from(
    new Set(
      operator_names
        .map((n) => (n ?? "").trim())
        .filter((n) => n.length > 0),
    ),
  );

  const { error: delErr } = await supabase
    .from("machine_operators")
    .delete()
    .eq("machine_id", machine_id)
    .eq("log_date", log_date);
  if (delErr) throw delErr;

  if (cleaned.length === 0) return;

  const rows = cleaned.map((operator_name) => ({
    machine_id,
    log_date,
    operator_name,
    updated_at: new Date().toISOString(),
  }));
  const { error: insErr } = await supabase.from("machine_operators").insert(rows);
  if (insErr) throw insErr;
}

// ============================================================
// Colaboradores (cadastro por área, gerenciado pelo líder/PCP)
// ============================================================
export type Collaborator = {
  id: string;
  area_id: string;
  name: string;
  active: boolean;
};

export async function fetchCollaborators(areaIds?: string[]): Promise<Collaborator[]> {
  let q = supabase
    .from("collaborators")
    .select("id,area_id,name,active")
    .order("name");
  if (areaIds && areaIds.length) q = q.in("area_id", areaIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Collaborator[];
}

export async function createCollaborator(area_id: string, name: string) {
  const { error } = await supabase
    .from("collaborators")
    .insert({ area_id, name: name.trim() });
  if (error) throw error;
}

export async function updateCollaborator(
  id: string,
  changes: Partial<Pick<Collaborator, "name" | "active">>,
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.name !== undefined) patch.name = changes.name.trim();
  if (changes.active !== undefined) patch.active = changes.active;
  const { error } = await supabase.from("collaborators").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCollaborator(id: string) {
  const { error } = await supabase.from("collaborators").delete().eq("id", id);
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

export async function fetchLeadersByArea(): Promise<Record<string, string[]>> {
  // Get all 'lider' role users
  const { data: roles, error: rolesErr } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "lider");
  if (rolesErr) throw rolesErr;
  const liderIds = (roles ?? []).map((r) => r.user_id);
  if (liderIds.length === 0) return {};

  const [{ data: areasLink, error: aErr }, { data: profiles, error: pErr }] = await Promise.all([
    supabase.from("user_areas").select("user_id,area_id").in("user_id", liderIds),
    supabase.from("profiles").select("id,full_name,email").in("id", liderIds),
  ]);
  if (aErr) throw aErr;
  if (pErr) throw pErr;

  const nameById = new Map<string, string>();
  (profiles ?? []).forEach((p) => {
    nameById.set(p.id, (p.full_name?.trim() || p.email || "—") as string);
  });

  const byArea: Record<string, string[]> = {};
  (areasLink ?? []).forEach((row) => {
    const name = nameById.get(row.user_id);
    if (!name) return;
    if (!byArea[row.area_id]) byArea[row.area_id] = [];
    if (!byArea[row.area_id].includes(name)) byArea[row.area_id].push(name);
  });
  return byArea;
}