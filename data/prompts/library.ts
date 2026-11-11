import type { PromptCategory, ReflectionSignal } from "@/lib/contracts";

export const PROMPT_LIBRARY_VERSION = "1" as const;

export interface OpeningPrompt {
  id: string;
  category: PromptCategory;
  text: string;
}

export interface FollowUpPrompt {
  id: string;
  target: ReflectionSignal | "deepen" | "language-neutral";
  text: string;
  anchoredText?: string;
}

const opening = (
  category: PromptCategory,
  texts: readonly string[],
): OpeningPrompt[] =>
  texts.map((text, index) => ({
    id: `opening.v1.${category}.${index + 1}`,
    category,
    text,
  }));

const followUps = (
  target: FollowUpPrompt["target"],
  prompts: ReadonlyArray<{ text: string; anchoredText?: string }>,
): FollowUpPrompt[] =>
  prompts.map((prompt, index) => ({
    id: `follow-up.v1.${target}.${index + 1}`,
    target,
    ...prompt,
  }));

export const OPENING_PROMPTS: Readonly<
  Record<PromptCategory, readonly OpeningPrompt[]>
> = {
  moment: opening("moment", [
    "What moment from today is still asking for your attention?",
    "Where did you feel most present today?",
    "What small detail do you want to remember from this day?",
    "When did the day feel different from what you expected?",
    "What happened today that you have not fully put into words?",
    "Which ordinary moment carried more weight than it first appeared to?",
    "Where did you notice yourself pause, even briefly?",
    "If you could return to one minute from today, which would it be?",
  ]),
  feeling: opening("feeling", [
    "What feeling has been nearest to the surface today?",
    "What are you carrying that has been difficult to name?",
    "When did your body tell you something before your mind did?",
    "Which emotion surprised you today?",
    "What feeling would benefit from a little more room?",
    "Where do two different feelings seem to coexist?",
    "What has softened in you, and what still feels guarded?",
    "If your mood had a texture or weather, what would it be?",
  ]),
  relationship: opening("relationship", [
    "Who has been on your mind, and what feels unfinished there?",
    "When did you feel understood—or misunderstood—recently?",
    "What did an interaction reveal about what you need?",
    "Where are you making room for someone else, and where do you need room?",
    "What have you wanted to say to someone but held back?",
    "Which relationship feels different than it did a month ago?",
    "What kindness did you receive, notice, or wish for?",
    "Where might a clearer boundary create more honesty?",
  ]),
  decision: opening("decision", [
    "What choice is quietly taking shape in you?",
    "Where are you waiting for certainty that may not come?",
    "What matters most in the decision in front of you?",
    "Which option feels expansive, and which feels protective?",
    "What would you choose if you trusted yourself a little more?",
    "What are you afraid a decision might change?",
    "Which value do you want your next choice to honor?",
    "What is the smallest honest next step you can see?",
  ]),
  change: opening("change", [
    "What is changing, even if only at the edges?",
    "What are you learning to release?",
    "Where do you notice growth that was invisible while it was happening?",
    "What no longer fits the person you are becoming?",
    "What part of change feels alive, and what part feels tender?",
    "Which transition deserves to be acknowledged today?",
    "What are you carrying forward from an earlier season?",
    "What would it mean to meet this change without rushing it?",
  ]),
  gratitude: opening("gratitude", [
    "What quietly supported you today?",
    "Who or what made the day a little more spacious?",
    "What did you nearly overlook that deserves appreciation?",
    "Which part of your life feels especially precious right now?",
    "What ordinary comfort are you grateful to have?",
    "Where did you encounter generosity today?",
    "What ability, place, or person helped you feel grounded?",
    "What are you thankful to notice in yourself?",
  ]),
  open: opening("open", [
    "Begin wherever your attention is resting.",
    "What wants to be written before you decide what it means?",
    "Let the page hold what you do not need to solve tonight.",
    "What feels most true right now?",
    "Write toward the thing you keep circling.",
    "What would you say if no explanation were required?",
    "What is taking up more inner space than you expected?",
    "Start with: Right now, I notice…",
  ]),
};

export const FOLLOW_UP_PROMPTS: Readonly<
  Record<ReflectionSignal | "deepen" | "language-neutral", readonly FollowUpPrompt[]>
