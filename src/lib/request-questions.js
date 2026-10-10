// Service-specific request questions: used at build time (the form markup), in the browser (reveal + validation
// messages) and on the server (the only place answers are trusted). The data lives in src/request-questions.json.
import data from '../request-questions.json' with { type: 'json' };

export const ISSUE_SATISFIES_DESCRIPTION = data.issueSatisfiesDescription === true;
export const TIMING = data.timing;
export const DEFAULT_PLACEHOLDER = data.defaultPlaceholder;
const SERVICES = new Map(Object.entries(data.services));
export const NON_ANSWERS = new Set(['other', 'unknown']);

export const hasQuestions = (serviceId) => SERVICES.has(serviceId);
export const questionsFor = (serviceId) => SERVICES.get(serviceId)?.questions ?? [];
export const placeholderFor = (serviceId) => SERVICES.get(serviceId)?.placeholder ?? data.defaultPlaceholder;
export const announceFor = (serviceId) => SERVICES.get(serviceId)?.announce ?? '';
export const fieldName = (questionId) => `q_${questionId}`;

/** True if this timing id is one we offer. */
export const isTiming = (value) => TIMING.some((t) => t.id === value);
export const timingLabel = (value) => TIMING.find((t) => t.id === value)?.label ?? '';

/**
 * Read the answers a visitor sent for one service. Anything that is not an exact, known option id is dropped
 * (never trusted, never echoed), answers for another service's questions are ignored, and every answer is turned
 * into its label so the email never shows a raw value.
 * @param {string} serviceId
 * @param {(name: string) => string} read  returns the submitted string for a field name, or ''
 * @returns {{ answers: {question: string, answer: string, id: string, value: string}[], issueAnswered: boolean }}
 */
export function readAnswers(serviceId, read) {
  const answers = [];
  let issueAnswered = false;
  for (const q of questionsFor(serviceId)) {
    const raw = String(read(fieldName(q.id)) ?? '').trim();
    const option = q.options.find((o) => o.id === raw);
    if (!option) continue;
    answers.push({ question: q.label, answer: option.label, id: q.id, value: option.id });
    // "Something else" and "don't know" tell Shane nothing, so they do not stand in for a written description.
    if (q.issue && !NON_ANSWERS.has(option.id)) issueAnswered = true;
  }
  return { answers, issueAnswered };
}
