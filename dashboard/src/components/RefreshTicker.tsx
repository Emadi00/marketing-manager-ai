"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function RefreshTicker({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => router.refresh());
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  function handleClick() {
    startTransition(() => router.refresh());
  }

  return (
    <button
      onClick={handleClick}
      title="Aggiorna"
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors text-xs",
        isPending && "opacity-60 cursor-not-allowed"
      )}
    >
      <RefreshCw className={cn("w-3.5 h-3.5", isPending && "animate-spin")} />
      {isPending ? "Aggiornamento…" : "Aggiorna"}
    </button>
  );
}
