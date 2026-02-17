import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getOpenAIClient, generateSection } from '@/lib/openai';
import {
  VIRAL_CONCEPT_PROMPT,
  BACKGROUND_RESEARCH_PROMPT,
  INTERVIEW_TARGETS_PROMPT,
  DOCUMENTS_DATA_PROMPT,
  FOIA_PROMPT,
  STORY_STRUCTURE_PROMPT,
  VISUAL_SUGGESTIONS_PROMPT,
} from '@/lib/prompts';
import { saveIdea } from '@/lib/db';
import { ResearchPackage } from '@/lib/types';

function safeParse(text: string): Record<string, unknown> {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { raw: text };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { topic, style } = await request.json();

    if (!topic || typeof topic !== 'string') {
      return Response.json({ error: 'Topic is required' }, { status: 400 });
    }

    const client = getOpenAIClient();
    const styleContext = style ? ` The documentary style/tone should be: ${style}.` : '';
    const userPrompt = `Documentary topic: "${topic}"${styleContext}`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Section A: Viral Concept
          send({ status: 'generating', section: 'viralConcept', label: 'Crafting viral concept & angle...' });
          const viralRaw = await generateSection(client, VIRAL_CONCEPT_PROMPT, userPrompt, 0.7);
          const viralConcept = safeParse(viralRaw);
          send({ status: 'complete', section: 'viralConcept', data: viralConcept });

          // Section B: Background Research
          send({ status: 'generating', section: 'backgroundResearch', label: 'Researching background...' });
          const bgRaw = await generateSection(client, BACKGROUND_RESEARCH_PROMPT, userPrompt, 0.4);
          const backgroundResearch = safeParse(bgRaw);
          send({ status: 'complete', section: 'backgroundResearch', data: backgroundResearch });

          // Section C: Interview Targets
          send({ status: 'generating', section: 'interviewTargets', label: 'Identifying interview targets...' });
          const itRaw = await generateSection(client, INTERVIEW_TARGETS_PROMPT, userPrompt, 0.5);
          const interviewTargets = safeParse(itRaw);
          send({ status: 'complete', section: 'interviewTargets', data: interviewTargets });

          // Section D: Documents & Data
          send({ status: 'generating', section: 'documentsAndData', label: 'Finding documents & data sources...' });
          const ddRaw = await generateSection(client, DOCUMENTS_DATA_PROMPT, userPrompt, 0.4);
          const documentsAndData = safeParse(ddRaw);
          send({ status: 'complete', section: 'documentsAndData', data: documentsAndData });

          // Section E: FOIA
          send({ status: 'generating', section: 'foiaSuggestions', label: 'Drafting FOIA requests...' });
          const foiaRaw = await generateSection(client, FOIA_PROMPT, userPrompt, 0.4);
          const foiaSuggestions = safeParse(foiaRaw);
          send({ status: 'complete', section: 'foiaSuggestions', data: foiaSuggestions });

          // Section F: Story Structure
          send({ status: 'generating', section: 'storyStructure', label: 'Building story structure...' });
          const ssRaw = await generateSection(client, STORY_STRUCTURE_PROMPT, userPrompt, 0.6);
          const storyStructure = safeParse(ssRaw);
          send({ status: 'complete', section: 'storyStructure', data: storyStructure });

          // Section G: Visual Suggestions
          send({ status: 'generating', section: 'visualSuggestions', label: 'Planning visual elements...' });
          const vsRaw = await generateSection(client, VISUAL_SUGGESTIONS_PROMPT, userPrompt, 0.5);
          const visualSuggestions = safeParse(vsRaw);
          send({ status: 'complete', section: 'visualSuggestions', data: visualSuggestions });

          // Assemble and save
          const researchData: ResearchPackage = {
            viralConcept: viralConcept as unknown as ResearchPackage['viralConcept'],
            backgroundResearch: backgroundResearch as unknown as ResearchPackage['backgroundResearch'],
            interviewTargets: interviewTargets as unknown as ResearchPackage['interviewTargets'],
            documentsAndData: documentsAndData as unknown as ResearchPackage['documentsAndData'],
            foiaSuggestions: foiaSuggestions as unknown as ResearchPackage['foiaSuggestions'],
            storyStructure: storyStructure as unknown as ResearchPackage['storyStructure'],
            visualSuggestions: visualSuggestions as unknown as ResearchPackage['visualSuggestions'],
          };

          const id = uuidv4();
          await saveIdea(id, topic, style || null, researchData);

          send({ status: 'done', id, researchData });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'An unexpected error occurred';
          send({ status: 'error', error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return Response.json({ error: message }, { status: 500 });
  }
}
