import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { payload: rawPayload, fileName } = await req.json();

    if (!rawPayload?.length) {
      return NextResponse.json({ error: 'Data payload kosong.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const payload = rawPayload.map((row: any) => ({
      ...row,
      created_at: now
    }));

    // Upsert dengan conflict key: sales_name, month
    const { data, error } = await supabase
      .from('fact_po_sales_fos_monthly')
      .upsert(payload, { onConflict: 'sales_name, month' })
      .select('sales_name');

    if (error) throw error;

    await supabase.from('upload_logs').insert({
      module: 'SALES_FOS_MONTHLY',
      file_name: fileName || 'unknown',
      rows_count: data?.length || payload.length,
      status: 'success',
      created_at: now
    });

    return NextResponse.json({
      success: true,
      count: data?.length || payload.length
    });

  } catch (err: any) {
    console.error('❌ [Upload Sales FOS Monthly Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}