import { z } from 'zod';

const strings = z.array(z.string());
const timestamp = z.number().finite().nonnegative();
export const scientificWorkSchema = z.object({
  id: z.string(), title: z.string(), authors: strings.default([]), year: z.number().int().nullable().default(null),
  sourceName: z.string().nullable().default(null), citationCount: z.number().int().nullable().default(null),
  doi: z.string().nullable().default(null), url: z.string().default(''), topics: strings.default([]), abstract: z.string().nullable().default(null),
});
const matchSchema = z.object({ publication: scientificWorkSchema, matchReason: z.string(), similarity: z.enum(['high', 'partial', 'adjacent', 'insufficient']), evidenceLevel: z.enum(['adequate', 'limited', 'insufficient']) });
const analysisSchema = z.object({
  problem: z.string(), relevance: z.string(), possibleNovelty: z.string(), topicOptions: strings, goal: z.string(),
  tasks: strings, recommendedMethods: strings, researchPlan: strings, literatureSearchQueries: strings, evidenceNote: z.string(), sources: z.array(scientificWorkSchema),
});
export const draftSchema = z.object({
  id: z.string(), text: z.string(), updatedAt: timestamp,
  research: z.object({ originalIdea: z.string(), clarificationRounds: z.array(z.object({ questions: strings, answers: strings })), confirmedTopic: z.string(), analysis: analysisSchema, savedAt: timestamp }).optional().catch(undefined),
  ideaCheck: z.object({ idea: z.string(), selectedMatches: z.array(matchSchema), savedAt: timestamp }).optional().catch(undefined),
});
export const sourceSchema = z.object({ work: scientificWorkSchema, savedAt: timestamp.default(() => Date.now()), draftIds: strings.default([]) });
const sectionSchema = z.object({ id: z.string(), title: z.string(), purpose: z.string(), guidingQuestions: strings });
const planSchema = z.object({ workingTitle: z.string(), problem: z.string(), goal: z.string(), tasks: strings, methodology: strings, sections: z.array(sectionSchema).min(1), evidenceNote: z.string() });
const guidanceSchema = z.object({ researchNotes: strings, questionsForResearcher: strings, evidenceSummary: z.string(), limitations: z.string() });
export const articleSchema = z.object({
  id: z.string(), revision: z.number().int().nonnegative().default(0), format: z.literal('article'), idea: z.string(), researchId: z.string(), sourceIds: strings,
  plan: planSchema.nullable().catch(null), structureApproved: z.boolean().default(false), sectionGuidance: z.record(guidanceSchema).catch({}), savedAt: timestamp,
}).transform(value => ({ ...value, structureApproved: value.structureApproved && value.plan !== null }));
const checklistSchema = z.object({
  criteria: z.array(z.object({ category: z.enum(['scope', 'language', 'structure', 'abstract', 'keywords', 'formatting', 'other']), status: z.enum(['specified', 'not_specified']), requirement: z.string(), evidenceQuote: z.string() })),
  checklist: z.array(z.object({ id: z.string(), title: z.string(), details: z.string(), evidenceQuote: z.string() })), limitations: z.string(),
});
export const publicationSchema = z.object({
  id: z.string(), revision: z.number().int().nonnegative().default(0), workTitle: z.string(), scienceArea: z.string(), researchId: z.string().default(''), journalName: z.string(), journalMode: z.enum(['known', 'search']), requirementsText: z.string(),
  result: checklistSchema.nullable().catch(null), checkedItemIds: strings.default([]), savedAt: timestamp,
});
export const researchProfileSchema = z.object({
  fullName: z.string().max(5000), organization: z.string().max(5000), position: z.string().max(5000), academicDegree: z.string().max(5000), academicTitle: z.string().max(5000), scienceArea: z.string().max(5000), specialization: z.string().max(5000), researchTopics: z.string().max(5000),
  interfaceLanguage: z.enum(['ru','kk']), researcherLevel: z.enum(['beginner','experienced','masters','doctoral']), aiResponseStyle: z.enum(['clear','academic','detailed']),
});
