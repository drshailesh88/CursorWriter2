import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { resolveApiUser, authErrorResponse } from '@/lib/supabase/api-auth';
import {
  buildWritingPrompt,
  type AIWritingAction,
  type AIWritingRequest,
} from '@/lib/ai-writing/types';

// Create OpenRouter provider for free models
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Model options for writing assistance
const MODEL_MAP = {
  'anthropic': anthropic('claude-3-5-sonnet-20241022'),
  'openai': openai('gpt-4o'),
  'google': google('gemini-2.0-flash-exp'),
  'openrouter-llama': openrouter('meta-llama/llama-3.3-70b-instruct:free'),
  'openrouter-qwen': openrouter('qwen/qwen-2.5-72b-instruct:free'),
};

// Use a fast, capable model by default for writing tasks
const DEFAULT_MODEL = 'anthropic';

export async function POST(req: NextRequest) {
  const authResult = await resolveApiUser(req);
  if (!authResult.userId) {
    return authErrorResponse(authResult);
  }

  try {
    const body = await req.json();
    const {
      action,
      selectedText,
      context,
      documentTitle,
      discipline,
      model = DEFAULT_MODEL,
      stream = true,
    } = body as AIWritingRequest & { model?: string; stream?: boolean };

    // Validate required fields
    if (!action || !selectedText) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: action and selectedText',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build the prompt for this action
    const prompt = buildWritingPrompt(
      action as AIWritingAction,
      selectedText,
      context,
      discipline
    );

    // Select model
    const selectedModel = MODEL_MAP[model as keyof typeof MODEL_MAP] || MODEL_MAP[DEFAULT_MODEL];

    if (stream) {
      // Stream the response
      const result = await streamText({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        system: `You are an expert academic writing assistant. Your task is to help improve, rewrite, or generate academic text.

Guidelines:
- Maintain scholarly tone and precision
- Preserve the original meaning when rewriting
- Use appropriate hedging language (may, suggests, indicates)
- Avoid first person unless specifically appropriate
- Be concise and clear
- Match the style and formality of the input

Respond ONLY with the requested output. Do not include explanations, preambles, or meta-commentary unless specifically asked.`,
        maxTokens: 2000,
        temperature: 0.7,
      });

      return result.toDataStreamResponse();
    } else {
      // Non-streaming response
      const result = await streamText({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        system: `You are an expert academic writing assistant. Respond only with the requested output, no explanations.`,
        maxTokens: 2000,
        temperature: 0.7,
      });

      // Collect the full response
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      return new Response(
        JSON.stringify({
          success: true,
          result: fullText.trim(),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('AI Writing API error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
