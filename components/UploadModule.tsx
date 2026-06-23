'use client';
import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  FaFileExcel,
  FaUpload,
  FaSpinner,
  FaCheckCircle,
  FaExclamationTriangle,
} from 'react-icons/fa';

// Helper parse date (sama dengan backend)
const parseExcelDate = (excelSerial: any): string => {
  if (!excelSerial) return '';
  if (isNaN(Number(excelSerial))) {
    const d = new Date(excelSerial);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
  }
  const dateOffset = Number(excelSerial) - 25569;
  return new Date(dateOffset * 86400 * 1000).toISOString().split('T')[0];
};

type ModuleType =
  | 'sq'
  | 'so'
  | 'sj'
  | 'stock'
  | 'salesforce-weekly'
  | 'salesforce-monthly';

export default function UploadModule({ type, title }: { type: ModuleType; title: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<'idle' | 'extracting' | 'uploading' | 'done' | 'error'>('idle');
  const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' }>({
    text: `Upload file ${title}`,
    type: 'info',
  });
  const [summary, setSummary] = useState<{
    fileName: string;
    totalItems: number;
    rowsInserted: number;
    dateMin: string;
    dateMax: string;
    hasSkuError?: boolean;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isDocumentType = ['sq', 'so', 'sj'].includes(type);
  const isSalesForce = type === 'salesforce-weekly' || type === 'salesforce-monthly';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split('.').pop();
    const validExts = ['xlsx', 'xls', 'xlsm', 'csv'];
    if (!validExts.includes(ext || '')) {
      setStatus({ text: '⚠️ File harus berformat Excel (.xlsx, .xls, .xlsm) atau CSV', type: 'error' });
      setFile(null);
      return;
    }
    setFile(f);
    setStatus({ text: `📄 ${f.name} siap diproses`, type: 'info' });
    setSummary(null);
    setProgress(0);
    setStep('idle');
  };

  const handleUpload = () => {
    if (!file) {
      setStatus({ text: '⚠️ Pilih file dulu', type: 'error' });
      return;
    }

    setLoading(true);
    setProgress(0);
    setStep('extracting');
    setStatus({ text: '📤 Membaca dan mengekstrak data...', type: 'info' });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let mappedPayload: any[] = [];
        let namaGudang = 'RTF'; // default
        const isCSV = file.name.toLowerCase().endsWith('.csv');

        // ============================================================
        // 1. PARSING FILE (CSV atau Excel)
        // ============================================================
        if (isSalesForce && isCSV) {
          // Parse CSV dengan PapaParse
          const csvText = e.target?.result as string;
          const result = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            trimHeaders: true,
          });

          if (result.errors.length > 0) {
            throw new Error('Gagal parsing CSV: ' + result.errors[0].message);
          }

          mappedPayload = result.data.filter((row: any) =>
            row.sales_name && row.sales_name.trim() !== ''
          );

          setProgress(30);
        } else {
          // Parse Excel (XLSX)
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

          if (!rawRows || rawRows.length < 6) {
            throw new Error('Format tidak sesuai (kurang dari 6 baris).');
          }

          namaGudang = rawRows[0]?.[1] || 'RTF';
          const titleFile = rawRows[1]?.[1] || '';

          // Validasi judul untuk SQ/SO/SJ/Stock
          if (!isSalesForce) {
            let expectedTitle = '';
            if (type === 'sq') expectedTitle = 'Rincian Penawaran Penjualan';
            else if (type === 'so') expectedTitle = 'Rincian Pesanan Penjualan';
            else if (type === 'sj') expectedTitle = 'Rincian Pengiriman Pesanan';
            else if (type === 'stock') expectedTitle = 'Kuantitas Barang per Gudang';

            if (String(titleFile).trim() !== expectedTitle) {
              throw new Error(`Berkas bukan "${expectedTitle}" yang valid.`);
            }
          }

          const dataRows = rawRows.slice(5);

          // Mapping sesuai type (SQ, SO, SJ, Stock)
          if (type === 'sq') {
            mappedPayload = dataRows
              .map((row) => ({
                date_sq: row[3],
                no_sq: row[1],
                customer_name: row[5],
                product_code: row[9],
                status_sq: row[21],
                qty_sq: row[13],
                price: row[17],
                branch_name: row[19],
                product_name: row[11],
                category_name: row[27],
              }))
              .filter((r) => r.no_sq && String(r.no_sq).trim() !== '');
          } else if (type === 'so') {
            mappedPayload = dataRows
              .map((row) => ({
                date_so: row[3],
                no_so: row[5],
                no_sq: row[1],
                product_code: row[7],
                status_so: row[17],
                qty_so: row[11],
                area_name: row[19],
              }))
              .filter((r) => r.no_so && String(r.no_so).trim() !== '');
          } else if (type === 'sj') {
            mappedPayload = dataRows
              .map((row) => ({
                branch_name: row[1],
                area_name: row[21],
                date_sj: row[3],
                no_sj: row[5],
                date_sq: row[35],
                no_sq: row[37],
                date_so: row[31],
                no_so: row[33],
                status_sj: row[39],
                product_code: row[11],
                qty_sj: row[17],
              }))
              .filter((r) => r.no_sj && String(r.no_sj).trim() !== '');
          } // ==================== DI DALAM reader.onload ====================

          // Mapping berdasarkan type
          if (type === 'sq') {
            mappedPayload = dataRows
              .map((row) => ({
                date_sq: parseExcelDate(row[3]),
                no_sq: row[1],
                customer_name: row[5],
                product_code: row[9],
                status_sq: row[21],
                qty_sq: row[13],
                price: row[17],
                branch_name: row[19],
                product_name: row[11],
                category_name: row[27],
              }))
              .filter((r) => r.no_sq && String(r.no_sq).trim() !== '');
          } else if (type === 'so') {
            mappedPayload = dataRows
              .map((row) => ({
                date_so: parseExcelDate(row[3]),
                no_so: row[5],
                no_sq: row[1],
                product_code: row[7],
                status_so: row[17],
                qty_so: row[11],
                area_name: row[19],
              }))
              .filter((r) => r.no_so && String(r.no_so).trim() !== '');
          } else if (type === 'sj') {
            mappedPayload = dataRows
              .map((row) => ({
                branch_name: row[1],
                area_name: row[21],
                date_sj: parseExcelDate(row[3]),
                no_sj: row[5],
                date_sq: parseExcelDate(row[35]),
                no_sq: row[37],
                date_so: parseExcelDate(row[31]),
                no_so: row[33],
                status_sj: row[39],
                product_code: row[11],
                qty_sj: row[17],
              }))
              .filter((r) => r.no_sj && String(r.no_sj).trim() !== '');
          } else if (type === 'stock') {
            mappedPayload = dataRows
              .map((row) => ({
                date_stock: parseExcelDate(row[3]), // ✅ PASTIKAN PAKAI parseExcelDate
                branch_name: row[1],
                product_code: row[7],
                qty_stock: row[11],
              }))
              .filter((r) => r.product_code && String(r.product_code).trim() !== '');
          }
        }

        if (mappedPayload.length === 0) {
          throw new Error('Tidak ada data valid di file.');
        }

        setProgress(40);
        setStep('uploading');
        setStatus({ text: '⏳ Mengirim data ke server...', type: 'info' });

        // ============================================================
        // 2. STATISTIK
        // ============================================================
        let totalUnique = 0;
        let dateField = '';
        if (type === 'sq') {
          const uniqueSet = new Set(mappedPayload.map((r) => String(r.no_sq).trim()));
          totalUnique = uniqueSet.size;
          dateField = 'date_sq';
        } else if (type === 'so') {
          const uniqueSet = new Set(mappedPayload.map((r) => String(r.no_so).trim()));
          totalUnique = uniqueSet.size;
          dateField = 'date_so';
        } else if (type === 'sj') {
          const uniqueSet = new Set(mappedPayload.map((r) => String(r.no_sj).trim()));
          totalUnique = uniqueSet.size;
          dateField = 'date_sj';
        } else if (type === 'stock') {
          totalUnique = mappedPayload.length;
          dateField = 'date_stock';
        } else if (isSalesForce) {
          totalUnique = mappedPayload.length;
          dateField = type === 'salesforce-weekly' ? 'week' : 'month';
        }

        // Range tanggal/week/month
        let dateMin = '',
          dateMax = '';
        if (dateField) {
          const dateStrings = mappedPayload
            .map((r) => String(r[dateField] || ''))
            .filter((d) => d.length > 0);
          if (dateStrings.length > 0) {
            const sorted = dateStrings.slice().sort();
            dateMin = sorted[0];
            dateMax = sorted[sorted.length - 1];
          }
        }

        // ============================================================
        // 3. DETERMINASI ENDPOINT
        // ============================================================
        let endpoint = '';
        if (type === 'sq') endpoint = '/api/upload-sq';
        else if (type === 'so') endpoint = '/api/upload-so';
        else if (type === 'sj') endpoint = '/api/upload-sj';
        else if (type === 'stock') endpoint = '/api/upload-stock';
        else if (type === 'salesforce-weekly') endpoint = '/api/upload-salesforce-weekly';
        else if (type === 'salesforce-monthly') endpoint = '/api/upload-salesforce-monthly';

        // ============================================================
        // 4. KIRIM KE BACKEND DENGAN ERROR HANDLING
        // ============================================================
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Warehouse-Name': String(namaGudang || 'RTF'),
          },
          body: JSON.stringify({
            payload: mappedPayload,
            fileName: file.name,
          }),
        });

        // 🔥 CEK CONTENT-TYPE SEBELUM PARSE JSON
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          console.error('Response bukan JSON:', text.substring(0, 500));
          throw new Error(`Server error (${res.status}): ${text.substring(0, 200)}`);
        }

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Server gagal memproses data.');

        setProgress(80);

        // ============================================================
        // 5. DOWNLOAD CSV ERROR (jika ada)
        // ============================================================
        if (json.skuErrorCsv) {
          const blob = new Blob([json.skuErrorCsv], { type: 'text/csv;charset=utf-8-sig;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${file.name.split('.')[0]}_sku_not_available.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // ============================================================
        // 6. SELESAI
        // ============================================================
        setProgress(100);
        setStep('done');
        setLoading(false);

        setSummary({
          fileName: file.name,
          totalItems: totalUnique,
          rowsInserted: json.count || mappedPayload.length,
          dateMin,
          dateMax,
          hasSkuError: json.hasSkuError || false,
        });

        setStatus({
          text: `✅ Berhasil upload ${json.count} baris.` +
            (json.hasSkuError ? ' (beberapa data bermasalah, cek file log)' : ''),
          type: json.hasSkuError ? 'info' : 'success',
        });

        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      } catch (err: any) {
        console.error('Upload Error:', err);
        setProgress(0);
        setStep('error');
        setLoading(false);
        setStatus({ text: `❌ Gagal: ${err.message}`, type: 'error' });
      }
    };

    // Baca file sesuai ekstensi
    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  if (!isClient) return <div className="min-h-screen flex items-center justify-center">Loading Engine...</div>;

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-1 text-center flex items-center justify-center gap-2">
        <FaFileExcel className="text-green-600" /> Upload {title}
      </h1>
      <p className="text-xs text-gray-500 text-center mb-6">
        {isSalesForce ? 'Upload file CSV dengan header yang sesuai' : `Modul Otomatis Pembersihan & Overwrite ${type.toUpperCase()}`}
      </p>

      <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 text-center mb-4 transition hover:border-blue-400">
        <input
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv"
          onChange={handleFileChange}
          ref={fileRef}
          disabled={loading}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer mb-4"
        />
        <button
          onClick={handleUpload}
          disabled={loading || !file}
          className="w-full px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <FaSpinner className="animate-spin" /> Memproses...
            </>
          ) : (
            <>
              <FaUpload /> Proses Upload
            </>
          )}
        </button>
      </div>

      {loading && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{step === 'extracting' ? 'Membaca File' : 'Upload ke Database'}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            {step === 'extracting' && 'Mengekstrak data dari file...'}
            {step === 'uploading' && 'Mengirim & memproses data... (mungkin memakan waktu)'}
          </p>
        </div>
      )}

      {status.text && (
        <div
          className={`p-4 rounded-lg text-sm font-medium border text-center ${status.type === 'success'
              ? 'bg-green-50 text-green-700 border-green-200'
              : status.type === 'error'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}
        >
          {status.type === 'success' && <FaCheckCircle className="inline mr-1" />}
          {status.type === 'error' && <FaExclamationTriangle className="inline mr-1" />}
          {status.text}
        </div>
      )}

      {summary && step === 'done' && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-[12px]">
          <h3 className="font-semibold text-gray-700 mb-2">📊 Ringkasan Upload</h3>
          <table className="w-full text-gray-600">
            <tbody>
              <tr>
                <td className="py-1 font-medium align-top">Nama File</td>
                <td className="py-1 pl-4 align-top">: {summary.fileName}</td>
              </tr>
              <tr>
                <td className="py-1 font-medium align-top">Total Data</td>
                <td className="py-1 pl-4 align-top">: {summary.totalItems}</td>
              </tr>
              <tr>
                <td className="py-1 font-medium align-top">Baris Diinsert</td>
                <td className="py-1 pl-4 align-top">: {summary.rowsInserted}</td>
              </tr>
              <tr>
                <td className="py-1 font-medium align-top">
                  {isSalesForce ? (type === 'salesforce-weekly' ? 'Minggu' : 'Bulan') : 'Tanggal'}
                </td>
                <td className="py-1 pl-4 align-top">
                  : {summary.dateMin && summary.dateMax ? `${summary.dateMin} s/d ${summary.dateMax}` : 'Tidak tersedia'}
                </td>
              </tr>
              {summary.hasSkuError && (
                <tr>
                  <td className="py-1 font-medium align-top text-amber-600">⚠️ Catatan</td>
                  <td className="py-1 pl-4 align-top text-amber-600">
                    : Beberapa data bermasalah, cek file log CSV yang diunduh.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}