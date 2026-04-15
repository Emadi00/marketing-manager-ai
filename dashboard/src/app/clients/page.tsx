import {
  readClientiSocial,
  readContabilitaConfig,
  readPipeline,
  readSmmLog,
  readContabilita,
} from "@/lib/data";
import { ClientsTabs } from "@/components/ClientsTabs";

export default function ClientsPage() {
  const clients     = readClientiSocial();
  const pricing     = readContabilitaConfig();
  const { cards }   = readPipeline();
  const smmLog      = readSmmLog();
  const contabilita = readContabilita();

  return (
    <div className="flex flex-col h-full">
      <ClientsTabs
        clients={clients}
        pricing={pricing}
        cards={cards}
        smmLog={smmLog}
        contabilita={contabilita}
      />
    </div>
  );
}
