import { Suspense } from "react";
import { readCalendarEvents, readClients } from "@/lib/data";
import { CalendarGrid } from "@/components/CalendarGrid";

interface Props {
  searchParams: Promise<{ month?: string; client?: string }>;
}

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;

  // Default to current month
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const month = params.month ?? defaultMonth;

  const events = readCalendarEvents(month);
  const clients = readClients();

  return (
    <div className="flex flex-col h-full">
      <Suspense>
        <CalendarGrid month={month} events={events} clients={clients} />
      </Suspense>
    </div>
  );
}
