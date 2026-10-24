/**
 * Créneaux de publication conseillés (heure de Paris), d'après le calendrier validé par Julien
 * le 24/10 : 3 recettes par semaine, heures calées sur les repas.
 * Module pur (aucun accès à la base) : utilisable côté serveur et dans le navigateur.
 */
export type SlotPlatform = "instagram" | "tiktok" | "pinterest";

export const SCHEDULE_TIMEZONE = "Europe/Paris";

/** 0 = dimanche … 6 = samedi ; heure locale « HH:MM ». */
export interface Slot {
  weekday: number;
  time: string;
}

export const RECOMMENDED_SLOTS: Record<SlotPlatform, readonly Slot[]> = {
  // Mardi midi, jeudi fin d'après-midi, dimanche matin.
  instagram: [
    { weekday: 2, time: "11:30" },
    { weekday: 4, time: "17:30" },
    { weekday: 0, time: "10:00" },
  ],
  // Même vidéo, le soir.
  tiktok: [
    { weekday: 2, time: "19:30" },
    { weekday: 4, time: "20:00" },
    { weekday: 0, time: "18:00" },
  ],
  // Une épingle par jour, en soirée.
  pinterest: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, time: "21:00" })),
};

/** Délai minimal entre maintenant et un créneau proposé. */
const MIN_LEAD_MS = 15 * 60 * 1000;
/** Deux publications d'un même réseau ne partagent pas un créneau (à 1 h près). */
const SLOT_GAP_MS = 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ParisParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

/** Date et heure de Paris d'un instant. */
export function parisParts(date: Date): ParisParts {
  const map: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAYS.indexOf(map.weekday ?? ""),
  };
}

function offsetMs(date: Date): number {
  const p = parisParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** Instant correspondant à une heure de Paris (heure d'été ou d'hiver comprise). */
export function parisTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let result = wall - offsetMs(new Date(wall));
  result = wall - offsetMs(new Date(result));
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Valeur d'un champ « date et heure » (AAAA-MM-JJTHH:MM, heure de Paris). */
export function toParisInput(date: Date): string {
  const p = parisParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Lit un champ « date et heure » saisi en heure de Paris ; null si la valeur est invalide. */
export function fromParisInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = parisTime(y, mo, d, h, mi);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Prochains créneaux conseillés pour un réseau, en sautant ceux déjà pris
 * (`taken` : publications déjà programmées sur ce réseau).
 */
export function nextSlots(platform: SlotPlatform, now: Date, taken: readonly Date[] = [], count = 1): Date[] {
  const slots = RECOMMENDED_SLOTS[platform];
  const today = parisParts(now);
  const found: Date[] = [];
  for (let offset = 0; offset < 60 && found.length < count; offset++) {
    // Jour de Paris « aujourd'hui + offset » (midi UTC évite les changements d'heure).
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    const weekday = day.getUTCDay();
    const candidates = slots
      .filter((slot) => slot.weekday === weekday)
      .map((slot) => {
        const [h, m] = slot.time.split(":").map(Number) as [number, number];
        return parisTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, m);
      })
      .sort((a, b) => a.getTime() - b.getTime());
    for (const candidate of candidates) {
      if (candidate.getTime() < now.getTime() + MIN_LEAD_MS) continue;
      if (taken.some((t) => Math.abs(t.getTime() - candidate.getTime()) < SLOT_GAP_MS)) continue;
      found.push(candidate);
      if (found.length >= count) break;
    }
  }
  return found;
}

/** Même jour de Paris ? */
export function sameParisDay(a: Date, b: Date): boolean {
  const pa = parisParts(a);
  const pb = parisParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** Créneau conseillé d'un réseau le même jour de Paris que `day` (null si ce jour n'en a pas). */
export function slotOnDay(platform: SlotPlatform, day: Date): Date | null {
  const p = parisParts(day);
  const slot = RECOMMENDED_SLOTS[platform].find((s) => s.weekday === p.weekday);
  if (!slot) return null;
  const [h, m] = slot.time.split(":").map(Number) as [number, number];
  return parisTime(p.year, p.month, p.day, h, m);
}
