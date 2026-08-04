import { WelcomeHeader } from "@/components/echo/WelcomeHeader";
import { DailyBriefing } from "@/components/echo/DailyBriefing";
import { EngagementTracker } from "@/components/echo/EngagementTracker";
import { BestIdea } from "@/components/echo/BestIdea";
import { OnYourRadar } from "@/components/echo/OnYourRadar";
import { ThoughtInbox } from "@/components/echo/ThoughtInbox";
import { CurrentFocus } from "@/components/echo/CurrentFocus";
import { DailyCheckInPanel } from "@/components/echo/day-plan/DailyCheckInPanel";
import {
  getCurrentFocus,
  getEngagementSnapshot,
  getRadarItems,
} from "@/lib/echo/daily-briefing/service";
import { getBestIdea } from "@/lib/echo/content-ideas/service";

export default async function Home() {
  const [engagementSnapshot, bestIdea, radarItems, currentFocusReminder] =
    await Promise.all([
      getEngagementSnapshot(),
      getBestIdea(),
      getRadarItems(),
      getCurrentFocus(),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-6 py-12 sm:gap-20 sm:py-16 lg:max-w-4xl lg:px-12">
      <WelcomeHeader />
      <DailyCheckInPanel />
      <DailyBriefing />
      <EngagementTracker snapshot={engagementSnapshot} />
      <BestIdea idea={bestIdea} />
      <OnYourRadar items={radarItems} />
      <ThoughtInbox />
      <CurrentFocus reminder={currentFocusReminder} />
    </main>
  );
}
