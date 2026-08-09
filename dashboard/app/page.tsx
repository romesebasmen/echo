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
  getRadarItems,
} from "@/lib/echo/daily-briefing/service";
import { getEngagementState } from "@/lib/echo/daily-briefing/engagement";
import { getBestIdea } from "@/lib/echo/content-ideas/service";

export default async function Home() {
  const [engagementState, bestIdea, radarItems, currentFocusReminder] =
    await Promise.all([
      getEngagementState(),
      getBestIdea(),
      getRadarItems(),
      getCurrentFocus(),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-6 py-12 sm:gap-20 sm:py-16 lg:max-w-4xl lg:px-12">
      <WelcomeHeader />
      <DailyCheckInPanel />
      <DailyBriefing />
      <EngagementTracker state={engagementState} />
      <BestIdea idea={bestIdea} />
      <OnYourRadar items={radarItems} />
      <ThoughtInbox />
      <CurrentFocus reminder={currentFocusReminder} />
    </main>
  );
}
