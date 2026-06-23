import { NextResponse } from 'next/server';
import {
  supabase,
  cleanIndonesianNumber,
  convertToCsvString,
  fetchValidSkus,
  fetchConvertMap,
  fetchBranchCodeMap,
  logUpload,
} from '../lib/supabase-helpers';

// Helper parse date (sama dengan frontend)
const parseExcelDate = (excelSerial: any): string | null => {
  if (!excelSerial) return null;
  if (!isNaN(Number(excelSerial))) {
    const dateOffset = Number(excelSerial) - 25569;
    const date = new Date(dateOffset * 86400 * 1000);
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - timezoneOffset);
    const y = localDate.getFullYear();
    const m = String(localDate.getMonth() + 1).padStart(2, '0');
    const d = String(localDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(excelSerial).trim();
  let d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  const bulanMap: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'mei': '05', 'jun': '06', 'jul': '07', 'agu': '08',
    'sep': '09', 'okt': '10', 'nov': '11', 'des': '12'
  };
  const match = str.match(/(\d{1,2})\s+([a-z]{3})\s+(\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = bulanMap[match[2].toLowerCase()] || '01';
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
};

export async function POST(req: Request) {
  try {
    const warehouseName = req.headers.get('x-warehouse-name') || '';
    const { payload: rawPayload, fileName } = await req.json();

    if (!rawPayload?.length) {
      return NextResponse.json({ error: 'Data payload kosong.' }, { status: 400 });
    }

    const validSkus = await fetchValidSkus();
    const convertMap = await fetchConvertMap();
    const branchCodeMap = await fetchBranchCodeMap();

    // 1. Mapping data
    const mappedData = rawPayload.map((row: any) => {
      const branchNameClean = String(row.branch_name || '').trim().toUpperCase();
      const branchCode = branchCodeMap.get(branchNameClean) || "UNKNOWN";
      const productCodeClean = String(row.product_code || '').trim().toUpperCase();
      const factor = convertMap.get(productCodeClean) || 1;
      const qty = cleanIndonesianNumber(row.qty_stock);
      const convertedQty = Math.round((qty / factor) * 100) / 100;

      const dateStock = parseExcelDate(row.date_stock);

      return {
        date_stock: dateStock,
        branch_code: branchCode,
        product_code: productCodeClean,
        qty_stock: convertedQty,
        key_product: `${branchCode.substring(0, 3)}-${productCodeClean}`,
        created_at: new Date().toISOString()
      };
    });

    // 2. Validasi & filter
    // - SKU tidak valid → masuk invalidRows (akan di-CSV error)
    // - Qty <= 0 → diabaikan (tidak diinsert, tidak dicatat error)
    // - Tanggal tidak valid → diabaikan
    const validRows: any[] = [];
    const invalidRows: any[] = [];
    let skippedQtyZero = 0;
    let skippedInvalidDate = 0;

    mappedData.forEach(row => {
      // Cek SKU
      const checkSku = String(row.product_code).toUpperCase();
      if (!validSkus.has(checkSku)) {
        invalidRows.push({
          date_stock: row.date_stock || 'INVALID',
          branch_code: row.branch_code,
          product_code: row.product_code,
          qty_stock: row.qty_stock,
          status: 'SKU tidak terdaftar'
        });
        return;
      }

      // Cek qty
      if (row.qty_stock <= 0) {
        skippedQtyZero++;
        return;
      }

      // Cek tanggal
      if (!row.date_stock) {
        skippedInvalidDate++;
        return;
      }

      validRows.push(row);
    });

    // 3. Buat CSV error hanya untuk SKU tidak valid (tidak termasuk qty <= 0)
    let skuErrorCsv: string | null = null;
    let hasSkuError = false;
    if (invalidRows.length > 0) {
      hasSkuError = true;
      skuErrorCsv = convertToCsvString(invalidRows, ['date_stock', 'branch_code', 'product_code', 'qty_stock', 'status']);
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        success: false,
        allFailed: true,
        message: `Tidak ada data valid. SKU invalid: ${invalidRows.length}, Qty<=0: ${skippedQtyZero}, Tanggal invalid: ${skippedInvalidDate}`,
        skuErrorCsv
      });
    }

    // 4. Hapus data lama per kombinasi (date_stock, branch_code)
    const uniquePairs = new Set<string>();
    validRows.forEach(row => {
      uniquePairs.add(`${row.date_stock}|${row.branch_code}`);
    });

    for (const pair of uniquePairs) {
      const [date, branch] = pair.split('|');
      const { error: deleteErr } = await supabase
        .from('fact_stock')
        .delete()
        .eq('date_stock', date)
        .eq('branch_code', branch);
      if (deleteErr) throw deleteErr;
    }

    // 5. Insert data baru
    const { data: insertedData, error: insertErr } = await supabase
      .from('fact_stock')
      .insert(validRows)
      .select('product_code');
    if (insertErr) throw insertErr;

    // 6. Log aktivitas
    const totalSkipped = skippedQtyZero + skippedInvalidDate;
    await logUpload(
      'STOCK',
      fileName,
      insertedData?.length || validRows.length,
      hasSkuError ? 'partial' : 'success',
      hasSkuError 
        ? `SKU invalid: ${invalidRows.length}, Qty<=0: ${skippedQtyZero}, Tanggal invalid: ${skippedInvalidDate}` 
        : `Qty<=0: ${skippedQtyZero}, Tanggal invalid: ${skippedInvalidDate}`
    );

    return NextResponse.json({
      success: true,
      count: insertedData?.length || validRows.length,
      hasSkuError,
      skuErrorCsv,
      skipped: { qtyZero: skippedQtyZero, invalidDate: skippedInvalidDate, invalidSku: invalidRows.length }
    });

  } catch (err: any) {
    console.error('❌ [Upload Stock Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}