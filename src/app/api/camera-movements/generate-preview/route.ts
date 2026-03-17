import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { CAMERA_MOVEMENTS } from '@/types/shot';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { logFalUsage } from '@/lib/ai/log-api-usage';

const execAsync = promisify(exec);

// Trim the first N seconds from a video using ffmpeg
async function trimVideoStart(
  inputPath: string,
  outputPath: string,
  trimSeconds: number = 1
): Promise<void> {
  console.log(`Trimming ${trimSeconds}s from start of video...`);

  // ffmpeg command to trim the start
  // -ss before -i for fast seeking, -c copy for no re-encoding (fast)
  // Using -c:v libx264 for compatibility since we're cutting
  const command = `ffmpeg -y -i "${inputPath}" -ss ${trimSeconds} -c:v libx264 -preset ultrafast -crf 23 -c:a copy "${outputPath}"`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 60000 });
    if (stderr) {
      console.log('ffmpeg stderr:', stderr);
    }
    console.log('Video trimmed successfully');
  } catch (error: any) {
    console.error('ffmpeg error:', error.message);
    // If ffmpeg fails, just copy the original file
    throw new Error(`Failed to trim video: ${error.message}`);
  }
}

interface FluxResult {
  data: {
    images: Array<{
      url: string;
    }>;
  };
}

interface KlingResult {
  data: {
    video: {
      url: string;
    };
  };
}

// Reference image for all camera movement previews
const REFERENCE_IMAGE_PROMPT = `A confident woman with elegant flowing brown hair, wearing a stylish dark coat, standing in a cinematic urban environment at golden hour. Professional photography, shallow depth of field, 8k quality.`;

