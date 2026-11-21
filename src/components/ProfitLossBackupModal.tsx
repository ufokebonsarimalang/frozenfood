'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatRupiah, formatTanggalIndo } from '@/lib/supabase';

export interface ProductItem {
  id: string;
  name: string;
  barcode?: string | null;
  category?: string;
  unit?: string;
  buy_price: number;
  sell_price: number;
  stock: number;
}

export interface TransactionItem {
  id: string;
  invoice_no?: string;
  created_at: string;
  total_amount?: number;
  total_profit?: number;
  total?: number;
  items?: Array<{
    product_id?: string;
    name?: string;
    qty?: number;
    quantity?: number;
    price?: number;
    sell_price?: number;
    buy_price?: number;
  }>;
}

export interface StockMutationItem {
  id: string;
  product_id: string;
  product_name: string;
  type: 'MASUK' | 'KELUAR' | 'RETUR_CUSTOMER' | 'RETUR_SUPPLIER';
  qty: number;
  note: string;
  created_at: string;
}

interface ProfitLossBackupModalProps {
  transactions: TransactionItem[];
  products: ProductItem[];
  mutations?: StockMutationItem[];
  storeName?: string;
}

function getPreviousMonthPeriod(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const prevDate = new Date(year, month - 1, 1);

  const prevYear = prevDate.getFullYear();
  const prevMonthIndex = prevDate.getMonth();
  const startDate = new Date(prevYear, prevMonthIndex, 1, 0, 0, 0, 0);
  const endDate = new Date(prevYear, prevMonthIndex + 1, 0, 23, 59, 59, 999);

  const monthKey = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(startDate);

  return { startDate, endDate, monthKey, label };
}

