import { createHash } from "node:crypto";
import { googleCalendarForUser } from "./integrations.js";
import { withProviderRetry } from "./retry.js";

const rruleDay = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function calendarSeriesId(userId: string, habitId: string) {
  return createHash("sha256").update(`${userId}:${habitId}:series`).digest("hex").slice(0, 40);
}

export function calendarOccurrenceId(userId: string, habitId: string, occurrenceDate: string) {
  return createHash("sha256").update(`${userId}:${habitId}:${occurrenceDate}`).digest("hex").slice(0, 40);
}

export function weeklyRRule(interval: number, weekdays: number[], endsAt: Date) {
  if (!weekdays.length) throw new Error("Select at least one execution date");
  const days = [...new Set(weekdays)].sort((a, b) => a - b).map((day) => rruleDay[day]);
  const until = endsAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `RRULE:FREQ=WEEKLY;INTERVAL=${Math.max(1, interval)};BYDAY=${days.join(",")};UNTIL=${until}`;
}

export async function insertWeeklyHabitSeries(input: {
  userId: string; habitId: string; name: string; description?: string; start: Date; end: Date;
  timeZone: string; durationMinutes: number; intervalWeeks: number; weekdays: number[]; colorId?: string;
}) {
  const { calendar, calendarId } = await googleCalendarForUser(input.userId);
  const eventId = calendarSeriesId(input.userId, input.habitId);
  const requestBody = {
    summary: `[習慣] ${input.name}`, description: input.description ?? "由日日習慣 App 排程。",
    colorId: input.colorId ?? "2", start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: new Date(input.start.getTime() + input.durationMinutes * 60_000).toISOString(), timeZone: input.timeZone },
    recurrence: [weeklyRRule(input.intervalWeeks, input.weekdays, input.end)],
  };
  // Stable event IDs make retries and rescheduling idempotent.
  const result = await withProviderRetry(async () => {
    try {
      return await calendar.events.insert({ calendarId, requestBody: { id: eventId, ...requestBody } });
    } catch (error: any) {
      if (Number(error?.response?.status ?? error?.code) !== 409) throw error;
      return calendar.events.patch({ calendarId, eventId, requestBody });
    }
  });
  return { calendarId, eventId: result.data.id ?? eventId };
}

export async function insertOneOffHabitEvent(input: {
  userId: string; habitId: string; name: string; occurrenceDate: string; start: Date; end: Date; timeZone: string; colorId?: string;
}) {
  const { calendar, calendarId } = await googleCalendarForUser(input.userId);
  const eventId = calendarOccurrenceId(input.userId, input.habitId, input.occurrenceDate);
  const requestBody = {
    summary: `[習慣] ${input.name}`, description: "由日日習慣 App 排程。",
    colorId: input.colorId ?? "2",
    start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
  };
  const result = await withProviderRetry(async () => {
    try { return await calendar.events.insert({ calendarId, requestBody: { id: eventId, ...requestBody } }); }
    catch (error: any) {
      if (Number(error?.response?.status ?? error?.code) !== 409) throw error;
      return calendar.events.patch({ calendarId, eventId, requestBody });
    }
  });
  return { calendarId, eventId: result.data.id ?? eventId };
}

export async function markGoogleEventDone(input: { userId: string; eventId: string; calendarId?: string }) {
  const { calendar, calendarId: linkedCalendarId } = await googleCalendarForUser(input.userId);
  const calendarId = input.calendarId ?? linkedCalendarId;
  const current = await withProviderRetry(() => calendar.events.get({ calendarId, eventId: input.eventId }));
  const marker = "[已完成] 由日日 App 更新。";
  const description = current.data.description ?? "";
  return withProviderRetry(() => calendar.events.patch({
    calendarId, eventId: input.eventId,
    requestBody: { description: description.includes(marker) ? description : `${description}${description ? "\n" : ""}${marker}`, colorId: "10" },
  }));
}

// For a completion on one recurring date, resolve and patch its instance, not the whole series.
export async function markCalendarOccurrenceDone(input: {
  userId: string; calendarId?: string; seriesId: string; occurrenceStart: Date; occurrenceEnd: Date;
}) {
  const { calendar, calendarId: linkedCalendarId } = await googleCalendarForUser(input.userId);
  const instances = await withProviderRetry(() => calendar.events.instances({
    calendarId: input.calendarId ?? linkedCalendarId, eventId: input.seriesId,
    timeMin: input.occurrenceStart.toISOString(), timeMax: input.occurrenceEnd.toISOString(),
  }));
  const event = instances.data.items?.[0];
  if (!event?.id) throw new Error("Matching Google Calendar occurrence was not found");
  const marker = "[已完成] 由日日 App 更新。";
  const description = event.description ?? "";
  return withProviderRetry(() => calendar.events.patch({
    calendarId: input.calendarId ?? linkedCalendarId, eventId: event.id!,
    requestBody: { description: description.includes(marker) ? description : `${description}${description ? "\n" : ""}${marker}`, colorId: "10" },
  }));
}
