import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { uploadFile, STORAGE_BUCKET } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * Upload a frame (base64 data URL) to B2 storage
 * Used for extracted video frames and other image uploads
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { dataUrl, type = 'frame' } = body;

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'Invalid data URL. Must be a base64 image.' },
        { status: 400 }
      );
    }

    // Extract mime type and base64 data
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: 'Invalid data URL format' },
        { status: 400 }
      );
    }

    const [, extension, base64Data] = matches;
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique key
    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const key = `${type}/${sanitizedUserId}/${projectId}/${timestamp}.${extension === 'jpeg' ? 'jpg' : extension}`;

    // Upload to B2
    const result = await uploadFile(key, buffer, `image/${extension}`);

    return NextResponse.json({
      url: result.url,
      key: result.key,
    });
  } catch (error) {
    console.error('[Upload Frame] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
