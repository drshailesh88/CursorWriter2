import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type { Slide, SlideContent } from '@/lib/presentations/types';

// ============================================================================
// TYPES
// ============================================================================

interface AIAssistRequest {
  action: 'regenerate' | 'expand' | 'simplify' | 'improve' | 'adapt-layout' | 'chat';
  slide: Slide;
  themeId: string;
  newLayout?: string;
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert slide content to a readable text representation for the AI
 */
function slideContentToText(slide: Slide): string {
  const { content, type, layout } = slide;
  let text = `Slide Type: ${type}\nLayout: ${layout}\n\n`;

  if (content.title) {
    text += `Title: ${content.title}\n`;
  }

  if (content.subtitle) {
    text += `Subtitle: ${content.subtitle}\n`;
  }

  if (content.bullets && content.bullets.length > 0) {
    text += '\nBullet Points:\n';
    content.bullets.forEach((bullet) => {
      const indent = '  '.repeat(bullet.level);
      text += `${indent}- ${bullet.text}\n`;
    });
  }

  if (content.leftContent && content.leftContent.length > 0) {
    text += '\nLeft Column:\n';
    content.leftContent.forEach((bullet) => {
      const indent = '  '.repeat(bullet.level);
      text += `${indent}- ${bullet.text}\n`;
    });
  }

  if (content.rightContent && content.rightContent.length > 0) {
    text += '\nRight Column:\n';
    content.rightContent.forEach((bullet) => {
      const indent = '  '.repeat(bullet.level);
      text += `${indent}- ${bullet.text}\n`;
    });
  }

  if (content.quote) {
    text += `\nQuote: "${content.quote.text}"`;
    if (content.quote.author) {
      text += `\n- ${content.quote.author}`;
    }
    if (content.quote.source) {
      text += ` (${content.quote.source}`;
      if (content.quote.year) {
        text += `, ${content.quote.year}`;
      }
      text += ')';
    }
    text += '\n';
  }

  if (content.author) {
    text += `\nAuthor: ${content.author}\n`;
  }

  if (content.institution) {
    text += `Institution: ${content.institution}\n`;
  }

  if (content.date) {
    text += `Date: ${content.date}\n`;
  }

  return text;
}

/**
 * Get the system prompt for a specific action
 */
function getSystemPrompt(action: string, themeId: string): string {
  const baseContext = `You are an expert academic presentation assistant. You help improve slides for academic presentations with a focus on clarity, scholarly tone, and visual effectiveness. The current theme is "${themeId}".`;

  const actionPrompts: Record<string, string> = {
    regenerate: `${baseContext}

Your task is to regenerate the slide content with a fresh perspective while maintaining the same core message and type. Keep the same slide type and general structure, but:
- Rephrase the content for better clarity
- Adjust bullet point hierarchy if needed
- Ensure proper academic tone
- Maintain citation integrity if present

Return ONLY a valid JSON object with the updated slide content following this structure:
{
  "title": "string (optional)",
  "subtitle": "string (optional)",
  "bullets": [{"text": "string", "level": 0|1|2, "icon": "string (optional)"}] (optional),
  "leftContent": [...] (optional, same structure as bullets),
  "rightContent": [...] (optional, same structure as bullets),
  "quote": {"text": "string", "author": "string", "source": "string", "year": number} (optional),
  "author": "string (optional)",
  "institution": "string (optional)",
  "date": "string (optional)"
}`,

    expand: `${baseContext}

Your task is to expand the slide content by adding more detail and explanation while maintaining clarity. This means:
- Add 2-3 more bullet points with supporting details
- Expand existing points with sub-bullets (increase level appropriately)
- Add context or examples where helpful
- Maintain proper academic tone and structure
- Keep the slide readable (don't overcrowd)

Return ONLY a valid JSON object with the updated slide content.`,

    simplify: `${baseContext}

Your task is to simplify the slide content by making it more concise and focused. This means:
- Reduce number of bullet points to key messages only
- Simplify language while maintaining accuracy
- Remove redundant information
- Combine related points
- Ensure each point is clear and direct
- Maintain academic integrity

Return ONLY a valid JSON object with the updated slide content.`,

    improve: `${baseContext}

Your task is to improve the writing quality of the slide content. Focus on:
- Enhancing clarity and readability
- Improving flow and logical structure
- Using stronger, more precise language
- Ensuring parallel structure in lists
- Maintaining academic tone (Eric Topol style: conversational yet authoritative)
- Checking grammar and punctuation

Return ONLY a valid JSON object with the updated slide content.`,

    'adapt-layout': `${baseContext}

Your task is to adapt the slide content to fit a new layout. Analyze the current content and restructure it appropriately for the new layout:
- If changing to "split" or two-column: divide content logically between left and right
- If changing to "centered": ensure content works well centered (usually less content)
- If changing to "full": spread content across full width
- If changing to "left-heavy" or "right-heavy": adjust content distribution
- Maintain all important information
- Ensure visual balance

Return ONLY a valid JSON object with the updated slide content.`,

    chat: `${baseContext}

You are having a conversation with the user about improving a specific slide. The user may ask questions about the content, request specific changes, or seek advice. Respond helpfully and conversationally.

If the user requests a change to the slide, include the updated slide content in your response. Otherwise, just provide helpful information.

When providing updated content, format it as JSON within your response using this format:
SLIDE_UPDATE: {json here}

Otherwise, respond naturally to the user's question or comment.`,
  };

  return actionPrompts[action] || baseContext;
}

/**
 * Parse JSON from AI response (handles various formats)
 */
function parseJSONFromResponse(text: string): SlideContent | null {
  try {
    // Try direct parse first
    return JSON.parse(text) as SlideContent;
  } catch {
    // Try to find JSON in markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as SlideContent;
      } catch {
        return null;
      }
    }

