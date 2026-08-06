import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Parse a voice dictation / free-text work summary into structured report fields.
 *
 * NOTE: This is a DEVELOPMENT FALLBACK using rule-based text parsing.
 * It does NOT use a real AI provider. Results are clearly labeled as mocked.
 * A real AI integration (e.g. OpenAI GPT-4) should be added in a future phase.
 */
function parseWithRules(text: string) {
  const lower = text.toLowerCase();

  // Extract hours mentions
  const hoursMatch = lower.match(/(\w+)\s+hours?/);
  const hoursStr = hoursMatch?.[1];
  const hoursMap: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const hours = hoursStr ? (hoursMap[hoursStr] ?? (parseInt(hoursStr, 10) || null)) : null;

  // Injury detection
  const injuries = lower.includes("injury") || lower.includes("injured") || lower.includes("incident") && !lower.includes("no injury") && !lower.includes("no incident");

  // Delay detection
  const delayMatch = lower.match(/(\w+)[-\s]hour\s+(?:weather\s+)?delay/);
  const delayHoursStr = delayMatch?.[1];
  const delayHours = delayHoursStr ? (hoursMap[delayHoursStr] ?? (parseInt(delayHoursStr, 10) || null)) : null;

  const delays = delayHours ? `${delayHours}-hour delay noted in dictation.` : (lower.includes("delay") ? "Delay mentioned in dictation." : null);

  // Structure detection
  const poles = lower.match(/(\d+|one|two|three|four|five|six)\s+poles?/);
  const transformers = lower.match(/(\d+|one|two|three|four|five)\s+transformers?/);
  const crossarms = lower.match(/(\d+|one|two|three|four|five|six)\s+crossarms?/);
  const guyWires = lower.match(/(\d+|one|two|three|four|five|six)\s+guy\s+wires?/);

  const structures: string[] = [];
  if (poles) structures.push(`${poles[1]} poles`);
  if (transformers) structures.push(`${transformers[1]} transformers`);
  if (crossarms) structures.push(`${crossarms[1]} crossarms`);
  if (guyWires) structures.push(`${guyWires[1]} guy wires`);

  // Weather
  const weatherConditions = lower.includes("weather") ? "Weather conditions noted in dictation — please specify." : null;

  // Safety meeting
  const safetyMeeting = lower.includes("tailboard") || lower.includes("safety meeting") || lower.includes("toolbox talk");

  // Crew size
  const crewMatch = lower.match(/crew\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/);

  // Suggested time entries
  const suggestedTimeEntries = hours && hours > 0 ? [{
    employeeName: "Crew member (from dictation)",
    regularHours: Math.min(hours, 8),
    trade: "Lineman",
  }] : [];

  return {
    workPerformed: text,
    structuresInstalled: structures.length > 0 ? structures.join(", ") : null,
    delays,
    injuries: injuries || false,
    injuryDetails: injuries ? "Injury or incident mentioned in dictation — please add details." : null,
    weatherConditions,
    safetyMeeting: safetyMeeting || false,
    additionalNotes: `[Parsed from dictation] ${crewMatch ? `Crew ${crewMatch[1]} mentioned.` : ""}`.trim(),
    suggestedTimeEntries,
    suggestedMaterials: [],
  };
}

router.post("/parse-dictation", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.clerkUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { text } = req.body;
  if (!text || typeof text !== "string") { res.status(400).json({ error: "text is required" }); return; }

  logger.info({ textLength: text.length }, "Parsing dictation with rule-based fallback (no AI provider configured)");

  const parsedFields = parseWithRules(text);

  res.json({
    isMocked: true,
    parsedFields,
  });
});

export default router;
