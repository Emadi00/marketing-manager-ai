import {
  readClientiSocial,
  readContabilitaConfig,
  readPipeline,
  readSmmLog,
} from "@/lib/data";
import { ClientsView } from "@/components/ClientsView";

export default function ClientsPage() {
  const clients   = readClientiSocial();
  const pricing   = readContabilitaConfig();
  const { cards } = readPipeline();
  const smmLog    = readSmmLog();

  return (
    <div className="flex flex-col h-full">
      <ClientsView
        clients={clients}
        pricing={pricing}
        cards={cards}
        smmLog={smmLog}
      />
    </div>
  );
}
