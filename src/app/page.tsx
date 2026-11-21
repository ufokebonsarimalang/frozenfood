'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart,
  Package,
  ArrowLeftRight,
  BarChart3,
  ScanBarcode,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Snowflake,
  Edit3,
  TrendingUp,
  Wallet,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase, formatRupiah, formatTanggalIndo } from '@/lib/supabase';
import ProfitLossBackupModal from '@/components/ProfitLossBackupModal';

// --- TIPE DATA ---
interface Product {
  id: string;
  name: string;
  barcode?: string | null;
  category: string;
  unit: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock: number;
}

interface CartItem extends Product {
  qty: number;
}

interface Transaction {
  id: string;
  invoice_no: string;
  customer_name: string;
  payment_method: string;
  total_amount: number;
  total_profit: number;
  cash_received: number;
  change_amount: number;
  created_at: string;
}

interface StockMutation {
  id: string;
  product_id: string;
  product_name: string;
  type: 'MASUK' | 'KELUAR' | 'RETUR_CUSTOMER' | 'RETUR_SUPPLIER';
  qty: number;
  note: string;
  created_at: string;
}

interface ModalNotification {
  show: boolean;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning';
}

const DEFAULT_CATEGORIES = [
  'Nugget & Olahan Ayam',
  'Sosis',
  'Seafood & Steamboat',
  'Dimsum & Bakpao',
  'Kentang & Camilan',
  'Daging Olahan',
];

