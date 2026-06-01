import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAreas,
  fetchMachines,
  fetchEntriesRange,
  fetchGoalsRange,
  fetchOperatorsRange,
} from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayIso } from "@/lib/time-slots";
import { useAuth } from "@/lib/auth-context";
import { Trophy } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LabelList,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_app/pcp/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { isPcp } = useAuth();
  // Mês selecionado para os indicadores (YYYY-MM). Default = mês atual.
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [dailySector, setDailySector] = useState<string>("");
  const monthRange = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, (m ?? 1) - 1, 1);
    const last = new Date(y, m ?? 1, 0);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: fmt(first), to: fmt(last), days: last.getDate() };
  }, [month]);

  const areasQ = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const machinesQ = useQuery({ queryKey: ["machines", "all"], queryFn: () => fetchMachines() });

  // Dados do mês inteiro (todas as máquinas) para os indicadores
  const allMachineIds = useMemo(() => (machinesQ.data ?? []).map((m) => m.id), [machinesQ.data]);
  const monthEntriesQ = useQuery({
    queryKey: ["entries-range", monthRange.from, monthRange.to, "all"],
    queryFn: () => fetchEntriesRange(monthRange.from, monthRange.to, allMachineIds),
    enabled: allMachineIds.length > 0,
  });
  const monthGoalsQ = useQuery({
    queryKey: ["goals-range", monthRange.from, monthRange.to, "all"],
    queryFn: () => fetchGoalsRange(monthRange.from, monthRange.to, allMachineIds),
    enabled: allMachineIds.length > 0,
  });
  const monthOperatorsQ = useQuery({
    queryKey: ["operators-range", monthRange.from, monthRange.to, "all"],
    queryFn: () => fetchOperatorsRange(monthRange.from, monthRange.to, allMachineIds),
    enabled: allMachineIds.length > 0,
  });

  const areas = areasQ.data ?? [];
  const allMachines = machinesQ.data ?? [];
  const machineToArea = new Map(allMachines.map((m) => [m.id, m.area_id]));

  // Define padrão do setor para "Metalurgia" assim que as áreas carregarem
  useEffect(() => {
    if (dailySector) return;
    if (areas.length === 0) return;
    const metalurgia = areas.find((a) => a.name.toLowerCase().includes("metalurgia"));
    setDailySector(metalurgia?.id ?? areas[0].id);
  }, [areas, dailySector]);

  // Série diária do setor selecionado (meta, realizado e % meta por dia)
  const dailySectorSeries = useMemo(() => {
    if (!dailySector) return [];
    const goals = monthGoalsQ.data ?? [];
    const entries = monthEntriesQ.data ?? [];
    const machineIdsOfArea = new Set(
      allMachines.filter((m) => m.area_id === dailySector).map((m) => m.id),
    );
    const rows: { day: string; Meta: number; Realizado: number; pct: number | null }[] = [];
    for (let d = 1; d <= monthRange.days; d++) {
      const iso = `${month}-${String(d).padStart(2, "0")}`;
      const meta = goals
        .filter((g) => g.goal_date === iso && machineIdsOfArea.has(g.machine_id))
        .reduce((s, g) => s + g.goal, 0);
      const realizado = entries
        .filter((e) => e.entry_date === iso && machineIdsOfArea.has(e.machine_id))
        .reduce((s, e) => s + e.quantity, 0);
      const pct = meta > 0 ? Math.round((realizado / meta) * 100) : null;
      rows.push({ day: String(d), Meta: meta, Realizado: realizado, pct });
    }
    return rows;
  }, [dailySector, monthGoalsQ.data, monthEntriesQ.data, allMachines, monthRange, month]);

  // Indicador 2: Meta total x realizado por setor (mês)
  const totalBySector = useMemo(() => {
    const goals = monthGoalsQ.data ?? [];
    const entries = monthEntriesQ.data ?? [];
    const rows = areas.map((a) => {
      const machineIdsOfArea = allMachines.filter((m) => m.area_id === a.id).map((m) => m.id);
      const meta = goals
        .filter((g) => machineIdsOfArea.includes(g.machine_id))
        .reduce((s, g) => s + g.goal, 0);
      const realizado = entries
        .filter((e) => machineIdsOfArea.includes(e.machine_id))
        .reduce((s, e) => s + e.quantity, 0);
      const pct = meta > 0 ? Math.round((realizado / meta) * 100) : 0;
      return { setor: a.name, Meta: meta, Realizado: realizado, pct, isBest: false };
    });
    let bestIdx = -1;
    let bestPct = -1;
    rows.forEach((r, i) => {
      if (r.Meta > 0 && r.pct > bestPct) {
        bestPct = r.pct;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) rows[bestIdx].isBest = true;
    return rows;
  }, [monthGoalsQ.data, monthEntriesQ.data, areas, allMachines]);

  // Indicador 3: Funcionário do mês por setor
  const employeeOfMonthBySector = useMemo(() => {
    const entries = monthEntriesQ.data ?? [];
    const operators = monthOperatorsQ.data ?? [];
    const goals = monthGoalsQ.data ?? [];

    // machine_id|log_date -> lista de operadores no dia (multi)
    const opsByMachineDay = new Map<string, string[]>();
    operators.forEach((o) => {
      const name = (o.operator_name ?? "").trim();
      if (!name) return;
      const key = `${o.machine_id}|${o.log_date}`;
      const list = opsByMachineDay.get(key) ?? [];
      if (!list.includes(name)) list.push(name);
      opsByMachineDay.set(key, list);
    });

    const goalByMachineDay = new Map<string, number>();
    goals.forEach((g) => {
      goalByMachineDay.set(`${g.machine_id}|${g.goal_date}`, g.goal);
    });
    const realByMachineDay = new Map<string, number>();
    entries.forEach((e) => {
      const key = `${e.machine_id}|${e.entry_date}`;
      realByMachineDay.set(key, (realByMachineDay.get(key) ?? 0) + e.quantity);
    });

    return areas.map((a) => {
      const machineIdsOfArea = new Set(
        allMachines.filter((m) => m.area_id === a.id).map((m) => m.id),
      );
      // operator -> meta e realizado atribuídos (share = 1/N na máquina/dia)
      const totals = new Map<string, { meta: number; real: number }>();

      const keys = new Set<string>([
        ...opsByMachineDay.keys(),
        ...realByMachineDay.keys(),
      ]);
      keys.forEach((key) => {
        const machineId = key.split("|")[0];
        if (!machineIdsOfArea.has(machineId)) return;
        const ops = opsByMachineDay.get(key) ?? [];
        if (ops.length === 0) return;
        const meta = goalByMachineDay.get(key) ?? 0;
        const real = realByMachineDay.get(key) ?? 0;
        const share = 1 / ops.length;
        const metaShare = meta * share;
        const realShare = real * share;
        ops.forEach((op) => {
          const cur = totals.get(op) ?? { meta: 0, real: 0 };
          cur.meta += metaShare;
          cur.real += realShare;
          totals.set(op, cur);
        });
      });

      const ranked = Array.from(totals.entries())
        .map(([op, v]) => ({
          op,
          meta: v.meta,
          real: v.real,
          pct: v.meta > 0 ? (v.real / v.meta) * 100 : 0,
        }))
        .filter((x) => x.meta > 0 && x.pct >= 95)
        .sort((x, y) => y.pct - x.pct);

      const top = ranked[0];
      return {
        setor: a.name,
        operador: top?.op ?? "—",
        pct: top ? Math.round(top.pct) : 0,
        meta: top ? Math.round(top.meta) : 0,
        real: top ? Math.round(top.real) : 0,
      };
    });
  }, [monthEntriesQ.data, monthOperatorsQ.data, monthGoalsQ.data, areas, allMachines]);

  if (!isPcp) return <div>Acesso restrito ao PCP.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Indicadores da Produção</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe os principais indicadores do mês.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Indicadores do mês</CardTitle>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mês</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-9 w-[160px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Indicador 1 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Meta diária por setor</h3>
                <p className="text-xs text-muted-foreground">
                  % da meta atingida por dia para o setor selecionado.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Setor</Label>
                <Select value={dailySector} onValueChange={setDailySector}>
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySectorSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(value: number) => [`${value}%`, "% Meta"]} />
                    <Bar dataKey="pct" name="% Meta" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="pct" position="top" formatter={(v: number | null) => (v != null ? `${v}%` : "")} fontSize={10} />
                      {dailySectorSeries.map((entry, index) => {
                        const pct = entry.pct ?? 0;
                        let fill = "hsl(0 72% 51%)"; // vermelho
                        if (pct >= 130) fill = "hsl(199 89% 48%)"; // azul
                        else if (pct >= 100) fill = "hsl(142 71% 45%)"; // verde
                        else if (pct >= 90) fill = "hsl(38 92% 50%)"; // amarelo
                        return <Cell key={`cell-${index}`} fill={fill} />;
                      })}
                    </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Indicador 2 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Meta total x Realizado por setor</h3>
            <p className="text-xs text-muted-foreground">
              Comparativo do total de meta versus produção realizada no mês.
            </p>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalBySector}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="setor"
                    fontSize={11}
                    tick={(props) => {
                      const { x, y, payload } = props;
                      const row = totalBySector.find((r) => r.setor === payload.value);
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={12}
                            textAnchor="middle"
                            fontSize={11}
                            fill="hsl(var(--muted-foreground))"
                          >
                            {payload.value}
                            {row?.isBest ? " ⭐" : ""}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Meta" fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Realizado" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="pct"
                      position="top"
                      formatter={(v: number) => `${v}%`}
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Indicador 3 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Funcionário do mês por setor</h3>
            <p className="text-xs text-muted-foreground">
              Colaborador com maior % de atingimento da meta no setor, desde que tenha
              atingido pelo menos 95% (divisão proporcional quando há mais de um colaborador no mesmo posto).
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {employeeOfMonthBySector.map((row) => (
                <div
                  key={row.setor}
                  className="flex items-center justify-between rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{row.setor}</p>
                    <p className="truncate font-medium">{row.operador}</p>
                    {row.operador !== "—" && (
                      <p className="text-[11px] text-muted-foreground">
                        {row.real.toLocaleString("pt-BR")} /{" "}
                        {row.meta.toLocaleString("pt-BR")} peças
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold">
                      {row.operador === "—" ? "—" : `${row.pct}%`}
                    </span>
                  </div>
                </div>
              ))}
              {employeeOfMonthBySector.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}