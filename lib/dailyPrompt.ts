import dailyPromptsData from "@/data/dailyPrompts.json";
import { getUtcDateString } from "./dateUtils";

export interface DailyPrompt {
  id: string;
  title: string;
  text: string;
}

/**
 * Deterministically computes the daily prompt for today using a UTC date string seed.
 * Ensures both partners see the exact same prompt regardless of client device timezone.
 */
export function getDailyPromptForDate(dateStr: string = getUtcDateString()): DailyPrompt {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % dailyPromptsData.length;
  return dailyPromptsData[index];
}
