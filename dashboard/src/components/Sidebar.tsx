"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  BarChart3,
  Users,
  Settings,
  Clapperboard,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/",          icon: Home,         label: "Home" },
  { href: "/calendar",  icon: CalendarDays, label: "Calendario" },
  { href: "/analytics", icon: BarChart3,    label: "Analytics" },
  { href: "/clients",   icon: Users,        label: "Clienti" },
  { href: "/settings",  icon: Settings,     label: "Impostazioni" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-16 min-h-screen bg-[#111111] border-r border-white/[0.08] shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-white/[0.08]">
        <Tooltip>
          <TooltipTrigger>
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#39FF14]/10 cursor-default">
              <Clapperboard className="w-5 h-5 text-[#39FF14]" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-semibold">
            Videocraft Studio
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1 pt-3 flex-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Tooltip key={href}>
              <TooltipTrigger>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
                    active
                      ? "bg-[#39FF14]/15 text-[#39FF14]"
                      : "text-white/40 hover:text-white/80 hover:bg-white/[0.06]"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Bottom version tag */}
      <div className="flex items-center justify-center h-10 mb-2">
        <span className="text-[10px] text-white/20 font-mono">v1.0</span>
      </div>
    </aside>
  );
}
