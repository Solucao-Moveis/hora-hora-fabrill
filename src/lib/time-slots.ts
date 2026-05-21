export type TimeSlot = {
  index: number;
  label: string;
  start: string;
  end: string;
  /** duração em minutos */
  minutes: number;
};

export const TIME_SLOTS: TimeSlot[] = [
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

export const TOTAL_MINUTES = TIME_SLOTS.reduce((s, t) => s + t.minutes, 0); // 540

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