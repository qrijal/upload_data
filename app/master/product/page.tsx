'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  FaPlus,
  FaEdit,
  FaTrash,
  FaSearch,
  FaSpinner,
  FaSave,
  FaTimes,
  FaUpload,
} from 'react-icons/fa';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DISPLAY_COLUMNS = [
  'product_code',
  'product_name',
  'brand',
  'product_category',
  'uom',
  'qty_convert',
  'size_product',
  'key_product',
];

const ALL_COLUMNS = [
  'product_code',
  'product_name',
  'accessories_category',
  'uom',
  'brand',
  'product_category',
  'product_non_active',
  'product_principle',
  'product_for_factory',
  'finish_good',
  'qty_convert',
  'uom_2',
  'size_product',
  'sub_category',
  'sub_category_2',
  'color_product',
  'key_product',
  'base_weight',
  'length',
  'weight',
];

// Field yang menggunakan dropdown (ambil dari database)
const DROPDOWN_FIELDS = [
  'product_category',
  'accessories_category',
  'uom',
  'uom_2',
  'brand',
  'product_principle',
  'sub_category',
];

// Field dengan static options
const STATIC_OPTIONS: Record<string, string[]> = {
  product_non_active: ['Ya', 'Tidak'],
  product_for_factory: ['ABC', 'RTF'],
  finish_good: ['Finish Good', 'Raw Material'],
};

