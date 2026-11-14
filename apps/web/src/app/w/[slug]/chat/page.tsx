import { EmptyState } from "@orbit/ui";
import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat" };

/** Desktop only: phones show the conversation list instead of this pane. */
export default function ChatIndex() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState icon={<MessageCircle />} title="Pick a conversation" description="Choose a channel or message on the left, or start something new." />
    </div>
  );
}
