// Sebastián's fixed set of active responsibilities. Not a database table —
// this list is short, personal, and not expected to change often; a
// configurable "manage my responsibility areas" system would be exactly the
// generic-task-manager overreach the Task Engine is deliberately avoiding.
export type ResponsibilityArea =
  | "texas-am"
  | "nrhh"
  | "ad-nrhh"
  | "tiktok"
  | "youtube"
  | "etsy"
  | "echo"
  | "family-personal"
  | "health";

export const RESPONSIBILITY_AREAS: ResponsibilityArea[] = [
  "texas-am",
  "nrhh",
  "ad-nrhh",
  "tiktok",
  "youtube",
  "etsy",
  "echo",
  "family-personal",
  "health",
];

export const RESPONSIBILITY_AREA_LABELS: Record<ResponsibilityArea, string> = {
  "texas-am": "Texas A&M",
  nrhh: "NRHH",
  "ad-nrhh": "AD-NRHH",
  tiktok: "TikTok",
  youtube: "YouTube",
  etsy: "Etsy",
  echo: "Echo",
  "family-personal": "Family / Personal",
  health: "Health",
};
