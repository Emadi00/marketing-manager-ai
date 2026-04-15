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
  Bot,
  Wifi,
  CheckSquare,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  badgeKey?: "review" | "ideas";
}

interface NavGroup {
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    // Produzione contenuti
    items: [
      { href: "/",       icon: Home,       label: "Pipeline" },
      { href: "/review", icon: CheckSquare,label: "Review",   badgeKey: "review" },
      { href: "/ideas",  icon: Lightbulb,  label: "Idee",     badgeKey: "ideas" },
    ],
  },
  {
    // Pubblicazione
    items: [
      { href: "/calendar", icon: CalendarDays, label: "Calendario" },
      { href: "/piano",    icon: BookOpen,     label: "Piano Editoriale" },
    ],
  },
  {
    // Business
    items: [
      { href: "/clients",   icon: Users,    label: "Clienti" },
      { href: "/analytics", icon: BarChart3, label: "Analytics" },
    ],
  },
  {
    // Sistema
    items: [
      { href: "/agents",      icon: Bot,      label: "Agenti" },
      { href: "/connections", icon: Wifi,     label: "Connessioni" },
      { href: "/settings",    icon: Settings, label: "Impostazioni" },
    ],
  },
];

interface SidebarProps {
  reviewBadge?: number;
  ideasBadge?: number;
}

export function Sidebar({ reviewBadge = 0, ideasBadge = 0 }: SidebarProps) {
  const pathname = usePathname();

  const badges: Record<string, number> = {
    review: reviewBadge,
    ideas: ideasBadge,
  };

  return (
    <aside className="flex flex-col w-16 min-h-screen bg-[#111111] border-r border-white/[0.08] shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-white/[0.08]">
        <Tooltip>
          <TooltipTrigger >
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
      <nav className="flex flex-col items-center pt-3 flex-1 gap-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="flex flex-col items-center gap-1 w-full">
            {group.items.map(({ href, icon: Icon, label, badgeKey }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              const count = badgeKey ? (badges[badgeKey] ?? 0) : 0;

              return (
                <Tooltip key={href}>
                  <TooltipTrigger >
                    <Link
                      href={href}
                      className={cn(
                        "relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
                        active
                          ? "bg-[#39FF14]/15 text-[#39FF14]"
                          : "text-white/40 hover:text-white/80 hover:bg-white/[0.06]"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {count > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[#0a0a0a] text-[9px] font-bold flex items-center justify-center leading-none">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {label}{count > 0 ? ` (${count})` : ""}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {gi < NAV_GROUPS.length - 1 && (
              <div className="w-6 h-px bg-white/[0.06] mt-1" />
            )}
          </div>
        ))}
      </nav>

      {/* Bottom version tag */}
      <div className="flex items-center justify-center h-10 mb-2">
        <span className="text-[10px] text-white/20 font-mono">v2.1</span>
      </div>
    </aside>
  );
}
