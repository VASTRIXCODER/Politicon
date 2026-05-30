import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const supabase = createClient();
    const { error } = await supabase.from('newsletter_subscribers').upsert(
      { email, subscribed_at: new Date().toISOString() },
      { onConflict: 'email' }
    );

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Newsletter error:', error);
    return NextResponse.json({ error: 'Subscription failed.' }, { status: 500 });
  }
}
