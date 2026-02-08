import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { BlockingQuestion, StructuredAnswers } from "./types.js";

const MAX_BLOCKING_QUESTIONS = 5;

export async function askBlockingQuestions(
  ctx: ExtensionContext,
  questions: BlockingQuestion[],
): Promise<StructuredAnswers> {
  const limited = questions.slice(0, MAX_BLOCKING_QUESTIONS);
  const answers: StructuredAnswers = {};

  for (const q of limited) {
    if (q.choices && q.choices.length > 0 && ctx.hasUI) {
      const selected = await ctx.ui.select(`${q.prompt} (blocking)`, q.choices);
      const selectedIndex = selected ? q.choices.indexOf(selected) + 1 : undefined;
      answers[q.id] = {
        questionId: q.id,
        blocking: true,
        answer: selected ?? "No answer provided",
        choiceIndex: selectedIndex,
      };
      continue;
    }

    if (ctx.hasUI) {
      const typed = await ctx.ui.input(`${q.prompt} (blocking)`, "Type answer");
      answers[q.id] = {
        questionId: q.id,
        blocking: true,
        answer: typed?.trim() || "No answer provided",
      };
      continue;
    }

    answers[q.id] = {
      questionId: q.id,
      blocking: true,
      answer: "No UI available. Answer required from user in interactive mode.",
    };
  }

  return answers;
}

export { MAX_BLOCKING_QUESTIONS };
