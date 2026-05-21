export type TimeSlot = {
  index: number;
  label: string;
  start: string;
  end: string;
  /** duração em minutos */
  minutes: number;
};

export const REGULAR_TIME_SLOTS: TimeSlot[] = [
  { index: 0, start: "07:00", end: "08:00", minutes: 60, label: "08h" },
  { index: 1, start: "08:00", end: "09:00", minutes: 60, label: "09h" },
  { index: 2, start: "09:00", end: "10:00", minutes: 60, label: "10h" },
  { index: 3, start: "10:00", end: "11:00", minutes: 60, label: "11h" },
  { index: 4, start: "11:00", end: "12:00", minutes: 60, label: "12h" },
  // 12h–13h: horário de almoço (sem medição)
  { index: 5, start: "13:00", end: "14:00", minutes: 60, label: "14h" },
  { index: 6, start: "14:00", end: "15:00", minutes: 60, label: "15h" },
  { index: 7, start: "15:00", end: "16:00", minutes: 60, label: "16h" },
  { index: 8, start: "16:00", end: "17:00", minutes: 60, label: "17h" },
];

export const OVERTIME_TIME_SLOTS: TimeSlot[] = [
  { index: 9, start: "17:00", end: "18:00", minutes: 60, label: "18h" },
  { index: 10, start: "18:00", end: "19:00", minutes: 60, label: "19h" },
];

export const ALL_TIME_SLOTS: TimeSlot[] = [...REGULAR_TIME_SLOTS, ...OVERTIME_TIME_SLOTS];

/** Slots used for apontamento (sempre inclui horas extras para permitir lançar) */
export const TIME_SLOTS: TimeSlot[] = ALL_TIME_SLOTS;

/** Sexta-feira: jornada reduzida (sem 17h, 18h, 19h) */
export function isFriday(iso: string): boolean {
  if (!iso) return false;
  const [y, m, d] = iso.split("-").map(Number);
  // meio-dia para evitar problema de timezone
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0).getDay() === 5;
}

/** Slots disponíveis para apontamento conforme a data (sexta termina às 16h) */
export function getApontamentoSlots(iso: string): TimeSlot[] {
  if (isFriday(iso)) return ALL_TIME_SLOTS.filter((s) => s.index <= 7);
  return ALL_TIME_SLOTS;
}

/** Slots válidos para cálculo de meta, conforme bandeira de hora extra */
export function getGoalTimeSlots(overtime: boolean, iso?: string): TimeSlot[] {
  if (iso && isFriday(iso)) return ALL_TIME_SLOTS.filter((s) => s.index <= 7);
  return overtime ? ALL_TIME_SLOTS : REGULAR_TIME_SLOTS;
}

export function getTotalMinutes(overtime: boolean, iso?: string): number {
  return getGoalTimeSlots(overtime, iso).reduce((s, t) => s + t.minutes, 0);
}

export const TOTAL_MINUTES = REGULAR_TIME_SLOTS.reduce((s, t) => s + t.minutes, 0); // 540 (compat)

export const LUNCH_LABEL = "12h–13h Almoço";

export function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}