export default function MasterProductPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' }>({
    text: '',
    type: 'info'
  });

  // State untuk dropdown options
  const [dropdownOptions, setDropdownOptions] = useState<Record<string, string[]>>({});
  const [loadingOptions, setLoadingOptions] = useState(false);

  const limit = 20;

  // Fetch data produk
  useEffect(() => {
    fetchProducts();
  }, [page, search]);

  // Fetch dropdown options once
  useEffect(() => {
    fetchDropdownOptions();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('dim_product')
        .select('*', { count: 'exact' })
        .order('product_code', { ascending: true });

      if (search) {
        query = query.ilike('product_code', `%${search}%`);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setProducts(data || []);
      setTotalPages(Math.ceil((count || 0) / limit));
    } catch (err: any) {
      setStatus({ text: '❌ Gagal memuat data: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownOptions = async () => {
    setLoadingOptions(true);
    try {
      const options: Record<string, string[]> = {};
      for (const field of DROPDOWN_FIELDS) {
        // Ambil semua nilai unik untuk field tersebut (termasuk null)
        const { data, error } = await supabase
          .from('dim_product')
          .select(field);
        if (error) throw error;
        // Filter null/undefined dan duplikat
        const distinct = [...new Set(
          data
            .map(row => row[field])
            .filter(val => val !== null && val !== undefined && String(val).trim() !== '')
            .map(val => String(val).trim())
        )] as string[];
        options[field] = distinct;
      }
      setDropdownOptions(options);
    } catch (err: any) {
      console.error('Gagal ambil dropdown options:', err);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setFormData({
      product_non_active: 'Tidak',
      product_for_factory: 'RTF',
      finish_good: 'Finish Good',
      qty_convert: 1,
    });
    setShowModal(true);
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setFormData({ ...product });
    setShowModal(true);
  };

  const handleDeleteProduct = async (productCode: string) => {
    if (!confirm(`Hapus produk ${productCode}?`)) return;
    try {
      const { error } = await supabase
        .from('dim_product')
        .delete()
        .eq('product_code', productCode);
      if (error) throw error;
      setStatus({ text: `✅ Produk ${productCode} berhasil dihapus`, type: 'success' });
      fetchProducts();
    } catch (err: any) {
      setStatus({ text: '❌ Gagal hapus: ' + err.message, type: 'error' });
    }
  };

  const handleSaveProduct = async () => {
    try {
      if (!formData.product_code?.trim()) {
        setStatus({ text: '⚠️ Product Code wajib diisi', type: 'error' });
        return;
      }
      if (!formData.product_name?.trim()) {
        setStatus({ text: '⚠️ Product Name wajib diisi', type: 'error' });
        return;
      }

      const payload = { ...formData };
      // Generate key_product
      payload.key_product = `${payload.product_for_factory || 'RTF'}-${payload.product_code.trim()}`;
      // Pastikan qty_convert number
      if (payload.qty_convert) {
        payload.qty_convert = parseFloat(payload.qty_convert) || 1;
      }

      if (editingProduct) {
        const { error } = await supabase
          .from('dim_product')
          .update(payload)
          .eq('product_code', editingProduct.product_code);
        if (error) throw error;
        setStatus({ text: `✅ Produk ${payload.product_code} berhasil diupdate`, type: 'success' });
      } else {
        const { error } = await supabase
          .from('dim_product')
          .insert(payload);
        if (error) throw error;
        setStatus({ text: `✅ Produk ${payload.product_code} berhasil ditambahkan`, type: 'success' });
      }

      setShowModal(false);
      fetchProducts();
    } catch (err: any) {
      setStatus({ text: '❌ Gagal simpan: ' + err.message, type: 'error' });
    }
  };

  // Render field
  const renderField = (field: string) => {
    const value = formData[field] || '';

    // Special case: key_product auto-generated
    if (field === 'key_product') {
      const autoKey = formData.product_for_factory && formData.product_code
        ? `${formData.product_for_factory}-${formData.product_code}`
        : '';
      return (
        <div key={field} className="flex flex-col">
          <label className="text-xs font-medium text-gray-600 mb-1">{field} (auto)</label>
          <input
            type="text"
            value={autoKey}
            disabled
            className="px-2 py-1 border border-gray-300 rounded text-sm bg-gray-100"
          />
        </div>
      );
    }

    // Check if this field uses static dropdown
    if (STATIC_OPTIONS[field]) {
      return (
        <div key={field} className="flex flex-col">
          <label className="text-xs font-medium text-gray-600 mb-1">{field}</label>
          <select
            value={value}
            onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
          >
            <option value="">-- Pilih --</option>
            {STATIC_OPTIONS[field].map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    // Check if this field uses dynamic dropdown from database
    if (DROPDOWN_FIELDS.includes(field)) {
      const options = dropdownOptions[field] || [];
      return (
        <div key={field} className="flex flex-col">
          <label className="text-xs font-medium text-gray-600 mb-1">{field}</label>
          <select
            value={value}
            onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
          >
            <option value="">-- Pilih --</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {loadingOptions && <span className="text-xs text-gray-400 mt-1">Memuat...</span>}
          {!loadingOptions && options.length === 0 && (
            <span className="text-xs text-amber-500 mt-1">Belum ada data, isi manual</span>
          )}
        </div>
      );
    }

    // Input manual (text/number)
    const isNumber = ['qty_convert', 'base_weight', 'length', 'weight'].includes(field);
    return (
      <div key={field} className="flex flex-col">
        <label className="text-xs font-medium text-gray-600 mb-1">{field}</label>
        <input
          type={isNumber ? 'number' : 'text'}
          value={value}
          onChange={(e) => setFormData({
            ...formData,
            [field]: isNumber ? parseFloat(e.target.value) || 0 : e.target.value
          })}
          className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
          placeholder={field}
          step={isNumber ? 'any' : undefined}
        />
      </div>
    );
  };

  // Handler upload CSV (placeholder)
  const handleUploadCSV = async (file: File) => {
    // Implementasi upload CSV (bisa dari kode sebelumnya)
    alert('Upload CSV: ' + file.name);
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-700">Master Produk</h2>
          <div className="relative">
            <FaSearch className="absolute left-2.5 top-2.5 text-gray-400 text-xs" />
            <input
              type="text"
              placeholder="Cari product_code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-48"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddProduct}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
          >
            <FaPlus /> Tambah
          </button>
          <button
            onClick={() => document.getElementById('csvInput')?.click()}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
          >
            <FaUpload /> Upload CSV
          </button>
          <input
            id="csvInput"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadCSV(file);
            }}
          />
        </div>
      </div>

      {/* Status */}
      {status.text && (
        <div className={`p-3 rounded-lg text-sm border mb-4 ${status.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : status.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
          {status.text}
        </div>
      )}

      {/* Tabel */}
      {loading ? (
        <div className="flex justify-center py-8">
          <FaSpinner className="animate-spin text-blue-600 text-2xl" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {DISPLAY_COLUMNS.map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      {col}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={DISPLAY_COLUMNS.length + 1} className="px-3 py-4 text-center text-gray-500">
                      Belum ada data produk.
                    </td>
                  </tr>
                ) : (
                  products.map((row) => (
                    <tr key={row.product_code} className="hover:bg-gray-50">
                      {DISPLAY_COLUMNS.map((col) => (
                        <td key={col} className="px-3 py-2 text-gray-700 text-xs">
                          {row[col] || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleEditProduct(row)}
                          className="text-blue-600 hover:text-blue-800 mr-2"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(row.product_code)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTrash />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-3 text-sm">
              <span className="text-gray-600">Halaman {page} dari {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <FaTimes />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ALL_COLUMNS.map((field) => renderField(field))}
            </div>

            <div className="flex gap-3 mt-4 pt-3 border-t border-gray-200">
              <button
                onClick={handleSaveProduct}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
              >
                <FaSave /> Simpan
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}