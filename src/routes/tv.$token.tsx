import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTvScreen } from "@/lib/tv.functions";
import {
  todayIso,
  getApontamentoSlots,
  getGoalTimeSlots,
  effectiveDayGoal,
  expectedForSlot,
  type TimeSlot,
} from "@/lib/time-slots";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, WifiOff, Tv } from "lucide-react";
import logo from "@/assets/logo-solucao-moveis.png";

// TV de chão de fábrica: abre sem login (token no link), tela cheia, sem botões.
// Recarrega a cada 5s pelo servidor; vira o dia sozinha à meia-noite.
export const Route = createFileRoute("/tv/$token")({
  ssr: false,
  component: TvPage,
});

declare const __BUILD_ID__: string;

// Cada célula vira um "container": a letra acompanha a altura da célula (cqh),
// então cabe tudo seja o setor com 4 ou com 14 máquinas.
const CELL = "[container-type:size] overflow-hidden";

const REFRESH_MS = 5000;
const FRESH_MS = 6000;

/** Nome curto pra TV: tira o nome do setor e "manual" ("Box solda manual 1" vira "Box 1"). */
function shortMachineName(name: string, areaName: string): string {
  const drop = new Set(["manual", ...areaName.toLowerCase().split(/\s+/)]);
  const kept = name.split(/\s+/).filter((w) => !drop.has(w.toLowerCase()));
  const out = kept.join(" ").trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : name;
}

type Tone = "exceed" | "ok" | "warn" | "bad" | "neutral";

// Mesmas faixas do mapa de calor do Dashboard
function toneFor(ratio: number): Tone {
  if (ratio > 1.3) return "exceed";
  if (ratio >= 1) return "ok";
  if (ratio >= 0.9) return "warn";
  return "bad";
}

const TONE_CELL: Record<Tone, string> = {
  exceed: "bg-exceed text-exceed-foreground",
  ok: "bg-success text-success-foreground",
  warn: "bg-warning text-warning-foreground",
  bad: "bg-destructive text-destructive-foreground",
  neutral: "bg-secondary text-secondary-foreground",
};

const TONE_TEXT: Record<Tone, string> = {
  exceed: "text-exceed",
  ok: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
};

const TONE_BAR: Record<Tone, string> = {
  exceed: "bg-exceed",
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-muted-foreground",
};

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Fração (0..1) já decorrida de um slot no horário `nowMin`. */
function slotProgress(slot: TimeSlot, nowMin: number): number {
  const a = minutesOf(slot.start);
  const b = minutesOf(slot.end);
  if (nowMin <= a) return 0;
  if (nowMin >= b) return 1;
  return (nowMin - a) / (b - a);
}

/** Meta esperada até agora para uma meta-base, somando os slots já decorridos. */
function expectedUntilNow(baseGoal: number, goalSlots: TimeSlot[], nowMin: number, date: string): number {
  return goalSlots.reduce((s, slot) => s + expectedForSlot(baseGoal, slot.index, date) * slotProgress(slot, nowMin), 0);
}

function useAnimatedNumber(target: number, ms = 900): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (target - from) * eased);
      setValue(v);
      fromRef.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Mantém a tela da TV acesa (quando o navegador permite). */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    const acquire = () => {
      if (document.visibilityState !== "visible" || !nav.wakeLock) return;
      nav.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}

type FreshEvent = { key: string; machine: string; slot: string; delta: number; at: number };

