import { createClient } from '@supabase/supabase-js';
import { Product, Sale, Currency, ProductCategory, PaymentMethod } from '../types';

// Leer credenciales desde variables de entorno o almacenamiento local
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('venstore_supabase_url') || '';
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('venstore_supabase_anon_key') || '';

// Inicializar el cliente de Supabase
export let supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export let rlsErrorListener: ((tableName: string, errorMsg: string) => void) | null = null;

export const supabaseService = {
  setRlsErrorListener(listener: (tableName: string, errorMsg: string) => void) {
    rlsErrorListener = listener;
  },

  isEnabled(): boolean {
    return !!supabase;
  },

  updateCredentials(url: string, anonKey: string) {
    if (url && anonKey) {
      localStorage.setItem('venstore_supabase_url', url);
      localStorage.setItem('venstore_supabase_anon_key', anonKey);
      supabaseUrl = url;
      supabaseAnonKey = anonKey;
      supabase = createClient(url, anonKey);
    } else {
      localStorage.removeItem('venstore_supabase_url');
      localStorage.removeItem('venstore_supabase_anon_key');
      supabaseUrl = '';
      supabaseAnonKey = '';
      supabase = null;
    }
  },

  getCredentials() {
    return {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      isEnvConfigured: !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
    };
  },

  /**
   * Verifica la conexión consultando las tablas principales de la base de datos.
   */
  async checkConnection(): Promise<{ success: boolean; missingTables: string[]; error?: string; isOffline?: boolean }> {
    if (!supabase) {
      return {
        success: false,
        missingTables: ['config', 'products', 'sales'],
        error: 'Las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY no están configuradas.'
      };
    }

    const missing: string[] = [];
    let networkError = false;
    let errorMsg = '';
    
    const isNetworkError = (msg: string) => {
      const lower = msg.toLowerCase();
      return lower.includes('fetch') || lower.includes('network') || lower.includes('cors') || lower.includes('failed to fetch') || lower.includes('load failed') || lower.includes('timeout') || lower.includes('failed to connect');
    };

    try {
      // 1. Probar tabla de configuración
      const { error: confError } = await supabase.from('config').select('key').limit(1);
      if (confError) {
        console.warn('Error reading config table:', confError.message);
        if (isNetworkError(confError.message)) {
          networkError = true;
          errorMsg = confError.message;
        } else {
          missing.push('config');
        }
      }

      // 2. Probar tabla de productos
      const { error: prodError } = await supabase.from('products').select('id').limit(1);
      if (prodError) {
        console.warn('Error reading products table:', prodError.message);
        if (isNetworkError(prodError.message)) {
          networkError = true;
          errorMsg = prodError.message;
        } else {
          missing.push('products');
        }
      }

      // 3. Probar tabla de ventas
      const { error: salesError } = await supabase.from('sales').select('id').limit(1);
      if (salesError) {
        console.warn('Error reading sales table:', salesError.message);
        if (isNetworkError(salesError.message)) {
          networkError = true;
          errorMsg = salesError.message;
        } else {
          missing.push('sales');
        }
      }

      if (networkError) {
        return {
          success: false,
          missingTables: [],
          isOffline: true,
          error: 'No se pudo conectar a Supabase por un error de red. ¿Tiene conexión a internet?'
        };
      }

      return {
        success: missing.length === 0,
        missingTables: missing,
        error: missing.length > 0 ? `Tablas faltantes en Supabase: ${missing.join(', ')}. Recuerda crear las tablas correspondientes.` : undefined
      };
    } catch (e: any) {
      const msg = e?.message || '';
      const offline = isNetworkError(msg);
      return {
        success: false,
        missingTables: offline ? [] : ['config', 'products', 'sales'],
        isOffline: offline,
        error: offline ? 'Sin conexión a internet / Supabase inaccesible.' : (msg || 'Error al conectar con Supabase.')
      };
    }
  },

  /**
   * Obtiene la tasa de cambio de la tabla 'config'.
   */
  async fetchExchangeRate(fallbackRate: number): Promise<number> {
    if (!supabase) return fallbackRate;
    try {
      const { data, error } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'exchangeRate')
        .maybeSingle();

      if (error) {
        console.error('Error fetching exchange rate from Supabase:', error.message);
        return fallbackRate;
      }

      if (data && data.value) {
        const parsed = parseFloat(data.value);
        return isNaN(parsed) ? fallbackRate : parsed;
      }

      // Si no existe, intenta guardarla
      await this.saveExchangeRate(fallbackRate);
      return fallbackRate;
    } catch (e) {
      console.error('Exception fetching exchange rate:', e);
      return fallbackRate;
    }
  },

  /**
   * Guarda o actualiza la tasa de cambio en la tabla 'config'.
   */
  async saveExchangeRate(rate: number): Promise<boolean> {
    if (!supabase) return false;
    try {
      const payload = { key: 'exchangeRate', value: rate.toString() };

      const { data: existing, error: checkError } = await supabase
        .from('config')
        .select('key')
        .eq('key', 'exchangeRate')
        .maybeSingle();

      if (checkError) {
        console.warn('Error checking exchange rate, falling back to upsert:', checkError.message);
        const { error } = await supabase
          .from('config')
          .upsert(payload, { onConflict: 'key' });
        
        if (error) {
          console.error('Error saving exchange rate to Supabase:', error.message);
          if (error.message.toLowerCase().includes('row-level security') || error.message.toLowerCase().includes('rls') || error.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('config', error.message);
          }
          return false;
        }
      } else if (existing) {
        const { error: updateError } = await supabase
          .from('config')
          .update(payload)
          .eq('key', 'exchangeRate');

        if (updateError) {
          console.error('Error updating exchange rate in Supabase:', updateError.message);
          if (updateError.message.toLowerCase().includes('row-level security') || updateError.message.toLowerCase().includes('rls') || updateError.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('config', updateError.message);
          }
          return false;
        }
      } else {
        const { error: insertError } = await supabase
          .from('config')
          .insert(payload);

        if (insertError) {
          console.error('Error inserting exchange rate in Supabase:', insertError.message);
          if (insertError.message.toLowerCase().includes('row-level security') || insertError.message.toLowerCase().includes('rls') || insertError.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('config', insertError.message);
          }
          return false;
        }
      }
      return true;
    } catch (e: any) {
      console.error('Exception saving exchange rate:', e);
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('policy')) {
        rlsErrorListener?.('config', msg);
      }
      return false;
    }
  },

  /**
   * Obtiene el umbral de alerta crítica de stock.
   */
  async fetchCriticalThreshold(fallback: number): Promise<number> {
    if (!supabase) return fallback;
    try {
      const { data, error } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'criticalThreshold')
        .maybeSingle();

      if (error) {
        console.error('Error fetching critical stock threshold from Supabase:', error.message);
        return fallback;
      }

      if (data && data.value) {
        const parsed = parseInt(data.value, 10);
        return isNaN(parsed) ? fallback : parsed;
      }

      // Si no existe, intenta guardarlo
      await this.saveCriticalThreshold(fallback);
      return fallback;
    } catch (e) {
      console.error('Exception fetching criticalThreshold:', e);
      return fallback;
    }
  },

  /**
   * Guarda o actualiza el umbral de alerta crítica.
   */
  async saveCriticalThreshold(threshold: number): Promise<boolean> {
    if (!supabase) return false;
    try {
      const payload = { key: 'criticalThreshold', value: threshold.toString() };

      const { data: existing, error: checkError } = await supabase
        .from('config')
        .select('key')
        .eq('key', 'criticalThreshold')
        .maybeSingle();

      if (checkError) {
        console.warn('Error checking criticalThreshold, falling back to upsert:', checkError.message);
        const { error } = await supabase
          .from('config')
          .upsert(payload, { onConflict: 'key' });

        if (error) {
          console.error('Error saving criticalThreshold to Supabase:', error.message);
          if (error.message.toLowerCase().includes('row-level security') || error.message.toLowerCase().includes('rls') || error.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('config', error.message);
          }
          return false;
        }
      } else if (existing) {
        const { error: updateError } = await supabase
          .from('config')
          .update(payload)
          .eq('key', 'criticalThreshold');

        if (updateError) {
          console.error('Error updating criticalThreshold in Supabase:', updateError.message);
          if (updateError.message.toLowerCase().includes('row-level security') || updateError.message.toLowerCase().includes('rls') || updateError.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('config', updateError.message);
          }
          return false;
        }
      } else {
        const { error: insertError } = await supabase
          .from('config')
          .insert(payload);

        if (insertError) {
          console.error('Error inserting criticalThreshold in Supabase:', insertError.message);
          if (insertError.message.toLowerCase().includes('row-level security') || insertError.message.toLowerCase().includes('rls') || insertError.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('config', insertError.message);
          }
          return false;
        }
      }
      return true;
    } catch (e: any) {
      console.error('Exception saving criticalThreshold:', e);
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('policy')) {
        rlsErrorListener?.('config', msg);
      }
      return false;
    }
  },

  /**
   * Obtiene todos los productos del inventario.
   */
  async fetchInventory(): Promise<Product[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching inventory from Supabase:', error.message);
        throw error;
      }

      if (!data) return [];

      return data.map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        name: item.name || '',
        category: (item.category as ProductCategory) || ProductCategory.OTROS,
        price: Number(item.price) || 0,
        currency: (item.currency as Currency) || Currency.USD,
        unit: item.unit || 'Unidad',
        unitsPerCase: Number(item.units_per_case) || 1,
        stock: Number(item.stock) || 0,
        barcode: item.barcode || '',
        cost: Number(item.cost) || 0,
        profitMargin: Number(item.profit_margin) || 0
      }));
    } catch (e) {
      console.error('Exception fetching inventory:', e);
      throw e;
    }
  },

  /**
   * Guarda un producto (insértalo si no existe, actualízalo si ya existe).
   */
  async saveProduct(product: Product, _isNew: boolean): Promise<boolean> {
    if (!supabase) return false;
    try {
      const payload = {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        currency: product.currency,
        unit: product.unit,
        units_per_case: product.unitsPerCase || 1,
        stock: product.stock,
        barcode: product.barcode || '',
        cost: product.cost || 0,
        profit_margin: product.profitMargin || 0
      };

      // Verificar existencia antes de decidir si insertar o actualizar
      const { data: existing, error: checkError } = await supabase
        .from('products')
        .select('id')
        .eq('id', product.id)
        .maybeSingle();

      if (checkError) {
        console.warn('Error checking product existence, falling back to upsert:', checkError.message);
        const { error: prodError } = await supabase
          .from('products')
          .upsert(payload, { onConflict: 'id' });
        
        if (prodError) {
          console.error('Error upserting product to Supabase:', prodError.message);
          if (prodError.message.toLowerCase().includes('row-level security') || prodError.message.toLowerCase().includes('rls') || prodError.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('products', prodError.message);
          }
          return false;
        }
      } else if (existing) {
        // El producto ya existe, actualizamos
        const { error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', product.id);

        if (updateError) {
          console.error('Error updating product in Supabase:', updateError.message);
          if (updateError.message.toLowerCase().includes('row-level security') || updateError.message.toLowerCase().includes('rls') || updateError.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('products', updateError.message);
          }
          return false;
        }
      } else {
        // No existe, insertamos un registro nuevo
        const { error: insertError } = await supabase
          .from('products')
          .insert(payload);

        if (insertError) {
          console.error('Error inserting product in Supabase:', insertError.message);
          if (insertError.message.toLowerCase().includes('row-level security') || insertError.message.toLowerCase().includes('rls') || insertError.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('products', insertError.message);
          }
          return false;
        }
      }
      return true;
    } catch (e: any) {
      console.error('Exception saving product:', e);
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('policy')) {
        rlsErrorListener?.('products', msg);
      }
      return false;
    }
  },

  /**
   * Elimina un producto.
   */
  async deleteProduct(productId: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) {
        console.error('Error deleting product from Supabase:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Exception deleting product:', e);
      return false;
    }
  },

  /**
   * Suscribe en tiempo real (WebSockets) a cambios en las tablas 'products', 'sales' y 'config'.
   */
  subscribeToRealtime(onDataChanged: (tableName: string) => void): (() => void) {
    if (!supabase) return () => {};

    try {
      const channel = supabase
        .channel('app-realtime-channel-' + Math.random().toString(36).substring(2, 7))
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products' },
          () => onDataChanged('products')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sales' },
          () => onDataChanged('sales')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'config' },
          () => onDataChanged('config')
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('🟢 Supabase Realtime conectado exitosamente');
          }
        });

      return () => {
        if (supabase) {
          supabase.removeChannel(channel);
        }
      };
    } catch (e) {
      console.warn('Excepción al crear suscripción Realtime en Supabase:', e);
      return () => {};
    }
  },

  /**
   * Obtiene el listado de ventas (limita automáticamente a 1 año de retención de datos).
   */
  async fetchSales(): Promise<Sale[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) {
        console.warn('Warning fetching sales from Supabase:', error.message);
        if (error.message.toLowerCase().includes('row-level security') || error.message.toLowerCase().includes('rls') || error.message.toLowerCase().includes('policy')) {
          rlsErrorListener?.('sales', error.message);
        }
        return [];
      }

      if (!data) return [];

      return data.map((item: any) => {
        let parsedItems = [];
        try {
          if (typeof item.items === 'string') {
            parsedItems = JSON.parse(item.items);
          } else if (Array.isArray(item.items)) {
            parsedItems = item.items;
          } else if (item.items && typeof item.items === 'object') {
            parsedItems = [item.items];
          }
        } catch (e) {
          console.error('Error parsing sale items:', e);
        }

        // Convertir timestamps de 10 dígitos (segundos) a 13 dígitos (milisegundos) si aplica
        let rawTimestamp = Number(item.timestamp) || Date.now();
        if (rawTimestamp < 10000000000) {
          rawTimestamp = rawTimestamp * 1000;
        }

        // Recuperar metadatos directos o fallback desde _meta dentro del JSON de items
        let customerName = item.customer_name || item.customerName;
        let paymentReference = item.payment_reference || item.paymentReference;
        let rateAtSale = Number(item.rate_at_sale || item.rateAtSale) || 36.5;
        let paymentMethod = (item.payment_method as PaymentMethod) || item.paymentMethod;

        // Intentar extraer metadatos guardados dentro de los items si no existen o están vacíos en las columnas de la fila
        if (Array.isArray(parsedItems) && parsedItems.length > 0) {
          const meta = (parsedItems as any)._meta || (parsedItems[0] && (parsedItems[0] as any)._meta);
          if (meta) {
            if ((!customerName || customerName === '') && meta.customerName) {
              customerName = meta.customerName;
            }
            if ((!paymentReference || paymentReference === '') && meta.paymentReference) {
              paymentReference = meta.paymentReference;
            }
            if (meta.rateAtSale) {
              rateAtSale = Number(meta.rateAtSale) || rateAtSale;
            }
            if ((!paymentMethod || paymentMethod === '') && meta.paymentMethod) {
              paymentMethod = meta.paymentMethod as PaymentMethod;
            }
          }
        }

        if (!paymentMethod) {
          paymentMethod = PaymentMethod.EFECTIVO_USD;
        }

        return {
          id: item.id || crypto.randomUUID(),
          timestamp: rawTimestamp,
          items: parsedItems,
          totalUSD: Number(item.total_usd) || 0,
          totalBsF: Number(item.total_bsf) || 0,
          rateAtSale: rateAtSale,
          paymentMethod: paymentMethod,
          customerName: customerName || undefined,
          paymentReference: paymentReference || undefined
        };
      });
    } catch (e: any) {
      console.warn('Exception fetching sales from Supabase:', e?.message || e);
      return [];
    }
  },

  /**
   * Registra una venta en 'sales' y actualiza el stock correspondiente en 'products'.
   */
  async saveSale(sale: Sale, updatedInventory: Product[]): Promise<boolean> {
    if (!supabase) return false;
    try {
      // 1. Convertir o asegurar estructura compatible con columnas JSONB y TEXT
      let itemsPayload = sale.items;
      if (typeof itemsPayload === 'string') {
        try {
          itemsPayload = JSON.parse(itemsPayload);
        } catch (e) {
          // Mantener string
        }
      }

      // Si itemsPayload es un array, incrustamos _meta para no perder datos si la tabla no tiene customer_name/payment_reference
      let itemsWithMeta = itemsPayload;
      if (Array.isArray(itemsPayload)) {
        itemsWithMeta = itemsPayload.map((it: any, idx: number) => {
          if (idx === 0) {
            return {
              ...it,
              _meta: {
                customerName: sale.customerName || '',
                paymentReference: sale.paymentReference || '',
                rateAtSale: sale.rateAtSale || 36.5,
                paymentMethod: sale.paymentMethod || PaymentMethod.EFECTIVO_USD
              }
            };
          }
          return it;
        });
      }

      const fullPayload = {
        id: sale.id,
        timestamp: sale.timestamp,
        items: itemsWithMeta,
        total_usd: sale.totalUSD,
        total_bsf: sale.totalBsF,
        rate_at_sale: sale.rateAtSale,
        payment_method: sale.paymentMethod,
        customer_name: sale.customerName || '',
        payment_reference: sale.paymentReference || ''
      };

      // Verificar si la venta existe primero
      const { data: existing, error: checkError } = await supabase
        .from('sales')
        .select('id')
        .eq('id', sale.id)
        .maybeSingle();

      let writeError = null;

      if (checkError) {
        console.warn('No se pudo verificar existencia de venta, probando upsert:', checkError.message);
        const { error: upsertErr } = await supabase
          .from('sales')
          .upsert(fullPayload, { onConflict: 'id' });
        writeError = upsertErr;
      } else if (existing) {
        // La venta existe: actualizar
        const { error: updateErr } = await supabase
          .from('sales')
          .update(fullPayload)
          .eq('id', sale.id);
        writeError = updateErr;
      } else {
        // No existe: insertar
        const { error: insertErr } = await supabase
          .from('sales')
          .insert(fullPayload);
        writeError = insertErr;
      }

      // Fallback 1: Si items es TEXT en vez de JSONB
      if (writeError) {
        console.warn('Primer intento con fullPayload falló, probando con items como string:', writeError.message);
        
        const fallback1Payload = {
          ...fullPayload,
          items: typeof itemsWithMeta === 'string' ? itemsWithMeta : JSON.stringify(itemsWithMeta)
        };

        let fb1Error = null;
        if (existing) {
          const { error: fb1Update } = await supabase
            .from('sales')
            .update(fallback1Payload)
            .eq('id', sale.id);
          fb1Error = fb1Update;
        } else {
          const { error: fb1Insert } = await supabase
            .from('sales')
            .insert(fallback1Payload);
          fb1Error = fb1Insert;
        }

        writeError = fb1Error;
      }

      // Fallback 2: Si las columnas opcionales (customer_name, payment_reference, rate_at_sale) no existen en la tabla
      if (writeError) {
        console.warn('Fallback 1 falló, probando payload mínimo sin columnas opcionales:', writeError.message);

        const minimalPayload = {
          id: sale.id,
          timestamp: sale.timestamp,
          items: typeof itemsWithMeta === 'string' ? itemsWithMeta : JSON.stringify(itemsWithMeta),
          total_usd: sale.totalUSD,
          total_bsf: sale.totalBsF,
          payment_method: sale.paymentMethod
        };

        let fb2Error = null;
        if (existing) {
          const { error: fb2Update } = await supabase
            .from('sales')
            .update(minimalPayload)
            .eq('id', sale.id);
          fb2Error = fb2Update;
        } else {
          const { error: fb2Insert } = await supabase
            .from('sales')
            .insert(minimalPayload);
          fb2Error = fb2Insert;
        }

        if (fb2Error) {
          console.error('Error definitivo al guardar venta en Supabase:', fb2Error.message);
          if (fb2Error.message.toLowerCase().includes('row-level security') || fb2Error.message.toLowerCase().includes('rls') || fb2Error.message.toLowerCase().includes('policy')) {
            rlsErrorListener?.('sales', fb2Error.message);
          }
          return false;
        }
      }

      // 2. Actualizar el stock de cada producto involucrado en la venta
      const itemsArray = typeof sale.items === 'string' ? JSON.parse(sale.items) : (Array.isArray(sale.items) ? sale.items : []);
      for (const item of itemsArray) {
        if (item && !item.isManual && item.productId) {
          const matchingProduct = updatedInventory.find(p => p.id === item.productId);
          if (matchingProduct) {
            const { error: stockError } = await supabase
              .from('products')
              .update({ stock: matchingProduct.stock })
              .eq('id', item.productId);
              
            if (stockError && (stockError.message.toLowerCase().includes('row-level security') || stockError.message.toLowerCase().includes('rls') || stockError.message.toLowerCase().includes('policy'))) {
              rlsErrorListener?.('products', stockError.message);
            }
          }
        }
      }

      return true;
    } catch (e: any) {
      console.error('Exception saving sale:', e);
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('rls') || msg.toLowerCase().includes('policy')) {
        rlsErrorListener?.('sales', msg);
      }
      return false;
    }
  },

  /**
   * Depura de forma explícita ventas con antigüedad mayor a 1 año (365 días).
   */
  async pruneOldSales(): Promise<{ success: boolean, countDeleted?: number, error?: string }> {
    if (!supabase) return { success: false, error: 'Supabase no conectado' };
    try {
      const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
      
      const { data, error } = await supabase
        .from('sales')
        .delete()
        .lt('timestamp', oneYearAgo)
        .select('id');

      if (error) {
        throw error;
      }

      return {
        success: true,
        countDeleted: data ? data.length : 0
      };
    } catch (e: any) {
      console.error('Exception pruning sales:', e);
      return {
        success: false,
        error: e.message || 'Error al depurar ventas viejas'
      };
    }
  },

  /**
   * Elimina un registro de venta.
   */
  async deleteSale(saleId: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId);

      if (error) {
        console.error('Error deleting sale from Supabase:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Exception deleting sale:', e);
      return false;
    }
  },

  /**
   * Actualiza una venta directamente en Supabase.
   */
  async updateSale(sale: Sale): Promise<boolean> {
    if (!supabase) return false;
    try {
      const payload = {
        timestamp: sale.timestamp,
        items: JSON.stringify(sale.items),
        total_usd: sale.totalUSD,
        total_bsf: sale.totalBsF,
        rate_at_sale: sale.rateAtSale,
        payment_method: sale.paymentMethod,
        customer_name: sale.customerName || '',
        payment_reference: sale.paymentReference || ''
      };

      const { error } = await supabase
        .from('sales')
        .update(payload)
        .eq('id', sale.id);

      if (error) {
        console.error('Error updating sale in Supabase:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Exception updating sale:', e);
      return false;
    }
  },

  /**
   * Actualiza el estado de la tabla de créditos.
   */
  async updateCreditStatus(customerName: string, status: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('credits')
        .update({ status: status })
        .eq('customer_name', customerName);

      if (error) {
        console.warn('Silent notice: credits table might not exist or lacks matching rows:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Silent notice: Exception updating credits table:', e);
      return false;
    }
  }
};