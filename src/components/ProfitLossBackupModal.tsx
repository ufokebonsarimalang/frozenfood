'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatRupiah, formatTanggalIndo } from '@/lib/supabase';

export interface ProductItem {
  id: string;
  name: string;
  buy_price: number;
  sell_price: number;
  stock: number;
}

export interface TransactionItem {
  id: string;
  created_at: string;
  total_amount?: number;
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

interface ProfitLossBackupModalProps {
  transactions: TransactionItem[];
  products: ProductItem[];
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
  storeName = 'KASIRPRO FROZEN',
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
        idTransaksi: trx.id,
        pendapatan: trxRevenue,
        hpp: trxCogs,
        labaRugi: grossProfit,
      };
    });

    return {
      rows,
      totalRevenue,
      totalCogs,
      netProfit: totalRevenue - totalCogs,
      transactionCount: filtered.length,
    };
  }, [transactions, prevPeriod, productMap]);

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
      ['Tanggal Cetak', formatTanggalIndo(new Date().toISOString())],
      ['Jumlah Transaksi', monthlyReport.transactionCount],
      ['Total Pendapatan', monthlyReport.totalRevenue],
      ['Total HPP / Harga Modal', monthlyReport.totalCogs],
      ['Laba / Rugi Bersih', monthlyReport.netProfit],
    ];

    const detailData = monthlyReport.rows.map((r) => ({
      No: r.no,
      Tanggal: r.tanggal,
      'ID Transaksi': r.idTransaksi,
      Pendapatan: r.pendapatan,
      'HPP (Modal)': r.hpp,
      'Laba / Rugi': r.labaRugi,
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

    const wsDetail = XLSX.utils.json_to_sheet(
      detailData.length > 0
        ? detailData
        : [
            {
              No: '-',
              Tanggal: '-',
              'ID Transaksi': '-',
              Pendapatan: 0,
              'HPP (Modal)': 0,
              'Laba / Rugi': 0,
            },
          ]
    );
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Transaksi');

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
        ['Total HPP / Harga Modal', formatRupiah(monthlyReport.totalCogs)],
        ['Laba / Rugi Bersih', formatRupiah(monthlyReport.netProfit)],
      ],
    });

    const afterSummaryY = (doc as unknown as { lastAutoTable?: { finalY?: number } })
      .lastAutoTable?.finalY || 75;

    doc.setFontSize(11);
    doc.text('Rincian Transaksi', 14, afterSummaryY + 10);

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

    doc.save(`Laporan_Laba_Rugi_${prevPeriod.monthKey}.pdf`);
    markMonthAsBackedUp();
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

      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
      >
        <span>Backup Laba Rugi ({prevPeriod.label})</span>
        {isAlreadyBackedUp && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            Sudah Backup
          </span>
        )}
      </button>

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
              Total transaksi terdeteksi pada {prevPeriod.label}:{' '}
              <span className="font-semibold text-slate-700">
                {monthlyReport.transactionCount} transaksi
              </span>
              .
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