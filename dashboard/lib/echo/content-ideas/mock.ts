import type { ContentIdea, IdeaOfTheDay } from "@/lib/echo/types";
import { creatorProfile } from "@/lib/echo/profile";

export const ideaOfTheDay: IdeaOfTheDay = {
  id: "idea-cancel-subscriptions",
  title: "Subscription cancellation flows should be illegal",
  concept:
    "Film yourself trying to cancel a real subscription on camera, narrating the friction in real time, dry and unbothered rather than outraged.",
  platform: "TikTok",
  whyItFits:
    "Reactive, low-production, and driven by a real annoyance instead of a performed persona. Matches how you're strongest: responding to something instead of scripting a bit.",
  hook: "\"This company made cancelling harder than signing a lease.\"",
  effort: "Low",
  seriesPotential: `${creatorProfile.recurringSeries}`,
  confidence: "High",
  evidenceBasis: [
    {
      label:
        "You've complained about confusing cancellation flows more than once recently.",
      kind: "explicit",
    },
    {
      label:
        "Your last three best-performing posts all opened with a complaint.",
      kind: "pattern",
    },
    {
      label:
        "Reaction-driven, single-frustration videos may be outperforming scripted formats for you right now.",
      kind: "hypothesis",
    },
  ],
};

export const contentIdeas: ContentIdea[] = [
  {
    id: ideaOfTheDay.id,
    userId: creatorProfile.id,
    title: ideaOfTheDay.title,
    concept: ideaOfTheDay.concept,
    platform: ideaOfTheDay.platform,
    hook: ideaOfTheDay.hook,
    status: "suggested",
    createdAt: new Date().toISOString(),
  },
  {
    id: "idea-worst-group-project",
    userId: creatorProfile.id,
    title: "Ranking your worst group project experiences",
    concept:
      "A straight-faced recap of the worst group project roles you've been stuck with, ranked.",
    platform: "TikTok",
    hook: "\"I've been the free-rider once. Never again.\"",
    status: "suggested",
    createdAt: new Date().toISOString(),
  },
  {
    id: "idea-parking-field-report",
    userId: creatorProfile.id,
    title: "TAMU parking field report",
    concept: "A short, dry walkthrough of this week's parking chaos on campus.",
    platform: "Instagram",
    hook: "\"They closed two more lots and told us to be patient.\"",
    status: "suggested",
    createdAt: new Date().toISOString(),
  },
];
