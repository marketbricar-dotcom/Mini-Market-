import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, Sale, CartItem, Currency, PaymentMethod } from '../types';
import { Search, Plus, Trash2, Smartphone, CreditCard, User, Check, AlertCircle, ScanBarcode, X } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';

interface Props {
  inventory: Product[];
  rate: number;
  onProcessSale: (sale: Sale, updatedInventory: Product[]) => void;
}

const SalesSystem: React.FC<Props> = ({ inventory, rate, onProcessSale }) => {
  const [mode, setMode] = useState<'INVENTORY' | 'MANUAL'>('INVENTORY');
  
  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Input State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<string>('1');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualCurrency, setManualCurrency] = useState<Currency>(Currency.USD);
  
  // Checkout State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.PUNTO_VENTA);
  const [customerName, setCustomerName] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  // Partial payment / Abono inicial states
  const [initialPayment, setInitialPayment] = useState('');
  const [initialPaymentCurrency, setInitialPaymentCurrency] = useState<Currency>(Currency.USD);
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<PaymentMethod>(PaymentMethod.EFECTIVO_USD);
  const [initialPaymentRef, setInitialPaymentRef] = useState('');
  
  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Scanner Quantity State
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scannedQtyInput, setScannedQtyInput] = useState<string>('1');
  const scannedQtyRef = useRef<HTMLInputElement>(null);

  // Auto-focus the scanned quantity input when a product is scanned
  useEffect(() => {
    if (scannedProduct && scannedQtyRef.current) {
      scannedQtyRef.current.focus();
      scannedQtyRef.current.select();
    }
  }, [scannedProduct]);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Suggestions Logic
  const suggestions = useMemo(() => {
    if (!searchTerm) return [];
    return inventory
      .filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (p.barcode && p.barcode.includes(searchTerm))
      )
      .slice(0, 10);
  }, [inventory, searchTerm]);

  const handleSelectProduct = (product: Product) => {
    // Check stock
    const currentInCart = cart.reduce((acc, item) => item.productId === product.id ? acc + item.quantity : acc, 0);
    if (product.stock < (currentInCart + 1)) {
        alert(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}`);
        return;
    }

    setCart(prev => {
        const existingIdx = prev.findIndex(i => i.productId === product.id && !i.isManual);
        if (existingIdx > -1) {
            const newCart = [...prev];
            newCart[existingIdx].quantity += 1;
            return newCart;
        }
        return [...prev, {
            productId: product.id,
            name: product.name,
            price: product.price,
            currency: product.currency,
            quantity: 1,
            isManual: false
        }];
    });
    
    // Reset inputs immediately so user can continue searching / scanning without extra clicks
    setSelectedProduct(null);
    setSearchTerm('');
    setShowSuggestions(false);
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const handleIncrementQuantity = (index: number) => {
    setCart(prev => {
      const newCart = [...prev];
      const item = newCart[index];
      if (!item.isManual && item.productId) {
        const prod = inventory.find(p => p.id === item.productId);
        if (prod) {
          if (prod.stock < (item.quantity + 1)) {
            alert(`Stock insuficiente para ${item.name}. Disponible: ${prod.stock}`);
            return prev;
          }
        }
      }
      newCart[index] = { ...item, quantity: item.quantity + 1 };
      return newCart;
    });
  };

  const handleDecrementQuantity = (index: number) => {
    setCart(prev => {
      const newCart = [...prev];
      const item = newCart[index];
      if (item.quantity <= 1) {
        return prev;
      }
      newCart[index] = { ...item, quantity: item.quantity - 1 };
      return newCart;
    });
  };

  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (isNaN(newQty) || newQty <= 0) return;
    setCart(prev => {
      const newCart = [...prev];
      const item = newCart[index];
      if (!item.isManual && item.productId) {
        const prod = inventory.find(p => p.id === item.productId);
        if (prod) {
          if (prod.stock < newQty) {
            alert(`Stock insuficiente para ${item.name}. Disponible: ${prod.stock}`);
            return prev;
          }
        }
      }
      newCart[index] = { ...item, quantity: newQty };
      return newCart;
    });
  };

  const handleAddToCart = () => {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return;

    if (mode === 'INVENTORY') {
        if (!selectedProduct) return;
        
        // Check stock
        const currentInCart = cart.reduce((acc, item) => item.productId === selectedProduct.id ? acc + item.quantity : acc, 0);
        if (selectedProduct.stock < (currentInCart + qty)) {
            alert(`Stock insuficiente. Disponible: ${selectedProduct.stock}`);
            return;
        }

        setCart(prev => {
            const existingIdx = prev.findIndex(i => i.productId === selectedProduct.id && !i.isManual);
            if (existingIdx > -1) {
                const newCart = [...prev];
                newCart[existingIdx].quantity += qty;
                return newCart;
            }
            return [...prev, {
                productId: selectedProduct.id,
                name: selectedProduct.name,
                price: selectedProduct.price,
                currency: selectedProduct.currency,
                quantity: qty,
                isManual: false
            }];
        });
        
        // Reset Inputs
        setSelectedProduct(null);
        setSearchTerm('');
        setQuantity('1');
        if (searchInputRef.current) searchInputRef.current.focus();

    } else {
        // Manual Mode
        if (!manualName || !manualPrice) return;
        setCart(prev => [...prev, {
            name: manualName,
            price: parseFloat(manualPrice),
            currency: manualCurrency,
            quantity: qty,
            isManual: true
        }]);
        setManualName('');
        setManualPrice('');
        setQuantity('1');
        // Do not reset manualCurrency to keep user preference sticky
    }
  };

  const handleClearCart = () => {
    if (confirm("¿Estás seguro de vaciar la venta actual?")) {
        setCart([]);
        setCustomerName('');
        setPaymentReference('');
    }
  };

  const handleRemoveItem = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const { totalUSD, totalBsF } = useMemo(() => {
    let usd = 0;
    let bsf = 0;
    cart.forEach(item => {
        if (item.currency === Currency.USD) {
            usd += item.price * item.quantity;
            bsf += (item.price * item.quantity) * rate;
        } else {
            bsf += item.price * item.quantity;
            usd += (item.price * item.quantity) / rate;
        }
    });
    return { totalUSD: usd, totalBsF: bsf };
  }, [cart, rate]);

  const handleProcessSale = () => {
    if (cart.length === 0) return;
    
    // Validations
    if (paymentMethod === PaymentMethod.CREDITO && !customerName) {
        alert("El nombre del cliente es obligatorio para ventas a crédito");
        return;
    }
    if (paymentMethod === PaymentMethod.PAGO_MOVIL && !paymentReference) {
        alert("La referencia es obligatoria para Pago Móvil");
        return;
    }

    let hasAbono = false;
    let abonoUSD = 0;
    const parsedInitial = parseFloat(initialPayment);

    if (paymentMethod === PaymentMethod.CREDITO && !isNaN(parsedInitial) && parsedInitial > 0) {
        abonoUSD = initialPaymentCurrency === Currency.USD ? parsedInitial : parsedInitial / rate;
        if (abonoUSD >= totalUSD) {
            alert(`El abono ($${abonoUSD.toFixed(2)}) no puede ser mayor o igual al total de la venta ($${totalUSD.toFixed(2)}). Si va a pagar el total completo, elija otro método de pago.`);
            return;
        }
        hasAbono = true;
    }

    // Process
    const updatedInventory = [...inventory];
    cart.forEach(item => {
        if (!item.isManual && item.productId) {
            const idx = updatedInventory.findIndex(p => p.id === item.productId);
            if (idx > -1) {
                updatedInventory[idx].stock -= item.quantity;
            }
        }
    });

    const newSale: Sale = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        items: cart,
        totalUSD,
        totalBsF,
        rateAtSale: rate,
        paymentMethod,
        customerName: paymentMethod === PaymentMethod.CREDITO ? customerName : undefined,
        paymentReference: paymentMethod === PaymentMethod.PAGO_MOVIL ? paymentReference : undefined
    };

    if (hasAbono) {
        const abonoSale: Sale = {
            id: crypto.randomUUID(),
            timestamp: Date.now() + 50, // Slightly after to preserve chronological order
            items: [{
                name: `Abono Inicial de Venta [${initialPaymentMethod}]`,
                quantity: 1,
                price: -abonoUSD,
                currency: Currency.USD,
                isManual: true
            }],
            totalUSD: -abonoUSD,
            totalBsF: -(abonoUSD * rate),
            rateAtSale: rate,
            paymentMethod: PaymentMethod.CREDITO,
            customerName: customerName,
            paymentReference: initialPaymentRef || `Abono Inicial (Efectivo/Ref)`
        };
        onProcessSale([newSale, abonoSale], updatedInventory);
    } else {
        onProcessSale(newSale, updatedInventory);
    }

    setCart([]);
    setCustomerName('');
    setPaymentReference('');
    setInitialPayment('');
    setInitialPaymentRef('');
    alert(hasAbono ? "Venta y abono parcial procesados con éxito!" : "Venta procesada con éxito!");
  };

  const handleConfirmScannedQuantity = () => {
    if (!scannedProduct) return;
    const qty = parseFloat(scannedQtyInput);
    if (isNaN(qty) || qty <= 0) {
      alert("Por favor, introduce una cantidad válida.");
      return;
    }

    // Check stock
    const currentInCart = cart.reduce((acc, item) => item.productId === scannedProduct.id ? acc + item.quantity : acc, 0);
    if (scannedProduct.stock < (currentInCart + qty)) {
      alert(`Stock insuficiente para ${scannedProduct.name}. Disponible: ${scannedProduct.stock}`);
      return;
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(i => i.productId === scannedProduct.id && !i.isManual);
      if (existingIdx > -1) {
        const newCart = [...prev];
        newCart[existingIdx].quantity += qty;
        return newCart;
      }
      return [...prev, {
        productId: scannedProduct.id,
        name: scannedProduct.name,
        price: scannedProduct.price,
        currency: scannedProduct.currency,
        quantity: qty,
        isManual: false
      }];
    });

    setScannedProduct(null);
  };

  const handleScanSuccess = (code: string) => {
      const prod = inventory.find(p => p.barcode === code);
      if (prod) {
          setScannedProduct(prod);
          setScannedQtyInput('1');
          setShowScanner(false);
      } else {
          alert("Producto no encontrado en inventario");
          setShowScanner(false);
      }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] flex flex-col">
       {showScanner && <BarcodeScanner onScanSuccess={handleScanSuccess} onClose={() => setShowScanner(false)} />}
       
       {scannedProduct && (
         <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
           <div className="bg-white rounded-xl overflow-hidden w-full max-w-sm relative animate-fade-in shadow-2xl border border-slate-200 animate-in fade-in duration-200">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h3 className="font-bold text-slate-800">Cantidad del Producto</h3>
               <button onClick={() => setScannedProduct(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
                 <X className="w-5 h-5" />
               </button>
             </div>
             
             <div className="p-6 space-y-4">
               <div>
                 <h4 className="font-semibold text-slate-900 text-base">{scannedProduct.name}</h4>
                 <p className="text-sm text-slate-500 mt-1 flex justify-between">
                   <span>Precio: <strong className="text-blue-600">${scannedProduct.price}</strong></span>
                   <span>Disponible: <strong className="text-slate-700">{scannedProduct.stock} uds</strong></span>
                 </p>
               </div>

               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cantidad a agregar</label>
                 <input 
                   ref={scannedQtyRef}
                   type="number"
                   value={scannedQtyInput}
                   onChange={(e) => setScannedQtyInput(e.target.value)}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg text-center bg-slate-50"
                   min="1"
                   step="any"
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       handleConfirmScannedQuantity();
                     } else if (e.key === 'Escape') {
                       setScannedProduct(null);
                     }
                   }}
                 />
               </div>
             </div>

             <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
               <button
                 onClick={() => setScannedProduct(null)}
                 className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300 transition-colors text-sm"
               >
                 Cancelar
               </button>
               <button
                 onClick={handleConfirmScannedQuantity}
                 className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm shadow-md"
               >
                 Agregar
               </button>
             </div>
           </div>
         </div>
       )}
       
       {/* Header Title Section */}
       <div className="p-4 border-b border-slate-200">
           <h2 className="text-xl font-bold text-slate-800">Sistema de Ventas</h2>
       </div>

       {/* Mode Tabs */}
       <div className="px-6 pt-6 flex gap-4">
           <button 
             onClick={() => setMode('INVENTORY')}
             className={`px-6 py-2 rounded-lg font-medium transition-colors ${mode === 'INVENTORY' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
           >
               Venta desde Inventario
           </button>
           <button 
             onClick={() => setMode('MANUAL')}
             className={`px-6 py-2 rounded-lg font-medium transition-colors ${mode === 'MANUAL' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
           >
               Venta Manual
           </button>
       </div>

       {/* Input Area - Replicating the row from the screenshot */}
       <div className="p-6 bg-slate-50 border-b border-slate-200">
           <div className="flex flex-col md:flex-row gap-4 items-end">
               
               {mode === 'INVENTORY' ? (
                   <>
                        <div className="flex-1 relative w-full">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Buscar Producto</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input 
                                        ref={searchInputRef}
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            setShowSuggestions(true);
                                            setSelectedProduct(null);
                                        }}
                                        onFocus={() => setShowSuggestions(true)}
                                        placeholder="Escribe el nombre o escanea..."
                                        className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && suggestions.length > 0) {
                                                handleSelectProduct(suggestions[0]);
                                                setShowSuggestions(false);
                                            }
                                        }}
                                    />
                                    {selectedProduct && <Check className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 w-4 h-4" />}
                                </div>
                                <button 
                                    onClick={() => setShowScanner(true)} 
                                    className="px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 flex items-center gap-2 text-slate-700 font-medium"
                                    title="Escanear Código"
                                >
                                    <ScanBarcode className="w-5 h-5" />
                                    <span className="hidden sm:inline">Escanear</span>
                                </button>
                            </div>

                            {/* Autocomplete Dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                    {suggestions.map(p => (
                                        <div 
                                            key={p.id}
                                            onClick={() => handleSelectProduct(p)}
                                            className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0"
                                        >
                                            <div className="font-medium text-slate-800">{p.name}</div>
                                            <div className="text-xs text-slate-500 flex justify-between">
                                                <span>Stock: {p.stock}</span>
                                                <span className="font-bold text-blue-600">${p.price}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="hidden">
                             <label className="block text-sm font-semibold text-slate-700 mb-1">Cantidad</label>
                             <input 
                                type="number" 
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                min="1"
                             />
                        </div>
                   </>
               ) : (
                   <>
                        <div className="flex-1">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Descripción</label>
                            <input 
                                type="text"
                                value={manualName}
                                onChange={(e) => setManualName(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Nombre del producto..."
                            />
                        </div>
                        <div className="w-32">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Moneda</label>
                            <select
                                value={manualCurrency}
                                onChange={(e) => setManualCurrency(e.target.value as Currency)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value={Currency.USD}>USD ($)</option>
                                <option value={Currency.BSF}>BsF</option>
                            </select>
                        </div>
                        <div className="w-32">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                Precio ({manualCurrency === Currency.USD ? '$' : 'Bs'})
                            </label>
                            <input 
                                type="number"
                                value={manualPrice}
                                onChange={(e) => setManualPrice(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="0.00"
                            />
                        </div>
                        <div className="w-24">
                             <label className="block text-sm font-semibold text-slate-700 mb-1">Cant.</label>
                             <input 
                                type="number" 
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                             />
                        </div>
                   </>
               )}

               <button 
                 onClick={handleAddToCart}
                 className={mode === 'INVENTORY' ? 'hidden' : 'bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors h-[42px] flex items-center justify-center min-w-[140px]'}
               >
                   Agregar a Venta
               </button>

               <button 
                 onClick={handleClearCart}
                 className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors h-[42px] min-w-[140px]"
               >
                   Limpiar Venta
               </button>
           </div>
           
           <div className="mt-2 text-xs text-slate-400">
               Tip: Escribe el nombre o escanea un producto para agregarlo abajo instantáneamente, luego ajusta su cantidad allí mismo.
           </div>
       </div>

       {/* Main Content Area: Split View */}
       <div className="flex-1 flex flex-col lg:flex-row">
           
           {/* Left Column: Product Table */}
           <div className="flex-1 border-r border-slate-200 overflow-y-auto bg-white p-4">
               <h3 className="font-bold text-slate-800 mb-4">Productos en Venta</h3>
               
               <table className="w-full text-left border-collapse">
                   <thead>
                       <tr className="bg-blue-50 border-b border-blue-100">
                           <th className="p-3 text-sm font-semibold text-blue-800">Producto</th>
                           <th className="p-3 text-sm font-semibold text-blue-800 text-center">Cant.</th>
                           <th className="p-3 text-sm font-semibold text-blue-800 text-right">Precio USD</th>
                           <th className="p-3 text-sm font-semibold text-blue-800 text-right">Precio BsF</th>
                           <th className="p-3 text-sm font-semibold text-blue-800 text-center">Acción</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {cart.map((item, idx) => {
                           const itemTotalUSD = item.currency === Currency.USD ? item.price * item.quantity : item.price * item.quantity / rate;
                           const itemTotalBsF = item.currency === Currency.BSF ? item.price * item.quantity : item.price * item.quantity * rate;
                           
                           return (
                               <tr key={idx} className="hover:bg-slate-50">
                                   <td className="p-3 font-medium text-slate-700">{item.name}</td>
                                    <td className="p-3 text-center">
                                        <div className="inline-flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1 shadow-sm select-none mx-auto">
                                            <button 
                                                onClick={() => handleDecrementQuantity(idx)}
                                                className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-800 font-bold transition-all text-sm focus:outline-none"
                                                title="Reducir Cantidad"
                                            >
                                                -
                                            </button>
                                            <input 
                                                type="number" 
                                                value={item.quantity} 
                                                onChange={(e) => handleUpdateQuantity(idx, parseFloat(e.target.value))}
                                                className="w-12 text-center font-bold text-slate-900 bg-transparent border-0 p-0 focus:ring-0 focus:outline-none text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                min="1"
                                            />
                                            <button 
                                                onClick={() => handleIncrementQuantity(idx)}
                                                className="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-800 font-bold transition-all text-sm focus:outline-none"
                                                title="Aumentar Cantidad"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </td>
                                   <td className="p-3 text-right text-slate-600">${itemTotalUSD.toFixed(2)}</td>
                                   <td className="p-3 text-right text-slate-600">{itemTotalBsF.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</td>
                                   <td className="p-3 text-center">
                                       <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700">
                                           <Trash2 className="w-4 h-4" />
                                       </button>
                                   </td>
                               </tr>
                           );
                       })}
                       {cart.length === 0 && (
                           <tr>
                               <td colSpan={5} className="p-8 text-center text-slate-400">
                                   No hay productos en la venta actual.
                               </td>
                           </tr>
                       )}
                   </tbody>
               </table>
           </div>

           {/* Right Column: Summary Panel */}
           <div className="w-full lg:w-96 bg-slate-50 p-6 flex flex-col gap-6">
               <div>
                   <h3 className="font-bold text-slate-800 mb-4">Resumen de Venta</h3>
                   
                   <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                       <div className="flex justify-between items-center">
                           <span className="text-slate-600">Total USD:</span>
                           <span className="text-xl font-bold text-slate-900">${totalUSD.toFixed(2)}</span>
                       </div>
                       <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                           <span className="text-slate-600">Total BsF:</span>
                           <span className="text-xl font-bold text-slate-900">{totalBsF.toLocaleString('es-VE', { maximumFractionDigits: 2 })} BsF</span>
                       </div>
                   </div>
               </div>

               <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Método de Pago</label>
                   <select 
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="w-full p-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                   >
                       {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                   </select>
               </div>

               {paymentMethod === PaymentMethod.PAGO_MOVIL && (
                   <div className="animate-fade-in">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Referencia</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={paymentReference}
                                onChange={(e) => setPaymentReference(e.target.value)}
                                placeholder="Últimos 4 dígitos"
                                className="w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        </div>
                   </div>
               )}

               {paymentMethod === PaymentMethod.CREDITO && (
                   <div className="animate-fade-in space-y-4 bg-white p-4 rounded-xl border border-slate-200">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Cliente</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Nombre del Cliente"
                                    className="w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                            </div>
                        </div>

                        {/* Abono inicial / Pago Parcial */}
                        <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/60 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">¿Abono Inicial / Pago Parcial?</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Monto Abono</label>
                                    <input 
                                        type="number" 
                                        step="any"
                                        value={initialPayment}
                                        onChange={(e) => setInitialPayment(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-600 mb-1">Moneda Abono</label>
                                    <select
                                        value={initialPaymentCurrency}
                                        onChange={(e) => setInitialPaymentCurrency(e.target.value as Currency)}
                                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value={Currency.USD}>USD ($)</option>
                                        <option value={Currency.BSF}>BsF</option>
                                    </select>
                                </div>
                            </div>

                            {parseFloat(initialPayment) > 0 && (
                                <div className="space-y-2 animate-fade-in pt-1">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">Método de Pago</label>
                                            <select
                                                value={initialPaymentMethod}
                                                onChange={(e) => setInitialPaymentMethod(e.target.value as PaymentMethod)}
                                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                <option value={PaymentMethod.EFECTIVO_USD}>Efectivo USD</option>
                                                <option value={PaymentMethod.PAGO_MOVIL}>Pago Móvil</option>
                                                <option value={PaymentMethod.PUNTO_VENTA}>Punto de Venta</option>
                                                <option value={PaymentMethod.EFECTIVO_BSF}>Efectivo BsF</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold text-slate-600 mb-1">Referencia / Detalle</label>
                                            <input 
                                                type="text" 
                                                value={initialPaymentRef}
                                                onChange={(e) => setInitialPaymentRef(e.target.value)}
                                                placeholder="Opcional..."
                                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Summary calculation */}
                                    {(() => {
                                        const parsedAbono = parseFloat(initialPayment) || 0;
                                        const abonoUSD = initialPaymentCurrency === Currency.USD ? parsedAbono : parsedAbono / rate;
                                        const remainingUSD = Math.max(0, totalUSD - abonoUSD);
                                        const remainingBsF = Math.max(0, totalBsF - (initialPaymentCurrency === Currency.BSF ? parsedAbono : parsedAbono * rate));
                                        
                                        return (
                                            <div className="pt-2 border-t border-indigo-100/60 text-[10px] text-indigo-900 font-medium space-y-0.5">
                                                <div className="flex justify-between">
                                                     <span>Detalle:</span>
                                                     <span>Abono de <strong>${abonoUSD.toFixed(2)} USD</strong></span>
                                                </div>
                                                <div className="flex justify-between text-indigo-950 font-bold">
                                                     <span>Deuda Restante:</span>
                                                     <span>${remainingUSD.toFixed(2)} USD / {remainingBsF.toLocaleString('es-VE', { maximumFractionDigits: 1 })} Bs</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                   </div>
               )}

               <button 
                 onClick={handleProcessSale}
                 disabled={cart.length === 0}
                 className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-600/20 disabled:bg-slate-300 disabled:shadow-none mt-auto"
               >
                   Procesar Venta
               </button>
           </div>
       </div>
    </div>
  );
};

export default SalesSystem;
