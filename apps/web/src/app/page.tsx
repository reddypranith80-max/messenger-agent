import { auth } from "@clerk/nextjs/server";
import { Card, buttonVariants, cn } from "@orbit/ui";
import { CalendarDays, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  { icon: MessageCircle, title: "Chat", text: "Channels, direct messages, threads and reactions." },
  { icon: Phone, title: "Calls", text: "Audio, video and screen sharing from any conversation." },
  { icon: CalendarDays, title: "Meetings", text: "Schedule, invite and join with one link." },
  { icon: ShieldCheck, title: "Private by design", text: "Every workspace's data is isolated from every other." },
];

export default async function LandingPage() {
  const { userId } = await auth();
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 pt-safe">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-[30%] bg-primary text-primary-foreground">
            <span className="size-3 rounded-full border-[3px] border-current" />
          </span>
          Orbit
        </span>
        {userId ? (
          <Link href="/app" className={buttonVariants({ size: "sm" })}>
            Open Orbit
          </Link>
        ) : (
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Sign in
          </Link>
        )}
      </header>

      <main className="flex flex-1 flex-col justify-center gap-10 py-12">
        <div className="max-w-2xl">
          <h1 className="text-5xl leading-[1.05] font-extrabold tracking-tight text-balance md:text-7xl">
            Your team, in one calm place.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground md:text-xl">
            Orbit brings chat, calls and meetings together so work keeps moving without ten open tabs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={userId ? "/app" : "/sign-up"} className={buttonVariants({ size: "lg" })}>
              {userId ? "Open Orbit" : "Get started free"}
            </Link>
            {userId ? null : (
              <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "lg" })}>
                I have an account
              </Link>
            )}
          </div>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Card className="h-full p-5">
                <span className={cn("flex size-11 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground")}>
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-4 text-[17px] font-bold">{title}</h2>
                <p className="mt-1 text-[15px] text-muted-foreground">{text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 py-6 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Orbit</span>
        <a
          href="https://github.com/reddypranith80-max/messenger-agent"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          View the source on GitHub
        </a>
      </footer>
    </div>
  );
}
