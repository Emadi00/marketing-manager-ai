"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function ClientFilter({ clients }: { clients: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("client") ?? "tutti";

  function select(val: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (val === "tutti") {
      params.delete("client");
    } else {
      params.set("client", val);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {["tutti", ...clients].map((c) => (
        <button
          key={c}
          onClick={() => select(c)}
          className={cn(
            "px-3 py-1 rounded-full text-xs border transition-colors capitalize",
            active === c
              ? "bg-[#39FF14]/15 text-[#39FF14] border-[#39FF14]/30"
              : "text-white/40 border-white/10 hover:text-white/70 hover:border-white/20"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
