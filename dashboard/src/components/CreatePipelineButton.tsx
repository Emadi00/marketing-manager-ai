"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreatePipelineModal } from "@/components/CreatePipelineModal";

interface Props {
  clients: string[];
  variant?: "default" | "cta";
}

export function CreatePipelineButton({ clients, variant = "default" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "cta" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30 text-sm font-semibold hover:bg-[#39FF14]/25 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Crea la prima pipeline
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            "bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30 hover:bg-[#39FF14]/25"
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Nuova Pipeline
        </button>
      )}

      {open && (
        <CreatePipelineModal clients={clients} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