export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { movementKey, referenceImageUrl } = await request.json();

    console.log('=== Camera Movement Preview Generation ===');
    console.log('Movement:', movementKey);
    console.log('Reference Image URL:', referenceImageUrl || 'None (will generate)');

    if (!movementKey) {
      return NextResponse.json({ error: 'Movement key required' }, { status: 400 });
    }

    // Find movement definition
    const movement = CAMERA_MOVEMENTS.find(m => m.value === movementKey);
    if (!movement) {
      return NextResponse.json({ error: 'Unknown movement' }, { status: 400 });
    }

    // Ensure public directory exists
    const publicDir = path.join(process.cwd(), 'public', 'camera-movements');
    if (!existsSync(publicDir)) {
      await mkdir(publicDir, { recursive: true });
    }

    // Build the prompt using the template
    const subject = 'a confident woman with flowing hair';
    const prompt = movement.promptTemplate.replace(/\{subject\}/g, subject);

    console.log(`Generating preview for ${movementKey}:`, prompt);

    // Dynamically import fal.ai
    const { fal } = await import('@fal-ai/client');
    fal.config({
      credentials: process.env.AI_FAL_KEY,
    });

    let firstFrameUrl = referenceImageUrl;

    // Step 1: Generate first frame with Flux if no reference provided
    if (!firstFrameUrl) {
      console.log('Generating reference image with Flux Pro...');
      try {
        const firstFrameResult = await fal.subscribe('fal-ai/flux-pro/v1.1', {
          input: {
            prompt: `${REFERENCE_IMAGE_PROMPT}`,
            image_size: 'landscape_16_9',
            num_images: 1,
          },
          logs: true,
          onQueueUpdate: (update) => {
            console.log(`Flux progress: ${update.status}`);
          },
        }) as unknown as FluxResult;

        firstFrameUrl = firstFrameResult.data?.images?.[0]?.url;
        if (!firstFrameUrl) {
          console.error('Flux result:', JSON.stringify(firstFrameResult, null, 2));
          throw new Error('Failed to generate reference image');
        }
        console.log('Reference image generated:', firstFrameUrl);

        // Log fal.ai usage for Flux Pro
        logFalUsage({
          operation: 'camera-movement-reference',
          model: 'flux-pro/v1.1',
          imagesCount: 1,
        }).catch(console.error);
      } catch (fluxError) {
        console.error('Flux error:', fluxError);
        throw new Error(`Flux generation failed: ${fluxError}`);
      }
    }

    // Upload image to fal.ai storage to ensure it's accessible by Kling
    console.log('Uploading image to fal.ai storage...');
    let uploadedImageUrl = firstFrameUrl;
    try {
      const imageResponse = await fetch(firstFrameUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
      }
      const imageBlob = await imageResponse.blob();
      uploadedImageUrl = await fal.storage.upload(imageBlob);
      console.log('Image uploaded to fal.ai storage:', uploadedImageUrl);
    } catch (uploadError) {
      console.error('Upload error, using original URL:', uploadError);
      // Continue with original URL
    }

    // Step 2: Generate video with camera movement using Kling v3 Pro
    console.log('Generating video with Kling 3 Pro...');
    let videoResult: KlingResult;
    try {
      // Use the full prompt template - Kling 3 has better understanding
      const videoPrompt = `${prompt}, cinematic, professional cinematography, smooth camera movement`;
      console.log('Video prompt:', videoPrompt);

      // Use Kling v3 Pro - better motion quality and understanding
      videoResult = await fal.subscribe('fal-ai/kling-video/v3/pro/image-to-video', {
        input: {
          prompt: videoPrompt,
          start_image_url: uploadedImageUrl, // Kling 3 uses start_image_url
          duration: '5', // String: "3" to "15"
          aspect_ratio: '16:9',
          generate_audio: false, // No audio for camera movement previews
        } as any,
        logs: true,
        onQueueUpdate: (update) => {
          console.log(`Kling 3 progress: ${update.status}`);
        },
      }) as unknown as KlingResult;
    } catch (klingError) {
      console.error('Kling error:', klingError);
      throw new Error(`Kling generation failed: ${klingError}`);
    }

    const videoUrl = videoResult.data?.video?.url;
    if (!videoUrl) {
      console.error('Kling result:', JSON.stringify(videoResult, null, 2));
      throw new Error('Failed to generate video');
    }
    console.log('Video generated:', videoUrl);

    // Log fal.ai usage for Kling v3 Pro
    logFalUsage({
      operation: 'camera-movement-video',
      model: 'kling-video/v3/pro',
      videoDuration: 5,
    }).catch(console.error);

    // Step 3: Download video, trim start, and save to public folder
    console.log('Downloading video...');
    const videoResponse = await fetch(videoUrl);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

    const videoFileName = `${movementKey}.mp4`;
    const videoPath = path.join(publicDir, videoFileName);
    const tempVideoPath = path.join(publicDir, `${movementKey}_temp.mp4`);

    // Save to temp file first
    await writeFile(tempVideoPath, videoBuffer);
    console.log('Temp video saved to:', tempVideoPath);

    // Trim the first 1 second to remove static reference image
    try {
      await trimVideoStart(tempVideoPath, videoPath, 1);
      // Clean up temp file
      await unlink(tempVideoPath);
      console.log('Trimmed video saved to:', videoPath);
    } catch (trimError) {
      console.error('Trim failed, using original:', trimError);
      // If trim fails, just rename temp to final
      await writeFile(videoPath, videoBuffer);
      try {
        await unlink(tempVideoPath);
      } catch {}
    }

    // Step 4: Save reference image
    try {
      const imageResponse = await fetch(firstFrameUrl);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const imageFileName = `${movementKey}.jpg`;
      const imagePath = path.join(publicDir, imageFileName);
      await writeFile(imagePath, imageBuffer);
      console.log('Image saved to:', imagePath);
    } catch (imageError) {
      console.error('Image save error:', imageError);
    }

    // Return the public URLs
    const publicVideoUrl = `/camera-movements/${movementKey}.mp4`;
    const publicImageUrl = `/camera-movements/${movementKey}.jpg`;

    return NextResponse.json({
      videoUrl: publicVideoUrl,
      imageUrl: publicImageUrl,
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Generate all previews at once
export async function PUT(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { referenceImageUrl } = await request.json();
    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const movement of CAMERA_MOVEMENTS) {
      if (movement.value === 'static') continue; // Skip static

      try {
        // Check if file already exists
        const videoPath = path.join(process.cwd(), 'public', 'camera-movements', `${movement.value}.mp4`);
        if (existsSync(videoPath)) {
          console.log(`Skipping ${movement.value} - already exists`);
          results[movement.value] = { success: true };
          continue;
        }

        console.log(`\n=== Generating ${movement.value} ===`);

        // Call the POST handler internally
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/camera-movements/generate-preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movementKey: movement.value,
            referenceImageUrl
          }),
        });

        if (response.ok) {
          results[movement.value] = { success: true };
        } else {
          const error = await response.json();
          results[movement.value] = { success: false, error: error.error };
        }
      } catch (error) {
        results[movement.value] = { success: false, error: String(error) };
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error generating all previews:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
