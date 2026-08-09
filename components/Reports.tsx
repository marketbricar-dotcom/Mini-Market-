import React, { useState, useMemo } from 'react';
import { Product, Sale, PaymentMethod, Currency } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, DollarSign, Calendar, Download, Search, RefreshCw, Filter, ListCollapse, Trash2, AlertTriangle, Edit, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabaseService } from '../services/supabaseService';

interface Props {
  sales: Sale[];
  onRefreshData?: () => Promise<void>;
  criticalThreshold?: number;
  inventory?: Product[];
  onGoToInventory?: () => void;
  onDeleteSale?: (saleId: string) => Promise<void> | void;
  onUpdateSale?: (updatedSale: Sale) => Promise<void> | void;
}

type TimeRange = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type FilterMode = 'PRESET' | 'SEARCH';
type CustomQueryType = 'DAY' | 'WEEK' | 'MONTH' | 'RANGE';

const Reports: React.FC<Props> = ({ sales, onRefreshData, criticalThreshold, inventory, onGoToInventory, onDeleteSale, onUpdateSale }) => {
  // Navigation & Control state
  const [filterMode, setFilterMode] = useState<FilterMode>('PRESET');
  const [timeRange, setTimeRange] = useState<TimeRange>('DAILY');
  const [pruning, setPruning] = useState(false);
  const [pruningStatus, setPruningStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [showAlertDetail, setShowAlertDetail] = useState(false);
  const [expandedSales, setExpandedSales] = useState<{ [id: string]: boolean }>({});

  const toggleSaleExpanded = (id: string) => {
    setExpandedSales(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Edit modal state
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO_USD);
  const [editPaymentReference, setEditPaymentReference] = useState('');
  const [editTimestamp, setEditTimestamp] = useState('');
  const [editTotalUSD, setEditTotalUSD] = useState('');
  const [editTotalBsF, setEditTotalBsF] = useState('');

  const startEditing = (sale: Sale) => {
    setEditingSale(sale);
    setEditCustomerName(sale.customerName || '');
    setEditPaymentMethod(sale.paymentMethod);
    setEditPaymentReference(sale.paymentReference || '');
    
    // Convert timestamp to YYYY-MM-DDTHH:mm for datetime-local picker
    const d = new Date(sale.timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    setEditTimestamp(`${year}-${month}-${day}T${hours}:${minutes}`);
    
    setEditTotalUSD(sale.totalUSD.toString());
    setEditTotalBsF(sale.totalBsF.toString());
  };

  const handleSaveEdit = () => {
    if (!editingSale || !onUpdateSale) return;
    
    const parsedTimestamp = new Date(editTimestamp).getTime();
    if (isNaN(parsedTimestamp)) {
      alert('Por favor, ingresa una fecha y hora válidas.');
      return;
    }

    const updatedSale: Sale = {
      ...editingSale,
      customerName: editCustomerName.trim(),
      paymentMethod: editPaymentMethod,
      paymentReference: editPaymentReference.trim(),
      timestamp: parsedTimestamp,
      totalUSD: parseFloat(editTotalUSD) || editingSale.totalUSD,
      totalBsF: parseFloat(editTotalBsF) || (parseFloat(editTotalUSD) * editingSale.rateAtSale)
    };

    onUpdateSale(updatedSale);
    setEditingSale(null);
    alert('¡Registro de transacción actualizado con éxito!');
  };
  
  // Custom picker state
  const [queryType, setQueryType] = useState<CustomQueryType>('DAY');
  
  // Format current date YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Format current month YYYY-MM
  const todayMonthStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [selectedWeekDay, setSelectedWeekDay] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState(todayMonthStr);
  const [selectedStartDate, setSelectedStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [selectedEndDate, setSelectedEndDate] = useState(todayStr);

  // Date helper functions
  const getStartOfDay = (d: Date) => {
    const newD = new Date(d);
    newD.setHours(0, 0, 0, 0);
    return newD;
  };

  const getStartOfWeek = (d: Date) => {
    const newD = new Date(d);
    newD.setHours(0, 0, 0, 0);
    const day = newD.getDay() || 7; // Sunday (0) -> 7
    if (day !== 1) newD.setHours(-24 * (day - 1)); // Back to Monday
    return newD;
  };

  const getStartOfMonth = (d: Date) => {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  };

  // Compile range of custom sales
  const { filteredSales, periodLabel } = useMemo(() => {
    const now = new Date();
    let fs: Sale[] = [];
    let label = '';

    if (filterMode === 'PRESET') {
      if (timeRange === 'DAILY') {
        const start = getStartOfDay(now);
        fs = sales.filter(s => s.timestamp >= start.getTime());
        label = 'Hoy';
      } else if (timeRange === 'WEEKLY') {
        const start = getStartOfWeek(now);
        fs = sales.filter(s => s.timestamp >= start.getTime());
        label = 'Esta Semana';
      } else {
        const start = getStartOfMonth(now);
        fs = sales.filter(s => s.timestamp >= start.getTime());
        label = 'Este Mes';
      }
    } else {
      // CUSTOM HISTORICAL SEARCH
      if (queryType === 'DAY') {
        if (selectedDay) {
          const parts = selectedDay.split('-');
          const y = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1;
          const d = parseInt(parts[2]);
          const start = new Date(y, m, d, 0, 0, 0, 0).getTime();
          const end = new Date(y, m, d, 23, 59, 59, 999).getTime();
          
          fs = sales.filter(s => s.timestamp >= start && s.timestamp <= end);
          label = `Día: ${d}/${m + 1}/${y}`;
        } else {
          label = 'Filtro por Día';
        }
      } else if (queryType === 'WEEK') {
        if (selectedWeekDay) {
          const parts = selectedWeekDay.split('-');
          const refDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          const monday = getStartOfWeek(refDate);
          
          const sunday = new Date(monday);
          sunday.setDate(sunday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);

          fs = sales.filter(s => s.timestamp >= monday.getTime() && s.timestamp <= sunday.getTime());
          label = `Semana: del ${monday.toLocaleDateString('es-ES')} al ${sunday.toLocaleDateString('es-ES')}`;
        } else {
          label = 'Filtro por Semana';
        }
      } else if (queryType === 'MONTH') {
        if (selectedMonth) {
          const parts = selectedMonth.split('-');
          const y = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1;
          
          const start = new Date(y, m, 1, 0, 0, 0, 0).getTime();
          const end = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime(); // last day

          fs = sales.filter(s => s.timestamp >= start && s.timestamp <= end);
          label = `Mes de ${new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;
        } else {
          label = 'Filtro por Mes';
        }
      } else {
        if (selectedStartDate && selectedEndDate) {
          const startParts = selectedStartDate.split('-');
          const endParts = selectedEndDate.split('-');
          const start = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]), 0, 0, 0, 0).getTime();
          const end = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]), 23, 59, 59, 999).getTime();

          fs = sales.filter(s => s.timestamp >= start && s.timestamp <= end);
          label = `Rango: del ${new Date(start).toLocaleDateString('es-ES')} al ${new Date(end).toLocaleDateString('es-ES')}`;
        } else {
          label = 'Filtro por Rango';
        }
      }
    }

    return { filteredSales: fs, periodLabel: label };
  }, [sales, filterMode, timeRange, queryType, selectedDay, selectedWeekDay, selectedMonth, selectedStartDate, selectedEndDate]);

  const totalUSD = useMemo(() => filteredSales.reduce((acc, s) => acc + s.totalUSD, 0), [filteredSales]);
  const totalBsF = useMemo(() => filteredSales.reduce((acc, s) => acc + s.totalBsF, 0), [filteredSales]);

  // General Report: Sum breakdown grouped by PaymentMethod
  const paymentBreakdown = useMemo(() => {
    const totalMap: { [key in PaymentMethod]: { usd: number; bsf: number; count: number } } = {
      [PaymentMethod.PAGO_MOVIL]: { usd: 0, bsf: 0, count: 0 },
      [PaymentMethod.PUNTO_VENTA]: { usd: 0, bsf: 0, count: 0 },
      [PaymentMethod.EFECTIVO_USD]: { usd: 0, bsf: 0, count: 0 },
      [PaymentMethod.EFECTIVO_BSF]: { usd: 0, bsf: 0, count: 0 },
      [PaymentMethod.CREDITO]: { usd: 0, bsf: 0, count: 0 },
    };

    filteredSales.forEach(s => {
      const pm = s.paymentMethod;
      if (totalMap[pm]) {
        totalMap[pm].usd += s.totalUSD;
        totalMap[pm].bsf += s.totalBsF;
        totalMap[pm].count += 1;
      }
    });

    return Object.entries(totalMap).map(([method, stats]) => ({
      method: method as PaymentMethod,
      ...stats
    }));
  }, [filteredSales]);

  // Chart Data Preparation depending on preset/historical
  const chartData = useMemo(() => {
    const data = [];
    const baseDate = new Date();

    if (filterMode === 'PRESET' && timeRange === 'DAILY') {
      // Show Last 7 Days for daily view trend
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const dayStr = d.toLocaleDateString('es-ES', { weekday: 'short' });

        const daySales = sales.filter(s => {
          const sDate = new Date(s.timestamp);
          sDate.setHours(0, 0, 0, 0);
          return sDate.getTime() === d.getTime();
        });

        data.push({
          name: dayStr,
          usd: daySales.reduce((acc, s) => acc + s.totalUSD, 0)
        });
      }
    } else if (filterMode === 'PRESET' && timeRange === 'WEEKLY') {
      // Show last 4 weeks
      for (let i = 3; i >= 0; i--) {
        const d = getStartOfWeek(new Date());
        d.setDate(d.getDate() - (i * 7));
        const nextWeek = new Date(d);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const weekStr = `Sem ${getStartOfWeek(d).getDate()}`;

        const weekSales = sales.filter(s => s.timestamp >= d.getTime() && s.timestamp < nextWeek.getTime());

        data.push({
          name: weekStr,
          usd: weekSales.reduce((acc, s) => acc + s.totalUSD, 0)
        });
      }
    } else if (filterMode === 'PRESET' && timeRange === 'MONTHLY') {
      // Show last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const monthStr = d.toLocaleDateString('es-ES', { month: 'short' });

        const monthSales = sales.filter(s => s.timestamp >= d.getTime() && s.timestamp < nextMonth.getTime());

        data.push({
          name: monthStr,
          usd: monthSales.reduce((acc, s) => acc + s.totalUSD, 0)
        });
      }
    } else {
      // Custom historical rendering: segment query items individually or by hours/days
      if (queryType === 'DAY') {
        // Hourly breakdown of selected day (6 intervals)
        for (let hour = 8; hour <= 20; hour += 2) {
          const labelStr = `${hour}:00`;
          const parts = selectedDay.split('-');
          const y = parseInt(parts[0]);
          const m = parseInt(parts[1]) - 1;
          const d = parseInt(parts[2]);
          const hStart = new Date(y, m, d, hour, 0, 0, 0).getTime();
          const hEnd = new Date(y, m, d, hour + 1, 59, 59, 999).getTime();

          const hrSales = fs => fs.filter((s: Sale) => s.timestamp >= hStart && s.timestamp <= hEnd);
          data.push({
            name: labelStr,
            usd: hrSales(filteredSales).reduce((acc: number, s: Sale) => acc + s.totalUSD, 0)
          });
        }
      } else if (queryType === 'WEEK') {
        // Daily breakdown of selected week (7 days)
        const parts = selectedWeekDay.split('-');
        const refDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const curr = getStartOfWeek(refDate);

        for (let i = 0; i < 7; i++) {
          const dOffset = new Date(curr);
          dOffset.setDate(dOffset.getDate() + i);
          const dayStr = dOffset.toLocaleDateString('es-ES', { weekday: 'short' });
          const start = getStartOfDay(dOffset).getTime();
          const end = start + 86399999;

          const daySales = filteredSales.filter(s => s.timestamp >= start && s.timestamp <= end);
          data.push({
            name: dayStr,
            usd: daySales.reduce((acc, s) => acc + s.totalUSD, 0)
          });
        }
      } else if (queryType === 'MONTH') {
        // Weekly breakdown of selected month (4 weeks)
        const parts = selectedMonth.split('-');
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1;

        for (let w = 1; w <= 4; w++) {
          const wStr = `S${w}`;
          const mStart = new Date(y, m, (w - 1) * 7 + 1, 0, 0, 0, 0).getTime();
          const mEnd = new Date(y, m, w * 7, 23, 59, 59, 999).getTime();

          const wkSales = filteredSales.filter(s => s.timestamp >= mStart && s.timestamp <= mEnd);
          data.push({
            name: wStr,
            usd: wkSales.reduce((acc, s) => acc + s.totalUSD, 0)
          });
        }
      } else {
        // queryType === 'RANGE' (custom period)
        if (selectedStartDate && selectedEndDate) {
          const startParts = selectedStartDate.split('-');
          const endParts = selectedEndDate.split('-');
          const start = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]), 0, 0, 0, 0);
          const end = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]), 0, 0, 0, 0);

          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

          if (diffDays <= 7) {
            // Show all individual days
            for (let i = 0; i < diffDays; i++) {
              const current = new Date(start);
              current.setDate(start.getDate() + i);
              const dayStr = current.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
              const dStart = current.getTime();
              const dEnd = dStart + 86399999;

              const daySales = filteredSales.filter(s => s.timestamp >= dStart && s.timestamp <= dEnd);
              data.push({
                name: dayStr,
                usd: daySales.reduce((acc, s) => acc + s.totalUSD, 0)
              });
            }
          } else {
            // If more than 7 days, segment into 6 intervals for visualization clarity
            const intervalDays = Math.max(1, Math.floor(diffDays / 6));
            for (let i = 0; i < 6; i++) {
              const currentStart = new Date(start);
              currentStart.setDate(start.getDate() + (i * intervalDays));
              
              const currentEnd = new Date(currentStart);
              currentEnd.setDate(currentStart.getDate() + intervalDays - 1);
              if (currentEnd > end) currentEnd.setDate(end.getDate());

              const valLabel = `${currentStart.getDate()}/${currentStart.getMonth() + 1}`;

              const startMs = currentStart.getTime();
              const endMs = currentEnd.getTime() + 86399999;

              const periodSales = filteredSales.filter(s => s.timestamp >= startMs && s.timestamp <= endMs);
              data.push({
                name: valLabel,
                usd: periodSales.reduce((acc, s) => acc + s.totalUSD, 0)
              });
              if (currentEnd >= end) break;
            }
          }
        }
      }
    }

    return data;
  }, [sales, filterMode, timeRange, queryType, selectedDay, selectedWeekDay, selectedMonth, selectedStartDate, selectedEndDate, filteredSales]);

  const handleTriggerManualPrune = async () => {
    setPruning(true);
    setPruningStatus(null);
    try {
      const res = await supabaseService.pruneOldSales();
      if (res.success) {
        setPruningStatus({
          success: true,
          message: `¡Depuración exitosa! Se descartaron ${res.countDeleted || 0} registros antiguos (> 365 días) de la base de datos.`
        });
        if (onRefreshData) {
          await onRefreshData();
        }
      } else {
        setPruningStatus({
          success: false,
          message: `No se pudo depurar la base de datos: ${res.error || 'Verifique la conexión.'}`
        });
      }
    } catch (err: any) {
      setPruningStatus({
        success: false,
        message: `Error al depurar: ${err.message || err}`
      });
    } finally {
      setPruning(false);
    }
  };

  // Generate completely customized filters PDF, matching exact selected period
  const handleDownloadPDF = () => {
    const doc = new jsPDF();

    // Font layout setup
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 27, 75); // Deep Indigo
    doc.text(`Reporte de Ventas - MINI MARKET BRICAR`, 14, 20);

    // Metadata section
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Período de Análisis: ${periodLabel}`, 14, 28);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`, 14, 34);

    // Core Summary Frame background
    doc.setDrawColor(224, 231, 255); // Indigo-100
    doc.setFillColor(245, 243, 255); // Purple-50
    doc.rect(14, 40, 182, 30, 'FD');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 27, 75);
    doc.text(`RESUMEN GENERAL:`, 18, 48);

    doc.setFont("helvetica", "normal");
    doc.text(`Tot. Transacciones: ${filteredSales.length}`, 18, 56);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL FACTURADO USD: $${totalUSD.toFixed(2)}`, 18, 64);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Equiv. Bolívares (BsF):`, 105, 56);
    doc.setFont("helvetica", "bold");
    doc.text(`${totalBsF.toLocaleString('es-VE', { maximumFractionDigits: 2 })} BsF`, 105, 64);

    // 1. Payment Method Breakdown Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(79, 70, 229); // Violet-600
    doc.text(`DESGLOSE GENERAL POR MÉTODO DE PAGO`, 14, 82);

    const breakdownTableData = paymentBreakdown.map(row => [
      row.method,
      row.count,
      `$${row.usd.toFixed(2)}`,
      `${row.bsf.toLocaleString('es-VE', { maximumFractionDigits: 2 })} BsF`
    ]);

    autoTable(doc, {
      startY: 87,
      head: [['Método de Pago', 'Ventas', 'Total Dólares (USD)', 'Total Bolívares (BsF)']],
      body: breakdownTableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], fontStyle: 'bold' }, // Violet-600
      styles: { fontSize: 9.5, font: 'helvetica' },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      }
    });

    // 2. Transaction detail list
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(79, 70, 229);
    doc.text(`HISTORIAL DETALLADO DE TRANSACCIONES`, 14, (doc as any).lastAutoTable.finalY + 12);

    const transactionsTableData = filteredSales.map(sale => {
      const isAbono = sale.totalUSD < 0;
      const itemsList = (sale.items || [])
        .map(item => `${item.quantity}x ${item.name}`)
        .join(', ');

      return [
        `${new Date(sale.timestamp).toLocaleDateString('es-ES')} ${new Date(sale.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
        isAbono ? `${sale.paymentMethod} (Abono)` : sale.paymentMethod,
        sale.customerName || '-',
        itemsList || '-',
        isAbono ? `-$${Math.abs(sale.totalUSD).toFixed(2)}` : `$${sale.totalUSD.toFixed(2)}`,
        isAbono ? `-${Math.abs(sale.totalBsF).toLocaleString('es-VE', { maximumFractionDigits: 1 })} Bs` : `${sale.totalBsF.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Bs`
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 17,
      head: [['Fecha y Hora', 'Método', 'Cliente/Nota', 'Productos', 'USD', 'BsF']],
      body: transactionsTableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 27, 75], fontStyle: 'bold' }, // Deep Indigo-950
      styles: { fontSize: 8 },
      columnStyles: {
        3: { cellWidth: 50 }, // Give the product description column ample space
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right' }
      }
    });

    doc.save(`reporte_ventas_${periodLabel.replace(/[\s\/:,.]/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6 text-indigo-950">

      {/* Alerta de Stock Crítico */}
      {inventory && inventory.filter(p => p.stock <= (criticalThreshold ?? 5)).length > 0 && (
        <div className="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="flex items-start gap-3">
              <div className="bg-rose-100 p-2 text-rose-700 rounded-xl mt-0.5">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-rose-950 flex items-center gap-2">
                  ¡Alerta de Inventario Crítico!
                  <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                    {inventory.filter(p => p.stock <= (criticalThreshold ?? 5)).length}
                  </span>
                </h4>
                <p className="text-rose-800 text-xs mt-1">
                  Hay productos que alcanzaron o están por debajo del nivel de stock crítico ({criticalThreshold ?? 5} unidades). Por favor revise y reabastezca sus suministros.
                </p>
              </div>
            </div>
            <div className="flex gap-2 self-stretch md:self-auto shrink-0">
              <button
                onClick={() => setShowAlertDetail(!showAlertDetail)}
                className="flex-1 md:flex-none bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                {showAlertDetail ? 'Ocultar Detalle' : 'Ver Productos'}
              </button>
              {onGoToInventory && (
                <button
                  onClick={onGoToInventory}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0"
                >
                  Ir a Inventario
                </button>
              )}
            </div>
          </div>

          {showAlertDetail && (
            <div className="bg-white/80 border border-rose-100/50 rounded-xl p-3 max-h-48 overflow-y-auto animate-fade-in text-xs space-y-1.5 divide-y divide-rose-50 font-sans">
              {inventory.filter(p => p.stock <= (criticalThreshold ?? 5)).map(p => (
                <div key={p.id} className="flex justify-between items-center py-2 first:pt-0 last:pb-0">
                  <div className="font-semibold text-slate-800 flex items-center gap-2 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                    <span className="truncate">{p.name}</span>
                    <span className="hidden sm:inline-block text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-medium shrink-0">{p.category}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-400">Existencia:</span>
                    <span className={`font-black px-2 py-0.5 rounded text-[10px] ${p.stock === 0 ? 'bg-rose-100 text-rose-700 font-extrabold' : 'bg-amber-100 text-amber-800'}`}>
                      {p.stock} {p.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Conservación Anual Activo y Depuración */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 p-4 rounded-2xl shadow-sm gap-4 flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="flex items-start gap-3">
          <div className="bg-amber-100 p-2 rounded-xl text-amber-700 shrink-0 mt-0.5">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-950">Política de Conservación de Datos Activa (1 Año)</h4>
            <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
              Las ventas se retienen de forma segura en su base de datos Supabase por un período máximo de de 1 año (365 días).
              El sistema purga de forma automatizada los registros obsoletos en cada inicio de sesión.
            </p>
            {pruningStatus && (
              <span className={`inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-lg ${
                pruningStatus.success ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {pruningStatus.message}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleTriggerManualPrune}
          disabled={pruning}
          className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm shadow-amber-600/10 shrink-0 w-full md:w-auto self-stretch md:self-center select-none"
        >
          {pruning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Depurando...
            </>
          ) : (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              Depurar Historial &gt; 1 Año
            </>
          )}
        </button>
      </div>

      {/* Search selection toolbar custom themed */}
      <div className="flex flex-col xl:flex-row justify-between gap-4 bg-white p-5 border border-violet-100 rounded-2xl shadow-sm">
        
        {/* Toggle Mode: Preset vs Custom */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex bg-violet-50 p-1 rounded-xl border border-violet-100">
            <button
              onClick={() => setFilterMode('PRESET')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                filterMode === 'PRESET' 
                  ? 'bg-indigo-950 text-white shadow' 
                  : 'text-indigo-700 hover:bg-violet-100/50'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Reportes Rápidos
            </button>
            <button
              onClick={() => setFilterMode('SEARCH')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                filterMode === 'SEARCH' 
                  ? 'bg-indigo-950 text-white shadow' 
                  : 'text-indigo-700 hover:bg-violet-100/50'
              }`}
            >
              <Search className="w-4 h-4" />
              Buscador Histórico
            </button>
          </div>

          {/* Conditional Sub-selectors */}
          {filterMode === 'PRESET' ? (
            <div className="flex gap-2 bg-slate-50 p-0.5 rounded-lg border border-slate-200/60">
              {(['DAILY', 'WEEKLY', 'MONTHLY'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    timeRange === range 
                      ? 'bg-white text-indigo-950 shadow-sm border border-slate-200/45' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {range === 'DAILY' ? 'Diario (Hoy)' : range === 'WEEKLY' ? 'Semanal' : 'Mensual'}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-slate-50 p-0.5 rounded-lg border border-slate-200/60">
                {(['DAY', 'WEEK', 'MONTH', 'RANGE'] as CustomQueryType[]).map((qt) => (
                  <button
                    key={qt}
                    onClick={() => setQueryType(qt)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      queryType === qt 
                        ? 'bg-white text-indigo-950 shadow-sm border border-slate-200/45' 
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {qt === 'DAY' ? 'Por Día' : qt === 'WEEK' ? 'Por Semana' : qt === 'MONTH' ? 'Mes Completo' : 'Rango de Fechas'}
                  </button>
                ))}
              </div>

              {/* Precise input queries */}
              <div className="animate-fade-in">
                {queryType === 'DAY' && (
                  <input 
                    type="date"
                    value={selectedDay}
                    onChange={(e) => e.target.value && setSelectedDay(e.target.value)}
                    className="px-3 py-1.5 text-xs font-semibold border border-violet-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 text-indigo-950"
                  />
                )}
                {queryType === 'WEEK' && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-bold">Semana de:</span>
                    <input 
                      type="date"
                      value={selectedWeekDay}
                      onChange={(e) => e.target.value && setSelectedWeekDay(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold border border-violet-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 text-indigo-950"
                    />
                  </div>
                )}
                {queryType === 'MONTH' && (
                  <input 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                    className="px-3 py-1.5 text-xs font-semibold border border-violet-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 text-indigo-950"
                  />
                )}
                {queryType === 'RANGE' && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-bold">Desde:</span>
                    <input 
                      type="date"
                      value={selectedStartDate}
                      onChange={(e) => e.target.value && setSelectedStartDate(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold border border-violet-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 text-indigo-950"
                    />
                    <span className="text-[10px] text-slate-400 font-bold">Hasta:</span>
                    <input 
                      type="date"
                      value={selectedEndDate}
                      onChange={(e) => e.target.value && setSelectedEndDate(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold border border-violet-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 text-indigo-950"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action downloads PDF */}
        <button
          onClick={handleDownloadPDF}
          className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow shadow-violet-600/20 text-xs flex items-center justify-center gap-1.5 shrink-0"
        >
          <Download className="w-4 h-4" />
          Descargar PDF ({filterMode === 'PRESET' ? 'Actual' : 'Filtrado'})
        </button>
      </div>

      {/* Visual top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
            <ListCollapse className="w-6 h-6 text-indigo-900" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Total Transacciones</p>
            <h3 className="text-xl font-extrabold text-indigo-950 mt-0.5">{filteredSales.length} ventas</h3>
            <span className="text-[10px] text-violet-600 font-semibold italic">Período: {periodLabel}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <DollarSign className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Facturación en Dólares</p>
            <h3 className="text-xl font-extrabold text-indigo-950 mt-0.5">${totalUSD.toFixed(2)} USD</h3>
            <span className="text-[10px] text-emerald-600 font-semibold">Caja base neta</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-violet-50 text-violet-600">
            <span className="text-lg font-black block">Bs</span>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Facturación en Bolívares</p>
            <h3 className="text-xl font-extrabold text-indigo-950 mt-0.5">
              {totalBsF.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Bs
            </h3>
            <span className="text-[10px] text-violet-600 font-semibold">Tasa del día promedio</span>
          </div>
        </div>

      </div>

      {/* General Report Payment Methods Breakdown */}
      <div className="bg-white p-6 rounded-2xl border border-violet-100 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-violet-50">
          <Filter className="w-5 h-5 text-violet-600" />
          <h3 className="text-base font-bold text-indigo-950">
            Reporte de Cierre: Métodos de Pago en el Período {periodLabel}
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {paymentBreakdown.map((row) => (
            <div key={row.method} className="bg-gradient-to-br from-violet-50/50 to-indigo-50/20 p-4 border border-violet-100/50 rounded-xl space-y-1 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate" title={row.method}>
                {row.method}
              </span>
              <div className="text-sm font-black text-indigo-950 pt-1">
                ${row.usd.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">USD</span>
              </div>
              <div className="text-xs text-violet-600 font-semibold">
                {row.bsf.toLocaleString('es-VE', { maximumFractionDigits: 1 })} BsF
              </div>
              <div className="text-[10px] text-slate-400 pt-0.5 italic">
                {row.count} transacc.
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-6 rounded-2xl border border-violet-100 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="w-5 h-5 text-indigo-950" />
          <h3 className="text-base font-bold text-indigo-950">
            Tendencia de Facturación Dólar ($) • {periodLabel}
          </h3>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f3ff" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#4f46e5', fontSize: 11, fontWeight: 'bold' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(val) => `$${val}`} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #ddd6fe', backgroundColor: '#ffffff', boxShadow: '0 4px 12px rgba(109, 40, 217, 0.08)' }}
                cursor={{ fill: '#faf5ff' }}
                formatter={(value: any) => [`$${parseFloat(value).toFixed(2)}`, 'Venta USD']}
              />
              <Bar dataKey="usd" fill="#6d28d9" radius={[6, 6, 0, 0]} barSize={25} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transaction table & list - RESPONSIVE (Table for MD+, beautiful cards for mobile) */}
      <div className="bg-white rounded-2xl border border-violet-100 overflow-hidden shadow-sm">
        <div className="p-4 bg-violet-50/50 border-b border-violet-100 font-bold text-indigo-950 text-sm flex justify-between items-center">
          <span>Historial Completo del Período ({periodLabel})</span>
          <span className="text-xs bg-indigo-950 text-white px-2.5 py-1 rounded-full">{filteredSales.length} ventas</span>
        </div>

        {/* Desktop view (Table) - hidden on mobile, visible on medium+ screens */}
        <div className="hidden md:block max-h-[450px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] text-violet-800 uppercase bg-violet-50 font-bold tracking-wider sticky top-0 z-10 shadow-xs">
              <tr>
                <th className="px-5 py-3">Fecha y Hora</th>
                <th className="px-5 py-3">Método de Pago</th>
                <th className="px-5 py-3">Cliente / Notas</th>
                <th className="px-5 py-3 text-right">Total USD</th>
                <th className="px-5 py-3 text-right">Total BsF</th>
                <th className="px-5 py-3 text-center">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 text-xs">
              {filteredSales.slice().reverse().map(sale => {
                const isAbono = sale.totalUSD < 0;
                const isExpanded = expandedSales[sale.id];
                const items = sale.items || [];
                return (
                  <React.Fragment key={sale.id}>
                    <tr 
                      onClick={() => toggleSaleExpanded(sale.id)}
                      className={`hover:bg-violet-50/20 cursor-pointer transition-colors ${isAbono ? 'bg-emerald-50/30' : ''} ${isExpanded ? 'bg-violet-50/40 font-semibold' : ''}`}
                    >
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-violet-600 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                            ▶
                          </span>
                          <span>
                            {new Date(sale.timestamp).toLocaleDateString()} {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isAbono 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100/40'
                        }`}>
                          {isAbono ? `${sale.paymentMethod} (Abono)` : sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-semibold max-w-xs truncate">
                        {sale.customerName || sale.paymentReference || '-'}
                      </td>
                      <td className={`px-5 py-3.5 text-right font-black ${isAbono ? 'text-emerald-700' : 'text-indigo-950'}`}>
                        {isAbono ? `-$${Math.abs(sale.totalUSD).toFixed(2)}` : `$${sale.totalUSD.toFixed(2)}`}
                      </td>
                      <td className={`px-5 py-3.5 text-right font-medium ${isAbono ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {isAbono ? `-${Math.abs(sale.totalBsF).toLocaleString('es-VE', { maximumFractionDigits: 1 })}` : `${sale.totalBsF.toLocaleString('es-VE', { maximumFractionDigits: 1 })}`} Bs
                      </td>
                      <td className="px-5 py-3.5 text-center text-slate-500 font-bold">
                        {items.length}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/30">
                        <td colSpan={6} className="px-5 py-4 border-l-4 border-violet-600 bg-violet-50/10 animate-fade-in">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-violet-100/60 pb-1.5 flex-wrap gap-2">
                              <span className="text-xs font-black text-violet-900">Detalle de Productos Vendidos ({items.length})</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-mono mr-2">ID: {sale.id.slice(0, 8)}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); startEditing(sale); }}
                                  className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded text-[11px] transition-colors border border-amber-200"
                                  title="Editar nombre de cliente, método de pago, referencia o fecha"
                                >
                                  <Edit className="w-3.5 h-3.5" /> Editar Datos
                                </button>
                                {onDeleteSale && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onDeleteSale(sale.id); }}
                                    className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-2.5 py-1 rounded text-[11px] transition-colors border border-rose-200"
                                    title="Eliminar esta transacción y regresar productos al inventario"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Borrar y Regresar Stock
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {items.map((item, index) => {
                                const itemTotal = item.quantity * item.price;
                                return (
                                  <div key={index} className="flex justify-between items-center bg-white p-3 rounded-xl border border-violet-100/50 shadow-xs">
                                    <div className="space-y-0.5 truncate pr-2">
                                      <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5 truncate">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                                        <span className="truncate" title={item.name}>{item.name}</span>
                                        {item.isManual && (
                                          <span className="text-[8px] bg-slate-100 text-slate-500 px-1 rounded uppercase font-bold tracking-wider shrink-0">Manual</span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-medium pl-3">
                                        {item.quantity} x {item.currency === 'USD' ? '$' : ''}{item.price.toFixed(2)}{item.currency !== 'USD' ? ' BsF' : ''}
                                      </div>
                                    </div>
                                    <div className="text-right font-black text-indigo-950 text-xs shrink-0">
                                      {item.currency === 'USD' ? '$' : ''}{itemTotal.toFixed(2)}{item.currency !== 'USD' ? ' BsF' : ''}
                                    </div>
                                  </div>
                                );
                              })}
                              {items.length === 0 && (
                                <div className="text-xs text-slate-400 italic py-1">Esta transacción no tiene ítems registrados.</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400 italic">No hay ventas registradas en esta fecha o período seleccionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) - visible only on mobile, hidden on medium+ screens */}
        <div className="block md:hidden max-h-[500px] overflow-y-auto divide-y divide-violet-100 p-2 space-y-2 bg-slate-50/50">
          {filteredSales.slice().reverse().map(sale => {
            const isAbono = sale.totalUSD < 0;
            const isExpanded = expandedSales[sale.id];
            const items = sale.items || [];
            return (
              <div 
                key={sale.id} 
                className={`bg-white rounded-xl border border-violet-100 p-3.5 transition-all ${isExpanded ? 'ring-2 ring-violet-500/20 bg-violet-50/5 shadow-xs' : ''}`}
              >
                {/* Sale Core Info - clickable */}
                <div 
                  onClick={() => toggleSaleExpanded(sale.id)}
                  className="flex flex-col space-y-3 cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {new Date(sale.timestamp).toLocaleDateString()} {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wide uppercase ${
                      isAbono 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-100/40'
                    }`}>
                      {isAbono ? `${sale.paymentMethod} (Abono)` : sale.paymentMethod}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Cliente/Detalle</div>
                      <div className="text-slate-700 font-extrabold text-xs max-w-[150px] truncate">
                        {sale.customerName || sale.paymentReference || 'Cliente General'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-black ${isAbono ? 'text-emerald-700' : 'text-indigo-950'}`}>
                        {isAbono ? `-$${Math.abs(sale.totalUSD).toFixed(2)}` : `$${sale.totalUSD.toFixed(2)}`}
                      </div>
                      <div className={`text-[10px] font-bold ${isAbono ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {isAbono ? `-${Math.abs(sale.totalBsF).toLocaleString('es-VE', { maximumFractionDigits: 1 })}` : `${sale.totalBsF.toLocaleString('es-VE', { maximumFractionDigits: 1 })}`} Bs
                      </div>
                    </div>
                  </div>

                  {/* Accordion trigger footer info */}
                  <div className="flex items-center justify-between pt-2 border-t border-violet-50/50 text-[11px] text-slate-500 font-medium">
                    <div className="flex items-center gap-1">
                      <span className="bg-slate-100 text-slate-600 font-black px-2 py-0.5 rounded-full text-[10px]">
                        {items.length} {items.length === 1 ? 'producto' : 'productos'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-violet-600 font-bold">
                      <span>{isExpanded ? 'Ocultar Productos' : 'Ver Productos'}</span>
                      <span className="transition-transform duration-200 inline-block text-[9px]" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        ▼
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Products list for Mobile */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-dashed border-violet-100 space-y-2 animate-fade-in">
                    <div className="flex justify-between items-center pb-2 border-b border-violet-100/45 flex-wrap gap-1.5">
                      <span className="text-[10px] font-extrabold text-violet-800 uppercase tracking-wider">
                        Desglose de productos:
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startEditing(sale); }}
                          className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded text-[10px] transition-colors border border-amber-200"
                        >
                          <Edit className="w-3 h-3" /> Editar
                        </button>
                        {onDeleteSale && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onDeleteSale(sale.id); }}
                            className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded text-[10px] transition-colors border border-rose-200"
                          >
                            <Trash2 className="w-3 h-3" /> Borrar
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {items.map((item, index) => {
                        const itemTotal = item.quantity * item.price;
                        return (
                          <div key={index} className="flex justify-between items-center bg-violet-50/20 p-2.5 rounded-lg border border-violet-100/30 text-xs">
                            <div className="space-y-0.5 truncate pr-2">
                              <div className="font-extrabold text-slate-800 truncate flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0"></span>
                                <span className="truncate">{item.name}</span>
                                {item.isManual && (
                                  <span className="text-[8px] bg-slate-200/50 text-slate-500 px-1 rounded font-bold uppercase shrink-0">Manual</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-semibold pl-3">
                                {item.quantity} x {item.currency === 'USD' ? '$' : ''}{item.price.toFixed(2)}{item.currency !== 'USD' ? ' BsF' : ''}
                              </div>
                            </div>
                            <div className="text-right font-black text-indigo-950 shrink-0">
                              {item.currency === 'USD' ? '$' : ''}{itemTotal.toFixed(2)}{item.currency !== 'USD' ? ' BsF' : ''}
                            </div>
                          </div>
                        );
                      })}
                      {items.length === 0 && (
                        <div className="text-xs text-slate-400 italic py-1">Esta transacción no tiene ítems registrados.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredSales.length === 0 && (
            <div className="p-8 text-center text-slate-400 italic bg-white rounded-xl border border-violet-100">
              No hay ventas registradas en esta fecha o período seleccionado.
            </div>
          )}
        </div>
      </div>

      {/* --- Edit Transaction Modal --- */}
      {editingSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-2xl flex flex-col p-6 animate-fade-in animate-scale">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Editar Datos de Transacción
                </h3>
              </div>
              <button 
                onClick={() => setEditingSale(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-sm leading-relaxed text-slate-600">
              
              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Cliente / Notas
                </label>
                <input
                  type="text"
                  value={editCustomerName}
                  onChange={(e) => setEditCustomerName(e.target.value)}
                  placeholder="Cliente General, Nombre, etc."
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800 font-medium"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Método de Pago
                </label>
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800 font-medium"
                >
                  <option value={PaymentMethod.EFECTIVO_USD}>{PaymentMethod.EFECTIVO_USD}</option>
                  <option value={PaymentMethod.PAGO_MOVIL}>{PaymentMethod.PAGO_MOVIL}</option>
                  <option value={PaymentMethod.PUNTO_VENTA}>{PaymentMethod.PUNTO_VENTA}</option>
                  <option value={PaymentMethod.EFECTIVO_BSF}>{PaymentMethod.EFECTIVO_BSF}</option>
                  <option value={PaymentMethod.CREDITO}>{PaymentMethod.CREDITO}</option>
                </select>
              </div>

              {/* Payment Reference */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Referencia de Pago
                </label>
                <input
                  type="text"
                  value={editPaymentReference}
                  onChange={(e) => setEditPaymentReference(e.target.value)}
                  placeholder="Número de referencia, comprobante, etc."
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800 font-medium"
                />
              </div>

              {/* Date / Timestamp */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Fecha y Hora de la Operación
                </label>
                <input
                  type="datetime-local"
                  value={editTimestamp}
                  onChange={(e) => setEditTimestamp(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800 font-mono"
                />
              </div>

              {/* Editable Amount Fields */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Monto Total (USD)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editTotalUSD}
                    onChange={(e) => setEditTotalUSD(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Monto Total (BsF)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editTotalBsF}
                    onChange={(e) => setEditTotalBsF(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800 font-mono"
                  />
                </div>
              </div>

            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-3 border-t border-slate-100 flex gap-2">
              <button 
                onClick={handleSaveEdit}
                className="flex-1 bg-indigo-900 hover:bg-indigo-950 text-white px-4 py-2.5 rounded-xl font-bold transition-colors shadow-sm text-xs"
              >
                Guardar Cambios
              </button>
              <button 
                onClick={() => setEditingSale(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold transition-colors text-xs"
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
