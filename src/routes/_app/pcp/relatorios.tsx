import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAreas,
  fetchMachines,
  fetchEntriesRange,
  fetchGoalsRange,
  fetchOperatorsForDate,
  fetchOperatorsRange,
} from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayIso, formatDateBR, TIME_SLOTS } from "@/lib/time-slots";
import { useAuth } from "@/lib/auth-context";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  ComposedChart,
  LabelList,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_app/pcp/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { isPcp } = useAuth();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [areaFilter, setAreaFilter] = useState<string>("all");

  // Mês selecionado para os indicadores (YYYY-MM). Default = mês atual.
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [dailySector, setDailySector] = useState<string>("all");
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

  const filteredMachines = useMemo(() => {
    const ms = machinesQ.data ?? [];
    if (areaFilter === "all") return ms;
    return ms.filter((m) => m.area_id === areaFilter);
  }, [machinesQ.data, areaFilter]);

  const machineIds = filteredMachines.map((m) => m.id);
  const entriesQ = useQuery({
    queryKey: ["entries-range", from, to, machineIds.join(",")],
    queryFn: () => fetchEntriesRange(from, to, machineIds),
    enabled: machineIds.length > 0,
  });
  const goalsQ = useQuery({
    queryKey: ["goals-range", from, to, machineIds.join(",")],
    queryFn: () => fetchGoalsRange(from, to, machineIds),
    enabled: machineIds.length > 0,
  });
  const operatorsTodayQ = useQuery({
    queryKey: ["operators", to, machineIds.join(",")],
    queryFn: () => fetchOperatorsForDate(to, machineIds),
    enabled: machineIds.length > 0,
  });

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

  const COLORS = [
    "hsl(221 83% 53%)",
    "hsl(142 71% 45%)",
    "hsl(38 92% 50%)",
    "hsl(0 72% 51%)",
    "hsl(262 83% 58%)",
    "hsl(178 78% 38%)",
    "hsl(24 95% 53%)",
    "hsl(199 89% 48%)",
  ];
  const areaColor = (idx: number) => COLORS[idx % COLORS.length];

  // Indicador 1: Meta diária por setor (por dia do mês)
  const dailyGoalBySector = useMemo(() => {
    const goals = monthGoalsQ.data ?? [];
    const rows: Record<string, number | string>[] = [];
    for (let d = 1; d <= monthRange.days; d++) {
      const iso = `${month}-${String(d).padStart(2, "0")}`;
      const row: Record<string, number | string> = { day: String(d) };
      areas.forEach((a) => (row[a.name] = 0));
      goals
        .filter((g) => g.goal_date === iso)
        .forEach((g) => {
          const areaId = machineToArea.get(g.machine_id);
          const area = areas.find((a) => a.id === areaId);
          if (!area) return;
          row[area.name] = (row[area.name] as number) + g.goal;
        });
      rows.push(row);
    }
    return rows;
  }, [monthGoalsQ.data, areas, monthRange, month, machineToArea]);

  // Série diária do setor selecionado (meta, realizado e % meta por dia)
  const dailySectorSeries = useMemo(() => {
    if (dailySector === "all") return [];
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
    return areas.map((a) => {
      const machineIdsOfArea = allMachines.filter((m) => m.area_id === a.id).map((m) => m.id);
      const meta = goals
        .filter((g) => machineIdsOfArea.includes(g.machine_id))
        .reduce((s, g) => s + g.goal, 0);
      const realizado = entries
        .filter((e) => machineIdsOfArea.includes(e.machine_id))
        .reduce((s, e) => s + e.quantity, 0);
      return { setor: a.name, Meta: meta, Realizado: realizado };
    });
  }, [monthGoalsQ.data, monthEntriesQ.data, areas, allMachines]);

  // Indicador 3: Funcionário do mês por setor
  const employeeOfMonthBySector = useMemo(() => {
    const entries = monthEntriesQ.data ?? [];
    const operators = monthOperatorsQ.data ?? [];
    // chave: machine_id|log_date -> operator_name
    const opMap = new Map<string, string>();
    operators.forEach((o) => {
      const name = (o.operator_name ?? "").trim();
      if (name) opMap.set(`${o.machine_id}|${o.log_date}`, name);
    });
    return areas.map((a) => {
      const machineIdsOfArea = new Set(allMachines.filter((m) => m.area_id === a.id).map((m) => m.id));
      const totals = new Map<string, number>();
      entries
        .filter((e) => machineIdsOfArea.has(e.machine_id))
        .forEach((e) => {
          const op = opMap.get(`${e.machine_id}|${e.entry_date}`);
          if (!op) return;
          totals.set(op, (totals.get(op) ?? 0) + e.quantity);
        });
      const ranked = Array.from(totals.entries()).sort((x, y) => y[1] - x[1]);
      const top = ranked[0];
      return { setor: a.name, operador: top?.[0] ?? "—", total: top?.[1] ?? 0 };
    });
  }, [monthEntriesQ.data, monthOperatorsQ.data, areas, allMachines]);

  if (!isPcp) return <div>Acesso restrito ao PCP.</div>;


  const exportDailyByArea = () => {
    if (!entriesQ.data || !goalsQ.data) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Relatório Diário de Produção — ${formatDateBR(to)}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Filtro: ${areaFilter === "all" ? "Todas as áreas" : areas.find((a) => a.id === areaFilter)?.name}`, 14, 22);

    const dayEntries = entriesQ.data.filter((e) => e.entry_date === to);
    const dayGoals = goalsQ.data.filter((g) => g.goal_date === to);

    let y = 30;
    areas
      .filter((a) => areaFilter === "all" || a.id === areaFilter)
      .forEach((area) => {
        const ms = filteredMachines.filter((m) => m.area_id === area.id);
        if (!ms.length) return;
        const rows = ms.map((m) => {
          const goal = dayGoals.find((g) => g.machine_id === m.id)?.goal ?? 0;
          const real = dayEntries.filter((e) => e.machine_id === m.id).reduce((s, e) => s + e.quantity, 0);
          const op = operatorsTodayQ.data?.find((o) => o.machine_id === m.id)?.operator_name ?? "—";
          const pct = goal > 0 ? `${Math.round((real / goal) * 100)}%` : "—";
          return [m.name, op, String(goal), String(real), pct];
        });
        doc.setFontSize(11);
        doc.text(area.name, 14, y);
        autoTable(doc, {
          startY: y + 2,
          head: [["Máquina", "Operador", "Meta", "Realizado", "% Meta"]],
          body: rows,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [37, 99, 235] },
        });
        type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
        y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 20;
        y += 8;
      });

    doc.save(`producao-diaria-${to}.pdf`);
    toast.success("PDF gerado");
  };

  const exportEfficiency = () => {
    if (!entriesQ.data || !goalsQ.data) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Eficiência por Máquina — ${formatDateBR(from)} a ${formatDateBR(to)}`, 14, 16);

    const rows = filteredMachines.map((m) => {
      const ents = entriesQ.data!.filter((e) => e.machine_id === m.id);
      const gs = goalsQ.data!.filter((g) => g.machine_id === m.id);
      const totalGoal = gs.reduce((s, g) => s + g.goal, 0);
      const totalReal = ents.reduce((s, e) => s + e.quantity, 0);
      const pct = totalGoal > 0 ? `${Math.round((totalReal / totalGoal) * 100)}%` : "—";
      return [m.name, String(totalGoal), String(totalReal), String(totalReal - totalGoal), pct];
    });

    autoTable(doc, {
      startY: 22,
      head: [["Máquina", "Meta período", "Realizado", "Desvio", "% Meta"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`eficiencia-${from}-a-${to}.pdf`);
    toast.success("PDF gerado");
  };

  const exportByOperator = () => {
    if (!entriesQ.data) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Histórico por Operador — ${formatDateBR(from)} a ${formatDateBR(to)}`, 14, 16);

    const opMap = new Map<string, number>();
    entriesQ.data.forEach((e) => {
      const op = operatorsTodayQ.data?.find((o) => o.machine_id === e.machine_id)?.operator_name?.trim();
      const key = op || "(sem operador)";
      opMap.set(key, (opMap.get(key) ?? 0) + e.quantity);
    });

    const rows = Array.from(opMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, q]) => [name, String(q)]);

    autoTable(doc, {
      startY: 22,
      head: [["Operador", "Total produzido"]],
      body: rows,
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`operadores-${from}-a-${to}.pdf`);
    toast.success("PDF gerado");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Indicadores da Produção</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe os principais indicadores do mês e gere relatórios em PDF.
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
                  {dailySector === "all"
                    ? "Soma das metas cadastradas para cada dia do mês, agrupada por setor."
                    : "% da meta atingida por dia para o setor selecionado."}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Setor</Label>
                <Select value={dailySector} onValueChange={setDailySector}>
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os setores</SelectItem>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {dailySector === "all" ? (
                  <LineChart data={dailyGoalBySector}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {areas.map((a, idx) => (
                      <Line
                        key={a.id}
                        type="monotone"
                        dataKey={a.name}
                        stroke={areaColor(idx)}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                ) : (
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
                )}
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
                  <XAxis dataKey="setor" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Meta" fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Realizado" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Indicador 3 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Funcionário do mês por setor</h3>
            <p className="text-xs text-muted-foreground">
              Operador com maior produção acumulada em cada setor no mês.
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
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold">{row.total.toLocaleString("pt-BR")}</span>
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

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Relatórios em PDF</h2>
        <p className="text-sm text-muted-foreground">Gere relatórios detalhados do período selecionado.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-[180px]" />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-[180px]" />
          </div>
          <div className="space-y-1">
            <Label>Área</Label>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="h-10 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Produção diária por área</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Resumo do dia <strong>{formatDateBR(to)}</strong> com meta, realizado e operador por máquina.
            </p>
            <Button onClick={exportDailyByArea} className="w-full">
              <FileDown className="mr-2 h-4 w-4" /> Gerar PDF
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Eficiência por máquina</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Total realizado vs meta no período selecionado.
            </p>
            <Button onClick={exportEfficiency} className="w-full">
              <FileDown className="mr-2 h-4 w-4" /> Gerar PDF
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Histórico por operador</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Total produzido por operador no período (com base no operador atual da máquina).
            </p>
            <Button onClick={exportByOperator} className="w-full">
              <FileDown className="mr-2 h-4 w-4" /> Gerar PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Lembrete: cada dia tem {TIME_SLOTS.length} intervalos horários (07:30 às 17:00).
      </p>
    </div>
  );
}