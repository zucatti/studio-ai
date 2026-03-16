import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { uploadFile, generateStorageKey, getSignedFileUrl } from '@/lib/storage';

export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'video/mp4',
      'video/webm',
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: images, audio, video` },
        { status: 400 }
      );
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 50MB' },
        { status: 400 }
      );
    }

    // Generate unique storage key
    const key = generateStorageKey(session.user.sub, folder, file.name);

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to B2
    const { key: storedKey } = await uploadFile(key, buffer, file.type);

    // Generate a signed URL for immediate use (1 hour expiry)
    const signedUrl = await getSignedFileUrl(storedKey, 3600);

    // Return both the storage key (for database) and signed URL (for immediate display)
    return NextResponse.json({
      key: storedKey,
      url: `b2://${process.env.S3_BUCKET || 'studio-assets'}/${storedKey}`,
      signedUrl,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
