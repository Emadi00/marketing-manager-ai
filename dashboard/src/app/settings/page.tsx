import { readPipeline, readContabilitaConfig } from "@/lib/data";
import { SettingsView } from "@/components/SettingsView";

export default function SettingsPage() {
  const { cards } = readPipeline();
  const pricing   = readContabilitaConfig();

  return <SettingsView cards={cards} pricing={pricing} />;
}