export default function KasirFrozenPro() {
  // Navigasi Menu Utama
  const [activeTab, setActiveTab] = useState<'kasir' | 'produk' | 'mutasi' | 'laporan'>('kasir');

  // State Data
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [mutations, setMutations] = useState<StockMutation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // State Kasir & Barcode
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('Pelanggan Umum');
  const [paymentMethod, setPaymentMethod] = useState<string>('Tunai');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState<boolean>(false);

  // State Struk Thermal
  const [lastReceipt, setLastReceipt] = useState<{
    invoice_no: string;
    date: string;
    customer: string;
    payment: string;
    items: CartItem[];
    total: number;
    cash: number;
    change: number;
  } | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);

  // State Kamera Scan Barcode
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);
  const [scannerStatus, setScannerStatus] = useState<string>('Arahkan kamera ke barcode barang...');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isHandlingScanRef = useRef<boolean>(false);

  // State Modal Produk (Tambah / Edit)
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    barcode: '',
    category: 'Nugget & Olahan Ayam',
    unit: 'Pack',
    buy_price: '',
    sell_price: '',
    stock: '',
    min_stock: '5',
  });

  // State Form Perubahan Stok
  const [mutationForm, setMutationForm] = useState({
    product_id: '',
    type: 'MASUK' as 'MASUK' | 'KELUAR' | 'RETUR_CUSTOMER' | 'RETUR_SUPPLIER',
    qty: '',
    note: '',
  });

  // State Filter Laporan Laba Rugi
  const [reportStartDate, setReportStartDate] = useState<string>('');
  const [reportEndDate, setReportEndDate] = useState<string>('');

  // State Modal Notifikasi Kustom
  const [notif, setNotif] = useState<ModalNotification>({
    show: false,
    title: '',
    message: '',
    type: 'success',
  });

  const showNotif = (title: string, message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotif({ show: true, title, message, type });
  };

  // --- AMBIL DATA DARI SUPABASE ---
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [prodRes, trxRes, mutRes] = await Promise.all([
        supabase.from('products').select('*').order('name', { ascending: true }),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_mutations').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      if (prodRes.data) setProducts(prodRes.data);
      if (trxRes.data) setTransactions(trxRes.data);
      if (mutRes.data) setMutations(mutRes.data);
    } catch (err) {
      console.error(err);
      showNotif('Koneksi Gagal', 'Gagal memuat data dari database.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const formatLocalISO = (dateObj: Date) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setReportStartDate(formatLocalISO(firstDay));
    setReportEndDate(formatLocalISO(now));
    fetchAllData();
  }, []);

  // --- KERANJANG KASIR ---
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      showNotif('Stok Habis', `Stok ${product.name} sedang kosong (0).`, 'warning');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.qty + 1 > product.stock) {
          showNotif('Batas Stok', `Stok ${product.name} hanya tersisa ${product.stock}.`, 'warning');
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const handleBarcodeMatch = (rawCode: string, closeCameraAfter = false) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode) return;

    const found = products.find((p) => (p.barcode || '').trim() === cleanCode);
    if (found) {
      addToCart(found);
      setBarcodeInput('');
      if (closeCameraAfter) {
        stopBarcodeScanner();
      }
      showNotif(
        'Barcode Terbaca',
        `${found.name} (${cleanCode}) masuk ke keranjang.`,
        'success'
      );
    } else {
      setBarcodeInput('');
      if (closeCameraAfter) {
        stopBarcodeScanner();
      }
      showNotif(
        'Barcode Belum Terdaftar',
        `Kode ${cleanCode} belum ada di daftar barang. Isi kolom Barcode di menu Stok Barang.`,
        'warning'
      );
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeMatch(barcodeInput, false);
    }
  };

  // --- SCANNER KAMERA BARCODE ---
  const startBarcodeScanner = async () => {
    isHandlingScanRef.current = false;
    setScannerStatus('Membuka kamera barcode...');
    setShowScannerModal(true);

    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('barcode-reader-box');
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 150 },
          },
          (decodedText) => {
            if (isHandlingScanRef.current) return;
            isHandlingScanRef.current = true;
            handleBarcodeMatch(decodedText, true);
          },
          () => {
            setScannerStatus('Arahkan garis pindai tepat ke barcode...');
          }
        );
      } catch {
        setShowScannerModal(false);
        showNotif(
          'Kamera Tidak Dapat Diakses',
          'Pastikan izin kamera aktif dan halaman dibuka lewat HTTPS atau localhost.',
          'error'
        );
      }
    }, 150);
  };

  const stopBarcodeScanner = async () => {
    const scanner = html5QrCodeRef.current;
    html5QrCodeRef.current = null;
    setShowScannerModal(false);

    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch {
        // Abaikan error saat menutup kamera
      }
    }
  };

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            if (newQty > item.stock) {
              showNotif('Stok Terbatas', `Stok tersedia hanya ${item.stock} ${item.unit}.`, 'warning');
              return item;
            }
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.sell_price * item.qty, 0);
  const cartTotalProfit = cart.reduce(
    (sum, item) => sum + (item.sell_price - item.buy_price) * item.qty,
    0
  );
  const cashNumeric = Number(cashReceived) || 0;
  const changeAmount = paymentMethod === 'Tunai' ? Math.max(0, cashNumeric - cartTotal) : 0;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showNotif('Keranjang Kosong', 'Pilih minimal satu barang terlebih dahulu.', 'warning');
      return;
    }
    if (paymentMethod === 'Tunai' && cashNumeric < cartTotal) {
      showNotif('Uang Kurang', 'Uang yang diterima masih kurang dari total belanja.', 'warning');
      return;
    }

    setIsProcessingCheckout(true);
    const invoiceNo = `INV-${Date.now().toString().slice(-6)}`;

    try {
      const { data: trxData, error: trxError } = await supabase
        .from('transactions')
        .insert({
          invoice_no: invoiceNo,
          customer_name: customerName || 'Pelanggan Umum',
          payment_method: paymentMethod,
          total_amount: cartTotal,
          total_profit: cartTotalProfit,
          cash_received: paymentMethod === 'Tunai' ? cashNumeric : cartTotal,
          change_amount: changeAmount,
        })
        .select()
        .single();

      if (trxError) throw trxError;

      for (const item of cart) {
        await supabase.from('transaction_items').insert({
          transaction_id: trxData.id,
          product_id: item.id,
          product_name: item.name,
          qty: item.qty,
          buy_price: item.buy_price,
          sell_price: item.sell_price,
          subtotal: item.sell_price * item.qty,
          profit: (item.sell_price - item.buy_price) * item.qty,
        });

        await supabase
          .from('products')
          .update({ stock: item.stock - item.qty })
          .eq('id', item.id);
      }

      setLastReceipt({
        invoice_no: invoiceNo,
        date: formatTanggalIndo(new Date().toISOString()),
        customer: customerName || 'Pelanggan Umum',
        payment: paymentMethod,
        items: [...cart],
        total: cartTotal,
        cash: paymentMethod === 'Tunai' ? cashNumeric : cartTotal,
        change: changeAmount,
      });

      setCart([]);
      setCashReceived('');
      setCustomerName('Pelanggan Umum');
      setShowReceiptModal(true);
      await fetchAllData();
    } catch (err) {
      console.error(err);
      showNotif('Transaksi Gagal', 'Gagal menyimpan transaksi ke database.', 'error');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // --- DAFTAR KATEGORI GABUNGAN (BAWAAN + KATEGORI BARANG) ---
  const availableCategories = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...products.map((p) => p.category).filter(Boolean),
    ])
  );

  // --- KELOLA BARANG & STOK ---
  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      barcode: '',
      category: availableCategories[0] || 'Nugget & Olahan Ayam',
      unit: 'Pack',
      buy_price: '',
      sell_price: '',
      stock: '',
      min_stock: '5',
    });
    setShowProductModal(true);
  };

  const openEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProductForm({
      name: prod.name,
      barcode: prod.barcode || '',
      category: prod.category,
      unit: prod.unit,
      buy_price: String(prod.buy_price),
      sell_price: String(prod.sell_price),
      stock: String(prod.stock),
      min_stock: String(prod.min_stock),
    });
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBarcode = productForm.barcode.trim();
    const cleanCategory = productForm.category.trim() || 'Umum';
    const payload = {
      name: productForm.name.trim(),
      barcode: cleanBarcode || null,
      category: cleanCategory,
      unit: productForm.unit,
      buy_price: Number(productForm.buy_price),
      sell_price: Number(productForm.sell_price),
      stock: Number(productForm.stock),
      min_stock: Number(productForm.min_stock),
    };

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id);
        if (error) throw error;
        showNotif('Barang Diperbarui', `${payload.name} berhasil disimpan.`, 'success');
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
        showNotif('Barang Ditambahkan', `${payload.name} masuk ke daftar stok.`, 'success');
      }
      setShowProductModal(false);
      await fetchAllData();
    } catch {
      showNotif('Gagal Menyimpan', 'Periksa isian barang atau pastikan kode barcode tidak kembar.', 'error');
    }
  };

  const handleDeleteProduct = async (prod: Product) => {
    try {
      const { error } = await supabase.from('products').delete().eq('id', prod.id);
      if (error) throw error;
      showNotif('Barang Dihapus', `${prod.name} telah dihapus.`, 'success');
      await fetchAllData();
    } catch {
      showNotif('Tidak Bisa Dihapus', 'Barang sudah tercatat di riwayat transaksi.', 'error');
    }
  };

  // --- PERUBAHAN STOK (MASUK / KELUAR / KEMBALI) ---
  const handleSaveMutation = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProd = products.find((p) => p.id === mutationForm.product_id);
    const qtyNum = Number(mutationForm.qty);

    if (!targetProd || qtyNum <= 0) {
      showNotif('Data Belum Lengkap', 'Pilih barang dan isi jumlah yang benar.', 'warning');
      return;
    }

    const isAddition = mutationForm.type === 'MASUK' || mutationForm.type === 'RETUR_CUSTOMER';
    const newStock = isAddition ? targetProd.stock + qtyNum : targetProd.stock - qtyNum;

    if (newStock < 0) {
      showNotif('Stok Kurang', `Stok ${targetProd.name} tinggal ${targetProd.stock}.`, 'warning');
      return;
    }

    try {
      const { error: mutError } = await supabase.from('stock_mutations').insert({
        product_id: targetProd.id,
        product_name: targetProd.name,
        type: mutationForm.type,
        qty: qtyNum,
        note: mutationForm.note || '-',
      });
      if (mutError) throw mutError;

      const { error: prodError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', targetProd.id);
      if (prodError) throw prodError;

      setMutationForm({ product_id: '', type: 'MASUK', qty: '', note: '' });
      showNotif('Stok Tersimpan', `Stok ${targetProd.name} sekarang menjadi ${newStock}.`, 'success');
      await fetchAllData();
    } catch {
      showNotif('Gagal Menyimpan', 'Terjadi kendala saat menyimpan perubahan stok.', 'error');
    }
  };

  // --- FILTER BARANG & LAPORAN ---
  const categories = ['Semua', ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
    const matchesCat = selectedCategory === 'Semua' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const filteredTransactions = transactions.filter((t) => {
    const trxDate = t.created_at.split('T')[0];
    if (reportStartDate && trxDate < reportStartDate) return false;
    if (reportEndDate && trxDate > reportEndDate) return false;
    return true;
  });

  const totalRevenue = filteredTransactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
  const totalNetProfit = filteredTransactions.reduce((sum, t) => sum + Number(t.total_profit), 0);
  const totalCOGS = totalRevenue - totalNetProfit;
  const lowStockCount = products.filter((p) => p.stock <= p.min_stock).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* HEADER NAVIGASI ATAS */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-sm">
              <Snowflake className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                FROZENPRO <span className="text-red-600">POS</span>
              </h1>
              <p className="text-xs text-slate-500">Kasir &amp; Stok Barang Beku</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            {[
              { id: 'kasir', label: 'Kasir', icon: ShoppingCart },
              { id: 'produk', label: 'Stok Barang', icon: Package, badge: lowStockCount },
              { id: 'mutasi', label: 'Masuk / Keluar / Kembali', icon: ArrowLeftRight },
              { id: 'laporan', label: 'Laba Rugi & Stok', icon: BarChart3 },
            ].map((menu) => {
              const Icon = menu.icon;
              const isActive = activeTab === menu.id;
              return (
                <button
                  key={menu.id}
                  onClick={() => setActiveTab(menu.id as typeof activeTab)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{menu.label}</span>
                  {menu.badge ? (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                        isActive ? 'bg-white text-red-600' : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {menu.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
            <p className="text-sm font-medium">Memuat data kasir dan stok...</p>
          </div>
        ) : (
          <>
            {/* =========================================================
                TAB 1: KASIR + SCAN BARCODE
            ========================================================= */}
            {activeTab === 'kasir' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <ScanBarcode className="w-4 h-4 text-red-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Tembak barcode / ketik kode lalu tekan Enter..."
                          value={barcodeInput}
                          onChange={(e) => setBarcodeInput(e.target.value)}
                          onKeyDown={handleBarcodeKeyDown}
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={startBarcodeScanner}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
                      >
                        <ScanBarcode className="w-4 h-4 text-red-400" />
                        <span>Scan Kamera</span>
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Cari nama barang atau nomor barcode..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors ${
                          selectedCategory === cat
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                    {filteredProducts.map((product) => {
                      const isOutOfStock = product.stock <= 0;
                      const isLowStock = product.stock > 0 && product.stock <= product.min_stock;
                      return (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product)}
                          disabled={isOutOfStock}
                          className={`text-left bg-white p-4 rounded-xl border transition-all flex flex-col justify-between ${
                            isOutOfStock
                              ? 'border-slate-200 opacity-50 cursor-not-allowed'
                              : 'border-slate-200 hover:border-red-500 hover:shadow-md active:scale-[0.99]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 truncate">
                                {product.category}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  isOutOfStock
                                    ? 'bg-red-100 text-red-700'
                                    : isLowStock
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                Stok: {product.stock}
                              </span>
                            </div>
                            <h3 className="font-semibold text-sm text-slate-900 line-clamp-2 leading-snug">
                              {product.name}
                            </h3>
                            {product.barcode && (
                              <p className="text-[11px] text-slate-400 font-mono mt-1 truncate">
                                {product.barcode}
                              </p>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                            <span className="text-base font-bold text-red-600">
                              {formatRupiah(product.sell_price)}
                            </span>
                            <span className="text-xs text-slate-400">/{product.unit}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* KANAN: KERANJANG & PEMBAYARAN */}
                <div className="lg:col-span-5 xl:col-span-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-xs sticky top-22 flex flex-col max-h-[calc(100vh-7rem)]">
                    <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-red-600" />
                        <h2 className="font-bold text-slate-900">Keranjang Belanja</h2>
                      </div>
                      {cart.length > 0 && (
                        <button
                          onClick={() => setCart([])}
                          className="text-xs text-red-600 hover:underline font-medium"
                        >
                          Kosongkan
                        </button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {cart.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">Belum ada barang dipilih</p>
                          <p className="text-xs mt-1">Klik barang atau scan barcode</p>
                        </div>
                      ) : (
                        cart.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatRupiah(item.sell_price)} x {item.qty}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => updateCartQty(item.id, -1)}
                                className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-7 text-center text-sm font-semibold">
                                {item.qty}
                              </span>
                              <button
                                onClick={() => updateCartQty(item.id, 1)}
                                className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="p-4 border-t border-slate-200 bg-slate-50/70 rounded-b-xl space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Nama Pembeli
                          </label>
                          <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Cara Bayar
                          </label>
                          <select
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                          >
                            <option value="Tunai">Tunai</option>
                            <option value="QRIS">QRIS</option>
                            <option value="Transfer Bank">Transfer Bank</option>
                          </select>
                        </div>
                      </div>

                      {paymentMethod === 'Tunai' && (
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Uang Diterima (Rp)
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            value={cashReceived}
                            onChange={(e) => setCashReceived(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                          />
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-200 space-y-1">
                        <div className="flex justify-between text-sm font-bold text-slate-900">
                          <span>Total Tagihan</span>
                          <span className="text-lg text-red-600">{formatRupiah(cartTotal)}</span>
                        </div>
                        {paymentMethod === 'Tunai' && (
                          <div className="flex justify-between text-xs text-slate-600">
                            <span>Kembalian</span>
                            <span className="font-semibold text-emerald-600">
                              {formatRupiah(changeAmount)}
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleCheckout}
                        disabled={isProcessingCheckout || cart.length === 0}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-semibold text-sm rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {isProcessingCheckout ? 'Menyimpan...' : 'Selesaikan Transaksi'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================
                TAB 2: STOK BARANG
            ========================================================= */}
            {activeTab === 'produk' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Daftar &amp; Stok Barang</h2>
                    <p className="text-xs text-slate-500">
                      Atur kategori, barcode, harga modal, harga jual, dan jumlah stok
                    </p>
                  </div>
                  <button
                    onClick={openAddProduct}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Barang Baru</span>
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                          <th className="py-3.5 px-4">Nama Barang</th>
                          <th className="py-3.5 px-4">Barcode</th>
                          <th className="py-3.5 px-4">Kategori</th>
                          <th className="py-3.5 px-4 text-right">Harga Modal</th>
                          <th className="py-3.5 px-4 text-right">Harga Jual</th>
                          <th className="py-3.5 px-4 text-right">Untung/Item</th>
                          <th className="py-3.5 px-4 text-center">Sisa Stok</th>
                          <th className="py-3.5 px-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {products.map((p) => {
                          const margin = p.sell_price - p.buy_price;
                          const isLow = p.stock <= p.min_stock;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-4 font-semibold text-slate-900">{p.name}</td>
                              <td className="py-3 px-4 font-mono text-xs text-slate-600">
                                {p.barcode || '-'}
                              </td>
                              <td className="py-3 px-4 text-slate-600">{p.category}</td>
                              <td className="py-3 px-4 text-right text-slate-600">
                                {formatRupiah(p.buy_price)}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-slate-900">
                                {formatRupiah(p.sell_price)}
                              </td>
                              <td className="py-3 px-4 text-right text-emerald-600 font-medium">
                                +{formatRupiah(margin)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    isLow
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {p.stock} {p.unit}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => openEditProduct(p)}
                                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                                    title="Edit Barang"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(p)}
                                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                    title="Hapus Barang"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================
                TAB 3: MASUK / KELUAR / KEMBALI STOK
            ========================================================= */}
            {activeTab === 'mutasi' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4">
                  <form
                    onSubmit={handleSaveMutation}
                    className="bg-white p-5 rounded-xl border border-slate-200 space-y-4"
                  >
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Catat Perubahan Stok</h2>
                      <p className="text-xs text-slate-500">
                        Catat barang masuk, barang keluar/rusak, atau barang kembali
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Pilih Jenis Perubahan
                      </label>
                      <select
                        value={mutationForm.type}
                        onChange={(e) =>
                          setMutationForm({
                            ...mutationForm,
                            type: e.target.value as typeof mutationForm.type,
                          })
                        }
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                      >
                        <option value="MASUK">Barang Masuk (Kulakan / Kiriman Baru) (+Stok)</option>
                        <option value="RETUR_CUSTOMER">Barang Kembali dari Pembeli (+Stok)</option>
                        <option value="KELUAR">Barang Keluar (Rusak / Cair / Terpakai) (-Stok)</option>
                        <option value="RETUR_SUPPLIER">Barang Dikembalikan ke Supplier (-Stok)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Pilih Barang
                      </label>
                      <select
                        required
                        value={mutationForm.product_id}
                        onChange={(e) =>
                          setMutationForm({ ...mutationForm, product_id: e.target.value })
                        }
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                      >
                        <option value="">-- Pilih Barang --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Sisa: {p.stock} {p.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Jumlah Barang
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Contoh: 10"
                        value={mutationForm.qty}
                        onChange={(e) => setMutationForm({ ...mutationForm, qty: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Keterangan / Alasan
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Kiriman baru / Plastik robek / Cair"
                        value={mutationForm.note}
                        onChange={(e) => setMutationForm({ ...mutationForm, note: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      Simpan Perubahan Stok
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-8">
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="text-sm font-bold text-slate-900">
                        Catatan Barang Masuk, Keluar &amp; Kembali
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                            <th className="py-3 px-4">Waktu</th>
                            <th className="py-3 px-4">Jenis</th>
                            <th className="py-3 px-4">Barang</th>
                            <th className="py-3 px-4 text-center">Jumlah</th>
                            <th className="py-3 px-4">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {mutations.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                                Belum ada catatan perubahan stok.
                              </td>
                            </tr>
                          ) : (
                            mutations.map((m) => {
                              const isPlus = m.type === 'MASUK' || m.type === 'RETUR_CUSTOMER';
                              const labelJenis =
                                m.type === 'MASUK'
                                  ? 'Barang Masuk'
                                  : m.type === 'RETUR_CUSTOMER'
                                  ? 'Kembali dari Pembeli'
                                  : m.type === 'KELUAR'
                                  ? 'Barang Keluar'
                                  : 'Dikembalikan ke Supplier';

                              return (
                                <tr key={m.id} className="hover:bg-slate-50">
                                  <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                                    {formatTanggalIndo(m.created_at)}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                                        isPlus
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-50 text-amber-700'
                                      }`}
                                    >
                                      {m.type === 'MASUK' && <ArrowDownLeft className="w-3 h-3" />}
                                      {m.type === 'KELUAR' && <ArrowUpRight className="w-3 h-3" />}
                                      {m.type.startsWith('RETUR') && (
                                        <RotateCcw className="w-3 h-3" />
                                      )}
                                      {labelJenis}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-medium text-slate-900">
                                    {m.product_name}
                                  </td>
                                  <td
                                    className={`py-3 px-4 text-center font-bold ${
                                      isPlus ? 'text-emerald-600' : 'text-red-600'
                                    }`}
                                  >
                                    {isPlus ? `+${m.qty}` : `-${m.qty}`}
                                  </td>
                                  <td className="py-3 px-4 text-slate-600 text-xs">{m.note}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================
                TAB 4: LAPORAN LABA RUGI, BARANG KELUAR & STOK
            ========================================================= */}
            {activeTab === 'laporan' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ProfitLossBackupModal
                    transactions={transactions}
                    products={products}
                    mutations={mutations}
                    storeName="FROZENPRO POS"
                  />
                  <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-2xs">
                    Waktu Sekarang:{' '}
                    <span className="font-semibold text-slate-900">
                      {formatTanggalIndo(new Date().toISOString())} WIB
                    </span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Laporan Laba Rugi, Barang Keluar &amp; Stok
                    </h2>
                    <p className="text-xs text-slate-500">
                      Periode terpilih:{' '}
                      <span className="font-semibold text-slate-800">
                        {reportStartDate
                          ? new Intl.DateTimeFormat('id-ID', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            }).format(new Date(`${reportStartDate}T00:00:00`))
                          : '-'}{' '}
                        00:00 WIB
                      </span>{' '}
                      s/d{' '}
                      <span className="font-semibold text-slate-800">
                        {reportEndDate
                          ? new Intl.DateTimeFormat('id-ID', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                            }).format(new Date(`${reportEndDate}T23:59:59`))
                          : '-'}{' '}
                        23:59 WIB
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                    />
                    <span className="text-slate-400 text-sm">s/d</span>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-semibold uppercase">Total Penjualan</span>
                      <Wallet className="w-5 h-5 text-slate-700" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                      {formatRupiah(totalRevenue)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Dari {filteredTransactions.length} transaksi selesai
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-semibold uppercase">Modal Barang Terjual</span>
                      <Receipt className="w-5 h-5 text-amber-600" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{formatRupiah(totalCOGS)}</p>
                    <p className="text-xs text-slate-400 mt-1">Harga modal produk terjual</p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border-2 border-emerald-500/30">
                    <div className="flex items-center justify-between text-emerald-700 mb-2">
                      <span className="text-xs font-semibold uppercase">Laba Kotor</span>
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-600">
                      {formatRupiah(totalNetProfit)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Persen untung:{' '}
                      {totalRevenue > 0 ? Math.round((totalNetProfit / totalRevenue) * 100) : 0}%
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between text-slate-500 mb-2">
                      <span className="text-xs font-semibold uppercase">Stok Toko &amp; Modal</span>
                      <Package className="w-5 h-5 text-red-600" />
                    </div>
                    <p className="text-xl font-bold text-slate-900">
                      {products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0)} unit
                    </p>
                    <p className="text-xs font-semibold text-red-600 mt-1">
                      Modal Stok:{' '}
                      {formatRupiah(
                        products.reduce(
                          (sum, p) => sum + (Number(p.stock) || 0) * (Number(p.buy_price) || 0),
                          0
                        )
                      )}
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900">Rincian Penjualan</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                          <th className="py-3 px-4">No. Nota</th>
                          <th className="py-3 px-4">Tanggal &amp; Jam</th>
                          <th className="py-3 px-4">Pembeli</th>
                          <th className="py-3 px-4 text-right">Total Bayar</th>
                          <th className="py-3 px-4 text-right">Harga Modal</th>
                          <th className="py-3 px-4 text-right">Laba</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                              Belum ada transaksi pada tanggal yang dipilih.
                            </td>
                          </tr>
                        ) : (
                          filteredTransactions.map((t) => {
                            const trxHpp = Math.max(
                              0,
                              Number(t.total_amount) - Number(t.total_profit)
                            );
                            return (
                              <tr key={t.id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-semibold text-slate-900">
                                  {t.invoice_no}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-500">
                                  {formatTanggalIndo(t.created_at)}
                                </td>
                                <td className="py-3 px-4 text-slate-700">{t.customer_name}</td>
                                <td className="py-3 px-4 text-right font-semibold text-slate-900">
                                  {formatRupiah(t.total_amount)}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600">
                                  {formatRupiah(trxHpp)}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-emerald-600">
                                  +{formatRupiah(t.total_profit)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900">
                      Barang Keluar / Dikembalikan ke Supplier &amp; Harga Modal
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                          <th className="py-3 px-4">Tanggal &amp; Jam</th>
                          <th className="py-3 px-4">Jenis</th>
                          <th className="py-3 px-4">Barang</th>
                          <th className="py-3 px-4 text-center">Jumlah</th>
                          <th className="py-3 px-4 text-right">Harga Modal</th>
                          <th className="py-3 px-4 text-right">Total Modal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {mutations
                          .filter((m) => {
                            if (m.type !== 'KELUAR' && m.type !== 'RETUR_SUPPLIER') return false;
                            const mutDate = m.created_at.split('T')[0];
                            if (reportStartDate && mutDate < reportStartDate) return false;
                            if (reportEndDate && mutDate > reportEndDate) return false;
                            return true;
                          })
                          .map((m) => {
                            const prod = products.find(
                              (p) =>
                                p.id === m.product_id ||
                                p.name.toLowerCase() === m.product_name.toLowerCase()
                            );
                            const modalSatuan = Number(prod?.buy_price) || 0;
                            const totalModal = modalSatuan * (Number(m.qty) || 0);
                            return (
                              <tr key={m.id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 text-xs text-slate-500">
                                  {formatTanggalIndo(m.created_at)}
                                </td>
                                <td className="py-3 px-4 text-xs font-semibold text-amber-700">
                                  {m.type === 'KELUAR'
                                    ? 'Barang Keluar'
                                    : 'Dikembalikan ke Supplier'}
                                </td>
                                <td className="py-3 px-4 font-medium text-slate-900">
                                  {m.product_name}
                                </td>
                                <td className="py-3 px-4 text-center font-bold text-red-600">
                                  -{m.qty}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600">
                                  {formatRupiah(modalSatuan)}
                                </td>
                                <td className="py-3 px-4 text-right font-semibold text-slate-900">
                                  {formatRupiah(totalModal)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* =========================================================
          MODAL 1: KAMERA SCAN BARCODE
      ========================================================= */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanBarcode className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-slate-900">Scan Barcode Barang</h3>
              </div>
              <button
                onClick={stopBarcodeScanner}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div
                id="barcode-reader-box"
                className="w-full rounded-xl overflow-hidden bg-slate-950 min-h-[240px]"
              />
              <p className="text-xs text-slate-500 text-center">{scannerStatus}</p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: TAMBAH / EDIT BARANG + KATEGORI BEBAS
      ========================================================= */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">
                {editingProduct ? 'Edit Barang' : 'Tambah Barang Baru'}
              </h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Barang</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Fiesta Crispy Bubble Nugget 500g"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kode Barcode (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 8991001000011"
                  value={productForm.barcode}
                  onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori (Pilih atau Ketik Baru)
                  </label>
                  <input
                    type="text"
                    required
                    list="kategori-barang-list"
                    placeholder="Ketik kategori baru..."
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  <datalist id="kategori-barang-list">
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Satuan</label>
                  <input
                    type="text"
                    required
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Harga Modal (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    value={productForm.buy_price}
                    onChange={(e) => setProductForm({ ...productForm, buy_price: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Harga Jual (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    value={productForm.sell_price}
                    onChange={(e) => setProductForm({ ...productForm, sell_price: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Stok Awal</label>
                  <input
                    type="number"
                    required
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pengingat Stok Menipis
                  </label>
                  <input
                    type="number"
                    required
                    value={productForm.min_stock}
                    onChange={(e) => setProductForm({ ...productForm, min_stock: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg"
                >
                  Simpan Barang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: STRUK THERMAL SIAP CETAK
      ========================================================= */}
      {showReceiptModal && lastReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Transaksi Berhasil</h3>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div id="thermal-receipt" className="p-5 font-mono text-xs text-slate-900 space-y-2">
              <div className="text-center border-b border-dashed border-slate-400 pb-2">
                <p className="font-bold text-sm">FROZENPRO STORE</p>
                <p>Pusat Aneka Frozen Food</p>
                <p>{lastReceipt.date}</p>
              </div>
              <div className="border-b border-dashed border-slate-400 pb-2">
                <p>Nota: {lastReceipt.invoice_no}</p>
                <p>Plg: {lastReceipt.customer}</p>
                <p>Bayar: {lastReceipt.payment}</p>
              </div>
              <div className="border-b border-dashed border-slate-400 pb-2 space-y-1">
                {lastReceipt.items.map((item) => (
                  <div key={item.id}>
                    <p className="font-semibold">{item.name}</p>
                    <div className="flex justify-between">
                      <span>
                        {item.qty} x {formatRupiah(item.sell_price)}
                      </span>
                      <span>{formatRupiah(item.qty * item.sell_price)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex justify-between font-bold">
                  <span>TOTAL</span>
                  <span>{formatRupiah(lastReceipt.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>BAYAR</span>
                  <span>{formatRupiah(lastReceipt.cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span>KEMBALI</span>
                  <span>{formatRupiah(lastReceipt.change)}</span>
                </div>
              </div>
              <p className="text-center pt-3 text-[11px]">
                Terima kasih telah berbelanja. Simpan di suhu beku (-18C).
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Struk</span>
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 4: NOTIFIKASI POPUP KUSTOM
      ========================================================= */}
      {notif.show && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              {notif.type === 'success' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{notif.title}</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.message}</p>
              </div>
            </div>
            <button
              onClick={() => setNotif({ ...notif, show: false })}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}