    // Try to find JSON object in text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as SlideContent;
      } catch {
        return null;
      }
    }

    return null;
  }
}

/**
 * Extract slide update from chat response
 */
function extractSlideUpdateFromChat(
  text: string
): { response: string; content: SlideContent | null } {
  const updateMatch = text.match(/SLIDE_UPDATE:\s*(\{[\s\S]*?\})/);

  if (updateMatch) {
    try {
      const content = JSON.parse(updateMatch[1]) as SlideContent;
      const response = text.replace(/SLIDE_UPDATE:\s*\{[\s\S]*?\}/, '').trim();
      return { response, content };
    } catch {
      return { response: text, content: null };
    }
  }

  return { response: text, content: null };
}

// ============================================================================
// API ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const authResult = await resolveApiUser(request);
  if (!authResult.userId) {
    return authErrorResponse(authResult);
  }

  try {
    const body = (await request.json()) as AIAssistRequest;
    const { action, slide, themeId, newLayout, message, history } = body;

    // Validate request
    if (!action || !slide || !themeId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Prepare the prompt based on action
    const systemPrompt = getSystemPrompt(action, themeId);
    const slideText = slideContentToText(slide);

    let userPrompt = '';

    if (action === 'chat') {
      if (!message) {
        return NextResponse.json(
          { success: false, error: 'Message is required for chat action' },
          { status: 400 }
        );
      }

      userPrompt = `Current Slide:\n${slideText}\n\nUser Question: ${message}`;
    } else if (action === 'adapt-layout') {
      if (!newLayout) {
        return NextResponse.json(
          { success: false, error: 'New layout is required for adapt-layout action' },
          { status: 400 }
        );
      }

      userPrompt = `Current Slide:\n${slideText}\n\nNew Layout: ${newLayout}\n\nPlease adapt the content to work well with the "${newLayout}" layout.`;
    } else {
      userPrompt = `Current Slide:\n${slideText}\n\nPlease ${action} this slide content and return the updated content as JSON.`;
    }

    // Call AI
    const model = anthropic('claude-3-5-sonnet-20241022');

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add chat history if this is a chat action
    if (action === 'chat' && history && history.length > 0) {
      messages.push(...history);
    }

    // Add current message
    messages.push({ role: 'user', content: userPrompt });

    const { text } = await generateText({
      model,
      system: systemPrompt,
      messages,
      temperature: 0.7,
      maxTokens: 2000,
    });

    // Parse response based on action
    if (action === 'chat') {
      const { response, content } = extractSlideUpdateFromChat(text);
      return NextResponse.json({
        success: true,
        response,
        content,
      });
    } else {
      const content = parseJSONFromResponse(text);

      if (!content) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to parse AI response. Please try again.',
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        content,
      });
    }
  } catch (error) {
    console.error('AI Assist API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// CORS CONFIGURATION (if needed for development)
// ============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
