/**
 * Claude (Anthropic) API Wrapper with Credit Management
 *
 * Wraps all Claude API calls to:
 * 1. Estimate cost before the call
 * 2. Check available budget
 * 3. Make the API call
 * 4. Log actual usage
 * 5. Trigger alerts if needed
 */

import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateClaudeCost,
  ensureCredit,
  CLAUDE_PRICES,
} from '@/lib/credits';
import { CreditError, isCreditError, formatCreditError } from './credit-error';

// Default model if not specified
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// Token estimation: rough approximation (4 chars per token on average)
const CHARS_PER_TOKEN = 4;

export interface ClaudeWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface ClaudeMessageOptions {
  model?: string;
  max_tokens?: number;
  messages: Anthropic.MessageParam[];
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}

export interface ClaudeWrapperResult {
  message: Anthropic.Message;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Estimate input tokens from message content
 */
function estimateInputTokens(
  messages: Anthropic.MessageParam[],
  system?: string
): number {
  let totalChars = 0;

  // Count system prompt
  if (system) {
    totalChars += system.length;
  }

  // Count message content
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          totalChars += block.text.length;
        } else if (block.type === 'image') {
          // Images cost roughly 1000-2000 tokens depending on size
          totalChars += 6000; // ~1500 tokens estimated
        }
      }
    }
  }

  // Add some overhead for message formatting
  totalChars += messages.length * 20;

  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

/**
 * Create a wrapped Claude client with credit management
 */
export class ClaudeWrapper {
  private client: Anthropic;
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;

  constructor(options: ClaudeWrapperOptions) {
    this.client = new Anthropic({
      apiKey: process.env.AI_CLAUDE_KEY,
    });
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
  }

  /**
   * Create a message with automatic credit management
   */
  async createMessage(
    options: ClaudeMessageOptions
  ): Promise<ClaudeWrapperResult> {
    const model = options.model || DEFAULT_MODEL;
    const maxTokens = options.max_tokens || 4096;

    // Step 1: Estimate cost before the call
    const estimatedInputTokens = estimateInputTokens(
      options.messages,
      options.system
    );
    // Assume we'll use about half of max_tokens on average
    const estimatedOutputTokens = Math.ceil(maxTokens * 0.5);
    const estimatedCost = calculateClaudeCost(
      model,
      estimatedInputTokens,
      estimatedOutputTokens
    );

    // Step 2: Check budget
    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'claude',
        estimatedCost
      );
    } catch (error) {
      // Log the blocked call
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'claude',
          model,
          operation: this.operation,
          project_id: this.projectId,
          input_tokens: estimatedInputTokens,
          output_tokens: 0,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Step 3: Make the API call
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: options.messages,
        system: options.system,
        temperature: options.temperature,
        top_p: options.top_p,
        stop_sequences: options.stop_sequences,
      });
    } catch (error) {
      // Log failed call
      await this.creditService.logUsage(this.userId, {
        provider: 'claude',
        model,
        operation: this.operation,
        project_id: this.projectId,
        input_tokens: estimatedInputTokens,
        output_tokens: 0,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Step 4: Calculate actual cost and log usage
    const actualInputTokens = message.usage.input_tokens;
    const actualOutputTokens = message.usage.output_tokens;
    const actualCost = calculateClaudeCost(
      model,
      actualInputTokens,
      actualOutputTokens
    );

    await this.creditService.logUsage(this.userId, {
      provider: 'claude',
      model,
      operation: this.operation,
      project_id: this.projectId,
      input_tokens: actualInputTokens,
      output_tokens: actualOutputTokens,
      estimated_cost: actualCost,
      status: 'success',
      metadata: {
        stop_reason: message.stop_reason,
      },
    });

    return {
      message,
      cost: actualCost,
      inputTokens: actualInputTokens,
      outputTokens: actualOutputTokens,
    };
  }

  /**
   * Get the underlying Anthropic client for advanced usage
   * Note: Using this directly bypasses credit management!
   */
  getClient(): Anthropic {
    return this.client;
  }
}

/**
 * Create a Claude wrapper instance
 */
export function createClaudeWrapper(options: ClaudeWrapperOptions): ClaudeWrapper {
  return new ClaudeWrapper(options);
}

/**
 * Helper to extract text content from a Claude message
 */
export function extractTextContent(message: Anthropic.Message): string {
  const textBlocks = message.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  return textBlocks.map((block) => block.text).join('');
}

/**
 * Helper to parse JSON from Claude response (handles markdown code blocks)
 */
export function parseJsonResponse<T>(message: Anthropic.Message): T {
  const text = extractTextContent(message);

  // Try to extract JSON from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let jsonString = jsonMatch ? jsonMatch[1].trim() : text.trim();

  // Handle malformed JSON that doesn't start with {
  if (!jsonString.startsWith('{') && !jsonString.startsWith('[')) {
    const jsonStart = jsonString.indexOf('{');
    const arrayStart = jsonString.indexOf('[');
    const start = jsonStart === -1 ? arrayStart :
                  arrayStart === -1 ? jsonStart :
                  Math.min(jsonStart, arrayStart);

    if (start !== -1) {
      const isArray = jsonString[start] === '[';
      const end = isArray
        ? jsonString.lastIndexOf(']')
        : jsonString.lastIndexOf('}');
      if (end !== -1) {
        jsonString = jsonString.substring(start, end + 1);
      }
    }
  }

  return JSON.parse(jsonString);
}
