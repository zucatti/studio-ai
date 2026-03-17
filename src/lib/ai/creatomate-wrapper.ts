/**
 * Creatomate Wrapper with Credit Management
 *
 * Wraps Creatomate API calls for video/image templating with credit management
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateCreatomateCost,
  ensureCredit,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

export interface CreatomateWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface CreatomateWrapperResult<T> {
  result: T;
  cost: number;
  renderId?: string;
}

export interface RenderOptions {
  template_id: string;
  modifications?: Record<string, unknown>;
  output_format?: 'mp4' | 'gif' | 'png' | 'jpg';
  width?: number;
  height?: number;
  frame_rate?: number;
  webhook_url?: string;
}

export interface RenderResult {
  id: string;
  status: 'queued' | 'rendering' | 'succeeded' | 'failed';
  url?: string;
  error?: string;
  snapshot_url?: string;
}

/**
 * Creatomate Wrapper with credit management
 */
export class CreatomateWrapper {
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;
  private apiKey: string;
  private baseUrl = 'https://api.creatomate.com/v1';

  constructor(options: CreatomateWrapperOptions) {
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
    this.apiKey = process.env.AI_CREATOMATE_API || '';
  }

  /**
   * Start a render job
   */
  async render(options: RenderOptions): Promise<CreatomateWrapperResult<RenderResult>> {
    const outputFormat = options.output_format || 'mp4';
    const renderType = outputFormat === 'mp4' ? 'video-render' :
                       outputFormat === 'gif' ? 'gif-render' : 'image-render';
    const estimatedCost = calculateCreatomateCost(renderType, 1);

    // Check budget
    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'creatomate',
        estimatedCost
      );
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'creatomate',
          model: renderType,
          operation: this.operation,
          project_id: this.projectId,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Make API call
    let result: RenderResult;
    try {
      const response = await fetch(`${this.baseUrl}/renders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Creatomate error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      result = Array.isArray(data) ? data[0] : data;
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'creatomate',
        model: renderType,
        operation: this.operation,
        project_id: this.projectId,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Log success
    await this.creditService.logUsage(this.userId, {
      provider: 'creatomate',
      model: renderType,
      operation: this.operation,
      project_id: this.projectId,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { renderId: result.id },
    });

    return {
      result,
      cost: estimatedCost,
      renderId: result.id,
    };
  }

  /**
   * Get render status
   */
  async getRender(renderId: string): Promise<RenderResult> {
    const response = await fetch(`${this.baseUrl}/renders/${renderId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Creatomate error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * List templates
   */
  async listTemplates(): Promise<Array<{ id: string; name: string; preview_url?: string }>> {
    const response = await fetch(`${this.baseUrl}/templates`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Creatomate error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get a specific template
   */
  async getTemplate(templateId: string): Promise<{ id: string; name: string; source: unknown }> {
    const response = await fetch(`${this.baseUrl}/templates/${templateId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Creatomate error: ${response.status}`);
    }

    return response.json();
  }
}

export function createCreatomateWrapper(options: CreatomateWrapperOptions): CreatomateWrapper {
  return new CreatomateWrapper(options);
}
