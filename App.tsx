import React, { useState, useEffect, useMemo } from 'react';
import ExchangeRate from './components/ExchangeRate';
import Inventory from './components/Inventory';
import SalesSystem from './components/SalesSystem';
import Reports from './components/Reports';
import Credits from './components/Credits';
import AIAssistant from './components/AIAssistant';
import { Product, Sale } from './types';
import { supabaseService } from './services/supabaseService';

export interface SyncStatus {
  connected: boolean;
  sheetsConfigured: boolean; // Indica si las tablas de Supabase están listas y configuradas
  missingSheets: string[]; // Lista de tablas faltantes en Supabase
  loading: boolean;
  error?: string;
  dbType: 'Supabase' | 'None';
}

import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  BrainCircuit, 
  Calculator, 
  Cloud, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  X, 
  Copy, 
  RefreshCw,
  User, 
  Download,
  Smartphone
} from 'lucide-react';

const App: React.FC = () => {
  // --- Estados Persistentes (Caché local fallback) ---
  const [rate, setRate] = useState<number>(() => {
    const saved = localStorage.getItem('venstore_rate');
    return saved ? parseFloat(saved) : 36.5; // Tasa por defecto
  });

  const [inventory, setInventory] = useState<Product[]>(() => {
    const saved = localStorage.getItem('venstore_inventory');
    return saved ? JSON.parse(saved) : [];
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem('venstore_sales');
    if (!saved) return [];
    try {
      const parsed: Sale[] = JSON.parse(saved);
      const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
      return parsed.filter(s => s.timestamp >= oneYearAgo); // Retención de 1 año
    } catch {
      return [];
    }
  });

  const [activeTab, setActiveTab] = useState<'RATE' | 'INVENTORY' | 'SALES' | 'CREDITS' | 'REPORTS' | 'AI'>('SALES');

  const [criticalThreshold, setCriticalThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('venstore_critical_threshold');
    return saved ? parseInt(saved, 10) : 5; // Stock crítico por defecto
  });

  const criticalProducts = useMemo(() => {
    return inventory.filter(p => p.stock <= criticalThreshold);
  }, [inventory, criticalThreshold]);

  // --- Estados de Sincronización de Base de Datos ---
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    connected: false,
    sheetsConfigured: false,
    missingSheets: [],
    loading: true,
    dbType: 'None'
  });
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showBackupPanel, setShowBackupPanel] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);

  // Referencias para evitar clausuras obsoletas (stale closures) en callbacks asíncronos
  const inventoryRef = React.useRef(inventory);
  const salesRef = React.useRef(sales);
  const rateRef = React.useRef(rate);
  const criticalThresholdRef = React.useRef(criticalThreshold);

  React.useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  React.useEffect(() => {
    salesRef.current = sales;
  }, [sales]);

  React.useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  React.useEffect(() => {
    criticalThresholdRef.current = criticalThreshold;
  }, [criticalThreshold]);

  // Estados para configuración manual de Supabase
  const [dbConfigUrl, setDbConfigUrl] = useState(() => supabaseService.getCredentials().url);
  const [dbConfigKey, setDbConfigKey] = useState(() => supabaseService.getCredentials().anonKey);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [rlsErrorState, setRlsErrorState] = useState<{ tableName: string; errorMsg: string } | null>(null);
  const [phoneConnectedToast, setPhoneConnectedToast] = useState(false);

  useEffect(() => {
    // Escuchar errores RLS (Row Level Security) de Supabase
    supabaseService.setRlsErrorListener((tableName, errorMsg) => {
      setRlsErrorState({ tableName, errorMsg });
    });
  }, []);

  const handleDbSaveAndConnect = () => {
    setRlsErrorState(null);
    supabaseService.updateCredentials(dbConfigUrl, dbConfigKey);
    setSaveSuccess(true);
    syncWithDatabase();
  };

  // --- Guardar en LocalStorage cada vez que cambien los estados ---
  useEffect(() => {
    localStorage.setItem('venstore_rate', rate.toString());
  }, [rate]);

  useEffect(() => {
    if (inventory && inventory.length > 0) {
      localStorage.setItem('venstore_inventory', JSON.stringify(inventory));
      // Guardar también una copia de seguridad diaria rodante (0-6) para protección extra
      try {
        const day = new Date().getDay();
        localStorage.setItem(`venstore_backup_inventory_day_${day}`, JSON.stringify(inventory));
      } catch (e) {
        console.error("Error al guardar copia de seguridad rodante de inventario:", e);
      }
    } else {
      // Si el inventario está vacío, sólo guardamos si no existía antes, para evitar borrar accidentalmente por desincronización
      const saved = localStorage.getItem('venstore_inventory');
      if (!saved || saved === '[]') {
        localStorage.setItem('venstore_inventory', JSON.stringify(inventory));
      }
    }
  }, [inventory]);

  useEffect(() => {
    if (sales && sales.length > 0) {
      localStorage.setItem('venstore_sales', JSON.stringify(sales));
      // Guardar también una copia de seguridad diaria rodante (0-6) para protección extra
      try {
        const day = new Date().getDay();
        localStorage.setItem(`venstore_backup_sales_day_${day}`, JSON.stringify(sales));
      } catch (e) {
        console.error("Error al guardar copia de seguridad rodante de ventas:", e);
      }
    } else {
      const saved = localStorage.getItem('venstore_sales');
      if (!saved || saved === '[]') {
        localStorage.setItem('venstore_sales', JSON.stringify(sales));
      }
    }
  }, [sales]);

  useEffect(() => {
    localStorage.setItem('venstore_critical_threshold', criticalThreshold.toString());
  }, [criticalThreshold]);

  // --- Helpers de la cola de sincronización Offline ---
  const getPendingQueue = () => {
    try {
      return {
        sales: JSON.parse(localStorage.getItem('pending_sales') || '[]') as Sale[],
        saleDeletions: JSON.parse(localStorage.getItem('pending_sale_deletions') || '[]') as string[],
        products: JSON.parse(localStorage.getItem('pending_products') || '[]') as Product[],
        productDeletions: JSON.parse(localStorage.getItem('pending_product_deletions') || '[]') as string[],
        rate: localStorage.getItem('pending_rate') ? parseFloat(localStorage.getItem('pending_rate')!) : null,
        threshold: localStorage.getItem('pending_threshold') ? parseInt(localStorage.getItem('pending_threshold')!, 10) : null,
      };
    } catch {
      return { sales: [], saleDeletions: [], products: [], productDeletions: [], rate: null, threshold: null };
    }
  };

  const savePendingQueue = (queue: ReturnType<typeof getPendingQueue>) => {
    localStorage.setItem('pending_sales', JSON.stringify(queue.sales));
    localStorage.setItem('pending_sale_deletions', JSON.stringify(queue.saleDeletions));
    localStorage.setItem('pending_products', JSON.stringify(queue.products));
    localStorage.setItem('pending_product_deletions', JSON.stringify(queue.productDeletions));
    if (queue.rate !== null) localStorage.setItem('pending_rate', queue.rate.toString());
    else localStorage.removeItem('pending_rate');
    if (queue.threshold !== null) localStorage.setItem('pending_threshold', queue.threshold.toString());
    else localStorage.removeItem('pending_threshold');
  };

  // Mezcla datos locales guardados y en memoria con lo que viene de la nube sin perder transacciones
  const mergeDbAndLocalQueue = (dbRate: number, dbInventory: Product[], dbSales: Sale[], dbThreshold: number) => {
    const queue = getPendingQueue();

    // --- 1. UNIFICAR VENTAS ---
    let savedLocalSales: Sale[] = [];
    try {
      const raw = localStorage.getItem('venstore_sales');
      if (raw) savedLocalSales = JSON.parse(raw);
    } catch {
      savedLocalSales = [];
    }

    const salesMap = new Map<string, Sale>();

    // Cargar de localStorage y estado actual en memoria
    savedLocalSales.forEach(s => { if (s && s.id) salesMap.set(s.id, s); });
    salesRef.current.forEach(s => { if (s && s.id) salesMap.set(s.id, s); });

    // Cargar lo retornado de Supabase
    dbSales.forEach(s => { if (s && s.id) salesMap.set(s.id, s); });

    // Aplicar eliminaciones pendientes
    if (queue.saleDeletions.length > 0) {
      queue.saleDeletions.forEach(delId => salesMap.delete(delId));
    }

    // Aplicar ventas pendientes en la cola (las más recientes locales)
    queue.sales.forEach(qs => { if (qs && qs.id) salesMap.set(qs.id, qs); });

    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const mergedSales = Array.from(salesMap.values())
      .filter(s => s.timestamp >= oneYearAgo)
      .sort((a, b) => a.timestamp - b.timestamp);


    // --- 2. UNIFICAR INVENTARIO ---
    let savedLocalInventory: Product[] = [];
    try {
      const raw = localStorage.getItem('venstore_inventory');
      if (raw) savedLocalInventory = JSON.parse(raw);
    } catch {
      savedLocalInventory = [];
    }

    const inventoryMap = new Map<string, Product>();

    savedLocalInventory.forEach(p => { if (p && p.id) inventoryMap.set(p.id, p); });
    inventoryRef.current.forEach(p => { if (p && p.id) inventoryMap.set(p.id, p); });

    dbInventory.forEach(p => { if (p && p.id) inventoryMap.set(p.id, p); });

    if (queue.productDeletions.length > 0) {
      queue.productDeletions.forEach(delId => inventoryMap.delete(delId));
    }

    queue.products.forEach(qp => { if (qp && qp.id) inventoryMap.set(qp.id, qp); });

    const mergedInventory = Array.from(inventoryMap.values())
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const finalRate = queue.rate !== null ? queue.rate : dbRate;
    const finalThreshold = queue.threshold !== null ? queue.threshold : dbThreshold;

    return {
      rate: finalRate,
      inventory: mergedInventory,
      sales: mergedSales,
      threshold: finalThreshold
    };
  };

  // Sube todos los cambios pendientes acumulados localmente a Supabase
  const processSyncQueue = async (): Promise<boolean> => {
    if (!supabaseService.isEnabled()) return false;

    try {
      const conn = await supabaseService.checkConnection();
      if (!conn.success) return false;

      const queue = getPendingQueue();
      let queueModified = false;

      // 1. Sincronizar tasa de cambio
      if (queue.rate !== null) {
        const ok = await supabaseService.saveExchangeRate(queue.rate);
        if (ok) {
          queue.rate = null;
          queueModified = true;
        }
      }

      // 2. Sincronizar stock crítico
      if (queue.threshold !== null) {
        const ok = await supabaseService.saveCriticalThreshold(queue.threshold);
        if (ok) {
          queue.threshold = null;
          queueModified = true;
        }
      }

      // 3. Sincronizar eliminaciones de productos
      if (queue.productDeletions.length > 0) {
        const remaining: string[] = [];
        for (const id of queue.productDeletions) {
          const ok = await supabaseService.deleteProduct(id);
          if (!ok) remaining.push(id);
        }
        if (remaining.length !== queue.productDeletions.length) {
          queue.productDeletions = remaining;
          queueModified = true;
        }
      }

      // 4. Sincronizar productos nuevos/actualizados
      if (queue.products.length > 0) {
        const remaining: Product[] = [];
        for (const prod of queue.products) {
          const ok = await supabaseService.saveProduct(prod, false);
          if (!ok) remaining.push(prod);
        }
        if (remaining.length !== queue.products.length) {
          queue.products = remaining;
          queueModified = true;
        }
      }

      // 5. Sincronizar eliminaciones de ventas
      if (queue.saleDeletions.length > 0) {
        const remaining: string[] = [];
        for (const id of queue.saleDeletions) {
          const ok = await supabaseService.deleteSale(id);
          if (!ok) remaining.push(id);
        }
        if (remaining.length !== queue.saleDeletions.length) {
          queue.saleDeletions = remaining;
          queueModified = true;
        }
      }

      // 6. Sincronizar ventas y abonos
      if (queue.sales.length > 0) {
        const remaining: Sale[] = [];
        for (const sale of queue.sales) {
          const ok = await supabaseService.saveSale(sale, inventoryRef.current);
          if (!ok) remaining.push(sale);
        }
        if (remaining.length !== queue.sales.length) {
          queue.sales = remaining;
          queueModified = true;
        }
      }

      if (queueModified) {
        savePendingQueue(queue);
      }

      const freshQueue = getPendingQueue();
      const allDone = freshQueue.sales.length === 0 &&
                      freshQueue.saleDeletions.length === 0 &&
                      freshQueue.products.length === 0 &&
                      freshQueue.productDeletions.length === 0 &&
                      freshQueue.rate === null &&
                      freshQueue.threshold === null;

      return allDone;
    } catch (err) {
      console.error('Error al procesar la cola de sincronización:', err);
      return false;
    }
  };

  // Dispara la sincronización en segundo plano con fusión segura
  const triggerBackgroundSync = () => {
    if (backgroundSyncing) return;
    setBackgroundSyncing(true);
    setTimeout(async () => {
      try {
        await processSyncQueue();

        let dbRate = rateRef.current;
        let dbInventory: Product[] = [];
        let dbSales: Sale[] = [];
        let dbThreshold = criticalThresholdRef.current;

        try {
          dbRate = await supabaseService.fetchExchangeRate(rateRef.current);
          dbInventory = await supabaseService.fetchInventory();
          dbSales = await supabaseService.fetchSales();
          dbThreshold = await supabaseService.fetchCriticalThreshold(criticalThresholdRef.current);
        } catch (e) {
          console.warn('Error fetching fresh DB data in background:', e);
        }

        const merged = mergeDbAndLocalQueue(dbRate, dbInventory, dbSales, dbThreshold);
        setRate(merged.rate);
        setInventory(merged.inventory);
        setSales(merged.sales);
        setCriticalThreshold(merged.threshold);

        setSyncStatus({
          connected: true,
          sheetsConfigured: true,
          missingSheets: [],
          loading: false,
          dbType: 'Supabase'
        });
      } catch (err) {
        console.warn('La sincronización asíncrona falló:', err);
      } finally {
        setBackgroundSyncing(false);
      }
    }, 100);
  };

  // --- Sincronizar al iniciar o al hacer clic manual ---
  const syncWithDatabase = async () => {
    setRlsErrorState(null);
    setSyncStatus(prev => ({ ...prev, loading: true, error: undefined }));
    try {
      if (supabaseService.isEnabled()) {
        const conn = await supabaseService.checkConnection();
        if (conn.success) {
          // 1. Sincronizar cola local pendiente primero
          const allProcessed = await processSyncQueue();
          
          // 2. Traer el estado fresco de Supabase
          let dbRate = rate;
          let dbInventory: Product[] = [];
          let dbSales: Sale[] = [];
          let dbThreshold = criticalThreshold;

          try {
            dbRate = await supabaseService.fetchExchangeRate(rate);
            dbInventory = await supabaseService.fetchInventory();
            dbSales = await supabaseService.fetchSales();
            dbThreshold = await supabaseService.fetchCriticalThreshold(criticalThreshold);
          } catch (e) {
            console.warn("Fallo al consultar Supabase en syncWithDatabase:", e);
          }

          // 3. Unificar base de datos con cualquier cambio local residual
          const merged = mergeDbAndLocalQueue(dbRate, dbInventory, dbSales, dbThreshold);

          setRate(merged.rate);
          setInventory(merged.inventory);
          setSales(merged.sales);
          setCriticalThreshold(merged.threshold);
          
          setSyncStatus({
            connected: true,
            sheetsConfigured: true,
            missingSheets: [],
            loading: false,
            dbType: 'Supabase',
            error: allProcessed ? undefined : 'Hay transacciones pendientes que no se pudieron sincronizar por políticas RLS o error de red.'
          });
        } else if (conn.isOffline) {
          // Modo sin conexión. No sobreescribir datos locales con vacíos, simplemente activar el "Modo Local"
          setSyncStatus({
            connected: false,
            sheetsConfigured: true,
            missingSheets: [],
            loading: false,
            error: 'Trabajando sin conexión (Modo Offline). Los datos se guardan en el navegador y se sincronizarán al recuperar internet.',
            dbType: 'Supabase'
          });
        } else {
          // Tablas incompletas o error en la base de datos
          setSyncStatus({
            connected: true,
            sheetsConfigured: false,
            missingSheets: conn.missingTables,
            loading: false,
            error: conn.error || 'Estructura de tablas incompleta en Supabase',
            dbType: 'Supabase'
          });
        }
      } else {
        setSyncStatus({
          connected: false,
          sheetsConfigured: false,
          missingSheets: ['config', 'products', 'sales'],
          loading: false,
          error: 'Credenciales de Supabase no configuradas o incompletas.',
          dbType: 'Supabase'
        });
      }
    } catch (err: any) {
      setSyncStatus({
        connected: false,
        sheetsConfigured: false,
        missingSheets: [],
        loading: false,
        error: err?.message || 'Fallo al conectar con Supabase',
        dbType: 'Supabase'
      });
    }
  };

  useEffect(() => {
    supabaseService.setRlsErrorListener((tableName, msg) => {
      setRlsErrorState({ tableName, errorMsg: msg });
    });

    // Leer posibles credenciales compartidas vía enlace URL o código QR
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramUrl = urlParams.get('supabase_url');
      const paramKey = urlParams.get('supabase_key') || urlParams.get('supabase_anon_key');
      if (paramUrl && paramKey) {
        supabaseService.updateCredentials(paramUrl, paramKey);
        setDbConfigUrl(paramUrl);
        setDbConfigKey(paramKey);
        setPhoneConnectedToast(true);
        // Limpiar parámetros de la URL de forma limpia
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {
      console.warn('Error leyendo credenciales de la URL:', e);
    }

    syncWithDatabase();

    // Suscripción WebSockets en Tiempo Real (Realtime Push Notification < 300ms)
    let unsubscribeRealtime: (() => void) | null = null;
    if (supabaseService.isEnabled()) {
      unsubscribeRealtime = supabaseService.subscribeToRealtime((tableName) => {
        console.log(`⚡ Evento en tiempo real recibido en la tabla '${tableName}'. Actualizando interfaz...`);
        triggerBackgroundSync();
      });
    }

    // Polling de respaldo en segundo plano cada 4 segundos
    const syncInterval = setInterval(() => {
      if (supabaseService.isEnabled()) {
        triggerBackgroundSync();
      }
    }, 4000);

    // Re-sincronizar al volver a la pestaña o al recuperar internet
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && supabaseService.isEnabled()) {
        syncWithDatabase();
      }
    };
    const handleOnline = () => {
      if (supabaseService.isEnabled()) {
        syncWithDatabase();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      if (unsubscribeRealtime) unsubscribeRealtime();
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // --- Manejadores de Operaciones (Mutaciones con Sync dinámico automático) ---

  const handleAddProduct = async (product: Product) => {
    setInventory(prev => [...prev, product]);

    const queue = getPendingQueue();
    queue.products = [...queue.products.filter(p => p.id !== product.id), product];
    savePendingQueue(queue);

    triggerBackgroundSync();
  };

  const handleUpdateProduct = async (product: Product) => {
    setInventory(prev => prev.map(p => p.id === product.id ? product : p));

    const queue = getPendingQueue();
    queue.products = [...queue.products.filter(p => p.id !== product.id), product];
    savePendingQueue(queue);

    triggerBackgroundSync();
  };

  const handleDeleteProduct = async (id: string) => {
    setInventory(prev => prev.filter(p => p.id !== id));

    const queue = getPendingQueue();
    queue.products = queue.products.filter(p => p.id !== id);
    if (!queue.productDeletions.includes(id)) {
      queue.productDeletions.push(id);
    }
    savePendingQueue(queue);

    triggerBackgroundSync();
  };

  const handleUpdateRate = async (newRate: number) => {
    setRate(newRate);

    const queue = getPendingQueue();
    queue.rate = newRate;
    savePendingQueue(queue);

    triggerBackgroundSync();
  };

  const handleUpdateCriticalThreshold = async (newThreshold: number) => {
    setCriticalThreshold(newThreshold);

    const queue = getPendingQueue();
    queue.threshold = newThreshold;
    savePendingQueue(queue);

    triggerBackgroundSync();
  };

  // Registra ventas normales, créditos y abonos/liquidaciones
  const handleProcessSale = async (saleOrSales: Sale | Sale[], updatedInventory: Product[]) => {
    const salesList = Array.isArray(saleOrSales) ? saleOrSales : [saleOrSales];
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    setSales(prev => [...prev.filter(s => s.timestamp >= oneYearAgo), ...salesList]);
    setInventory(updatedInventory);

    const queue = getPendingQueue();
    
    // Agregar ventas a la cola
    for (const sale of salesList) {
      queue.sales = [...queue.sales.filter(s => s.id !== sale.id), sale];
    }

    // Agregar stocks de productos involucrados en la venta a la cola para actualizar en Supabase
    for (const sale of salesList) {
      for (const item of sale.items) {
        if (!item.isManual && item.productId) {
          const prod = updatedInventory.find(p => p.id === item.productId);
          if (prod) {
            queue.products = [...queue.products.filter(p => p.id !== prod.id), prod];
          }
        }
      }
    }

    savePendingQueue(queue);
    triggerBackgroundSync();
  };

  // Elimina una venta (restando o devolviendo stocks automáticamente si aplica)
  const handleDeleteSale = async (saleId: string) => {
    const saleToDelete = sales.find(s => s.id === saleId);
    if (!saleToDelete) return;

    // Calcular inventario restaurado
    const updatedInventory = [...inventory];
    if (saleToDelete.items && Array.isArray(saleToDelete.items)) {
      saleToDelete.items.forEach(item => {
        if (!item.isManual && item.productId) {
          const idx = updatedInventory.findIndex(p => p.id === item.productId);
          if (idx !== -1) {
            updatedInventory[idx] = {
              ...updatedInventory[idx],
              stock: updatedInventory[idx].stock + item.quantity
            };
          }
        }
      });
    }

    setSales(prev => prev.filter(s => s.id !== saleId));
    setInventory(updatedInventory);

    const queue = getPendingQueue();
    
    queue.sales = queue.sales.filter(s => s.id !== saleId);
    if (!queue.saleDeletions.includes(saleId)) {
      queue.saleDeletions.push(saleId);
    }

    // Agregar productos actualizados a la cola
    if (saleToDelete.items && Array.isArray(saleToDelete.items)) {
      for (const item of saleToDelete.items) {
        if (!item.isManual && item.productId) {
          const prod = updatedInventory.find(p => p.id === item.productId);
          if (prod) {
            queue.products = [...queue.products.filter(p => p.id !== prod.id), prod];
          }
        }
      }
    }

    savePendingQueue(queue);
    triggerBackgroundSync();
  };

  const handleUpdateSale = async (updatedSale: Sale) => {
    setSales(prev => prev.map(s => s.id === updatedSale.id ? updatedSale : s));

    const queue = getPendingQueue();
    queue.sales = [...queue.sales.filter(s => s.id !== updatedSale.id), updatedSale];
    savePendingQueue(queue);

    triggerBackgroundSync();
  };

  // Helper para copiar texto al portapapeles
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('¡Copiado al portapapeles! Listo para pegar en el editor SQL de Supabase.');
  };

  // --- Escaneo e Historial de Copias de Seguridad de LocalStorage ---
  const [detectedBackups, setDetectedBackups] = useState<Array<{
    key: string;
    type: 'inventory' | 'sales' | 'unknown';
    count: number;
    preview: string;
    dayName?: string;
  }>>([]);

  const scanLocalStorage = () => {
    const found: typeof detectedBackups = [];
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Detectar si parece inventario o historial de ventas
          const sample = parsed[0];
          let type: 'inventory' | 'sales' | 'unknown' = 'unknown';
          let preview = '';
          
          if (sample && typeof sample === 'object') {
            if ('name' in sample && 'price' in sample) {
              type = 'inventory';
              preview = parsed.slice(0, 3).map((p: any) => p.name).join(', ') + (parsed.length > 3 ? '...' : '');
            } else if ('timestamp' in sample && ('totalUSD' in sample || 'items' in sample)) {
              type = 'sales';
              preview = `Venta o movimiento del cliente ${sample.customerName || 'General'} por $${Math.abs(sample.totalUSD).toFixed(2)}`;
            }
          }
          
          if (type !== 'unknown') {
            // Si el nombre de la clave termina en un número de día (0-6)
            let dayName = undefined;
            const match = key.match(/_day_(\d)$/);
            if (match) {
              const dayIndex = parseInt(match[1], 10);
              dayName = days[dayIndex] || undefined;
            }

            found.push({
              key,
              type,
              count: parsed.length,
              preview,
              dayName
            });
          }
        }
      } catch (e) {
        // Ignorar claves que no sean JSON válido o arrays
      }
    }
    
    // Ordenar para mostrar los de hoy o nombres conocidos más arriba
    found.sort((a, b) => {
      if (a.key.includes('backup') && !b.key.includes('backup')) return 1;
      if (!a.key.includes('backup') && b.key.includes('backup')) return -1;
      return a.key.localeCompare(b.key);
    });

    setDetectedBackups(found);
  };

  // Escanear cada vez que se abre el panel o cambia el inventario/ventas
  useEffect(() => {
    if (showBackupPanel) {
      scanLocalStorage();
    }
  }, [showBackupPanel, inventory, sales]);

  const handleRestoreDetectedBackup = (backup: typeof detectedBackups[0]) => {
    try {
      const value = localStorage.getItem(backup.key);
      if (!value) return;
      const parsed = JSON.parse(value);
      
      if (backup.type === 'inventory') {
        if (confirm(`¿Deseas restaurar ${parsed.length} productos desde el respaldo "${backup.key}"? Se unirá con tu lista actual y se subirá a la nube.`)) {
          setInventory(prev => {
            const updated = [...prev];
            parsed.forEach((vp: any) => {
              const idx = updated.findIndex(p => p.id === vp.id);
              if (idx >= 0) {
                updated[idx] = vp;
              } else {
                updated.push(vp);
              }
            });
            return updated;
          });
          
          // Cola de sincronización
          const queue = getPendingQueue();
          parsed.forEach((vp: any) => {
            queue.products = [...queue.products.filter(p => p.id !== vp.id), vp];
          });
          savePendingQueue(queue);
          
          alert('¡Inventario recuperado exitosamente! Los productos han vuelto a la lista. Sincronizando con Supabase en segundo plano...');
          triggerBackgroundSync();
          scanLocalStorage();
        }
      } else if (backup.type === 'sales') {
        if (confirm(`¿Deseas restaurar ${parsed.length} ventas/créditos deudores desde el respaldo "${backup.key}"? Se unirá con tu lista actual y se subirá a la nube.`)) {
          setSales(prev => {
            const updated = [...prev];
            parsed.forEach((vs: any) => {
              const idx = updated.findIndex(s => s.id === vs.id);
              if (idx >= 0) {
                updated[idx] = vs;
              } else {
                updated.push(vs);
              }
            });
            return updated;
          });
          
          // Cola de sincronización
          const queue = getPendingQueue();
          parsed.forEach((vs: any) => {
            queue.sales = [...queue.sales.filter(s => s.id !== vs.id), vs];
          });
          savePendingQueue(queue);
          
          alert('¡Ventas y cuentas por cobrar (créditos) recuperadas exitosamente! Sincronizando con Supabase en segundo plano...');
          triggerBackgroundSync();
          scanLocalStorage();
        }
      }
    } catch (err: any) {
      alert('Error al restaurar los datos: ' + err.message);
    }
  };

  // Exportar Inventario Local como JSON
  const handleExportLocalInventory = () => {
    try {
      const localData = localStorage.getItem('venstore_inventory');
      const dataToExport = localData ? JSON.parse(localData) : inventory;
      
      if (!dataToExport || dataToExport.length === 0) {
        alert('No hay productos en el inventario local para exportar.');
        return;
      }
      
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventario_local_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al exportar el inventario: ' + err.message);
    }
  };

  // Exportar Ventas Locales como JSON (para respaldar créditos e historial de ventas)
  const handleExportLocalSales = () => {
    try {
      const localData = localStorage.getItem('venstore_sales');
      const dataToExport = localData ? JSON.parse(localData) : sales;
      
      if (!dataToExport || dataToExport.length === 0) {
        alert('No hay ventas en el historial local para exportar.');
        return;
      }
      
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ventas_local_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al exportar el historial de ventas: ' + err.message);
    }
  };

  // Importar Inventario desde un Archivo JSON
  const handleImportLocalInventory = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const importedData = JSON.parse(text);

        if (!Array.isArray(importedData)) {
          alert('El archivo JSON debe contener una lista (array) de productos.');
          return;
        }

        const validProducts = importedData.filter(p => p && typeof p === 'object' && p.id && p.name);
        
        if (validProducts.length === 0) {
          alert('No se encontraron productos válidos en el archivo JSON.');
          return;
        }

        if (confirm(`Se importarán ${validProducts.length} productos al inventario. ¿Deseas continuar?`)) {
          setInventory(prev => {
            const updated = [...prev];
            validProducts.forEach(vp => {
              const idx = updated.findIndex(p => p.id === vp.id);
              if (idx >= 0) {
                updated[idx] = vp;
              } else {
                updated.push(vp);
              }
            });
            return updated;
          });

          // Agregar todos los productos importados a la cola de sincronización pendiente
          const queue = getPendingQueue();
          validProducts.forEach(vp => {
            queue.products = [...queue.products.filter(p => p.id !== vp.id), vp];
          });
          savePendingQueue(queue);

          alert(`¡Se importaron ${validProducts.length} productos con éxito! Iniciando sincronización en segundo plano...`);
          triggerBackgroundSync();
        }
      } catch (err: any) {
        alert('Error al leer e importar el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Importar Ventas desde un Archivo JSON (para restaurar créditos e historial de ventas)
  const handleImportLocalSales = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const importedData = JSON.parse(text);

        if (!Array.isArray(importedData)) {
          alert('El archivo JSON debe contener una lista (array) de ventas.');
          return;
        }

        const validSales = importedData.filter(s => s && typeof s === 'object' && s.id && typeof s.timestamp === 'number');
        
        if (validSales.length === 0) {
          alert('No se encontraron ventas válidas en el archivo JSON.');
          return;
        }

        if (confirm(`Se importarán ${validSales.length} ventas y cuentas por cobrar (créditos). ¿Deseas continuar?`)) {
          setSales(prev => {
            const updated = [...prev];
            validSales.forEach(vs => {
              const idx = updated.findIndex(s => s.id === vs.id);
              if (idx >= 0) {
                updated[idx] = vs;
              } else {
                updated.push(vs);
              }
            });
            return updated;
          });

          // Agregar todos los importados a la cola de sincronización pendiente
          const queue = getPendingQueue();
          validSales.forEach(vs => {
            queue.sales = [...queue.sales.filter(s => s.id !== vs.id), vs];
          });
          savePendingQueue(queue);

          alert(`¡Se importaron ${validSales.length} ventas/créditos con éxito! Iniciando sincronización en segundo plano...`);
          triggerBackgroundSync();
        }
      } catch (err: any) {
        alert('Error al leer e importar el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const NavButton = ({ id, label, icon: Icon, active, badge }: { id: string, label: string, icon: any, active: boolean, badge?: React.ReactNode }) => (
    <button
      onClick={() => setActiveTab(id as any)}
      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 border select-none relative ${
        active 
          ? 'bg-indigo-950 text-white border-indigo-950 shadow-md' 
          : 'bg-white text-indigo-950 hover:bg-violet-50/50 border-violet-100/85'
      }`}
    >
      <Icon className="w-4 h-4 text-violet-600" />
      <span>{label}</span>
      {badge}
    </button>
  );

  return (
    <div className="min-h-screen bg-violet-50/30 text-indigo-950 font-sans">
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Encabezado Principal */}
        <header className="mb-6 flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl border border-violet-100/70 shadow-sm gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-black text-indigo-950 tracking-tight">
              MINI MARKET BRICAR
            </h1>
            <p className="text-slate-500 text-sm mt-1">
               Sistema de Gestión de Inventario y Ventas (Sincronizado con Supabase)
            </p>
          </div>

          {/* Widget del Estado de Sincronización */}
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2">
            <button
              onClick={handleExportLocalInventory}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white transition-colors px-4 py-2.5 rounded-full text-xs font-bold shadow-sm cursor-pointer"
              title="Exportar inventario guardado localmente"
            >
              <Download className="w-4 h-4" />
              Exportar Inventario Local como JSON
            </button>

            <button
              onClick={() => setShowBackupPanel(prev => !prev)}
              className={`flex items-center gap-2 transition-colors px-4 py-2.5 rounded-full text-xs font-bold shadow-sm cursor-pointer border ${
                showBackupPanel 
                  ? 'bg-indigo-950 text-white border-indigo-950' 
                  : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}
              title="Panel para respaldar y recuperar inventario o ventas/créditos"
            >
              <RefreshCw className={`w-4 h-4 ${showBackupPanel ? 'animate-spin' : ''}`} />
              Importar / Restaurar JSON
            </button>

            {syncStatus.loading ? (
              <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-xs font-semibold border border-blue-100">
                <Loader2 className="w-4 h-4 animate-spin" />
                Conectando bdd...
              </div>
            ) : syncStatus.sheetsConfigured ? (
              <button 
                onClick={() => syncWithDatabase()}
                className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-100 hover:bg-emerald-100 transition-colors"
                title="Supabase Sincronizado. Clic para forzar recarga."
              >
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Supabase Activo
                {backgroundSyncing && <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />}
              </button>
            ) : (
              <button
                onClick={() => setShowSyncModal(true)}
                className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-xs font-semibold border border-amber-100 hover:bg-amber-100 transition-colors"
              >
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Configurar Supabase
              </button>
            )}

            {!syncStatus.loading && !syncStatus.connected && (
              <button
                onClick={() => syncWithDatabase()}
                className="flex items-center gap-2 bg-rose-50 text-rose-700 px-3 py-1.5 rounded-full text-xs font-semibold border border-rose-100 hover:bg-rose-100 transition-colors animate-pulse"
                title="No se pudo establecer conexión. Haga clic para intentar de nuevo."
              >
                <Cloud className="w-4 h-4" />
                Modo Local (Reconectar)
              </button>
            )}
          </div>
        </header>

        {/* Panel de Respaldo y Restauración de Datos */}
        {showBackupPanel && (
          <div className="mb-6 bg-white border border-indigo-100 rounded-2xl p-6 shadow-md animate-fade-in font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                Mantenimiento de Datos: Respaldos y Recuperación Manual (JSON)
              </h3>
              <button 
                onClick={() => setShowBackupPanel(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors text-xs font-bold"
              >
                Cerrar Panel ×
              </button>
            </div>
            
            <p className="text-slate-600 text-xs leading-relaxed mb-4">
              Usa este panel para recuperar tu información de inventario o tus cuentas de crédito/ventas a partir de archivos JSON que hayas exportado previamente en este u otro dispositivo. Al importar un archivo, los datos se unificarán localmente y se sincronizarán de forma automática con Supabase.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bloque Inventario */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1.5">
                    <span>📦</span> Gestión del Inventario de Productos
                  </h4>
                  <p className="text-slate-500 text-[11px] mb-3">Descarga tu lista de productos o restaura un inventario antiguo desde un archivo JSON.</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={handleExportLocalInventory}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white transition-colors px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Exportar Inventario (.json)
                  </button>
                  <label className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 transition-colors px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Cloud className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Importar Inventario (.json)</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportLocalInventory}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Bloque Ventas y Créditos */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1.5">
                    <span>👤</span> Historial de Ventas y Créditos
                  </h4>
                  <p className="text-slate-500 text-[11px] mb-3">Exporta el registro completo de ventas o recupera tus deudores y cuentas por cobrar (créditos) antiguos.</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={handleExportLocalSales}
                    className="bg-violet-600 hover:bg-violet-700 text-white transition-colors px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Exportar Ventas (.json)
                  </button>
                  <label className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 transition-colors px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Cloud className="w-3.5 h-3.5 text-violet-600" />
                    <span>Importar Ventas (.json)</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportLocalSales}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Lista de copias de seguridad autodetectadas en el navegador */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <h4 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1.5">
                <span>🔍</span> Copias de seguridad automáticas detectadas en este navegador
              </h4>
              {detectedBackups.length === 0 ? (
                <p className="text-slate-400 text-xs italic">
                  No se encontraron claves de datos anteriores o copias automáticas guardadas en este navegador.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                  {detectedBackups.map((b) => (
                    <div key={b.key} className="bg-slate-50 hover:bg-slate-100/80 transition-colors p-3.5 rounded-xl border border-slate-200/60 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-black uppercase text-[9px] px-1.5 py-0.5 rounded ${
                            b.type === 'inventory' ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'
                          }`}>
                            {b.type === 'inventory' ? '📦 Inventario' : '👤 Ventas / Créditos'}
                          </span>
                          <span className="font-bold text-slate-700 truncate" title={b.key}>
                            {b.dayName ? `Copia del ${b.dayName}` : b.key}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-1 truncate">
                          {b.count} registros • <span className="italic">{b.preview}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleRestoreDetectedBackup(b)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors px-3 py-1.5 rounded-lg text-[11px] font-bold shadow-sm shrink-0 cursor-pointer"
                      >
                        Recuperar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toast de Éxito al Vincular Dispositivo desde Enlace QR */}
        {phoneConnectedToast && (
          <div className="mb-6 bg-emerald-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between gap-4 animate-fade-in border-2 border-emerald-400">
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">📱</span>
              <div>
                <h4 className="font-bold text-sm">¡Dispositivo Vinculado Exitosamente!</h4>
                <p className="text-xs text-emerald-100 mt-0.5 leading-relaxed">
                  Este dispositivo ya está conectado en tiempo real a tu base de datos de Supabase. Todo lo que registres aquí (ventas, créditos e inventario) se reflejará de inmediato en tu computadora y otros teléfonos.
                </p>
              </div>
            </div>
            <button
              onClick={() => setPhoneConnectedToast(false)}
              className="bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer shadow-sm"
            >
              Entendido ×
            </button>
          </div>
        )}

        {/* Banner Prominente cuando Supabase no está conectado en este dispositivo */}
        {(!supabaseService.isEnabled() || (!syncStatus.loading && !syncStatus.connected)) && (
          <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 animate-fade-in">
            <div className="flex items-start md:items-center gap-3">
              <div className="bg-amber-100 p-2.5 rounded-xl text-amber-800 shrink-0 mt-0.5 md:mt-0">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                  ⚠️ Este dispositivo no está conectado a la Base de Datos Supabase
                </h4>
                <p className="text-amber-800 text-xs mt-0.5 leading-relaxed">
                  Para ver en este dispositivo las ventas, créditos e inventario de la computadora o teléfono principal, debes conectar Supabase o escanear el Código QR.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
              <button
                onClick={() => setShowSyncModal(true)}
                className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                Vincular Teléfono / Conectar Supabase
              </button>
            </div>
          </div>
        )}

        {/* Banner de Advertencia de Estructura de Tablas Faltante */}
        {!syncStatus.loading && syncStatus.connected && !syncStatus.sheetsConfigured && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h4 className="font-bold text-amber-900 text-sm">
                  Falta Configurar Tablas en Supabase
                </h4>
                <p className="text-amber-700 text-xs mt-0.5">
                  Conectado correctamente a Supabase, pero tu base de datos necesita las tablas: 
                  <span className="font-semibold text-amber-950"> {syncStatus.missingSheets.join(', ')}</span> con la estructura requerida.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSyncModal(true)}
              className="bg-amber-600 text-white hover:bg-amber-700 transition-colors px-4 py-2 rounded-lg text-xs font-bold shrink-0 shadow-sm"
            >
              Ver Instrucciones de Configuración
            </button>
          </div>
        )}

        {/* Banner de Advertencia de Violación de Políticas RLS */}
        {rlsErrorState && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-5 shadow-sm transition-all duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-start gap-3 col-span-2">
                <div className="bg-rose-100 p-2 rounded-lg text-rose-700 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-rose-950 text-base flex items-center gap-2">
                    ⚠️ Error de Seguridad de Supabase (Políticas RLS Activas)
                  </h4>
                  <p className="text-rose-700 text-xs mt-1 leading-relaxed max-w-3xl">
                    Tu base de datos de Supabase rechazó la escritura en la tabla <strong className="text-rose-900">"{rlsErrorState.tableName}"</strong> debido a que tiene <strong>Row Level Security (RLS)</strong> activado pero carece de políticas de acceso público o anónimo. Conéctate a tu panel de Supabase y arregla este problema ejecutando el script de corrección.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5 shrink-0 w-full md:w-auto">
                <button
                  onClick={() => {
                    copyToClipboard(`-- Ejecuta esto en el SQL Editor de Supabase para arreglar el error RLS
ALTER TABLE config DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;

-- OPTATIVO: Si prefieres políticas explícitas en vez de desactivar RLS:
-- DROP POLICY IF EXISTS "Permitir todo a anon en config" ON config;
-- CREATE POLICY "Permitir todo a anon en config" ON config FOR ALL TO anon USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Permitir todo a anon en products" ON products;
-- CREATE POLICY "Permitir todo a anon en products" ON products FOR ALL TO anon USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Permitir todo a anon en sales" ON sales;
-- CREATE POLICY "Permitir todo a anon en sales" ON sales FOR ALL TO anon USING (true) WITH CHECK (true);`);
                  }}
                  className="w-full md:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-4 h-4" /> Copiar SQL de Solución
                </button>
                <button
                  onClick={() => setRlsErrorState(null)}
                  className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2.5 rounded-lg transition-colors flex items-center justify-center"
                >
                  Ocultar Error
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Barra de Navegación */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
            <NavButton id="RATE" label="Calculadora Tasa" icon={Calculator} active={activeTab === 'RATE'} />
            <NavButton 
              id="INVENTORY" 
              label="Inventario" 
              icon={Package} 
              active={activeTab === 'INVENTORY'} 
              badge={criticalProducts.length > 0 ? (
                <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-pulse">
                  {criticalProducts.length}
                </span>
              ) : undefined}
            />
            <NavButton id="SALES" label="Ventas" icon={ShoppingCart} active={activeTab === 'SALES'} />
            <NavButton id="CREDITS" label="Créditos" icon={User} active={activeTab === 'CREDITS'} />
            <NavButton id="REPORTS" label="Reportes" icon={LayoutDashboard} active={activeTab === 'REPORTS'} />
            <NavButton id="AI" label="Asistente IA" icon={BrainCircuit} active={activeTab === 'AI'} />
        </div>

        {/* Contenido Dinámico */}
        <div className="animate-fade-in-up">
            {activeTab === 'RATE' && (
                <ExchangeRate rate={rate} onUpdateRate={handleUpdateRate} />
            )}

            {activeTab === 'INVENTORY' && (
                <Inventory 
                  inventory={inventory} 
                  onAddProduct={handleAddProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={handleDeleteProduct}
                  rate={rate} 
                  criticalThreshold={criticalThreshold}
                  onUpdateCriticalThreshold={handleUpdateCriticalThreshold}
                />
            )}

            {activeTab === 'SALES' && (
                <SalesSystem inventory={inventory} rate={rate} onProcessSale={handleProcessSale} />
              )}

            {activeTab === 'CREDITS' && (
                <Credits 
                  sales={sales} 
                  rate={rate} 
                  onProcessSale={handleProcessSale} 
                  inventory={inventory} 
                  onDeleteSale={handleDeleteSale}
                  onUpdateSale={handleUpdateSale}
                  onExportSalesJSON={handleExportLocalSales}
                  onImportSalesJSON={handleImportLocalSales}
                />
            )}

            {activeTab === 'REPORTS' && (
                <Reports 
                  sales={sales} 
                  onRefreshData={syncWithDatabase} 
                  criticalThreshold={criticalThreshold}
                  inventory={inventory}
                  onGoToInventory={() => setActiveTab('INVENTORY')}
                  onDeleteSale={handleDeleteSale}
                  onUpdateSale={handleUpdateSale}
                />
            )}

            {activeTab === 'AI' && (
                <AIAssistant storeData={{ exchangeRate: rate, inventory, sales }} />
            )}
        </div>
      </div>

      {/* --- Modal de Configuración Supabase --- */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col p-6 animate-fade-in animate-scale">
            
            {/* Cabecera del Modal */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 font-sans">
              <div className="flex items-center gap-2">
                <Cloud className="w-6 h-6 text-indigo-600" />
                <h3 className="text-xl font-bold text-slate-900">
                  Configuración de Base de Datos Supabase
                </h3>
              </div>
              <button 
                onClick={() => setShowSyncModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="flex-1 space-y-4 text-slate-600 text-sm leading-relaxed overflow-y-auto font-sans">
              
              {/* Formulario de credenciales */}
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-900 text-sm">
                  Credenciales de Conexión Supabase (Nube)
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">URL del Proyecto Supabase</label>
                    <input
                      type="text"
                      value={dbConfigUrl}
                      onChange={(e) => {
                        setDbConfigUrl(e.target.value);
                        setSaveSuccess(false);
                      }}
                      placeholder="https://your-project.supabase.co"
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Anon Key / JWT de Supabase</label>
                    <input
                      type="password"
                      value={dbConfigKey}
                      onChange={(e) => {
                        setDbConfigKey(e.target.value);
                        setSaveSuccess(false);
                      }}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 text-slate-800"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">
                    {supabaseService.getCredentials().isEnvConfigured 
                      ? '✔️ Cargadas desde variables de entorno.' 
                      : '✏️ Configuración manual guardada localmente.'}
                  </span>
                  <button
                    onClick={handleDbSaveAndConnect}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow-sm"
                  >
                    Guardar y Conectar
                  </button>
                </div>
                {saveSuccess && (
                   <p className="text-xs text-emerald-600 font-semibold mt-1">¡Credenciales aplicadas correctamente! Intentando conectar...</p>
                )}

                {/* Generador de Código QR y enlace directo para conectar teléfono u otro PC */}
                {dbConfigUrl && dbConfigKey && (() => {
                  const syncLink = `${window.location.origin}${window.location.pathname}?supabase_url=${encodeURIComponent(dbConfigUrl)}&supabase_key=${encodeURIComponent(dbConfigKey)}`;
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(syncLink)}`;

                  return (
                    <div className="mt-4 bg-gradient-to-br from-indigo-50/90 to-violet-50/90 border-2 border-indigo-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 shadow-xs">
                      <div className="bg-white p-2.5 rounded-2xl border border-indigo-200 shadow-sm shrink-0 text-center">
                        <img 
                          src={qrUrl} 
                          alt="Código QR de Conexión Teléfono" 
                          className="w-36 h-36 mx-auto rounded-xl"
                        />
                        <span className="text-[10px] font-bold text-indigo-700 block mt-1">Escanea con tu Teléfono 📱</span>
                      </div>
                      <div className="flex-1 space-y-2 text-left">
                        <h5 className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                          <span>📱 ↔️ 💻</span> Vincular Teléfono y PC en Tiempo Real
                        </h5>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          <strong>1.</strong> Abre la cámara de tu teléfono celular.<br/>
                          <strong>2.</strong> Apunta a este Código QR y toca el enlace que se despliega.<br/>
                          <strong>3.</strong> ¡Listo! Tu teléfono se conectará a esta misma base de datos de Supabase y sincronizará en tiempo real sin pedir contraseñas.
                        </p>
                        <div className="pt-1 flex flex-wrap gap-2">
                          <button
                            onClick={() => copyToClipboard(syncLink)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copiar Enlace Directo
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <p>
                Para que los cambios de tu inventario, ventas y tasa de cambio se guarden de forma automática y duradera, debes crear las siguientes tres tablas en tu base de datos de Supabase:
              </p>
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <span className="bg-violet-100 text-violet-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">SQL</span> 
                    Script de Creación de Tablas
                  </span>
                  <button 
                    onClick={() => copyToClipboard(`CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  price NUMERIC,
  currency TEXT,
  unit TEXT,
  units_per_case NUMERIC DEFAULT 1,
  stock NUMERIC,
  barcode TEXT,
  cost NUMERIC DEFAULT 0,
  profit_margin NUMERIC DEFAULT 0
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  timestamp BIGINT,
  items JSONB,
  total_usd NUMERIC,
  total_bsf NUMERIC,
  rate_at_sale NUMERIC,
  payment_method TEXT,
  customer_name TEXT,
  payment_reference TEXT
);

INSERT INTO config (key, value) VALUES ('exchangeRate', '36.5') ON CONFLICT (key) DO NOTHING;

-- Desactivar Row Level Security (RLS) para permitir lectura/escritura pública directa:
ALTER TABLE config DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;

-- OPTATIVO: O si prefieres mantener RLS activado pero dar acceso libre al rol 'anon' de Supabase:
-- DROP POLICY IF EXISTS "Permitir todo a anon en config" ON config;
-- CREATE POLICY "Permitir todo a anon en config" ON config FOR ALL TO anon USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Permitir todo a anon en products" ON products;
-- CREATE POLICY "Permitir todo a anon en products" ON products FOR ALL TO anon USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Permitir todo a anon en sales" ON sales;
-- CREATE POLICY "Permitir todo a anon en sales" ON sales FOR ALL TO anon USING (true) WITH CHECK (true);`)}
                    className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 hover:bg-violet-50 border border-violet-200 rounded px-2 py-1 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar SQL Completo
                  </button>
                </div>
                <p className="text-xs text-slate-500">Haz clic en el botón superior, luego ve al menú <strong>SQL Editor</strong> de tu panel de Supabase, crea una consulta (New Query), pega el código y presiona <strong>Run</strong>.</p>
                <pre className="bg-slate-900 text-slate-100 px-3 py-2 border border-slate-800 rounded font-mono text-[10px] overflow-x-auto max-h-[160px] leading-relaxed">
{`CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  price NUMERIC,
  currency TEXT,
  unit TEXT,
  units_per_case NUMERIC DEFAULT 1,
  stock NUMERIC,
  barcode TEXT,
  cost NUMERIC DEFAULT 0,
  profit_margin NUMERIC DEFAULT 0
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  timestamp BIGINT,
  items JSONB,
  total_usd NUMERIC,
  total_bsf NUMERIC,
  rate_at_sale NUMERIC,
  payment_method TEXT,
  customer_name TEXT,
  payment_reference TEXT
);

INSERT INTO config (key, value) VALUES ('exchangeRate', '36.5') ON CONFLICT (key) DO NOTHING;

-- Desactivar Row Level Security (RLS) para permitir lectura/escritura pública directa:
ALTER TABLE config DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;`}
                </pre>
              </div>
              <div className="bg-violet-50 border border-violet-200 p-4 rounded-xl text-xs text-violet-800 space-y-1 bg-opacity-70">
                <h5 className="font-bold">💡 Instrucción Rápida Supabase:</h5>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Pega el código SQL en el panel SQL Editor de Supabase y ejecútalo.</li>
                  <li>Vuelve aquí y presiona <strong className="text-violet-950 text-xs">Verificar Conexión de Datos</strong>.</li>
                </ol>
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="mt-6 pt-3 border-t border-slate-100 flex gap-3 font-sans">
              <button 
                onClick={() => {
                  syncWithDatabase();
                  setShowSyncModal(false);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold transition-colors shadow-sm text-sm"
              >
                Verificar Conexión de Datos
              </button>
              <button 
                onClick={() => setShowSyncModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-bold transition-colors text-sm"
              >
                Continuar en Modo Local
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default App;