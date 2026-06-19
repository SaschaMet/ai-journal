import entryAnalysisPrompt from "./entry-analysis.md" with { type: "text" };
import guidingPromptsPrompt from "./guiding-prompts.md" with { type: "text" };

/**
 * System prompts loaded from the editable Markdown files in this directory.
 * See `README.md` for how to change them.
 */
export const GUIDING_PROMPTS_SYSTEM_PROMPT = guidingPromptsPrompt.trim();
export const ENTRY_ANALYSIS_SYSTEM_PROMPT = entryAnalysisPrompt.trim();
