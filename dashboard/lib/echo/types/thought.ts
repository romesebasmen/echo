// The `thoughts` table's `status` column is free-text with an observed
// default of "inbox" and no enforced enum in the exposed schema.
export type ThoughtStatus = string;

export interface Thought {
  id: string;
  userId: string;
  content: string;
  context?: string;
  possibleFormat?: string;
  status: ThoughtStatus;
  createdAt: string;
  updatedAt: string;
}
