import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import { getOpenAIClient, generateSection } from '@/lib/openai';
import {
  DAILY_TOPIC_PROMPT,
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
import { buildEmailHtml } from '@/lib/email';

function safeParse(text: string): Record<string, unknown> {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { raw: text };
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret =
    request.nextUrl.searchParams.get('secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = getOpenAIClient();

    // Step 1: Generate a trending topic
    const topicResponse = await generateSection(
      client,
      DAILY_TOPIC_PROMPT,
      'Generate one viral documentary topic for today.',
      0.9
    );
    const topic = topicResponse.trim().replace(/^["']|["']$/g, '');

    // Step 2: Run full pipeline
    const userPrompt = `Documentary topic: "${topic}"`;

    const viralConcept = safeParse(
      await generateSection(client, VIRAL_CONCEPT_PROMPT, userPrompt, 0.7)
    );
    const backgroundResearch = safeParse(
      await generateSection(client, BACKGROUND_RESEARCH_PROMPT, userPrompt, 0.4)
    );
    const interviewTargets = safeParse(
      await generateSection(client, INTERVIEW_TARGETS_PROMPT, userPrompt, 0.5)
    );
    const documentsAndData = safeParse(
      await generateSection(client, DOCUMENTS_DATA_PROMPT, userPrompt, 0.4)
    );
    const foiaSuggestions = safeParse(
      await generateSection(client, FOIA_PROMPT, userPrompt, 0.4)
    );
    const storyStructure = safeParse(
      await generateSection(client, STORY_STRUCTURE_PROMPT, userPrompt, 0.6)
    );
    const visualSuggestions = safeParse(
      await generateSection(client, VISUAL_SUGGESTIONS_PROMPT, userPrompt, 0.5)
    );

    const researchData: ResearchPackage = {
      viralConcept: viralConcept as unknown as ResearchPackage['viralConcept'],
      backgroundResearch: backgroundResearch as unknown as ResearchPackage['backgroundResearch'],
      interviewTargets: interviewTargets as unknown as ResearchPackage['interviewTargets'],
      documentsAndData: documentsAndData as unknown as ResearchPackage['documentsAndData'],
      foiaSuggestions: foiaSuggestions as unknown as ResearchPackage['foiaSuggestions'],
      storyStructure: storyStructure as unknown as ResearchPackage['storyStructure'],
      visualSuggestions: visualSuggestions as unknown as ResearchPackage['visualSuggestions'],
    };

    // Step 3: Save to DB
    const id = uuidv4();
    await saveIdea(id, topic, null, researchData, true);

    // Step 4: Send email
    const topTitle = researchData.viralConcept?.titles?.[0] || topic;
    const resendApiKey = process.env.RESEND_API_KEY;
    let emailSent = false;

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      const emailHtml = buildEmailHtml(topic, researchData);

      await resend.emails.send({
        from: 'DeepCut <onboarding@resend.dev>',
        to: ['jpsthesecond@gmail.com'],
        subject: `🎬 DeepCut Daily: ${topTitle}`,
        html: emailHtml,
      });
      emailSent = true;
    }

    return Response.json({
      success: true,
      id,
      topic,
      topTitle,
      emailSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return Response.json({ error: message }, { status: 500 });
  }
}
