import React, { useState, useMemo, useRef } from 'react';
import { Sale, Product, Currency, PaymentMethod } from '../types';
import { User, DollarSign, Calendar, CreditCard, Plus, ArrowLeftRight, Search, FileText, CheckCircle, RefreshCw, Smartphone, Sparkles, CheckSquare, Trash2, Download, FileCode, Upload, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabaseService } from '../services/supabaseService';

interface Props {
  sales: Sale[];
  rate: number; // Current exchange rate
  onProcessSale: (sale: Sale | Sale[], updatedInventory: Product[]) => void;
  inventory: Product[];
  onDeleteSale?: (saleId: string) => Promise<void> | void;
  onUpdateSale?: (updatedSale: Sale) => Promise<void> | void;
  onExportSalesJSON?: () => void;
  onImportSalesJSON?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

interface ClientCreditProfile {
  name: string;
  totalDebtUSD: number;
  totalDebtBsF: number; // Recalculated to current rate!
  transactionsCount: number;
  lastActivity: number;
}

const Credits: React.FC<Props> = ({ 
  sales, 
  rate, 
  onProcessSale, 
  inventory, 
  onDeleteSale, 
  onUpdateSale,
  onExportSalesJSON,
  onImportSalesJSON
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState<'DEBTORS' | 'SOLVENT'>('DEBTORS');

  // Payment form states
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentUnit, setPaymentUnit] = useState<Currency>(Currency.USD);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO_USD);
  const [paymentReference, setPaymentReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Safe credit sale checker
  const isCreditSale = (s: Sale) => {
    if (!s || !s.customerName || !s.customerName.trim()) return false;
    const pm = (s.paymentMethod || '').toString().toLowerCase();
    return pm === 'crédito' || pm === 'credito' || pm === PaymentMethod.CREDITO.toLowerCase();
  };

  // Group and process créditos
  const creditProfiles = useMemo(() => {
    const profiles: { [key: string]: { usdTotal: number; count: number; lastTime: number } } = {};

    // Get all sales that are CREDITO or have customer name
    sales.forEach(s => {
      if (isCreditSale(s)) {
        const nameKey = s.customerName!.trim().toUpperCase();
        if (!profiles[nameKey]) {
          profiles[nameKey] = { usdTotal: 0, count: 0, lastTime: 0 };
        }
        profiles[nameKey].usdTotal += (s.totalUSD || 0);
        profiles[nameKey].count += 1;
        if ((s.timestamp || 0) > profiles[nameKey].lastTime) {
          profiles[nameKey].lastTime = s.timestamp || 0;
        }
      }
    });

    return Object.entries(profiles).map(([name, data]) => {
      // Find original casing
      const match = sales.find(s => s.customerName?.trim().toUpperCase() === name);
      const originalName = match?.customerName?.trim() || name;

      return {
        name: originalName,
        totalDebtUSD: parseFloat(data.usdTotal.toFixed(2)),
        totalDebtBsF: parseFloat((data.usdTotal * rate).toFixed(2)),
        transactionsCount: data.count,
        lastActivity: data.lastTime
      } as ClientCreditProfile;
    });
  }, [sales, rate]);

  // Total sums of active credits
  const grandTotals = useMemo(() => {
    let usd = 0;
    creditProfiles.forEach(p => {
      if (p.totalDebtUSD > 0.01) {
        usd += p.totalDebtUSD;
      }
    });
    return {
      usd,
      bsf: usd * rate
    };
  }, [creditProfiles, rate]);

  // Filter profiles based on selected view & search query
  const filteredProfiles = useMemo(() => {
    return creditProfiles
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const hasDebt = p.totalDebtUSD > 0.01;
        if (activeSegment === 'DEBTORS') {
          return matchesSearch && hasDebt;
        } else {
          return matchesSearch && !hasDebt;
        }
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [creditProfiles, searchTerm, activeSegment]);

  // Selected client transaction history
  const clientHistory = useMemo(() => {
    if (!selectedClientName) return [];

    const normSelected = selectedClientName.trim().toUpperCase();
    const history: Array<{
      saleId?: string;
      date: number;
      concept: string;
      quantity: number;
      priceUSD: number;
      rateAtSale: number;
      totalUSD: number;
      totalBsF: number;
      paymentReference?: string;
    }> = [];

    // Filter sales corresponding to selected client
    sales.forEach(sale => {
      if (isCreditSale(sale) && sale.customerName?.trim().toUpperCase() === normSelected) {
        const itemsArray = typeof sale.items === 'string'
          ? JSON.parse(sale.items)
          : (Array.isArray(sale.items) ? sale.items : []);

        // Double check if this is an abono (credit payment)
        const isAbono = sale.totalUSD < 0 || (itemsArray.length === 1 && itemsArray[0]?.price < 0);
        
        if (isAbono) {
          history.push({
            saleId: sale.id,
            date: sale.timestamp,
            concept: itemsArray[0]?.name || 'Abono / Pago de Crédito',
            quantity: 1,
            priceUSD: sale.totalUSD,
            rateAtSale: sale.rateAtSale || rate,
            totalUSD: sale.totalUSD,
            totalBsF: sale.totalUSD * (sale.rateAtSale || rate),
            paymentReference: sale.paymentReference
          });
        } else {
          // Regular credit sale: log each item
          itemsArray.forEach((item: any) => {
            if (!item) return;
            const saleRate = sale.rateAtSale || rate;
            const itemPriceUSD = item.currency === Currency.USD 
              ? item.price 
              : item.price / saleRate;

            const itemTotalUSD = itemPriceUSD * (item.quantity || 1);
            const itemTotalBsF = item.currency === Currency.BSF
              ? item.price * (item.quantity || 1)
              : item.price * (item.quantity || 1) * saleRate;

            history.push({
              saleId: sale.id,
              date: sale.timestamp,
              concept: item.name || 'Producto',
              quantity: item.quantity || 1,
              priceUSD: itemPriceUSD,
              rateAtSale: saleRate,
              totalUSD: itemTotalUSD,
              totalBsF: itemTotalBsF
            });
          });
        }
      }
    });

    // Sort newer first
    return history.sort((a, b) => b.date - a.date);
  }, [sales, selectedClientName, rate]);

  const selectedProfile = useMemo(() => {
    if (!selectedClientName) return null;
    return creditProfiles.find(p => p.name.trim().toUpperCase() === selectedClientName.trim().toUpperCase()) || {
      name: selectedClientName,
      totalDebtUSD: 0,
      totalDebtBsF: 0,
      transactionsCount: 0,
      lastActivity: Date.now()
    };
  }, [creditProfiles, selectedClientName]);

  // Handle abono processing
  const handleRegisterAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientName || !paymentAmount) return;

    const parsedAmount = parseFloat(paymentAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Por favor ingrese un monto válido mayor a cero.');
      return;
    }

    // Convert amount to USD if entered in BSF
    let amountUSD = 0;
    if (paymentUnit === Currency.USD) {
      amountUSD = parsedAmount;
    } else {
      amountUSD = parsedAmount / rate;
    }

    // Limit checkout to not overpay drastically (optional warning)
    if (selectedProfile && amountUSD > selectedProfile.totalDebtUSD + 1.0) {
      const confirmOverpay = confirm(`El abono ($${amountUSD.toFixed(2)}) supera la deuda ($${selectedProfile.totalDebtUSD.toFixed(2)}). ¿Proceder de todas formas?`);
      if (!confirmOverpay) return;
    }

    setIsSubmitting(true);

    try {
      // Create a sale representing credit offset
      const newSale: Sale = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        items: [{
          name: `Abono de Crédito [${paymentMethod}]`,
          quantity: 1,
          price: -amountUSD,
          currency: Currency.USD,
          isManual: true
        }],
        totalUSD: -amountUSD,
        totalBsF: -(amountUSD * rate),
        rateAtSale: rate,
        paymentMethod: PaymentMethod.CREDITO, // Grouped as CREDITO
        customerName: selectedClientName,
        paymentReference: paymentReference || `Abono ${paymentMethod}`
      };

      await onProcessSale(newSale, [...inventory]);
      
      // Reset form
      setPaymentAmount('');
      setPaymentReference('');
      alert('¡Abono registrado con éxito!');
    } catch (err) {
      console.error(err);
      alert('Ocurrió un error al registrar el abono.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompletePayment = async () => {
    if (!selectedProfile || selectedProfile.totalDebtUSD <= 0.01) {
      alert('Este cliente no tiene deudas pendientes.');
      return;
    }

    const debtUSD = selectedProfile.totalDebtUSD;
    const debtBsF = selectedProfile.totalDebtBsF;

    const confirmPayment = confirm(
      `¿Desea LIQUIDAR LA DEUDA COMPLETA de ${selectedProfile.name}?\n\n` +
      `Monto a Pagar: $${debtUSD.toFixed(2)} USD (${debtBsF.toLocaleString('es-VE', { maximumFractionDigits: 2 })} BsF)\n` +
      `Método de Recibo en Caja: ${paymentMethod}\n` +
      `Referencia: ${paymentReference || 'Ninguna'}\n\n` +
      `Esta acción registrará la entrada de dinero en la caja diaria y marcará la cuenta del cliente como solvente.`
    );

    if (!confirmPayment) return;

    setIsSubmitting(true);

    try {
      // 1. Credit offset transaction (to zero out client's credit account)
      const creditOffsetSale: Sale = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        items: [{
          name: `Liquidación de Crédito [Pago Completo]`,
          quantity: 1,
          price: -debtUSD,
          currency: Currency.USD,
          isManual: true
        }],
        totalUSD: -debtUSD,
        totalBsF: -debtUSD * rate,
        rateAtSale: rate,
        paymentMethod: PaymentMethod.CREDITO, // Grouped as CREDITO
        customerName: selectedProfile.name,
        paymentReference: paymentReference || `Liquidación Crédito`
      };

      // 2. Real cash box entry transaction (using the chosen payment method to avoid cash box mismatch)
      const cashBoxEntrySale: Sale = {
        id: crypto.randomUUID(),
        timestamp: Date.now() + 10, // slightly newer timestamp to keep order
        items: [{
          name: `Cobro de Crédito de ${selectedProfile.name}`,
          quantity: 1,
          price: debtUSD,
          currency: Currency.USD,
          isManual: true
        }],
        totalUSD: debtUSD,
        totalBsF: debtUSD * rate,
        rateAtSale: rate,
        paymentMethod: paymentMethod, // e.g. Pago Movil, Efectivo USD, etc.
        customerName: selectedProfile.name,
        paymentReference: paymentReference || `Pago de Crédito`
      };

      // Send both transactions to App's process handler
      await onProcessSale([creditOffsetSale, cashBoxEntrySale], [...inventory]);

      // 3. Update the Supabase 'credits' table status to 'Pagado' if it exists
      if (supabaseService.isEnabled()) {
        await supabaseService.updateCreditStatus(selectedProfile.name, 'Pagado');
      }

      // Reset form fields
      setPaymentAmount('');
      setPaymentReference('');
      alert(`¡Crédito liquidado con éxito! Se registraron los movimientos en la cuenta corriente de ${selectedProfile.name} y en la caja del día (${paymentMethod}).`);
    } catch (err) {
      console.error(err);
      alert('Ocurrió un error al liquidar la deuda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- PDF GENERATOR (REPORTE GENERAL O ESTADO DE CUENTA INDIVIDUAL) ---
  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();
      const todayStr = new Date().toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      if (selectedProfile && selectedClientName) {
        // PDF 1: ESTADO DE CUENTA INDIVIDUAL DE UN CLIENTE
        doc.setFontSize(18);
        doc.setTextColor(30, 27, 75); // Indigo 950
        doc.text('MINI MARKET BRICAR', 14, 18);

        doc.setFontSize(12);
        doc.setTextColor(109, 40, 217); // Violet 700
        doc.text('ESTADO DE CUENTA - CUENTA POR COBRAR', 14, 25);

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Fecha de emisión: ${todayStr}`, 14, 31);
        doc.text(`Tasa de cambio: ${rate.toFixed(2)} Bs.F / USD`, 14, 36);

        // Tarjeta resumen del cliente
        doc.setFillColor(245, 243, 255);
        doc.roundedRect(14, 42, 182, 24, 3, 3, 'F');

        doc.setFontSize(11);
        doc.setTextColor(30, 27, 75);
        doc.text(`Cliente: ${selectedProfile.name}`, 18, 50);

        doc.setFontSize(10);
        doc.text(`Saldo Deuda USD: $${selectedProfile.totalDebtUSD.toFixed(2)} USD`, 18, 58);
        doc.text(`Saldo Deuda Bs.F: ${selectedProfile.totalDebtBsF.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.F`, 100, 58);

        // Tabla de movimientos del cliente
        const tableRows = clientHistory.map(item => [
          new Date(item.date).toLocaleDateString('es-VE'),
          item.concept + (item.quantity > 1 ? ` (${item.quantity}x)` : ''),
          item.totalUSD < 0 ? `-$${Math.abs(item.totalUSD).toFixed(2)}` : `$${item.totalUSD.toFixed(2)}`,
          item.rateAtSale ? item.rateAtSale.toFixed(2) : rate.toFixed(2),
          item.totalBsF < 0 ? `-${Math.abs(item.totalBsF).toFixed(2)}` : `${item.totalBsF.toFixed(2)}`,
          item.paymentReference || '-'
        ]);

        autoTable(doc, {
          startY: 72,
          head: [['Fecha', 'Concepto / Movimiento', 'USD ($)', 'Tasa', 'Bs.F', 'Ref.']],
          body: tableRows,
          headStyles: {
            fillColor: [76, 29, 149],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
          },
          bodyStyles: {
            fontSize: 8.5,
            textColor: [30, 27, 75]
          },
          alternateRowStyles: {
            fillColor: [250, 248, 255]
          },
          margin: { left: 14, right: 14 }
        });

        // Totales al pie
        const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 120;
        doc.setFontSize(10);
        doc.setTextColor(30, 27, 75);
        doc.text(`Total Saldo Pendiente: $${selectedProfile.totalDebtUSD.toFixed(2)} USD / ${selectedProfile.totalDebtBsF.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.F`, 14, finalY);

        doc.save(`estado_cuenta_${selectedProfile.name.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else {
        // PDF 2: REPORTE GENERAL DE CUENTAS POR COBRAR Y DEUDORES
        doc.setFontSize(18);
        doc.setTextColor(30, 27, 75);
        doc.text('MINI MARKET BRICAR', 14, 18);

        doc.setFontSize(12);
        doc.setTextColor(109, 40, 217);
        doc.text('REPORTE GENERAL DE CUENTAS POR COBRAR (DEUDORES)', 14, 25);

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Fecha de emisión: ${todayStr}`, 14, 31);
        doc.text(`Tasa de Cambio: ${rate.toFixed(2)} Bs.F / USD`, 14, 36);

        // Resumen
        doc.setFillColor(245, 243, 255);
        doc.roundedRect(14, 42, 182, 22, 3, 3, 'F');

        doc.setFontSize(10);
        doc.setTextColor(30, 27, 75);
        doc.text(`Total Cuentas por Cobrar: $${grandTotals.usd.toFixed(2)} USD`, 18, 51);
        doc.text(`Equivalente en Bolívares: ${grandTotals.bsf.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.F`, 18, 58);
        doc.text(`Total Clientes Deudores: ${filteredProfiles.length}`, 115, 51);

        // Tabla general de deudores
        const tableRows = filteredProfiles.map((p, idx) => [
          (idx + 1).toString(),
          p.name,
          p.transactionsCount.toString(),
          `$${p.totalDebtUSD.toFixed(2)}`,
          `${p.totalDebtBsF.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`,
          new Date(p.lastActivity).toLocaleDateString('es-VE')
        ]);

        autoTable(doc, {
          startY: 70,
          head: [['#', 'Cliente / Deudor', 'Movimientos', 'Deuda ($ USD)', 'Deuda (Bs.F)', 'Última Actividad']],
          body: tableRows,
          headStyles: {
            fillColor: [76, 29, 149],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
          },
          bodyStyles: {
            fontSize: 8.5,
            textColor: [30, 27, 75]
          },
          alternateRowStyles: {
            fillColor: [250, 248, 255]
          },
          margin: { left: 14, right: 14 }
        });

        doc.save(`reporte_creditos_deudores_bricar_${new Date().toISOString().split('T')[0]}.pdf`);
      }
    } catch (err: any) {
      console.error('Error al generar PDF:', err);
      alert('Error al generar PDF: ' + err.message);
    }
  };

  // --- EXPORTAR CRÉDITOS EN FORMATO JSON ---
  const handleExportCreditsJSON = () => {
    try {
      const creditSales = sales.filter(s => s.paymentMethod === PaymentMethod.CREDITO || (s.customerName && s.customerName.trim() !== ''));
      const exportData = {
        appName: "Mini Market Bricar",
        type: "creditos_y_deudores",
        exportedAt: new Date().toISOString(),
        exchangeRate: rate,
        summary: {
          totalDebtUSD: grandTotals.usd,
          totalDebtBsF: grandTotals.bsf,
          debtorsCount: creditProfiles.filter(p => p.totalDebtUSD > 0.01).length,
        },
        profiles: creditProfiles,
        sales: sales // Incluye todas las ventas para no perder nada al restaurar
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `respaldo_creditos_deudores_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al exportar créditos en JSON: ' + err.message);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-indigo-950">
      
      {/* LEFT COLUMN: Clean visual purple/deep blue panels */}
      <div className="lg:col-span-5 space-y-6">
        
        {/* Total stats bar */}
        <div className="bg-gradient-to-br from-indigo-900 to-violet-950 p-6 rounded-2xl text-white shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-indigo-200 text-xs uppercase tracking-wider font-bold">
                <DollarSign className="w-4 h-4 text-violet-300" />
                Cuentas por Cobrar Total
              </div>
              <span className="bg-violet-800/80 text-violet-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                {filteredProfiles.length} Clientes
              </span>
            </div>
            <h2 className="text-3xl font-extrabold mt-1 tracking-tight">
              ${grandTotals.usd.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xl font-normal text-indigo-200">USD</span>
            </h2>
          </div>
          <div className="mt-4 pt-4 border-t border-indigo-800/60 flex justify-between items-center text-sm font-semibold">
            <span className="text-indigo-200">Equivalente Hoy:</span>
            <span className="text-violet-200 text-lg">
              {grandTotals.bsf.toLocaleString('es-VE', { maximumFractionDigits: 2 })} BsF
            </span>
          </div>

          {/* BARRA DE ACCIONES DE EXPORTACIÓN (PDF / JSON) */}
          <div className="mt-5 pt-4 border-t border-indigo-800/80 flex flex-wrap gap-2">
            <button
              onClick={handleDownloadPDF}
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              title="Descargar reporte impreso o estado de cuenta en formato PDF"
            >
              <FileText className="w-3.5 h-3.5 text-violet-200" />
              <span>{selectedClientName ? 'PDF Estado Cuenta' : 'Descargar PDF'}</span>
            </button>

            <button
              onClick={handleExportCreditsJSON}
              className="bg-indigo-950/80 hover:bg-indigo-800 text-indigo-100 border border-indigo-700/60 font-bold text-xs px-3 py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              title="Exportar copia de seguridad en formato JSON"
            >
              <FileCode className="w-3.5 h-3.5 text-violet-300" />
              <span>Exportar JSON</span>
            </button>

            {onImportSalesJSON && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/50 font-bold text-xs px-2.5 py-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                  title="Restaurar o importar respaldo en JSON"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-300" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onImportSalesJSON}
                  accept=".json"
                  className="hidden"
                />
              </>
            )}
          </div>

          <div className="text-[10px] text-indigo-300 mt-2 text-right italic">
            Calculado dinámicamente a la tasa actual ({rate.toFixed(2)} BsF/$)
          </div>
        </div>

        {/* Clients list tabbed section */}
        <div className="bg-white rounded-2xl border border-violet-100 p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2">
            <h3 className="font-bold text-lg text-indigo-950 flex items-center gap-1.5">
              <User className="w-5 h-5 text-violet-600" />
              Directorio de Créditos
            </h3>
            
            {/* Custom lavender styled segments */}
            <div className="flex bg-violet-50/80 p-0.5 rounded-lg border border-violet-100/50">
              <button 
                onClick={() => { setActiveSegment('DEBTORS'); setSelectedClientName(null); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeSegment === 'DEBTORS' ? 'bg-indigo-900 text-white' : 'text-indigo-600 hover:text-indigo-800'
                }`}
              >
                Deudores
              </button>
              <button 
                onClick={() => { setActiveSegment('SOLVENT'); setSelectedClientName(null); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeSegment === 'SOLVENT' ? 'bg-indigo-900 text-white' : 'text-indigo-600 hover:text-indigo-800'
                }`}
              >
                Solventes
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full pl-9 pr-4 py-2 border border-violet-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 bg-violet-50/20 text-sm"
            />
            <Search className="w-4.5 h-4.5 text-violet-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          {/* Directory list */}
          <div className="max-h-[350px] overflow-y-auto space-y-2.5 pr-1">
            {filteredProfiles.map((p) => (
              <div
                key={p.name}
                onClick={() => setSelectedClientName(p.name)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex justify-between items-center select-none ${
                  selectedClientName?.toUpperCase() === p.name.toUpperCase()
                    ? 'bg-violet-50 border-violet-200 ring-1 ring-violet-200'
                    : 'bg-white hover:bg-violet-50/30 border-slate-100'
                }`}
              >
                <div>
                  <h4 className="font-bold text-sm text-indigo-950 flex items-center gap-1">
                    {p.name}
                    {p.totalDebtUSD === 0 && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Actividad: {new Date(p.lastActivity).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-indigo-950">
                    ${p.totalDebtUSD.toFixed(2)} USD
                  </div>
                  <div className="text-xs text-violet-600 font-medium">
                    {p.totalDebtBsF.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Bs
                  </div>
                </div>
              </div>
            ))}

            {filteredProfiles.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm italic">
                {sales.length === 0 ? (
                  <div className="space-y-3 not-italic">
                    <p className="font-bold text-slate-700">El historial de créditos está vacío</p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                      Si tenías cuentas registradas, puedes importarlas desde el panel de restauración de la barra superior pulsando <strong className="text-indigo-950 font-semibold bg-slate-100 px-1 py-0.5 rounded border border-slate-200">Importar / Restaurar JSON</strong>.
                    </p>
                  </div>
                ) : (
                  searchTerm ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes registrados en esta sección.'
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Ledger detail & dynamic calculator */}
      <div className="lg:col-span-7">
        {selectedProfile ? (
          <div className="bg-white rounded-2xl border border-violet-100 p-6 shadow-sm space-y-6 animate-fade-in">
            
            {/* Ledger Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-violet-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-violet-100 text-violet-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Expediente de Crédito
                  </span>
                  <button
                    onClick={handleDownloadPDF}
                    className="bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 font-bold text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 cursor-pointer"
                    title="Imprimir / Guardar en PDF este estado de cuenta"
                  >
                    <FileText className="w-3 h-3 text-violet-600" />
                    <span>PDF Estado Cuenta</span>
                  </button>
                </div>
                <h3 className="text-2xl font-black text-indigo-950 mt-1 flex items-center gap-2">
                  {selectedProfile.name}
                </h3>
              </div>

              {/* Dynamic current calculations */}
              <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100/75 p-3.5 rounded-xl flex items-center gap-5">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">Deuda Neta:</span>
                  <span className="text-lg font-black text-indigo-950">${selectedProfile.totalDebtUSD.toFixed(2)} USD</span>
                </div>
                <div className="border-l border-violet-200/60 pl-4">
                  <span className="text-[10px] text-indigo-600 font-bold block">Bolívares (Tasa Actual):</span>
                  <span className="text-lg font-black text-violet-700">
                    {selectedProfile.totalDebtBsF.toLocaleString('es-VE', { maximumFractionDigits: 2 })} BsF
                  </span>
                </div>
              </div>
            </div>

            {/* Quick action: Abono payment form */}
            {selectedProfile.totalDebtUSD > 0.01 && (
              <div className="bg-violet-50/50 p-4 border border-violet-100/60 rounded-xl space-y-3">
                <h4 className="font-bold text-xs text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-violet-600" />
                  Registrar Abono / Pago Parcial o Total
                </h4>

                <form onSubmit={handleRegisterAbono} className="flex flex-wrap gap-3 items-end">
                  
                  {/* Amount Field */}
                  <div className="flex-1 min-w-[124px]">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Monto Abono</label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="any"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-3 pr-14 py-2 border border-violet-100 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                        required
                      />
                      <select 
                        value={paymentUnit}
                        onChange={(e) => setPaymentUnit(e.target.value as Currency)}
                        className="absolute right-1 top-1 bottom-1 px-1 bg-violet-100 border-l border-violet-200 rounded text-[10px] font-bold text-violet-700"
                      >
                        <option value={Currency.USD}>USD</option>
                        <option value={Currency.BSF}>BsF</option>
                      </select>
                    </div>
                  </div>

                  {/* Method Field */}
                  <div className="w-[140px]">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Método Pago</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-2 py-2 border border-violet-100 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                    >
                      <option value={PaymentMethod.EFECTIVO_USD}>Efectivo USD</option>
                      <option value={PaymentMethod.PAGO_MOVIL}>Pago Móvil</option>
                      <option value={PaymentMethod.PUNTO_VENTA}>Punto de Venta</option>
                      <option value={PaymentMethod.EFECTIVO_BSF}>Efectivo BsF</option>
                    </select>
                  </div>

                  {/* Ref/Notes */}
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Referencia / Comentarios</label>
                    <input 
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Ej. Efectivo, Referencia Pago Móvil..."
                      className="w-full px-2.5 py-2 border border-violet-100 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>

                  {/* Process button */}
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-indigo-900 hover:bg-indigo-950 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors h-[38px] flex items-center gap-1 disabled:bg-slate-300 shadow-xs"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      Girar Abono
                    </button>

                    <button
                      type="button"
                      onClick={handleCompletePayment}
                      disabled={isSubmitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors h-[38px] flex items-center gap-1.5 disabled:bg-slate-300 shadow-xs"
                      title="Liquidar toda la deuda de este cliente con el método de pago seleccionado"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckSquare className="w-4 h-4" />
                      )}
                      Pago Completo (Liquidar)
                    </button>
                  </div>

                </form>

                {/* Instant conversion help text */}
                {paymentAmount && (
                  <div className="text-[10px] text-slate-500 font-semibold px-1 mt-1 flex items-center justify-between">
                    <span>
                      Equivalencia: {' '}
                      {paymentUnit === Currency.USD ? (
                        <span className="text-violet-600 font-black">
                          {(parseFloat(paymentAmount) * rate || 0).toLocaleString('es-VE', { maximumFractionDigits: 1 })} BsF
                        </span>
                      ) : (
                        <span className="text-violet-600 font-black">
                          ${(parseFloat(paymentAmount) / rate || 0).toFixed(2)} USD
                        </span>
                      )}
                    </span>
                    <span className="text-indigo-900 italic font-medium">Se almacena base Dólar en la cuenta corriente</span>
                  </div>
                )}
              </div>
            )}

            {/* History detailed table */}
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-indigo-950 flex items-center gap-1">
                <FileText className="w-4 h-4 text-violet-600" />
                Historial Detallado del Cliente
              </h4>

              <div className="border border-violet-100 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-violet-50 text-[10px] uppercase font-bold text-violet-800 tracking-wider">
                      <tr>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Concepto/Producto</th>
                        <th className="p-3 text-center">Cant.</th>
                        <th className="p-3 text-right">Precio USD</th>
                        <th className="p-3 text-center">Tasa Reg.</th>
                        <th className="p-3 text-right">Total USD</th>
                        <th className="p-3 text-right">Total BsF</th>
                        <th className="p-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-100 bg-white">
                      {clientHistory.map((h, i) => {
                        const isCreditPaidOffset = h.totalUSD < 0;

                        return (
                          <tr key={i} className={`hover:bg-slate-50 ${isCreditPaidOffset ? 'bg-emerald-50/40' : ''}`}>
                            <td className="p-3 text-slate-500 whitespace-nowrap">
                              {new Date(h.date).toLocaleDateString()}
                            </td>
                            <td className={`p-3 font-semibold ${isCreditPaidOffset ? 'text-emerald-700' : 'text-slate-700'}`}>
                              {h.concept}
                              {h.paymentReference && (
                                <span className="block text-[9px] font-normal text-slate-400">
                                  Ref: {h.paymentReference}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center text-slate-500">
                              {isCreditPaidOffset ? '-' : h.quantity}
                            </td>
                            <td className={`p-3 text-right ${isCreditPaidOffset ? 'text-emerald-600 font-bold' : 'text-slate-600'}`}>
                              {isCreditPaidOffset ? `-$${Math.abs(h.priceUSD).toFixed(2)}` : `$${h.priceUSD.toFixed(2)}`}
                            </td>
                            <td className="p-3 text-center text-slate-400 font-mono">
                              {h.rateAtSale.toFixed(1)}
                            </td>
                            <td className={`p-3 text-right font-bold ${isCreditPaidOffset ? 'text-emerald-700' : 'text-indigo-950'}`}>
                              {isCreditPaidOffset ? `-$${Math.abs(h.totalUSD).toFixed(2)}` : `$${h.totalUSD.toFixed(2)}`}
                            </td>
                            <td className={`p-3 text-right font-medium ${isCreditPaidOffset ? 'text-emerald-700' : 'text-slate-600'}`}>
                              {isCreditPaidOffset ? `-${Math.abs(h.totalBsF).toLocaleString('es-VE', { maximumFractionDigits: 1 })}` : `${h.totalBsF.toLocaleString('es-VE', { maximumFractionDigits: 1 })}`} Bs
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              {onDeleteSale && h.saleId && (
                                <button
                                  type="button"
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (window.confirm('¿Estás seguro de eliminar esta transacción de crédito/abono? Los productos asociados retornarán automáticamente al inventario.')) {
                                      onDeleteSale(h.saleId!); 
                                    }
                                  }}
                                  className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 transition-colors inline-flex items-center"
                                  title="Eliminar esta transacción y restaurar el stock si aplica"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {clientHistory.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                            No se registran transacciones para este cliente.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="bg-slate-50/50 border border-dashed border-violet-200/80 rounded-2xl p-16 text-center text-slate-400 font-medium h-full flex flex-col items-center justify-center space-y-3">
            <User className="w-12 h-12 text-violet-300 animate-pulse" />
            <p className="text-sm">Selecciona un cliente de la lista para auditar su cuenta de crédito, registrar abonos y calcular el saldo en tiempo real.</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default Credits;