export default function ProfitLossBackupModal({
  transactions,
  products,
  mutations = [],
  storeName = 'FROZENPRO POS',
}: ProfitLossBackupModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFirstDayReminder, setIsFirstDayReminder] = useState(false);
  const [backedUpMonths, setBackedUpMonths] = useState<string[]>([]);

  const prevPeriod = useMemo(() => getPreviousMonthPeriod(), []);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('pnl_backed_up_months') || '[]');
    setBackedUpMonths(Array.isArray(saved) ? saved : []);

    const today = new Date();
    const isFirstDay = today.getDate() === 1;
    const alreadyBackedUp = Array.isArray(saved) && saved.includes(prevPeriod.monthKey);

    if (isFirstDay && !alreadyBackedUp) {
      setIsFirstDayReminder(true);
      setIsOpen(true);
    }
  }, [prevPeriod.monthKey]);

  const productMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    for (const p of products) {
      map.set(p.id, p);
      map.set(p.name.toLowerCase(), p);
    }
    return map;
  }, [products]);

  const monthlyReport = useMemo(() => {
    const filtered = transactions.filter((trx) => {
      const d = new Date(trx.created_at);
      return d >= prevPeriod.startDate && d <= prevPeriod.endDate;
    });

    let totalRevenue = 0;
    let totalCogs = 0;

    const rows = filtered.map((trx, index) => {
      const items = Array.isArray(trx.items) ? trx.items : [];
      let trxRevenue = 0;
      let trxCogs = 0;

      if (items.length > 0) {
        for (const item of items) {
          const qty = Number(item.qty ?? item.quantity ?? 1) || 1;
          const byId = item.product_id ? productMap.get(item.product_id) : undefined;
          const byName = item.name ? productMap.get(item.name.toLowerCase()) : undefined;
          const matchedProduct: ProductItem | undefined = byId ?? byName;

          const sellPrice =
            Number(item.price ?? item.sell_price ?? matchedProduct?.sell_price ?? 0) || 0;
          const buyPrice =
            Number(item.buy_price ?? matchedProduct?.buy_price ?? 0) || 0;

          trxRevenue += sellPrice * qty;
          trxCogs += buyPrice * qty;
        }
      } else if (typeof trx.total_amount === 'number' && typeof trx.total_profit === 'number') {
        trxRevenue = Number(trx.total_amount) || 0;
        trxCogs = Math.max(0, trxRevenue - (Number(trx.total_profit) || 0));
      } else {
        trxRevenue = Number(trx.total_amount ?? trx.total ?? 0) || 0;
        trxCogs = 0;
      }

      const grossProfit = trxRevenue - trxCogs;
      totalRevenue += trxRevenue;
      totalCogs += trxCogs;

      return {
        no: index + 1,
        tanggal: formatTanggalIndo(trx.created_at),
        idTransaksi: trx.invoice_no || trx.id,
        pendapatan: trxRevenue,
        hpp: trxCogs,
        labaRugi: grossProfit,
      };
    });

    // Barang keluar (KELUAR / RETUR_SUPPLIER) pada periode bulan lalu beserta harga modal (HPP)
    const outgoingRows = mutations
      .filter((m) => {
        if (m.type !== 'KELUAR' && m.type !== 'RETUR_SUPPLIER') return false;
        const d = new Date(m.created_at);
        return d >= prevPeriod.startDate && d <= prevPeriod.endDate;
      })
      .map((m, idx) => {
        const matchedProduct =
          productMap.get(m.product_id) || productMap.get(m.product_name.toLowerCase());
        const buyPrice = Number(matchedProduct?.buy_price) || 0;
        const qtyNum = Number(m.qty) || 0;
        const totalModalKeluar = buyPrice * qtyNum;

        return {
          no: idx + 1,
          tanggal: formatTanggalIndo(m.created_at),
          jenis: m.type.replace('_', ' '),
          produk: m.product_name,
          qty: qtyNum,
          hargaModal: buyPrice,
          totalModal: totalModalKeluar,
          keterangan: m.note || '-',
        };
      });

    const totalOutgoingQty = outgoingRows.reduce((sum, r) => sum + r.qty, 0);
    const totalOutgoingCost = outgoingRows.reduce((sum, r) => sum + r.totalModal, 0);

    return {
      rows,
      totalRevenue,
      totalCogs,
      netProfit: totalRevenue - totalCogs,
      transactionCount: filtered.length,
      outgoingRows,
      totalOutgoingQty,
      totalOutgoingCost,
    };
  }, [transactions, mutations, prevPeriod, productMap]);

  const stockSummary = useMemo(() => {
    let totalUnits = 0;
    let totalCapitalValue = 0;

    const rows = products.map((p, idx) => {
      const stockNum = Number(p.stock) || 0;
      const buyNum = Number(p.buy_price) || 0;
      const subtotalCapital = stockNum * buyNum;

      totalUnits += stockNum;
      totalCapitalValue += subtotalCapital;

      return {
        no: idx + 1,
        name: p.name,
        barcode: p.barcode || '-',
        category: p.category || '-',
        unit: p.unit || 'Pack',
        stock: stockNum,
        buyPrice: buyNum,
        subtotalCapital,
      };
    });

    return {
      rows,
      totalProducts: products.length,
      totalUnits,
      totalCapitalValue,
    };
  }, [products]);

  const markMonthAsBackedUp = () => {
    const updated = Array.from(new Set([...backedUpMonths, prevPeriod.monthKey]));
    setBackedUpMonths(updated);
    localStorage.setItem('pnl_backed_up_months', JSON.stringify(updated));
    setIsFirstDayReminder(false);
  };

  const handleDownloadExcel = () => {
    const summaryData = [
      ['LAPORAN LABA RUGI BULANAN', ''],
      ['Toko', storeName],
      ['Periode Backup', prevPeriod.label],
      ['Tanggal & Jam Cetak', formatTanggalIndo(new Date().toISOString())],
      ['Jumlah Transaksi', monthlyReport.transactionCount],
      ['Total Pendapatan', monthlyReport.totalRevenue],
      ['Total HPP / Harga Modal Penjualan', monthlyReport.totalCogs],
      ['Laba / Rugi Bersih Penjualan', monthlyReport.netProfit],
      ['Total Qty Barang Keluar / Retur Supplier', monthlyReport.totalOutgoingQty],
      ['Total Harga Modal Barang Keluar', monthlyReport.totalOutgoingCost],
    ];

    const detailData = monthlyReport.rows.map((r) => ({
      No: r.no,
      Tanggal: r.tanggal,
      'No. Invoice / ID': r.idTransaksi,
      Pendapatan: r.pendapatan,
      'HPP (Harga Modal)': r.hpp,
      'Laba / Rugi': r.labaRugi,
    }));

    const outgoingData = monthlyReport.outgoingRows.map((o) => ({
      No: o.no,
      Tanggal: o.tanggal,
      Jenis: o.jenis,
      Produk: o.produk,
      Qty: o.qty,
      'Harga Modal (HPP)': o.hargaModal,
      'Total Modal Keluar': o.totalModal,
      Keterangan: o.keterangan,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Ringkasan');

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        detailData.length > 0
          ? detailData
          : [
              {
                No: '-',
                Tanggal: '-',
                'No. Invoice / ID': '-',
                Pendapatan: 0,
                'HPP (Harga Modal)': 0,
                'Laba / Rugi': 0,
              },
            ]
      ),
      'Detail Transaksi'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        outgoingData.length > 0
          ? outgoingData
          : [
              {
                No: '-',
                Tanggal: '-',
                Jenis: '-',
                Produk: 'Tidak ada barang keluar',
                Qty: 0,
                'Harga Modal (HPP)': 0,
                'Total Modal Keluar': 0,
                Keterangan: '-',
              },
            ]
      ),
      'Barang Keluar & Modal'
    );

    XLSX.writeFile(wb, `Laporan_Laba_Rugi_${prevPeriod.monthKey}.xlsx`);
    markMonthAsBackedUp();
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text(`LAPORAN LABA RUGI - ${storeName}`, 14, 16);

    doc.setFontSize(10);
    doc.text(`Periode: ${prevPeriod.label}`, 14, 24);
    doc.text(`Dicetak: ${formatTanggalIndo(new Date().toISOString())}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [['Keterangan Ringkasan', 'Nilai']],
      body: [
        ['Jumlah Transaksi', `${monthlyReport.transactionCount} transaksi`],
        ['Total Pendapatan', formatRupiah(monthlyReport.totalRevenue)],
        ['Total HPP / Harga Modal Penjualan', formatRupiah(monthlyReport.totalCogs)],
        ['Laba / Rugi Bersih Penjualan', formatRupiah(monthlyReport.netProfit)],
        ['Barang Keluar / Retur Supplier', `${monthlyReport.totalOutgoingQty} unit (${formatRupiah(monthlyReport.totalOutgoingCost)})`],
      ],
    });

    const afterSummaryY = (doc as unknown as { lastAutoTable?: { finalY?: number } })
      .lastAutoTable?.finalY || 82;

    doc.setFontSize(11);
    doc.text('Rincian Transaksi & HPP', 14, afterSummaryY + 10);

    autoTable(doc, {
      startY: afterSummaryY + 14,
      head: [['No', 'Tanggal', 'Pendapatan', 'HPP', 'Laba / Rugi']],
      body:
        monthlyReport.rows.length > 0
          ? monthlyReport.rows.map((r) => [
              String(r.no),
              r.tanggal,
              formatRupiah(r.pendapatan),
              formatRupiah(r.hpp),
              formatRupiah(r.labaRugi),
            ])
          : [['-', 'Tidak ada transaksi pada periode ini', 'Rp 0', 'Rp 0', 'Rp 0']],
    });

    const afterTrxY = (doc as unknown as { lastAutoTable?: { finalY?: number } })
      .lastAutoTable?.finalY || 120;

    doc.setFontSize(11);
    doc.text('Barang Keluar & Harga Modal', 14, afterTrxY + 10);

    autoTable(doc, {
      startY: afterTrxY + 14,
      head: [['No', 'Tanggal', 'Produk', 'Qty', 'Harga Modal', 'Total Modal']],
      body:
        monthlyReport.outgoingRows.length > 0
          ? monthlyReport.outgoingRows.map((o) => [
              String(o.no),
              o.tanggal,
              o.produk,
              String(o.qty),
              formatRupiah(o.hargaModal),
              formatRupiah(o.totalModal),
            ])
          : [['-', '-', 'Tidak ada barang keluar pada periode ini', '0', 'Rp 0', 'Rp 0']],
    });

    doc.save(`Laporan_Laba_Rugi_${prevPeriod.monthKey}.pdf`);
    markMonthAsBackedUp();
  };

  const handleDownloadStockExcel = () => {
    const nowFormatted = formatTanggalIndo(new Date().toISOString());
    const dateStamp = new Date().toISOString().slice(0, 10);

    const ringkasanStok = [
      ['REKAP STOK ALL BARANG & HARGA MODAL', ''],
      ['Toko', storeName],
      ['Tanggal & Jam Data', nowFormatted],
      ['Jumlah Jenis Produk', stockSummary.totalProducts],
      ['Total Unit Stok Toko', stockSummary.totalUnits],
      ['Total Nilai Harga Modal (HPP)', stockSummary.totalCapitalValue],
    ];

    const tabelStok = stockSummary.rows.map((r) => ({
      No: r.no,
      'Nama Produk': r.name,
      Barcode: r.barcode,
      Kategori: r.category,
      Satuan: r.unit,
      'Stok Saat Ini': r.stock,
      'Harga Modal (HPP)': r.buyPrice,
      'Total Modal Stok': r.subtotalCapital,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ringkasanStok), 'Ringkasan Stok');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        tabelStok.length > 0
          ? tabelStok
          : [
              {
                No: '-',
                'Nama Produk': 'Belum ada produk',
                Barcode: '-',
                Kategori: '-',
                Satuan: '-',
                'Stok Saat Ini': 0,
                'Harga Modal (HPP)': 0,
                'Total Modal Stok': 0,
              },
            ]
      ),
      'Stok All Barang'
    );

    XLSX.writeFile(wb, `Stok_All_Barang_Modal_${dateStamp}.xlsx`);
  };

  const handleDownloadStockPDF = () => {
    const doc = new jsPDF();
    const nowFormatted = formatTanggalIndo(new Date().toISOString());
    const dateStamp = new Date().toISOString().slice(0, 10);

    doc.setFontSize(14);
    doc.text(`LAPORAN STOK ALL BARANG & MODAL - ${storeName}`, 14, 16);

    doc.setFontSize(10);
    doc.text(`Tanggal & Jam Cetak: ${nowFormatted}`, 14, 24);

    autoTable(doc, {
      startY: 30,
      head: [['Ringkasan Stok Toko', 'Nilai']],
      body: [
        ['Jumlah Jenis Produk', `${stockSummary.totalProducts} item`],
        ['Total Unit Stok Toko', `${stockSummary.totalUnits} unit`],
        ['Total Nilai Harga Modal', formatRupiah(stockSummary.totalCapitalValue)],
      ],
    });

    const afterRingkasanY = (doc as unknown as { lastAutoTable?: { finalY?: number } })
      .lastAutoTable?.finalY || 62;

    doc.setFontSize(11);
    doc.text('Daftar Stok & Harga Modal Seluruh Produk', 14, afterRingkasanY + 10);

    autoTable(doc, {
      startY: afterRingkasanY + 14,
      head: [['No', 'Produk', 'Stok', 'Harga Modal', 'Total Modal']],
      body:
        stockSummary.rows.length > 0
          ? stockSummary.rows.map((r) => [
              String(r.no),
              r.name,
              `${r.stock} ${r.unit}`,
              formatRupiah(r.buyPrice),
              formatRupiah(r.subtotalCapital),
            ])
          : [['-', 'Belum ada produk', '0', 'Rp 0', 'Rp 0']],
    });

    doc.save(`Stok_All_Barang_Modal_${dateStamp}.pdf`);
  };

  const isAlreadyBackedUp = backedUpMonths.includes(prevPeriod.monthKey);

  return (
    <>
      {isFirstDayReminder && !isAlreadyBackedUp && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-slate-900 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-red-700">
              Pengingat Backup Bulanan (Tanggal 1)
            </p>
            <p className="text-xs text-slate-700">
              Silakan unduh backup laporan laba rugi periode{' '}
              <span className="font-semibold">{prevPeriod.label}</span> (Excel &amp; PDF) untuk
              menghemat kuota database.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Buka Backup
            </button>
            <button
              type="button"
              onClick={() => setIsFirstDayReminder(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Nanti
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 shadow-xs hover:bg-slate-50"
        >
          <span>Backup Laba Rugi ({prevPeriod.label})</span>
          {isAlreadyBackedUp && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Sudah Backup
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={handleDownloadStockExcel}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700"
        >
          <span>Excel Stok &amp; Modal</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadStockPDF}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-slate-800"
        >
          <span>PDF Stok &amp; Modal</span>
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Backup Laporan Laba Rugi
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Periode bulan sebelumnya: <span className="font-semibold">{prevPeriod.label}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">Pendapatan</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">
                  {formatRupiah(monthlyReport.totalRevenue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total HPP</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">
                  {formatRupiah(monthlyReport.totalCogs)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Laba / Rugi Bersih</p>
                <p
                  className={`mt-0.5 text-sm font-bold ${
                    monthlyReport.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {formatRupiah(monthlyReport.netProfit)}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Transaksi: <span className="font-semibold text-slate-700">{monthlyReport.transactionCount}</span>{' '}
              | Barang keluar: <span className="font-semibold text-slate-700">{monthlyReport.totalOutgoingQty} unit</span>{' '}
              (Modal: <span className="font-semibold text-slate-700">{formatRupiah(monthlyReport.totalOutgoingCost)}</span>).
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Download Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}