function TvPage() {
  const { token } = Route.useParams();
  const now = useClock();
  const date = todayIso();
  useWakeLock();

  const q = useQuery({
    queryKey: ["tv", token, date],
    queryFn: () => fetchTvScreen({ data: { token, date } }),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: true,
    retry: 1,
  });
  const data = q.data;

  // Saiu versão nova do app: recarrega a TV sozinha (o link continua o mesmo)
  useEffect(() => {
    if (!data?.build || data.build === __BUILD_ID__) return;
    // Trava: recarrega no máximo uma vez por versão, nunca em loop
    try {
      if (sessionStorage.getItem("tv-reload") === data.build) return;
      sessionStorage.setItem("tv-reload", data.build);
    } catch {
      return;
    }
    window.location.reload();
  }, [data?.build]);

  // Detecta lançamentos novos/alterados para acender a célula e mostrar o aviso
  const prevRef = useRef<Map<string, number> | null>(null);
  const [fresh, setFresh] = useState<FreshEvent[]>([]);
  useEffect(() => {
    if (!data) return;
    const curr = new Map<string, number>();
    data.entries.forEach((e) => curr.set(`${e.machine_id}:${e.hour_slot}`, e.quantity));
    const prev = prevRef.current;
    prevRef.current = curr;
    if (!prev) return;
    const slots = getApontamentoSlots(date);
    const events: FreshEvent[] = [];
    curr.forEach((qty, key) => {
      const before = prev.get(key) ?? 0;
      if (qty === before) return;
      const [machineId, slotIdx] = key.split(":");
      events.push({
        key,
        machine: shortMachineName(data.machines.find((m) => m.id === machineId)?.name ?? "", data.areaName),
        slot: slots.find((s) => s.index === Number(slotIdx))?.label ?? "",
        delta: qty - before,
        at: Date.now(),
      });
    });
    if (events.length) setFresh((f) => [...f.filter((x) => !events.some((e) => e.key === x.key)), ...events]);
  }, [data, date]);
  useEffect(() => {
    if (!fresh.length) return;
    const id = setTimeout(() => setFresh((f) => f.filter((x) => Date.now() - x.at < FRESH_MS)), 1000);
    return () => clearTimeout(id);
  }, [fresh, now]);
  // Zera a memória ao virar o dia, senão o dia novo "acenderia" tudo
  useEffect(() => {
    prevRef.current = null;
  }, [date]);

  if (!data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src={logo} alt="" className="h-14 w-auto opacity-90" />
        {q.isError ? (
          <>
            <div className="text-2xl font-bold text-foreground">TV indisponível</div>
            <div className="max-w-md text-muted-foreground">{(q.error as Error)?.message}</div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-lg text-muted-foreground">
            <span className="h-3 w-3 animate-ping rounded-full bg-primary" /> Conectando…
          </div>
        )}
      </div>
    );
  }

  return <TvBoard data={data} date={date} now={now} fresh={fresh} offline={q.isError} updatedAt={q.dataUpdatedAt} />;
}

type TvData = Awaited<ReturnType<typeof fetchTvScreen>>;

