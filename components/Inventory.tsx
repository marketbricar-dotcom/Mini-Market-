import React, { useState, useMemo } from 'react';
import { Product, ProductCategory, Currency } from '../types';
import { Plus, Search, Package, Trash2, ScanBarcode, Edit, PlusCircle, Save, X, Filter, Tag, AlertCircle } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';

interface Props {
  inventory: Product[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  rate: number;
  criticalThreshold?: number;
  onUpdateCriticalThreshold?: (threshold: number) => void;
}

const initialProductState: Partial<Product> = {
    category: ProductCategory.OTROS,
    currency: Currency.USD,
    unit: 'Unidad',
    stock: 0,
    unitsPerCase: 1,
    barcode: '',
    cost: 0,
    profitMargin: 0,
    name: '',
    price: 0
};

const Inventory: React.FC<Props> = ({ 
  inventory, 
  onAddProduct, 
  onUpdateProduct, 
  onDeleteProduct, 
  rate,
  criticalThreshold = 5,
  onUpdateCriticalThreshold
}) => {
  const [view, setView] = useState<'LIST' | 'FORM'>('LIST');
  const [filterCat, setFilterCat] = useState<ProductCategory | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  // Form State
  const [newProduct, setNewProduct] = useState<Partial<Product>>(initialProductState);

  const handleSaveProduct = () => {
    if (!newProduct.name || !newProduct.price) {
      alert("Nombre y Precio son obligatorios");
      return;
    }

    if (newProduct.id) {
        // UPDATE EXISTING
        onUpdateProduct({ ...newProduct } as Product);
        alert("Producto actualizado correctamente");
    } else {
        // CREATE NEW
        const product: Product = {
            id: crypto.randomUUID(),
            name: newProduct.name,
            category: newProduct.category as ProductCategory,
            price: Number(newProduct.price),
            currency: newProduct.currency as Currency,
            unit: newProduct.unit || 'Unidad',
            unitsPerCase: Number(newProduct.unitsPerCase) || 1,
            stock: Number(newProduct.stock) || 0,
            barcode: newProduct.barcode || '',
            cost: Number(newProduct.cost) || 0,
            profitMargin: Number(newProduct.profitMargin) || 0
        };
        onAddProduct(product);
        alert("Producto agregado correctamente");
    }

    setNewProduct(initialProductState);
    setView('LIST');
  };

  const handleEdit = (product: Product) => {
      setNewProduct({ ...product });
      setView('FORM');
  };

  const handleQuickAddStock = (product: Product) => {
      const quantityStr = prompt(`INGRESO RÁPIDO DE INVENTARIO\n\nProducto: ${product.name}\nStock Actual: ${product.stock}\n\nIngrese cantidad a AGREGAR (Use números negativos para restar):`);
      if (quantityStr) {
          // Handle comma as decimal separator for better UX
          const cleanStr = quantityStr.replace(',', '.');
          const qty = parseFloat(cleanStr);
          
          if (!isNaN(qty) && qty !== 0) {
              const newStock = parseFloat((product.stock + qty).toFixed(2));
              onUpdateProduct({ ...product, stock: newStock });
          }
      }
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
      onDeleteProduct(id);
    }
  };

  // Helper function to remove Spanish accents and convert to lowercase for robust searching
  const normalizeText = (str: string) => {
    return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
  };

  // Dynamic product count per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    inventory.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [inventory]);

