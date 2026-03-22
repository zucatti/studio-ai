/**
 * WaveSpeedAI Wrapper with Credit Management
 *
 * API Base: https://api.wavespeed.ai/api/v3
 * Auth: Bearer token
 * Docs: https://wavespeed.ai/docs
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateWavespeedCost,
  ensureCredit,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

export interface WavespeedWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface WavespeedWrapperResult<T> {
  result: T;
  cost: number;
  taskId?: string;
}

export interface WavespeedTaskResult {
  task_id: string;
  status: 'created' | 'processing' | 'completed' | 'failed';
  outputs?: string[];
  error?: string;
  timings?: { inference: number };
}

// Models available on WaveSpeed (2026 catalog)
// Format: provider/model-name/operation (e.g., kwaivgi/kling-video-o3-pro/image-to-video)
export type WavespeedModel = string;

// Video models 2026
export const WAVESPEED_VIDEO_MODELS = {
  // Kling
  'kling-o3-pro': 'kwaivgi/kling-video-o3-pro/image-to-video',
  'kling-o3-std': 'kwaivgi/kling-video-o3-std/image-to-video',
  // Sora
  'sora-2': 'openai/sora-2/image-to-video',
  'sora-2-pro': 'openai/sora-2-pro/image-to-video',
  // Veo
  'veo-3.1': 'google/veo3.1/image-to-video',
  // Seedance
  'seedance-2': 'bytedance/seedance-v2.0/image-to-video',
  'seedance-1.5': 'bytedance/seedance-v1.5-pro/image-to-video',
  // WAN
  'wan-2.6': 'alibaba/wan-2.6/image-to-video',
  'wan-2.5': 'alibaba/wan-2.5/image-to-video',
  // OmniHuman
  'omnihuman-1.5': 'bytedance/omnihuman-1.5/image-to-video',
} as const;

export interface ImageGenerationInput {
  model: WavespeedModel;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_images?: number;
  seed?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
}

export interface VideoGenerationInput {
  model: WavespeedModel;
  prompt?: string;
  image_url?: string;
  image_end_url?: string;
  duration?: number;
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  audio_url?: string; // For OmniHuman and talking head models
}

/**
 * WaveSpeed Wrapper with credit management
 */
export class WavespeedWrapper {
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;
  private apiKey: string;
  private baseUrl = 'https://api.wavespeed.ai/api/v3';

  constructor(options: WavespeedWrapperOptions) {
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
    this.apiKey = process.env.AI_WAVESPEED || '';
  }

