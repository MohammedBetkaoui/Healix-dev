"use client";

import { useEffect, useMemo, useState } from "react";

import { useAppointments } from "./use-appointments";

// Today's appointments (local 00:00–23:59:59.999), sent as UTC instants: the
// backend compares scheduledAt in UTC, so this keeps "today" aligned with the
// user's own timezone. `now` ticks every minute so the upcoming count stays
// current and the range rolls over at midnight on a page left open.
export function useTodayAppointments() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const range = useMemo(() => {
    const start = new Date(dayStart);
    const nextDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return { from: start.toISOString(), to: new Date(nextDay.getTime() - 1).toISOString() };
  }, [dayStart]);
  const { data } = useAppointments(range);

  return {
    // Every appointment returned for the day, whatever its status.
    count: data?.length,
    // Not started yet and still pending (SCHEDULED or CONFIRMED).
    upcomingCount: data?.filter((appointment) =>
      (appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED")
      && new Date(appointment.scheduledAt).getTime() > now.getTime(),
    ).length,
  };
}
