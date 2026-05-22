import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAreas,
  fetchMachines,
  fetchGoalsForDate,
  fetchEntriesForDate,
  fetchOperatorsForDate,
  fetchOvertime,
  fetchJustificationsForDate,
  upsertJustification,
  type Area,
  type Machine,
} from "@/lib/queries";
import { todayIso, formatDateBR, LUNCH_LABEL, getGoalTimeSlots, getTotalMinutes, getApontamentoSlots } from "@/lib/time-slots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/app/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/logo-solucao-moveis.jpg";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type Props = {
  /** Restrict to specific areas (líder); empty = all (PCP) */
  restrictAreaIds?: string[];
};

const PIE_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportReportCsv({
  date,
  areas,
  machines,
  goals,
  entries,
  operators,
  justifications,
  overtime,
}: {
  date: string;
  areas: Area[];
  machines: Machine[];
  goals: { machine_id: string; goal: number }[];
  entries: { machine_id: string; hour_slot: number; quantity: number; observation: string | null }[];
  operators: { machine_id: string; operator_name: string }[];
  justifications: { machine_id: string; justification: string }[];
  overtime: boolean;
}) {
  const slots = getApontamentoSlots(date);
  const goalSlots = getGoalTimeSlots(overtime, date);
  const goalSlotsCount = goalSlots.length || 1;

  const lines: string[] = [];
  lines.push(`Relatório de Produção;${formatDateBR(date)}`);
  lines.push(`Hora extra;${overtime ? "Sim (até 19h)" : "Não"}`);
  lines.push("");

  // Header
  const header = [
    "Área",
    "Máquina",
    "Operador",
    ...slots.map((s) => s.label),
    "Meta/h",
    "Meta total",
    "Realizado",
    "% Meta",
    "Justificativa",
    "Observações",
  ];
  lines.push(header.map(csvEscape).join(";"));

  for (const area of areas) {
    const ams = machines.filter((m) => m.area_id === area.id);
    for (const m of ams) {
      const goal = goals.find((g) => g.machine_id === m.id)?.goal ?? 0;
      const realized = entries
        .filter((e) => e.machine_id === m.id)
        .reduce((s, e) => s + e.quantity, 0);
      const pct = goal > 0 ? Math.round((realized / goal) * 100) : 0;
      const operator = operators.find((o) => o.machine_id === m.id)?.operator_name?.trim() ?? "";
      const justif = justifications.find((j) => j.machine_id === m.id)?.justification ?? "";
      const obs = entries
        .filter((e) => e.machine_id === m.id && e.observation && e.observation.trim())
        .map((e) => `${e.hour_slot}h: ${e.observation!.trim()}`)
        .join(" | ");
      const hourCells = slots.map((s) => {
        const e = entries.find((x) => x.machine_id === m.id && x.hour_slot === s.index);
        return e ? e.quantity : "";
      });
      const row = [
        area.name,
        m.name,
        operator,
        ...hourCells,
        goal > 0 ? Math.round(goal / goalSlotsCount) : "",
        goal || "",
        realized,
        goal > 0 ? `${pct}%` : "",
        justif,
        obs,
      ];
      lines.push(row.map(csvEscape).join(";"));
    }
  }

  // Totals
  const totalMeta = goals.reduce((s, g) => s + g.goal, 0);
  const totalReal = entries.reduce((s, e) => s + e.quantity, 0);
  const totalPct = totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0;
  lines.push("");
  lines.push(["TOTAL", "", "", ...slots.map(() => ""), "", totalMeta, totalReal, `${totalPct}%`, "", ""].map(csvEscape).join(";"));

  const csv = "\ufeff" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-producao-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Dashboard({ restrictAreaIds }: Props) {
  const [date, setDate] = useState(todayIso());
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [machineFilter, setMachineFilter] = useState<string>("all");

  const areasQ = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const allAreas = areasQ.data ?? [];
  const visibleAreas = useMemo(
    () =>
      restrictAreaIds && restrictAreaIds.length
        ? allAreas.filter((a) => restrictAreaIds.includes(a.id))
        : allAreas,
    [allAreas, restrictAreaIds],
  );

  const visibleAreaIds = visibleAreas.map((a) => a.id);
  const machinesQ = useQuery({
    queryKey: ["machines", visibleAreaIds],
    queryFn: () => fetchMachines(visibleAreaIds.length ? visibleAreaIds : undefined),
    enabled: areasQ.isSuccess,
  });
  const allMachines = machinesQ.data ?? [];

  const filteredMachines = useMemo(() => {
    return allMachines.filter((m) => {
      if (areaFilter !== "all" && m.area_id !== areaFilter) return false;
      if (machineFilter !== "all" && m.id !== machineFilter) return false;
      return true;
    });
  }, [allMachines, areaFilter, machineFilter]);

  const machineIds = filteredMachines.map((m) => m.id);

  const goalsQ = useQuery({
    queryKey: ["goals", date, machineIds.join(",")],
    queryFn: () => fetchGoalsForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });
  const entriesQ = useQuery({
    queryKey: ["entries", date, machineIds.join(",")],
    queryFn: () => fetchEntriesForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });
  const operatorsQ = useQuery({
    queryKey: ["operators", date, machineIds.join(",")],
    queryFn: () => fetchOperatorsForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });
  const overtimeQ = useQuery({
    queryKey: ["overtime", date],
    queryFn: () => fetchOvertime(date),
  });
  const justifQ = useQuery({
    queryKey: ["justifications", date, machineIds.join(",")],
    queryFn: () => fetchJustificationsForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });

  const goals = goalsQ.data ?? [];
  const entries = entriesQ.data ?? [];
  const operators = operatorsQ.data ?? [];
  const overtime = !!overtimeQ.data;
  const justifications = justifQ.data ?? [];
  const apontamentoSlots = getApontamentoSlots(date);
  const goalSlots = getGoalTimeSlots(overtime, date);
  const totalMinutesForGoal = getTotalMinutes(overtime, date);

  // BAR DATA: meta vs realizado por máquina
  const barData = filteredMachines.map((m) => {
    const goal = goals.find((g) => g.machine_id === m.id)?.goal ?? 0;
    const realizado = entries
      .filter((e) => e.machine_id === m.id)
      .reduce((s, e) => s + e.quantity, 0);
    return { name: m.name, Meta: goal, Realizado: realizado };
  });

  // LINE DATA: produção acumulada ao longo das horas
  const totalGoal = goals.reduce((s, g) => s + g.goal, 0);
  const lineData = apontamentoSlots.map((slot) => {
    const hourProd = entries
      .filter((e) => e.hour_slot === slot.index)
      .reduce((s, e) => s + e.quantity, 0);
    const goalIdx = goalSlots.findIndex((g) => g.index === slot.index);
    let expected = 0;
    if (goalIdx >= 0) {
      const minutesUntilEnd = goalSlots.slice(0, goalIdx + 1).reduce((s, t) => s + t.minutes, 0);
      expected = Math.round((totalGoal * minutesUntilEnd) / totalMinutesForGoal);
    } else {
      // slot fora da meta (ex: hora extra desativada) — mantém último valor da meta
      expected = totalGoal;
    }
    return { slot: slot.label, hourProd, expected };
  });
  let acc = 0;
  const lineDataAcc = lineData.map((d) => {
    acc += d.hourProd;
    return { hora: d.slot, Acumulado: acc, Meta: d.expected };
  });

  // PIE: % cumprimento por área
  const pieData = visibleAreas
    .map((area) => {
      const ms = allMachines.filter((m) => m.area_id === area.id);
      const ids = ms.map((m) => m.id);
      const g = goals.filter((x) => ids.includes(x.machine_id)).reduce((s, x) => s + x.goal, 0);
      const r = entries.filter((x) => ids.includes(x.machine_id)).reduce((s, x) => s + x.quantity, 0);
      const pct = g > 0 ? Math.round((r / g) * 100) : 0;
      return { name: area.name, value: pct, realizado: r, meta: g };
    })
    .filter((d) => d.meta > 0);

  // OPERATOR BAR: produção por operador
  const opMap = new Map<string, number>();
  entries.forEach((e) => {
    const op = operators.find((o) => o.machine_id === e.machine_id)?.operator_name?.trim();
    if (!op) return;
    opMap.set(op, (opMap.get(op) ?? 0) + e.quantity);
  });
  const opData = Array.from(opMap.entries())
    .map(([name, value]) => ({ name, Produzido: value }))
    .sort((a, b) => b.Produzido - a.Produzido)
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <DatePicker value={date} onChange={setDate} />
        {visibleAreas.length > 1 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Área</div>
            <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setMachineFilter("all"); }}>
              <SelectTrigger className="h-10 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {visibleAreas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Máquina</div>
          <Select value={machineFilter} onValueChange={setMachineFilter}>
            <SelectTrigger className="h-10 w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {allMachines
                .filter((m) => areaFilter === "all" || m.area_id === areaFilter)
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="h-10 items-center px-3">
          {formatDateBR(date)}
        </Badge>
        {!restrictAreaIds && (
          <Button
            type="button"
            variant="outline"
            className="ml-auto h-10 gap-2"
            onClick={() =>
              exportReportCsv({
                date,
                areas: visibleAreas,
                machines: filteredMachines,
                goals,
                entries,
                operators,
                justifications,
                overtime,
              })
            }
          >
            <Download className="h-4 w-4" />
            Exportar relatório
          </Button>
        )}
      </div>

      <KpiRow goals={goals} entries={entries} machines={filteredMachines} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Meta vs Realizado por máquina</CardTitle></CardHeader>
          <CardContent>
            <ChartWrap empty={barData.every((d) => !d.Meta && !d.Realizado)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Meta" fill="#94a3b8" radius={3} />
                <Bar dataKey="Realizado" fill="#2563eb" radius={3} />
              </BarChart>
            </ChartWrap>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Produção acumulada vs meta horária</CardTitle></CardHeader>
          <CardContent>
            <ChartWrap empty={totalGoal === 0 && acc === 0}>
              <LineChart data={lineDataAcc}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hora" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Meta" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="Acumulado" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ChartWrap>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">% de cumprimento por área</CardTitle></CardHeader>
          <CardContent>
            <ChartWrap empty={pieData.length === 0}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(d: { name: string; value: number }) => `${d.name}: ${d.value}%`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ChartWrap>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Produção por operador</CardTitle></CardHeader>
          <CardContent>
            <ChartWrap empty={opData.length === 0}>
              <BarChart data={opData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Produzido" fill="#7c3aed" radius={3} />
              </BarChart>
            </ChartWrap>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Mapa de calor — produção por hora
            {overtime && <span className="ml-2 text-xs font-normal text-warning">• hora extra ativa (até 19h)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap
            machines={filteredMachines}
            areas={visibleAreas}
            entries={entries}
            goals={goals}
            operators={operators}
            overtime={overtime}
            date={date}
          />
        </CardContent>
      </Card>

      <ObservationsCard
        machines={filteredMachines}
        areas={visibleAreas}
        entries={entries}
      />

      <JustificationsCard
        machines={filteredMachines}
        areas={visibleAreas}
        goals={goals}
        entries={entries}
        justifications={justifications}
        date={date}
      />
    </div>
  );
}

function ObservationsCard({
  machines,
  areas,
  entries,
}: {
  machines: Machine[];
  areas: Area[];
  entries: { machine_id: string; hour_slot: number; observation: string | null }[];
}) {
  const withObs = entries.filter((e) => e.observation && e.observation.trim().length > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Observações dos apontamentos</CardTitle>
      </CardHeader>
      <CardContent>
        {withObs.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Nenhuma observação registrada pelos líderes neste dia.
          </div>
        ) : (
          <div className="space-y-3">
            {areas.map((area) => {
              const areaMachineIds = machines
                .filter((m) => m.area_id === area.id)
                .map((m) => m.id);
              const areaObs = withObs.filter((e) => areaMachineIds.includes(e.machine_id));
              if (!areaObs.length) return null;
              return (
                <div key={area.id} className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {area.name}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {areaObs
                      .sort((a, b) => a.hour_slot - b.hour_slot)
                      .map((e, i) => {
                        const m = machines.find((x) => x.id === e.machine_id);
                        return (
                          <li
                            key={`${e.machine_id}-${e.hour_slot}-${i}`}
                            className="flex flex-wrap gap-2 rounded border bg-muted/30 px-2 py-1"
                          >
                            <Badge variant="outline" className="text-[10px]">
                              {m?.name ?? "—"}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              slot {e.hour_slot}
                            </Badge>
                            <span className="text-foreground">{e.observation}</span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JustificationsCard({
  machines,
  areas,
  goals,
  entries,
  justifications,
  date,
}: {
  machines: Machine[];
  areas: Area[];
  goals: { machine_id: string; goal: number }[];
  entries: { machine_id: string; quantity: number }[];
  justifications: { machine_id: string; justification: string }[];
  date: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const rows = machines
    .map((m) => {
      const goal = goals.find((g) => g.machine_id === m.id)?.goal ?? 0;
      const realized = entries
        .filter((e) => e.machine_id === m.id)
        .reduce((s, e) => s + e.quantity, 0);
      const just = justifications.find((j) => j.machine_id === m.id)?.justification ?? "";
      return { machine: m, goal, realized, justification: just };
    })
    .filter((r) => (r.goal > 0 && r.realized < r.goal) || r.justification);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Justificativas de meta não cumprida</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Todas as metas foram cumpridas ou nenhuma meta registrada.
          </div>
        ) : (
          <div className="space-y-4">
            {areas.map((area) => {
              const areaRows = rows.filter((r) => r.machine.area_id === area.id);
              if (!areaRows.length) return null;
              return (
                <div key={area.id} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {area.name}
                  </div>
                  {areaRows.map((r) => (
                    <JustificationRow
                      key={r.machine.id}
                      machineName={r.machine.name}
                      machineId={r.machine.id}
                      goal={r.goal}
                      realized={r.realized}
                      current={r.justification}
                      userId={user?.id ?? ""}
                      date={date}
                      onSaved={() =>
                        qc.invalidateQueries({ queryKey: ["justifications", date] })
                      }
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JustificationRow({
  machineName,
  machineId,
  goal,
  realized,
  current,
  userId,
  date,
  onSaved,
}: {
  machineName: string;
  machineId: string;
  goal: number;
  realized: number;
  current: string;
  userId: string;
  date: string;
  onSaved: () => void;
}) {
  const [val, setVal] = useState(current);
  const pct = goal > 0 ? Math.round((realized / goal) * 100) : 0;
  const save = async () => {
    if (val.trim() === current.trim()) return;
    if (!userId) return;
    try {
      await upsertJustification(machineId, date, val.trim(), userId);
      toast.success("Justificativa salva");
      onSaved();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao salvar justificativa");
    }
  };
  return (
    <div className="space-y-1 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{machineName}</span>
        <Badge variant="outline" className="text-[10px]">
          {realized} / {goal} ({pct}%)
        </Badge>
        {!current && goal > 0 && realized < goal && (
          <Badge className="bg-destructive text-destructive-foreground text-[10px]">
            justificativa pendente
          </Badge>
        )}
      </div>
      <Textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        placeholder="Justificativa para a meta não cumprida"
        rows={2}
        className="resize-none text-sm"
      />
    </div>
  );
}

function ChartWrap({ children, empty }: { children: React.ReactElement; empty: boolean }) {
  if (empty) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Sem dados para o período selecionado
      </div>
    );
  }
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function KpiRow({
  goals,
  entries,
  machines,
}: {
  goals: { machine_id: string; goal: number }[];
  entries: { machine_id: string; quantity: number }[];
  machines: Machine[];
}) {
  const totalMeta = goals.reduce((s, g) => s + g.goal, 0);
  const totalReal = entries.reduce((s, e) => s + e.quantity, 0);
  const pct = totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0;
  const desvio = totalReal - totalMeta;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi label="Máquinas" value={String(machines.length)} />
      <Kpi label="Meta total" value={String(totalMeta)} />
      <Kpi label="Realizado" value={String(totalReal)} />
      <Kpi
        label="% Meta"
        value={`${pct}%`}
        tone={pct >= 100 ? "success" : pct >= 70 ? "warning" : "destructive"}
        sub={`Desvio: ${desvio > 0 ? "+" : ""}${desvio}`}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 text-2xl font-bold",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}
        </div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Heatmap({
  machines,
  areas,
  entries,
  goals,
  operators,
  overtime,
  date,
}: {
  machines: Machine[];
  areas: Area[];
  entries: { machine_id: string; hour_slot: number; quantity: number }[];
  goals: { machine_id: string; goal: number }[];
  operators: { machine_id: string; operator_name: string }[];
  overtime: boolean;
  date: string;
}) {
  if (machines.length === 0) {
    return <div className="text-sm text-muted-foreground">Selecione filtros para visualizar.</div>;
  }
  const slots = getApontamentoSlots(date);
  const goalSlots = getGoalTimeSlots(overtime, date);
  const goalSlotsCount = goalSlots.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card px-2 py-1 text-left font-semibold">Máquina</th>
            {slots.map((s, i) => (
              <Fragment key={`th-${s.index}`}>
                {i === 5 && (
                  <th
                    key="lunch-h"
                    className="px-1 py-1 text-center text-[10px] font-medium text-muted-foreground"
                  >
                    {LUNCH_LABEL}
                  </th>
                )}
                <th key={s.index} className="px-1 py-1 text-center font-medium text-muted-foreground">
                  {s.label}
                </th>
              </Fragment>
            ))}
            <th className="px-2 py-1 text-center font-semibold">Meta/h</th>
            <th className="px-2 py-1 text-center font-semibold">Meta total</th>
            <th className="px-2 py-1 text-center font-semibold">Realizado</th>
            <th className="px-2 py-1 text-center font-semibold">% Meta</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => {
            const ams = machines.filter((m) => m.area_id === area.id);
            if (!ams.length) return null;
            return (
              <Fragment key={`area-${area.id}`}>
                <tr>
                  <td colSpan={slots.length + 6} className="bg-muted px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {area.name}
                  </td>
                </tr>
                {ams.map((m) => {
                  const goal = goals.find((g) => g.machine_id === m.id)?.goal ?? 0;
                  const expectedPerHour = goal / goalSlotsCount;
                  const operator = operators.find((o) => o.machine_id === m.id)?.operator_name?.trim();
                  const realized = entries
                    .filter((x) => x.machine_id === m.id)
                    .reduce((s, x) => s + x.quantity, 0);
                  const pct = goal > 0 ? Math.round((realized / goal) * 100) : 0;
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="sticky left-0 bg-card px-2 py-1 font-medium">
                        <div>{m.name}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {operator ? `Op.: ${operator}` : "Sem operador"}
                        </div>
                      </td>
                      {slots.map((s, i) => {
                        const e = entries.find((x) => x.machine_id === m.id && x.hour_slot === s.index);
                        const inGoal = goalSlots.some((g) => g.index === s.index);
                        const lunchCell = i === 5 ? (
                          <td key={`lunch-${m.id}`} className="bg-muted/40 px-1 py-1 text-center text-[10px] text-muted-foreground">
                            almoço
                          </td>
                        ) : null;
                        if (!e) {
                          return (
                            <Fragment key={`c-${s.index}`}>
                              {lunchCell}
                              <td key={s.index} className="px-1 py-1 text-center">
                                <Cell2 tone="empty" />
                                {goal > 0 && inGoal && (
                                  <div className="mt-0.5 text-[9px] text-muted-foreground">
                                    meta {Math.round(expectedPerHour * (s.minutes / 60))}
                                  </div>
                                )}
                                {!inGoal && (
                                  <div className="mt-0.5 text-[9px] text-muted-foreground">extra</div>
                                )}
                              </td>
                            </Fragment>
                          );
                        }
                        const tone =
                          goal === 0
                            ? "neutral"
                            : !inGoal
                            ? "neutral"
                            : e.quantity >= expectedPerHour
                            ? "ok"
                            : e.quantity >= expectedPerHour * 0.7
                            ? "warn"
                            : "bad";
                        return (
                          <Fragment key={`c-${s.index}`}>
                            {lunchCell}
                            <td key={s.index} className="px-1 py-1 text-center">
                              <Cell2 tone={tone} value={e.quantity} />
                              {goal > 0 && inGoal && (
                                <div className="mt-0.5 text-[9px] text-muted-foreground">
                                  meta {Math.round(expectedPerHour * (s.minutes / 60))}
                                </div>
                              )}
                              {!inGoal && (
                                <div className="mt-0.5 text-[9px] text-muted-foreground">extra</div>
                              )}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-2 py-1 text-center font-semibold">
                        {goal > 0 ? Math.round(expectedPerHour) : "—"}
                      </td>
                      <td className="px-2 py-1 text-center font-semibold">{goal || "—"}</td>
                      <td className="px-2 py-1 text-center font-semibold">{realized}</td>
                      <td
                        className={cn(
                          "px-2 py-1 text-center font-bold",
                          goal === 0
                            ? "text-muted-foreground"
                            : pct >= 100
                            ? "text-success"
                            : pct >= 70
                            ? "text-warning"
                            : "text-destructive",
                        )}
                      >
                        {goal > 0 ? `${pct}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell2({ tone, value }: { tone: "ok" | "warn" | "bad" | "empty" | "neutral"; value?: number }) {
  const map = {
    ok: "bg-success text-success-foreground",
    warn: "bg-warning text-warning-foreground",
    bad: "bg-destructive text-destructive-foreground",
    empty: "bg-muted text-muted-foreground border border-dashed",
    neutral: "bg-secondary text-secondary-foreground",
  } as const;
  return (
    <div className={cn("mx-auto flex h-7 w-10 items-center justify-center rounded text-[11px] font-bold", map[tone])}>
      {value ?? "—"}
    </div>
  );
}