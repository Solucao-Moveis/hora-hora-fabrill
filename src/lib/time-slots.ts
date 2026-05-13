export type TimeSlot = {
  index: number;
  label: string;
  start: string;
  end: string;
  /** duração em minutos */
  minutes: number;
};

export const TIME_SLOTS: TimeSlot[] = [
  { index: 0, start: "07:30", end: "08:30", minutes: 60, label: "07:30 – 08:30" },
  { index: 1, start: "08:30", end: "09:30", minutes: 60, label: "08:30 – 09:30" },
  { index: 2, start: "09:30", end: "10:30", minutes: 60, label: "09:30 – 10:30" },
  { index: 3, start: "10:30", end: "11:30", minutes: 60, label: "10:30 – 11:30" },
  { index: 4, start: "11:30", end: "12:30", minutes: 60, label: "11:30 – 12:30" },
  { index: 5, start: "12:30", end: "13:30", minutes: 60, label: "12:30 – 13:30" },
  { index: 6, start: "13:30", end: "14:30", minutes: 60, label: "13:30 – 14:30" },
  { index: 7, start: "14:30", end: "15:30", minutes: 60, label: "14:30 – 15:30" },
  { index: 8, start: "15:30", end: "16:30", minutes: 60, label: "15:30 – 16:30" },
  { index: 9, start: "16:30", end: "17:00", minutes: 30, label: "16:30 – 17:00" },
];

export const TOTAL_MINUTES = TIME_SLOTS.reduce((s, t) => s + t.minutes, 0); // 570

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