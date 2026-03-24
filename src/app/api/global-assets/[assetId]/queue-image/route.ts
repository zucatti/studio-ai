/**
 * Queue Image Generation API Route
 *
 * @deprecated Use /api/global-assets/[assetId]/generate-images instead
 * This endpoint is kept for backward compatibility but redirects to the new endpoint.
 */

import { auth0 } from '@/lib/auth0';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assetId } = await params;
  const body = await request.json();

  // Forward to the new generate-images endpoint with mode: 'generate_single'
  const newBody = {
    mode: 'generate_single',
    viewType: body.imageType || 'front',
    style: 'photorealistic',
    model: body.model || 'fal-ai/nano-banana-2',
    resolution: '2K',
    visualDescription: body.prompt,
  };

  // Make internal request to generate-images
  const baseUrl = process.env.AUTH0_BASE_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/global-assets/${assetId}/generate-images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': request.headers.get('cookie') || '',
    },
    body: JSON.stringify(newBody),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