  /**
   * Generate image(s)
   */
  async generateImage(input: ImageGenerationInput): Promise<WavespeedWrapperResult<WavespeedTaskResult>> {
    const estimatedCost = calculateWavespeedCost(input.model, input.num_images || 1);

    // Check budget
    try {
      await ensureCredit(this.creditService, this.userId, 'wavespeed', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'wavespeed',
          model: input.model,
          operation: this.operation,
          project_id: this.projectId,
          images_count: input.num_images || 1,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Submit task
    let result: WavespeedTaskResult;
    try {
      const response = await fetch(`${this.baseUrl}/wavespeed-ai/${input.model}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          prompt: input.prompt,
          negative_prompt: input.negative_prompt,
          width: input.width || 1024,
          height: input.height || 1024,
          num_images: input.num_images || 1,
          seed: input.seed,
          guidance_scale: input.guidance_scale || 7.5,
          num_inference_steps: input.num_inference_steps || 30,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.code !== 200) {
        throw new Error(`WaveSpeed error: ${response.status} - ${JSON.stringify(data)}`);
      }

      result = {
        task_id: data.data?.id,
        status: data.data?.status || 'processing',
        outputs: data.data?.outputs,
      };
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'wavespeed',
        model: input.model,
        operation: this.operation,
        project_id: this.projectId,
        images_count: input.num_images || 1,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Log success
    await this.creditService.logUsage(this.userId, {
      provider: 'wavespeed',
      model: input.model,
      operation: this.operation,
      project_id: this.projectId,
      images_count: input.num_images || 1,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return { result, cost: estimatedCost, taskId: result.task_id };
  }

  /**
   * Generate video
   */
  async generateVideo(input: VideoGenerationInput): Promise<WavespeedWrapperResult<WavespeedTaskResult>> {
    const estimatedCost = calculateWavespeedCost(input.model, 1, input.duration || 5);

    try {
      await ensureCredit(this.creditService, this.userId, 'wavespeed', estimatedCost);
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'wavespeed',
          model: input.model,
          operation: this.operation,
          project_id: this.projectId,
          video_duration: input.duration || 5,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    let result: WavespeedTaskResult;
    try {
      // Check if this is OmniHuman (talking head model - different API)
      const isOmniHuman = input.model.includes('omni-human');

      let body: Record<string, unknown>;

      if (isOmniHuman) {
        // OmniHuman uses image + audio, not prompt
        if (!input.audio_url) {
          throw new Error('OmniHuman requires audio. Enable dialogue with a character voice.');
        }
        if (!input.image_url) {
          throw new Error('OmniHuman requires an image (Frame In).');
        }
        body = {
          image: input.image_url,
          audio: input.audio_url,
        };
        console.log(`[WaveSpeed] OmniHuman request - image: ${input.image_url.substring(0, 80)}...`);
        console.log(`[WaveSpeed] OmniHuman request - audio: ${input.audio_url.substring(0, 80)}...`);
      } else {
        // Standard video generation - WaveSpeed uses "image" not "image_url"
        body = {
          prompt: input.prompt || 'Smooth cinematic motion',
          duration: input.duration || 5,
          aspect_ratio: input.aspect_ratio || '16:9',
        };

        if (input.image_url) {
          body.image = input.image_url;
        }
        if (input.image_end_url) {
          body.end_image = input.image_end_url;
        }
      }

      // Model can be a full path (e.g., kwaivgi/kling-video-o3-pro/image-to-video)
      // or a short name that we map to the full path
      const modelPath = input.model.includes('/') ? input.model : `wavespeed-ai/${input.model}`;

      const requestUrl = `${this.baseUrl}/${modelPath}`;
      console.log(`[WaveSpeed] POST ${requestUrl}`);
      console.log(`[WaveSpeed] Body:`, JSON.stringify(body, null, 2));

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      console.log(`[WaveSpeed] Response status: ${response.status}`);
      console.log(`[WaveSpeed] Response text: ${responseText.substring(0, 500)}`);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`WaveSpeed returned invalid JSON: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok || data.code !== 200) {
        throw new Error(`WaveSpeed video error: ${response.status} - ${JSON.stringify(data)}`);
      }

      result = {
        task_id: data.data?.id,
        status: data.data?.status || 'processing',
        outputs: data.data?.outputs,
      };
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'wavespeed',
        model: input.model,
        operation: this.operation,
        project_id: this.projectId,
        video_duration: input.duration || 5,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    await this.creditService.logUsage(this.userId, {
      provider: 'wavespeed',
      model: input.model,
      operation: this.operation,
      project_id: this.projectId,
      video_duration: input.duration || 5,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: { taskId: result.task_id },
    });

    return { result, cost: estimatedCost, taskId: result.task_id };
  }

  /**
   * Get task status
   */
  async getTask(taskId: string): Promise<WavespeedTaskResult> {
    const url = `${this.baseUrl}/predictions/${taskId}/result`;
    console.log(`[WaveSpeed] Polling: GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    const responseText = await response.text();
    console.log(`[WaveSpeed] Poll response (${response.status}): ${responseText.substring(0, 300)}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[WaveSpeed] getTask parse error. Full response: ${responseText}`);
      throw new Error(`WaveSpeed returned invalid JSON during polling: ${responseText.substring(0, 100)}`);
    }

    if (!response.ok) {
      throw new Error(`WaveSpeed fetch error: ${response.status} - ${JSON.stringify(data)}`);
    }

    return {
      task_id: taskId,
      status: data.data?.status || 'processing',
      outputs: data.data?.outputs,
      error: data.data?.error,
      timings: data.data?.timings,
    };
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(startDate: Date, endDate: Date): Promise<{
    totalCost: number;
    totalRequests: number;
    perModelUsage: Array<{ model: string; cost: number; requests: number }>;
  }> {
    const response = await fetch(`${this.baseUrl}/user/usage_stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`WaveSpeed usage error: ${response.status}`);
    }

    return {
      totalCost: data.summary?.total_cost || 0,
      totalRequests: data.summary?.total_requests || 0,
      perModelUsage: data.per_model_usage || [],
    };
  }
}

export function createWavespeedWrapper(options: WavespeedWrapperOptions): WavespeedWrapper {
  return new WavespeedWrapper(options);
}
