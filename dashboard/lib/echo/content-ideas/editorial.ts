import type { IdeaOfTheDay } from "../types/ui.ts";
import { creatorProfile } from "../profile.ts";

// A curated creative prompt, not a claim about observed audience behavior or
// current social performance. Future data-backed ideas should use their own
// source-aware service branch rather than being mixed into this fixture.
export const editorialIdeaOfTheDay: IdeaOfTheDay = {
  id: "idea-cancel-subscriptions",
  title: "Subscription cancellation flows should be illegal",
  concept:
    "Film yourself trying to cancel a real subscription on camera, narrating the friction in real time, dry and unbothered rather than outraged.",
  platform: "TikTok",
  whyItFits:
    "Reactive, low-production, and driven by a real annoyance instead of a performed persona. It is a useful format hypothesis to test, not a conclusion from performance data.",
  hook: "\"This company made cancelling harder than signing a lease.\"",
  effort: "Low",
  seriesPotential: creatorProfile.recurringSeries,
  confidence: "High",
  evidenceBasis: [
    {
      label:
        "The premise directly fits the configured Things That Should Be Illegal series.",
      kind: "hypothesis",
    },
    {
      label:
        "A complaint-led opening gives this concept a clear, immediate premise.",
      kind: "hypothesis",
    },
    {
      label:
        "A simple reaction format is worth testing against more scripted ideas.",
      kind: "hypothesis",
    },
  ],
};
