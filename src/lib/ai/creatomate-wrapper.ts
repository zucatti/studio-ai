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

  /**
   * Merge video and audio into a single video file
   * Uses Creatomate's source-based rendering (no template needed)
   */
  async mergeVideoAudio(options: {
    videoUrl: string;
    audioUrl: string;
    width: number;
    height: number;
    duration?: number;
  }): Promise<CreatomateWrapperResult<RenderResult>> {
    const estimatedCost = calculateCreatomateCost('video-render', 1);

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
          model: 'video-merge',
          operation: this.operation,
          project_id: this.projectId,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Create source-based render request
    const source = {
      output_format: 'mp4',
      width: options.width,
      height: options.height,
      duration: options.duration,
      elements: [
        {
          type: 'video',
          source: options.videoUrl,
          // Fill the frame
          x: '50%',
          y: '50%',
          width: '100%',
          height: '100%',
          fit: 'cover',
          // IMPORTANT: Mute original video audio to avoid multiple tracks
          volume: 0,
        },
        {
          type: 'audio',
          source: options.audioUrl,
          // Start from beginning
          time: 0,
          // Full volume for dialogue
          volume: 1,
        },
      ],
    };

    let result: RenderResult;
    try {
      const response = await fetch(`${this.baseUrl}/renders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ source }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Creatomate merge error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      result = Array.isArray(data) ? data[0] : data;
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'creatomate',
        model: 'video-merge',
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
      model: 'video-merge',
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
   * Concatenate multiple videos into one
   * Videos are placed sequentially on a timeline
   */
  async concatenateVideos(options: {
    videoUrls: string[];
    width: number;
    height: number;
  }): Promise<CreatomateWrapperResult<RenderResult>> {
    const estimatedCost = calculateCreatomateCost('video-render', 1);

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
          model: 'video-concat',
          operation: this.operation,
          project_id: this.projectId,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Create video elements on the same track - they play in sequence
    const videoElements = options.videoUrls.map((url, index) => ({
      type: 'video' as const,
      track: 1,
      source: url,
      // Add a short crossfade transition between clips (except for first)
      ...(index > 0 ? {
        animations: [{
          time: 'start',
          duration: 0.3,
          transition: true,
          type: 'fade',
        }],
      } : {}),
    }));

    const source = {
      output_format: 'mp4',
      width: options.width,
      height: options.height,
      elements: videoElements,
    };

    let result: RenderResult;
    try {
      const payload = { source };
      console.log('[Creatomate] Concatenation payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(`${this.baseUrl}/renders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Creatomate] API error:', response.status, errorText);
        throw new Error(`Creatomate concat error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[Creatomate] Render started:', data);
      result = Array.isArray(data) ? data[0] : data;
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'creatomate',
        model: 'video-concat',
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
      model: 'video-concat',
      operation: this.operation,
      project_id: this.projectId,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { renderId: result.id, videoCount: options.videoUrls.length },
    });

    return {
      result,
      cost: estimatedCost,
      renderId: result.id,
    };
  }

  /**
   * Poll for render completion
   */
  async waitForRender(renderId: string, maxAttempts = 60, intervalMs = 2000): Promise<RenderResult> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.getRender(renderId);

      if (result.status === 'succeeded') {
        return result;
      }

      if (result.status === 'failed') {
        throw new Error(`Render failed: ${result.error || 'Unknown error'}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Render timeout');
  }
}

export function createCreatomateWrapper(options: CreatomateWrapperOptions): CreatomateWrapper {
  return new CreatomateWrapper(options);
}
