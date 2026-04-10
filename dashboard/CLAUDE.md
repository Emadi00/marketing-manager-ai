# Dashboard — Videocraft Studio

## Stack
- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS v4** (inline `@theme`, no `tailwind.config.ts`)
- **shadcn/ui** (`components.json` configured, components in `src/components/ui/`)
- **Recharts** — grafici e chart
- **Lucide React** — icone

## Tema
Dark fisso: `html` ha classe `dark`. Mai light mode.
- Background: `#0a0a0a`
- Card: `#111111`
- Accento neon: `#39FF14` (variabile `--primary` e `--accent`)
- Muted: `#888888`

## Struttura
```
src/
  app/
    layout.tsx          ← Sidebar + TooltipProvider
    page.tsx            ← Home (Pipeline Tracker)
    calendar/page.tsx   ← Content Calendar
    analytics/page.tsx  ← Analytics & Grafici
    clients/page.tsx    ← Gestione Clienti
    settings/page.tsx   ← Impostazioni
    api/
      pipeline-step/route.ts   ← POST da bot Telegram
      pipeline-cost/route.ts   ← POST da bot Telegram
  components/
    Sidebar.tsx         ← Nav laterale con icone
    ui/                 ← shadcn components
  lib/
    utils.ts            ← cn()
```

## Data sources (read-only, mai scrivere direttamente)
```
C:\Users\super\Desktop\ai-command-center\data\
  pipeline.json      ← pipelines[].steps[] — scritto da API routes
  contabilita.json   ← entries[] costi — scritto da API routes
  clients.json       ← lista clienti
  performance.json   ← metriche Upload-Post
  smm_log.json       ← log pubblicazioni
```

Il bot Telegram scrive ai file tramite le API routes `/api/pipeline-step` e `/api/pipeline-cost`.
Le pagine leggono i file direttamente (server component) o via API route GET (client component).

## Convenzioni
- **Server Components** di default, `"use client"` solo dove serve interattività
- Dati mock come `const MOCK_X = [...]` nello stesso file, commentati `// TODO: sostituire con dati reali`
- Niente `any` — tipizzare tutto
- `cn()` per classi condizionali
- Niente `console.log` nei componenti React

## Avvio
```bash
cd "C:\Users\super\Desktop\MARKETING MANAGER\dashboard"
npm run dev
# → http://localhost:3000
```
