/* Horário de funcionamento e formas de atendimento do estabelecimento.
   Ficam dentro de `settings` no documento do restaurante, editados em Configurações. */

export type DayHours = { open: boolean; from: string; to: string };
/** Chaves "0" (domingo) a "6" (sábado), como `Date#getDay`. */
export type WeeklyHours = Record<string, DayHours>;

export type ServiceInfo = {
  dineIn: boolean;
  pickup: boolean;
  delivery: boolean;
  /** Taxa de entrega em centavos; null quando o restaurante não informou. */
  deliveryFeeCents: number | null;
  deliveryEta: string;
  pickupEta: string;
  deliveryArea: string;
};

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const RESTAURANT_TIME_ZONE = "America/Sao_Paulo";

export const emptyHours = (): WeeklyHours =>
  Object.fromEntries(WEEKDAYS.map((_, day) => [String(day), { open: false, from: "11:00", to: "23:00" }]));

export const emptyService = (): ServiceInfo => ({
  dineIn: false,
  pickup: false,
  delivery: false,
  deliveryFeeCents: null,
  deliveryEta: "",
  pickupEta: "",
  deliveryArea: "",
});

const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};

export const hasHours = (hours?: WeeklyHours | null) =>
  Boolean(hours && Object.values(hours).some((day) => day?.open && day.from && day.to));

/** Dia da semana e minuto do dia no fuso do restaurante. */
function localNow(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Aberto/fechado calculado pelos horários cadastrados. Retorna null quando o
 * restaurante não informou horários: nesse caso o cardápio não exibe status.
 * Suporta expediente que atravessa a meia-noite (ex.: 18:00 às 02:00).
 */
export function openStatus(hours?: WeeklyHours | null, now = new Date(), timeZone = RESTAURANT_TIME_ZONE): boolean | null {
  if (!hasHours(hours)) return null;
  const { day, minute } = localNow(now, timeZone);
  const today = hours![String(day)];
  if (today?.open) {
    const from = minutes(today.from), to = minutes(today.to);
    if (to > from ? minute >= from && minute < to : minute >= from) return true;
  }
  const yesterday = hours![String((day + 6) % 7)];
  if (yesterday?.open) {
    const from = minutes(yesterday.from), to = minutes(yesterday.to);
    if (to <= from && minute < to) return true;
  }
  return false;
}