function TvBoard({
  data,
  date,
  now,
  fresh,
  offline,
  updatedAt,
}: {
  data: TvData;
  date: string;
  now: Date;
  fresh: FreshEvent[];
  offline: boolean;
  updatedAt: number;
}) {
  const { machines, goals, entries, operators, overtime } = data;
  const slots = getApontamentoSlots(date);
  const goalSlots = getGoalTimeSlots(overtime, date);
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const currentSlot = slots.find((s) => nowMin >= minutesOf(s.start) && nowMin < minutesOf(s.end));
  const isLunch = nowMin >= 12 * 60 && nowMin < 13 * 60;
  const lunchAt = slots.findIndex((s) => s.index === 5);
  const freshKeys = new Set(fresh.map((f) => f.key));

  const rows = useMemo(
    () =>
      machines.map((m) => {
        const baseGoal = goals.find((g) => g.machine_id === m.id)?.goal ?? 0;
        const dayGoal = effectiveDayGoal(baseGoal, overtime, date);
        const mine = entries.filter((e) => e.machine_id === m.id);
        const realized = mine.reduce((s, e) => s + e.quantity, 0);
        const launched = new Set(mine.map((e) => e.hour_slot));
        // Projeção: o que falta da meta do dia, repartido entre as horas que ainda
        // dá pra produzir (atual + futuras, sem lançamento), no peso da meta hora a hora.
        const remainingSlots = goalSlots.filter((s) => !launched.has(s.index) && minutesOf(s.end) > nowMin);
        const missing = Math.max(0, dayGoal - realized);
        const weightSum = remainingSlots.reduce((s, slot) => s + expectedForSlot(baseGoal, slot.index, date), 0);
        const neededBySlot = new Map<number, number>();
        if (missing > 0 && weightSum > 0) {
          remainingSlots.forEach((slot) =>
            neededBySlot.set(slot.index, Math.ceil((missing * expectedForSlot(baseGoal, slot.index, date)) / weightSum)),
          );
        }
        return {
          missing,
          remainingCount: remainingSlots.length,
          neededBySlot,
          machine: m,
          baseGoal,
          dayGoal,
          realized,
          byslot: new Map(mine.map((e) => [e.hour_slot, e.quantity])),
          operator: operators.find((o) => o.machine_id === m.id)?.operator_name?.trim() ?? "",
          expectedNow: expectedUntilNow(baseGoal, goalSlots, nowMin, date),
        };
      }),
    // nowMin muda a cada segundo; o ritmo só precisa de precisão por minuto
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [machines, goals, entries, operators, overtime, date, Math.floor(nowMin)],
  );

  const totalGoal = rows.reduce((s, r) => s + r.dayGoal, 0);
  const totalReal = rows.reduce((s, r) => s + r.realized, 0);
  const totalExpected = Math.round(rows.reduce((s, r) => s + r.expectedNow, 0));
  const pace = totalReal - totalExpected;
  const totalMissing = rows.reduce((s, r) => s + r.missing, 0);
  const sectorPerHour = rows.reduce((s, r) => s + (r.remainingCount > 0 ? r.missing / r.remainingCount : 0), 0);
  const sectorHoursLeft = Math.max(0, ...rows.map((r) => r.remainingCount));
  const pct = totalGoal > 0 ? Math.round((totalReal / totalGoal) * 100) : 0;
  const pctTone: Tone = totalGoal > 0 ? toneFor(totalReal / totalGoal) : "neutral";
  const paceTone: Tone = totalExpected > 0 ? toneFor(totalReal / totalExpected) : "neutral";
  const animReal = useAnimatedNumber(totalReal);
  const latest = fresh[fresh.length - 1];
  const secsAgo = Math.max(0, Math.round((now.getTime() - updatedAt) / 1000));

  const gridCols = [
    "minmax(9rem, 1.5fr)",
    ...slots.flatMap((_, i) => (i === lunchAt ? ["0.5fr", "1fr"] : ["1fr"])),
    "minmax(8rem, 1.4fr)",
  ].join(" ");

  return (
    <div
      className="flex h-screen flex-col gap-[1.2vh] overflow-hidden bg-background p-[1.4vh] text-foreground"
      onDoubleClick={() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }}
    >
      {/* ======== CABEÇALHO ======== */}
      <header className="relative flex shrink-0 items-center gap-[2vw] overflow-hidden rounded-2xl border bg-card px-[2vw] py-[1.4vh] shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-primary" />
        <img src={logo} alt="" className="h-[5.5vh] w-auto shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[clamp(0.7rem,1.2vh,1rem)] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Tv className="h-[1.6vh] w-[1.6vh]" /> Produção hora a hora
          </div>
          <div className="truncate text-[clamp(1.6rem,4.6vh,4rem)] font-black uppercase leading-none tracking-tight">
            {data.areaName}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-[2vw]">
          {latest && (
            <div
              key={latest.key + latest.at}
              className="animate-in fade-in slide-in-from-top-4 flex items-center gap-2 rounded-full border border-primary/30 bg-accent px-4 py-2 text-[clamp(0.8rem,1.7vh,1.3rem)] font-semibold text-accent-foreground duration-500"
            >
              <span className="h-2.5 w-2.5 animate-ping rounded-full bg-primary" />
              {latest.machine} · {latest.slot}
              <span className="font-black text-primary">
                {latest.delta > 0 ? "+" : ""}
                {latest.delta}
              </span>
            </div>
          )}
          <div className="text-right">
            <div className="font-mono text-[clamp(1.6rem,4.4vh,3.8rem)] font-bold leading-none tabular-nums">
              {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              <span className="text-[0.5em] text-muted-foreground">
                :{String(now.getSeconds()).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-end gap-2 text-[clamp(0.7rem,1.4vh,1.1rem)] text-muted-foreground">
              {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}
              {offline ? (
                <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                  <WifiOff className="h-[1.5vh] w-[1.5vh]" /> sem conexão há {secsAgo}s
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-semibold text-success">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  AO VIVO
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ======== PLACAR ======== */}
      <section className="grid shrink-0 grid-cols-4 gap-[1.2vh]">
        <div className="flex items-center gap-[1.4vw] rounded-2xl border bg-card px-[1.6vw] py-[1.2vh] shadow-sm">
          <ProgressRing pct={pct} tone={pctTone} />
          <div>
            <Label>Meta do dia</Label>
            <div className="text-[clamp(1.2rem,3.4vh,3rem)] font-black leading-none tabular-nums">
              <span className={TONE_TEXT[pctTone]}>{animReal}</span>
              <span className="text-muted-foreground"> / {totalGoal}</span>
            </div>
            {overtime && <div className="mt-1 text-[clamp(0.6rem,1.2vh,0.95rem)] font-semibold text-warning">hora extra até 19h</div>}
          </div>
        </div>

        <ScoreTile
          label="Pra bater a meta"
          value={
            totalGoal === 0 ? "–" : totalMissing === 0 ? "Batida ✓" : sectorHoursLeft === 0 ? `faltou ${totalMissing}` : `${Math.ceil(sectorPerHour)}/h`
          }
          valueClass={totalGoal > 0 && totalMissing === 0 ? "text-success" : "text-primary"}
          sub={
            totalGoal === 0 || totalMissing === 0
              ? undefined
              : sectorHoursLeft === 0
                ? "turno encerrado"
                : `faltam ${totalMissing} peças em ${sectorHoursLeft} ${sectorHoursLeft === 1 ? "hora" : "horas"}`
          }
        />

        <ScoreTile
          label="Ritmo"
          value={`${pace > 0 ? "+" : ""}${pace}`}
          valueClass={TONE_TEXT[paceTone]}
          sub={
            totalExpected === 0
              ? "aguardando início"
              : `${pace >= 0 ? "adiantado" : "atrasado"} · esperado ${totalExpected}`
          }
          icon={
            totalExpected === 0 ? null : pace >= 0 ? (
              <TrendingUp className={cn("h-[4vh] w-[4vh]", TONE_TEXT[paceTone])} />
            ) : (
              <TrendingDown className={cn("h-[4vh] w-[4vh]", TONE_TEXT[paceTone])} />
            )
          }
        />

        <div className="flex flex-col justify-center rounded-2xl border bg-card px-[1.6vw] py-[1.2vh] shadow-sm">
          <Label>Hora atual</Label>
          {isLunch ? (
            <div className="text-[clamp(1.2rem,3.4vh,3rem)] font-black leading-none">Almoço</div>
          ) : currentSlot ? (
            <>
              <div className="text-[clamp(1.2rem,3.4vh,3rem)] font-black leading-none text-primary">
                {currentSlot.start}–{currentSlot.end}
              </div>
              <div className="mt-[0.8vh] h-[0.8vh] overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
                  style={{ width: `${slotProgress(currentSlot, nowMin) * 100}%` }}
                />
              </div>
              <div className="mt-1 text-[clamp(0.6rem,1.2vh,0.95rem)] text-muted-foreground">
                faltam {Math.ceil(minutesOf(currentSlot.end) - nowMin)} min
              </div>
            </>
          ) : (
            <div className="text-[clamp(1.2rem,3.4vh,3rem)] font-black leading-none text-muted-foreground">Fora do turno</div>
          )}
        </div>
      </section>

      {/* ======== MAPA DE CALOR ======== */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card p-[1.2vh] shadow-sm">
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xl text-muted-foreground">
            Nenhuma máquina cadastrada neste setor.
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1 gap-[0.6vh]"
            style={{ gridTemplateColumns: gridCols, gridTemplateRows: `auto repeat(${rows.length}, minmax(0, 1fr))` }}
          >
            {/* cabeçalho das horas */}
            <div />
            {slots.map((s, i) => {
              const isNow = currentSlot?.index === s.index;
              return (
                <Fragment key={`h-${s.index}`}>
                  {i === lunchAt && <div className="text-center text-[clamp(0.6rem,1.2vh,0.9rem)] text-muted-foreground">🍽</div>}
                  <div
                    className={cn(
                      "rounded-lg py-[0.5vh] text-center text-[clamp(0.75rem,1.7vh,1.3rem)] font-bold tabular-nums",
                      isNow ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground",
                      !goalSlots.some((g) => g.index === s.index) && !isNow && "opacity-50",
                    )}
                  >
                    {s.label}
                  </div>
                </Fragment>
              );
            })}
            <div className="text-center text-[clamp(0.7rem,1.5vh,1.1rem)] font-bold uppercase tracking-wide text-muted-foreground">
              Total
            </div>

            {/* linhas */}
            {rows.map((r) => {
              const rPct = r.dayGoal > 0 ? Math.round((r.realized / r.dayGoal) * 100) : 0;
              const rTone: Tone = r.dayGoal > 0 ? toneFor(r.realized / r.dayGoal) : "neutral";
              const rPaceUp = r.realized >= Math.round(r.expectedNow);
              return (
                <Fragment key={r.machine.id}>
                  <div className={cn(CELL, "flex min-w-0 flex-col justify-center rounded-xl bg-muted/60 px-[0.8vw]")}>
                    <div className="line-clamp-2 break-words text-[min(36cqh,17cqw)] font-extrabold leading-[1.05]">
                      {shortMachineName(r.machine.name, data.areaName)}
                    </div>
                    <div className="truncate text-[min(20cqh,10cqw)] leading-tight text-muted-foreground">
                      {r.operator || "sem operador"}
                    </div>
                  </div>

                  {slots.map((s, i) => {
                    const qty = r.byslot.get(s.index);
                    const inGoal = goalSlots.some((g) => g.index === s.index);
                    const expected = expectedForSlot(r.baseGoal, s.index, date);
                    const shownMeta = Math.max(1, Math.round(expected));
                    const end = minutesOf(s.end);
                    const isNow = currentSlot?.index === s.index;
                    const past = nowMin >= end;
                    const key = `${r.machine.id}:${s.index}`;
                    const isFresh = freshKeys.has(key);
                    const tone: Tone = qty == null || r.baseGoal === 0 || !inGoal ? "neutral" : toneFor(qty / shownMeta);
                    const needed = r.neededBySlot.get(s.index);
                    const metaLine = r.baseGoal > 0 && inGoal && (
                      <span className="mt-[3cqh] text-[min(19cqh,15cqw)] font-semibold opacity-80">meta {Math.round(expected)}</span>
                    );
                    return (
                      <Fragment key={key}>
                        {i === lunchAt && <div className="rounded-lg bg-muted/40" />}
                        {qty != null ? (
                          <div
                            className={cn(
                              CELL,
                              "relative flex flex-col items-center justify-center rounded-xl leading-none shadow-sm transition-colors duration-700",
                              TONE_CELL[tone],
                              isNow && "ring-4 ring-primary ring-offset-2 ring-offset-card",
                              isFresh && "tv-glow",
                            )}
                          >
                            <span className="text-[min(54cqh,36cqw)] font-black tabular-nums">{qty}</span>
                            {metaLine}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              CELL,
                              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed leading-none",
                              isNow
                                ? "border-primary bg-accent text-accent-foreground"
                                : past && inGoal && r.baseGoal > 0
                                  ? "border-destructive/40 bg-destructive/5 text-destructive/70"
                                  : "border-border bg-muted/30 text-muted-foreground/60",
                            )}
                          >
                            {needed != null ? (
                              <>
                                <span className="mb-[1cqh] text-[min(14cqh,11cqw)] font-semibold uppercase tracking-wide opacity-80">precisa</span>
                                <span
                                  className={cn(
                                    "text-[min(42cqh,30cqw)] font-black tabular-nums",
                                    needed > shownMeta ? "text-destructive" : "text-success",
                                  )}
                                >
                                  {needed}
                                </span>
                              </>
                            ) : (
                              <span className="text-[min(32cqh,26cqw)] font-bold">
                                {r.dayGoal > 0 && r.missing === 0 && !past
                                  ? "✓"
                                  : isNow
                                    ? "…"
                                    : past && inGoal && r.baseGoal > 0
                                      ? "!"
                                      : "–"}
                              </span>
                            )}
                            {metaLine}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}

                  <div className={cn(CELL, "flex min-w-0 flex-col justify-center rounded-xl bg-muted/60 px-[0.8vw]")}>
                    <div className="flex items-center justify-between gap-1 leading-none">
                      <span className={cn("text-[min(42cqh,18cqw)] font-black tabular-nums", TONE_TEXT[rTone])}>
                        {r.dayGoal > 0 ? `${rPct}%` : "–"}
                      </span>
                      <span className="flex items-center gap-1 text-[min(19cqh,9cqw)] font-semibold tabular-nums text-muted-foreground">
                        {r.realized}/{r.dayGoal || "–"}
                        {r.dayGoal > 0 && r.expectedNow > 0 && (
                          rPaceUp ? (
                            <TrendingUp className="h-[18cqh] w-[18cqh] text-success" />
                          ) : (
                            <TrendingDown className="h-[18cqh] w-[18cqh] text-destructive" />
                          )
                        )}
                      </span>
                    </div>
                    <div className="my-[6cqh] h-[7cqh] min-h-1 overflow-hidden rounded-full bg-background">
                      <div
                        className={cn("h-full rounded-full transition-[width] duration-1000", TONE_BAR[rTone])}
                        style={{ width: `${Math.min(100, rPct)}%` }}
                      />
                    </div>
                    {r.dayGoal > 0 && r.missing > 0 && r.remainingCount > 0 && (
                      <div className="truncate text-[min(20cqh,10cqw)] font-bold leading-none tabular-nums text-primary">
                        precisa {Math.ceil(r.missing / r.remainingCount)}/h
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </section>

      {/* ======== LEGENDA ======== */}
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-[2vw] gap-y-1 text-[clamp(0.6rem,1.3vh,1rem)] text-muted-foreground">
        <LegendDot className="bg-exceed" label="acima de 130%" />
        <LegendDot className="bg-success" label="bateu a meta" />
        <LegendDot className="bg-warning" label="90 a 99%" />
        <LegendDot className="bg-destructive" label="abaixo de 90%" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-3 w-3 items-center justify-center rounded border-2 border-dashed border-destructive/50 text-[8px] font-bold text-destructive">!</span>
          hora passada sem lançamento
        </span>
      </footer>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[0.5vh] text-[clamp(0.6rem,1.25vh,1rem)] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
      {children}
    </div>
  );
}

function ScoreTile({
  label,
  value,
  sub,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border bg-card px-[1.6vw] py-[1.2vh] shadow-sm">
      <div>
        <Label>{label}</Label>
        <div className={cn("text-[clamp(1.2rem,3.4vh,3rem)] font-black leading-none tabular-nums", valueClass)}>{value}</div>
        {sub && <div className="mt-1 text-[clamp(0.6rem,1.2vh,0.95rem)] text-muted-foreground">{sub}</div>}
      </div>
      {icon}
    </div>
  );
}

function ProgressRing({ pct, tone }: { pct: number; tone: Tone }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative h-[8vh] w-[8vh] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="11" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          className={cn("transition-[stroke-dashoffset] duration-1000", TONE_TEXT[tone])}
          stroke="currentColor"
        />
      </svg>
      <div className={cn("absolute inset-0 flex items-center justify-center text-[clamp(0.8rem,2.1vh,1.6rem)] font-black tabular-nums", TONE_TEXT[tone])}>
        {pct}%
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded", className)} />
      {label}
    </span>
  );
}