  // Filter and sort products alphabetically with search and category constraints
  const filteredInventory = useMemo(() => {
    const normSearch = normalizeText(searchTerm);
    return inventory
      .filter(p => {
        const normName = normalizeText(p.name);
        const normCat = normalizeText(p.category);
        const normBarcode = p.barcode ? p.barcode.trim() : "";
        
        const matchesSearch = 
          normName.includes(normSearch) || 
          normBarcode.includes(searchTerm.trim()) ||
          normCat.includes(normSearch);

        const matchesCat = filterCat === 'ALL' || p.category === filterCat;
        return matchesSearch && matchesCat;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [inventory, searchTerm, filterCat]);

  const handleScanSuccess = (decodedText: string) => {
    if (view === 'LIST') {
        // If in list view, search for the product
        setSearchTerm(decodedText);
    } else {
        // If in form view, fill the barcode input
        setNewProduct(prev => ({ ...prev, barcode: decodedText }));
    }
    setShowScanner(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px] relative">
      {showScanner && (
        <BarcodeScanner 
          onScanSuccess={handleScanSuccess} 
          onClose={() => setShowScanner(false)} 
        />
      )}

      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-800">
              {view === 'LIST' ? 'Inventario' : (newProduct.id ? 'Editar Producto' : 'Agregar Producto')}
          </h2>
        </div>
        <button
          onClick={() => {
              if (view === 'LIST') {
                  setNewProduct(initialProductState);
                  setView('FORM');
              } else {
                  setView('LIST');
              }
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            view === 'LIST' 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          }`}
        >
          {view === 'LIST' ? <><Plus className="w-4 h-4" /> Agregar Producto</> : 'Volver a la Lista'}
        </button>
      </div>

      {view === 'LIST' ? (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/40 space-y-3.5">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search Input with quick-clear and camera scanner */}
              <div className="relative flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                      type="text" 
                      placeholder="Buscar por nombre, código o categoría..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-10 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400 text-slate-800 shadow-sm"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                      title="Limpar búsqueda"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => setShowScanner(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm font-semibold text-sm shrink-0 select-none cursor-pointer"
                  title="Escanear Código para Buscar"
                >
                    <ScanBarcode className="w-5 h-5" />
                    <span className="hidden sm:inline">Escanear</span>
                </button>
              </div>

              {/* Mobile Category Selection Dropdown (Hidden on Desktop) */}
              <div className="flex items-center gap-2 md:hidden">
                <Filter className="w-4 h-4 text-slate-500 shrink-0" />
                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value as ProductCategory | 'ALL')}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">Todas las Categorías ({inventory.length})</option>
                  {Object.values(ProductCategory).map(cat => (
                    <option key={cat} value={cat}>
                      {cat} ({categoryCounts[cat] || 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Desktop Category Chips (Hidden on Mobile) */}
            <div className="hidden md:flex flex-wrap items-center gap-1.5 pt-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-2">
                <Filter className="w-3.5 h-3.5" />
                Filtro:
              </span>
              <button
                onClick={() => setFilterCat('ALL')}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-all border select-none duration-150 cursor-pointer ${
                  filterCat === 'ALL' 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/10' 
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                Todos <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${filterCat === 'ALL' ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'}`}>{inventory.length}</span>
              </button>
              {Object.values(ProductCategory).map(cat => {
                const count = categoryCounts[cat] || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilterCat(cat)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-all border select-none duration-150 cursor-pointer ${
                      filterCat === cat 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/10' 
                        : count === 0
                        ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 hover:opacity-90'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {cat} 
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      filterCat === cat 
                        ? 'bg-blue-700 text-blue-100' 
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Results Details Bar */}
            <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-slate-100 flex-wrap">
              <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                Mostrando <strong className="text-slate-800 font-bold">{filteredInventory.length}</strong> de <strong className="text-slate-800 font-bold">{inventory.length}</strong> productos
              </span>
              
              <div className="flex items-center gap-3 flex-wrap">
                {/* Control de Nivel de Stock Crítico */}
                <div className="flex items-center gap-2 text-xs text-slate-600 font-semibold bg-amber-50/70 px-3 py-1 border border-amber-200/50 rounded-lg shadow-sm">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Alerta Stock Mínimo:</span>
                  <input
                    type="number"
                    min="1"
                    value={criticalThreshold}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 0) {
                        onUpdateCriticalThreshold?.(val);
                      }
                    }}
                    className="w-12 text-center bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-500 font-bold text-slate-850"
                  />
                  <span className="text-[10px] text-slate-400 font-normal">unid.</span>
                </div>

                {(searchTerm || filterCat !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterCat('ALL');
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors select-none"
                  >
                    <X className="w-3.5 h-3.5" /> Quitar filtros
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Producto</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Categoría</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Precio</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Existencias</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInventory.map(product => {
                    const priceInOther = product.currency === Currency.USD 
                        ? product.price * rate 
                        : product.price / rate;
                    
                    return (
                        <tr key={product.id} className="hover:bg-slate-50/50 group">
                        <td className="p-4">
                            <div className="font-medium text-slate-900">{product.name}</div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">{product.unit} ({product.unitsPerCase} u/caja)</span>
                                {product.barcode && (
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                                        {product.barcode}
                                    </span>
                                )}
                            </div>
                        </td>
                        <td className="p-4">
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                                {product.category}
                            </span>
                        </td>
                        <td className="p-4">
                            <div className="font-bold text-slate-700">
                                {product.currency === Currency.USD ? '$' : 'BsF'}{product.price}
                            </div>
                            <div className="text-xs text-slate-400">
                                ≈ {product.currency === Currency.USD ? 'BsF' : '$'}{priceInOther.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                            </div>
                        </td>
                        <td className="p-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                                  product.stock <= criticalThreshold 
                                    ? product.stock === 0 
                                      ? 'bg-rose-100 text-rose-700 font-extrabold' 
                                      : 'bg-amber-100 text-amber-800 font-bold'
                                    : 'text-slate-700'
                                }`}>
                                    {product.stock}
                                </span>
                                {product.stock <= criticalThreshold && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                                    product.stock === 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-amber-500 text-white'
                                  }`}>
                                    {product.stock === 0 ? 'Agotado' : 'Crítico'}
                                  </span>
                                )}
                            </div>
                        </td>
                        <td className="p-4 text-right">
                            <div className="flex justify-end items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => handleQuickAddStock(product)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-md transition-colors text-xs font-semibold border border-green-200"
                                    title="Añadir Stock"
                                >
                                    <PlusCircle className="w-3.5 h-3.5" />
                                    Stock
                                </button>
                                <button 
                                    onClick={() => handleEdit(product)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Editar Producto"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => handleDelete(product.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </td>
                        </tr>
                    )
                })}
              </tbody>
            </table>
            {filteredInventory.length === 0 && (
                <div className="flex flex-col items-center justify-center h-80 text-center p-6 text-slate-400">
                    <Package className="w-16 h-16 mb-4 text-slate-300 stroke-[1.5]" />
                    {inventory.length === 0 ? (
                      <div className="max-w-md">
                        <h3 className="text-base font-bold text-slate-800 mb-1">Tu inventario local está vacío</h3>
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                          Esto puede ocurrir si tu base de datos de Supabase se restableció y borró la copia local activa. ¡No te preocupes! Si tenías datos guardados, puedes recuperarlos fácilmente.
                        </p>
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-800 text-left mb-4 leading-relaxed">
                          <strong className="block text-indigo-950 font-bold mb-1">💡 ¿Cómo recuperar tus productos?</strong>
                          Haz clic en el botón <strong className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-950">Importar / Restaurar JSON</strong> en la barra superior. Allí encontrarás el panel para subir tu archivo JSON de respaldo o buscar copias automáticas en el navegador.
                        </div>
                      </div>
                    ) : (
                      <p>No se encontraron productos que coincidan con la búsqueda o el filtro.</p>
                    )}
                </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 overflow-y-auto">
          <div className="max-w-xl mx-auto space-y-4">
            
            <div className="flex gap-2 items-end">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Código de Barras</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={newProduct.barcode || ''}
                            onChange={(e) => setNewProduct({...newProduct, barcode: e.target.value})}
                            placeholder="Escanea o escribe el código"
                            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                        />
                         <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                </div>
                <button 
                    onClick={() => setShowScanner(true)}
                    className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
                    title="Escanear con Cámara"
                >
                    <ScanBarcode className="w-5 h-5" />
                    <span className="text-sm">Escanear</span>
                </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Producto</label>
              <input
                type="text"
                value={newProduct.name || ''}
                onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                    <select
                        value={newProduct.category}
                        onChange={(e) => setNewProduct({...newProduct, category: e.target.value as ProductCategory})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                        {Object.values(ProductCategory).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Unidad de Medida</label>
                     <input
                        type="text"
                        placeholder="ej. Caja, Unidad"
                        value={newProduct.unit}
                        onChange={(e) => setNewProduct({...newProduct, unit: e.target.value})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Moneda Base</label>
                     <select
                        value={newProduct.currency}
                        onChange={(e) => setNewProduct({...newProduct, currency: e.target.value as Currency})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                        <option value={Currency.USD}>USD (Dólar)</option>
                        <option value={Currency.BSF}>BsF (Bolívar)</option>
                    </select>
                </div>
                <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Costo (Opcional)</label>
                     <input
                        type="number"
                        value={newProduct.cost === 0 ? '' : newProduct.cost}
                        onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            const margin = newProduct.profitMargin || 0;
                            // Update price if profit margin is set
                            const newPrice = margin > 0 ? Number((val * (1 + margin / 100)).toFixed(2)) : newProduct.price;
                            setNewProduct({...newProduct, cost: val, price: newPrice});
                        }}
                        placeholder="0.00"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">% Ganancia (Opcional)</label>
                     <input
                        type="number"
                        value={newProduct.profitMargin === 0 ? '' : newProduct.profitMargin}
                        onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            const cost = newProduct.cost || 0;
                            // Update price based on cost and new margin
                            const newPrice = cost > 0 ? Number((cost * (1 + val / 100)).toFixed(2)) : newProduct.price;
                            setNewProduct({...newProduct, profitMargin: val, price: newPrice});
                        }}
                        placeholder="0%"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>
                <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Precio de Venta</label>
                     <input
                        type="number"
                        value={newProduct.price === 0 ? '' : newProduct.price}
                        onChange={(e) => setNewProduct({...newProduct, price: parseFloat(e.target.value)})}
                        placeholder="0.00"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-blue-50/50"
                    />
                </div>
            </div>

             <div className="grid grid-cols-2 gap-4">
                <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Unidades por Caja/Paquete</label>
                     <input
                        type="number"
                        value={newProduct.unitsPerCase}
                        onChange={(e) => setNewProduct({...newProduct, unitsPerCase: parseFloat(e.target.value)})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>
                <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">
                         {newProduct.id ? 'Existencia / Stock Actual' : 'Existencia Inicial'}
                     </label>
                     <input
                        type="number"
                        value={newProduct.stock}
                        onChange={(e) => setNewProduct({...newProduct, stock: parseFloat(e.target.value)})}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>
            </div>

            <button
                onClick={handleSaveProduct}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors mt-4 flex items-center justify-center gap-2"
            >
                <Save className="w-5 h-5" />
                {newProduct.id ? 'Actualizar Producto' : 'Guardar Producto'}
            </button>

          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;