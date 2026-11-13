import { EmptyState } from "@orbit/ui";
import { Settings } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

/** Desktop only: phones show the settings list instead of this pane. */
export default function SettingsIndex() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={<Settings />} title="Settings" description="Choose a section on the left." />
    </div>
  );
}
