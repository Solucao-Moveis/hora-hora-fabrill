import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchViewerDashboard } from "@/lib/viewer.functions";
import { TIME_SLOTS, todayIso, formatDateBR, LUNCH_LABEL } from "@/lib/time-slots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/app/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { Factory, Eye } from "lucide-react";

export const Route = createFileRoute("/view/$token")({
  component: ViewerPage,
});

function ViewerPage() {
  const { token } = Route.useParams();
  const [date, setDate] = useState(todayIso());
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["viewer", token, date],
    queryFn: () => fetchViewerDashboard({ data: { token, date } }),
    retry: false,
  });

  const data = q.data;
  const filteredMachines = useMemo(
    () => (data?.machines ?? []).filter((m) => areaFilter === "all" || m.area_id === areaFilter),
    [data, areaFilter],
  );

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (q.isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Acesso indisponível</h1>
          <p className="text-sm text-muted-foreground">
            {(q.error as Error)?.message ?? "Link inválido."}
          </p>
        </div>
      </div>
    );
  }

  const visibleAreas = data.areas;

  const totalMeta = data.goals
    .filter((g) => filteredMachines.some((m) => m.id === g.machine_id))
    .reduce((s, g) => s + g.goal, 0);
  const totalReal = data.entries
    .filter((e) => filteredMachines.some((m) => m.id === e.machine_id))
    .reduce((s, e) => s + e.quantity, 0);
  const pct = totalMeta > 0 ? Math.round((totalReal / totalMeta) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Factory className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Produção Hora a Hora</div>
            <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Eye className="h-3 w-3" /> Visualização — {data.viewerName}
            </div>
          </div>
          <Badge variant="outline" className="ml-auto">Somente leitura</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <DatePicker value={date} onChange={setDate} />
          {visibleAreas.length > 1 && (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Área</div>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
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
          <Badge variant="outline" className="h-10 items-center px-3">{formatDateBR(date)}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Máquinas" value={String(filteredMachines.length)} />
          <KpiCard label="Meta total" value={String(totalMeta)} />
          <KpiCard label="Realizado" value={String(totalReal)} />
          <KpiCard label="% Meta" value={`${pct}%`} tone={pct >= 100 ? "success" : pct >= 70 ? "warning" : "destructive"} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapa de calor — produção por hora</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapView
              machines={filteredMachines}
              areas={visibleAreas}
              entries={data.entries}
              goals={data.goals}
              operators={data.operators}
              overtime={data.overtime}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "destructive" }) {
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
      </CardContent>
    </Card>
  );
}

type Machine = { id: string; area_id: string; name: string };
type Area = { id: string; name: string };

function HeatmapView({
  machines,
  areas,
  entries,
  goals,
  operators,
  overtime,
}: {
  machines: Machine[];
  areas: Area[];
  entries: { machine_id: string; hour_slot: number; quantity: number }[];
  goals: { machine_id: string; goal: number }[];
  operators: { machine_id: string; operator_name: string }[];
  overtime: boolean;
}) {
  if (machines.length === 0) {
    return <div className="text-sm text-muted-foreground">Sem máquinas para exibir.</div>;
  }
  const goalSlots = overtime ? TIME_SLOTS : TIME_SLOTS.filter((s) => s.index <= 8);
  const goalSlotsCount = goalSlots.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card px-2 py-1 text-left font-semibold">Máquina</th>
            {TIME_SLOTS.map((s, i) => (
              <Fragment key={`th-${s.index}`}>
                {i === 5 && (
                  <th className="px-1 py-1 text-center text-[10px] font-medium text-muted-foreground">
                    {LUNCH_LABEL}
                  </th>
                )}
                <th className="px-1 py-1 text-center font-medium text-muted-foreground">{s.label}</th>
              </Fragment>
            ))}
            <th className="px-2 py-1 text-center font-semibold">Meta/h</th>
            <th className="px-2 py-1 text-center font-semibold">Meta</th>
            <th className="px-2 py-1 text-center font-semibold">Real.</th>
            <th className="px-2 py-1 text-center font-semibold">%</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => {
            const ams = machines.filter((m) => m.area_id === area.id);
            if (!ams.length) return null;
            return (
              <Fragment key={area.id}>
                <tr>
                  <td colSpan={TIME_SLOTS.length + 6} className="bg-muted px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {area.name}
                  </td>
                </tr>
                {ams.map((m) => {
                  const goal = goals.find((g) => g.machine_id === m.id)?.goal ?? 0;
                  const expectedPerHour = goal / goalSlotsCount;
                  const operator = operators.find((o) => o.machine_id === m.id)?.operator_name?.trim();
                  const realized = entries.filter((x) => x.machine_id === m.id).reduce((s, x) => s + x.quantity, 0);
                  const pct = goal > 0 ? Math.round((realized / goal) * 100) : 0;
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="sticky left-0 bg-card px-2 py-1 font-medium">
                        <div>{m.name}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {operator ? `Op.: ${operator}` : "Sem operador"}
                        </div>
                      </td>
                      {TIME_SLOTS.map((s, i) => {
                        const e = entries.find((x) => x.machine_id === m.id && x.hour_slot === s.index);
                        const inGoal = goalSlots.some((g) => g.index === s.index);
                        const qty = e?.quantity;
                        const tone =
                          qty == null
                            ? "empty"
                            : goal === 0 || !inGoal
                            ? "neutral"
                            : qty >= expectedPerHour
                            ? "ok"
                            : qty >= expectedPerHour * 0.7
                            ? "warn"
                            : "bad";
                        const toneClass = {
                          ok: "bg-success text-success-foreground",
                          warn: "bg-warning text-warning-foreground",
                          bad: "bg-destructive text-destructive-foreground",
                          empty: "bg-muted text-muted-foreground border border-dashed",
                          neutral: "bg-secondary text-secondary-foreground",
                        }[tone];
                        return (
                          <Fragment key={`c-${s.index}`}>
                            {i === 5 && (
                              <td className="bg-muted/40 px-1 py-1 text-center text-[10px] text-muted-foreground">
                                almoço
                              </td>
                            )}
                            <td className="px-1 py-1 text-center">
                              <div className={cn("mx-auto flex h-7 w-10 items-center justify-center rounded text-[11px] font-bold", toneClass)}>
                                {qty ?? "—"}
                              </div>
                              {goal > 0 && inGoal && (
                                <div className="mt-0.5 text-[9px] text-muted-foreground">
                                  meta {Math.round(expectedPerHour)}
                                </div>
                              )}
                              {!inGoal && (
                                <div className="mt-0.5 text-[9px] text-muted-foreground">extra</div>
                              )}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-2 py-1 text-center font-semibold">{goal > 0 ? Math.round(expectedPerHour) : "—"}</td>
                      <td className="px-2 py-1 text-center font-semibold">{goal || "—"}</td>
                      <td className="px-2 py-1 text-center font-semibold">{realized}</td>
                      <td className={cn("px-2 py-1 text-center font-bold",
                        goal === 0 ? "text-muted-foreground" : pct >= 100 ? "text-success" : pct >= 70 ? "text-warning" : "text-destructive",
                      )}>
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