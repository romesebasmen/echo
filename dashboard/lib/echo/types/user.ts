export interface UserProfile {
  id: string;
  name: string;
  preferences: Record<string, string>;
  currentFocus: string;
  createdAt: string;
}
