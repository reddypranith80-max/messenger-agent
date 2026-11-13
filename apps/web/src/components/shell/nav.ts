import { Bell, CalendarDays, MessageCircle, Phone, Settings, type LucideIcon } from "lucide-react";

export type NavItem = { segment: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { segment: "chat", label: "Chat", icon: MessageCircle },
  { segment: "calls", label: "Calls", icon: Phone },
  { segment: "meetings", label: "Meetings", icon: CalendarDays },
  { segment: "activity", label: "Activity", icon: Bell },
  { segment: "settings", label: "Settings", icon: Settings },
];
