import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET() {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({
      user_id: session.user.sub,
      email: session.user.email,
      name: session.user.name
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