> = {
  context: followUps("context", [
    {
      text: "Can you return to the moment itself—where were you, and what happened?",
      anchoredText:
        "Can you return to the moment around “{anchor}”—where were you, and what happened?",
    },
    {
      text: "What detail from the scene would help you remember it clearly?",
      anchoredText:
        "What detail from the scene around “{anchor}” would help you remember it clearly?",
    },
    {
      text: "What happened just before this, and what happened next?",
    },
    {
      text: "Who else was present, directly or in your thoughts?",
    },
    {
      text: "What did you notice through your senses in that moment?",
    },
    {
      text: "If you described only what a camera could have seen, what would be there?",
    },
    {
      text: "Which ordinary detail is still asking to be named?",
    },
  ]),
  emotion: followUps("emotion", [
    {
      text: "What made that feeling true — a person, a moment, or a relief?",
      anchoredText:
        "What made “{anchor}” feel that way — a person, a moment, or a relief?",
    },
    {
      text: "What feeling was underneath your first reaction?",
      anchoredText: "What feeling comes closest when you sit with “{anchor}”?",
    },
    {
      text: "Where do you notice this feeling in your body?",
    },
    {
      text: "If two feelings are present at once, what are they each asking for?",
    },
    {
      text: "What emotion is easiest to admit here, and which is harder?",
    },
    {
      text: "How did the feeling change as the moment unfolded?",
    },
    {
      text: "What word feels more precise than simply good, bad, or fine?",
    },
    {
      text: "If you stay with the feeling for one more breath, what else is there?",
    },
    {
      text: "What about this feeling is still sitting with you?",
    },
  ]),
  meaning: followUps("meaning", [
    {
      text: "Why does this matter to you?",
      anchoredText: "What makes “{anchor}” matter to you?",
    },
    {
      text: "What need or value of yours is close to this?",
    },
    {
      text: "What story are you telling yourself about what happened?",
    },
    {
      text: "What does your reaction reveal about what you care about?",
    },
    {
      text: "What feels at stake for you here?",
    },
    {
      text: "If this moment had something to teach you, what might it be?",
    },
    {
      text: "What would feel even a little truer than the first sentence you wrote?",
    },
  ]),
  perspective: followUps("perspective", [
    {
      text: "What might look different if you met yourself here with kindness?",
      anchoredText:
        "What might look different if you held “{anchor}” with a little more kindness?",
    },
    {
      text: "What else could be true alongside your first interpretation?",
    },
    {
      text: "What would you say to someone you care about in this same position?",
    },
    {
      text: "Which part of this is yours to carry, and which part may not be?",
    },
    {
      text: "What uncertainty can you allow without needing to resolve it yet?",
    },
    {
      text: "How might this look from the other side of the moment?",
    },
    {
      text: "What do you wish someone had understood about this without you explaining?",
    },
  ]),
  integration: followUps("integration", [
    {
      text: "What do you want to carry forward from this?",
      anchoredText: "What do you want to carry forward from “{anchor}”?",
    },
    {
      text: "What is one gentle next step that feels honest?",
    },
    {
      text: "Is there a boundary, request, or choice becoming clearer?",
    },
    {
      text: "What would honoring what you learned look like tomorrow?",
    },
    {
      text: "What do you want to remember when this feeling returns?",
    },
    {
      text: "What can remain unresolved, and what are you ready to act on?",
    },
    {
      text: "What would taking care of yourself look like with this still in the room?",
    },
  ]),
  deepen: followUps("deepen", [
    {
      text: "What remains unsaid, even after writing this?",
      anchoredText: "What remains unsaid about “{anchor}”?",
    },
    {
      text: "Where is the tension between what you want and what you need?",
    },
    {
      text: "What belief of yours is being protected or challenged here?",
    },
    {
      text: "What would become possible if you trusted what you have written?",
    },
    {
      text: "Which part of this reflection feels most alive to you now?",
    },
    {
      text: "What has shifted between your first sentence and this one?",
    },
    {
      text: "What would feel even 5% truer than the first sentence you wrote?",
    },
    {
      text: "What do you wish someone had understood about what you just wrote?",
    },
  ]),
  "language-neutral": followUps("language-neutral", [
    { text: "What feels most important in what you have just written?" },
    { text: "What else would you like this page to hold?" },
    { text: "What changed for you while you were writing?" },
    { text: "What do you want to understand more clearly?" },
    { text: "What would you like to remember from this reflection?" },
    { text: "If you stayed with this a little longer, where would you go next?" },
  ]),
};

export function getOpeningPrompts(
  category: PromptCategory,
): readonly OpeningPrompt[] {
  return OPENING_PROMPTS[category];
}

export function getFollowUpPrompts(
  target: FollowUpPrompt["target"],
): readonly FollowUpPrompt[] {
  return FOLLOW_UP_PROMPTS[target];
}

