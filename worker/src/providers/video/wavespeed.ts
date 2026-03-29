/**
 * WaveSpeed Video Provider
 * Supports: Kling O3 Pro, Kling V3 Pro, Veo 3.1, Seedance, Wan 2.6
 */

import type {
  VideoProvider,
  VideoModel,
  VideoGenerationRequest,
  VideoGenerationResult,
  ProgressCallback,
} from './types.js';
import { aiConfig } from '../../config.js';
import { getSupabase } from '../../supabase.js';

const WAVESPEED_API_BASE = 'https://api.wavespeed.ai/api/v3';

const MODELS: VideoModel[] = [
  {
    id: 'kwaivgi/kling-video-o3-pro/image-to-video',
    name: 'Kling O3 Pro',
    description: 'Best quality, cinematic video generation',
    maxDuration: 15,
    minDuration: 3,
    supportsEndFrame: true,
    supportsDialogue: false,
    supportsAudio: false,
    defaultForVideo: true,
  },
  {
    id: 'kwaivgi/kling-v3.0-pro/image-to-video',
    name: 'Kling V3 Pro',
    description: 'High quality video generation',
    maxDuration: 10,
    minDuration: 5,
    supportsEndFrame: true,
    supportsDialogue: false,
    supportsAudio: false,
  },
  {
    id: 'google/veo3.1/image-to-video',
    name: 'Veo 3.1',
    description: 'Google Veo video generation',
    maxDuration: 10,
    minDuration: 5,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
  },
  {
    id: 'bytedance/seedance-v1.5-pro/image-to-video',
    name: 'Seedance 1.5 Pro',
    description: 'ByteDance video generation',
    maxDuration: 10,
    minDuration: 5,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
  },
  {
    id: 'alibaba/wan-2.6/image-to-video',
    name: 'Wan 2.6',
    description: 'Alibaba Wan video generation',
    maxDuration: 10,
    minDuration: 3,
    supportsEndFrame: false,
    supportsDialogue: false,
    supportsAudio: false,
  },
];

export class WaveSpeedProvider implements VideoProvider {
  readonly name = 'wavespeed';
  readonly displayName = 'WaveSpeed';

  supportsModel(model: string): boolean {
    return MODELS.some(m => m.id === model) || model.startsWith('kwaivgi/') || model.startsWith('google/') || model.startsWith('bytedance/') || model.startsWith('alibaba/');
  }

  getSupportedModels(): VideoModel[] {
    return MODELS;
  }

  async generate(
    model: string,
    request: VideoGenerationRequest,
    onProgress?: ProgressCallback
  ): Promise<VideoGenerationResult> {
    const apiKey = aiConfig.wavespeed;
    if (!apiKey) {
      throw new Error('WaveSpeed API key not configured (AI_WAVESPEED)');
    }

    const modelInfo = MODELS.find(m => m.id === model);
    const maxDuration = modelInfo?.maxDuration || 15;
    const minDuration = modelInfo?.minDuration || 3;

    // Validate and clamp duration
    const validDuration = Math.max(minDuration, Math.min(maxDuration, Math.round(request.duration)));

    // Build request body
    const body: Record<string, unknown> = {
      image: request.firstFrameUrl,
      prompt: request.prompt || 'Smooth cinematic motion',
      duration: validDuration,
      aspect_ratio: request.aspectRatio,
    };

    // Add end frame if supported and provided
    if (request.lastFrameUrl && modelInfo?.supportsEndFrame !== false) {
      body.end_image = request.lastFrameUrl;
    }

    const requestUrl = `${WAVESPEED_API_BASE}/${model}`;
    console.log(`[WaveSpeed] POST ${requestUrl}`);
    console.log(`[WaveSpeed] Body:`, JSON.stringify(body, null, 2));

    await onProgress?.(10, 'Envoi à WaveSpeed...');

    // Submit task
    const submitResponse = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const submitText = await submitResponse.text();
    console.log(`[WaveSpeed] Submit response (${submitResponse.status}): ${submitText.substring(0, 500)}`);

    let submitData;
    try {
      submitData = JSON.parse(submitText);
    } catch {
      throw new Error(`WaveSpeed returned invalid JSON: ${submitText.substring(0, 200)}`);
    }

    if (!submitResponse.ok || submitData.code !== 200) {
      const errorMsg = submitData.message || submitData.error || JSON.stringify(submitData);
      throw new Error(`WaveSpeed error: ${submitResponse.status} - ${errorMsg}`);
    }

    const taskId = submitData.data?.id;
    if (!taskId) {
      throw new Error('WaveSpeed did not return a task ID');
    }

    console.log(`[WaveSpeed] Task ID: ${taskId}`);
    await onProgress?.(15, 'Génération en cours...');

    // Poll for completion
    const pollUrl = `${WAVESPEED_API_BASE}/predictions/${taskId}/result`;
    const maxAttempts = 180; // 6 minutes max
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      // Check if job was cancelled (every 5 attempts = 10 seconds)
      if (request.jobId && attempt % 5 === 0) {
        try {
          const supabase = getSupabase();
          const { data: job } = await supabase
            .from('generation_jobs')
            .select('status')
            .eq('id', request.jobId)
            .single();

          if (job?.status === 'cancelled') {
            console.log(`[WaveSpeed] Job ${request.jobId} was cancelled, stopping`);
            throw new Error('Job cancelled by user');
          }
        } catch (checkError) {
          // Ignore check errors, continue with generation
          if ((checkError as Error).message === 'Job cancelled by user') {
            throw checkError;
          }
        }
      }

      const pollResponse = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      const pollText = await pollResponse.text();
      let pollData;
      try {
        pollData = JSON.parse(pollText);
      } catch {
        console.warn(`[WaveSpeed] Poll returned invalid JSON, retrying...`);
        continue;
      }

      const status = pollData.data?.status;
      const progress = pollData.data?.progress || 0;

      // Log progress every 10 attempts (20 seconds)
      if (attempt % 10 === 0) {
        console.log(`[WaveSpeed] Poll ${attempt}/${maxAttempts}: status=${status}, progress=${progress}%`);
      }

      // Update progress (scale 15-90)
      const scaledProgress = 15 + Math.round(progress * 0.75);
      const timeElapsed = Math.round((attempt * pollInterval) / 1000);
      await onProgress?.(scaledProgress, `${modelInfo?.name || 'WaveSpeed'}: ${Math.round(progress)}% (${timeElapsed}s)`);

      if (status === 'completed') {
        const outputs = pollData.data?.outputs;
        const videoUrl = Array.isArray(outputs) ? outputs[0] : outputs;

        if (!videoUrl) {
          throw new Error('WaveSpeed completed but no video URL returned');
        }

        console.log(`[WaveSpeed] Video URL: ${videoUrl}`);
        await onProgress?.(90, 'Génération terminée');

        return {
          videoUrl,
          duration: validDuration,
          cost: 0, // WaveSpeed doesn't return cost info
        };
      }

      if (status === 'failed' || status === 'error') {
        const errorMsg = pollData.data?.error || pollData.data?.message || 'Unknown error';
        throw new Error(`WaveSpeed generation failed: ${errorMsg}`);
      }
    }

    throw new Error('WaveSpeed generation timed out');
  }
}
