
export enum Currency {
  USD = 'USD',
  BSF = 'BsF'
}

export enum ProductCategory {
  VIVERES = 'Víveres',
  ASEO = 'Aseo Personal',
  BEBIDAS = 'Bebidas',
  CHARCUTERIA = 'Charcutería',
  LACTEOS = 'Lácteos',
  PAN = 'Pan',
  LIMPIEZA = 'Limpieza',
  GOLOSINAS = 'Golosinas',
  GRANOS = 'Granos',
  FARMACIA = 'Farmacia',
  PAPELERIA = 'Papelería',
  MISCELANEO = 'Misceláneo',
  OTROS = 'Otros'
}

export enum PaymentMethod {
  PAGO_MOVIL = 'Pago Móvil',
  PUNTO_VENTA = 'Punto de Venta',
  EFECTIVO_USD = 'Efectivo USD (Divisa)',
  EFECTIVO_BSF = 'Efectivo BsF',
  CREDITO = 'Crédito'
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  currency: Currency;
  unit: string; // e.g., 'Unidad', 'Kg'
  unitsPerCase?: number;
  stock: number;
  barcode?: string;
  cost?: number;
  profitMargin?: number;
}

export interface CartItem {
  productId?: string; // Optional because manual items don't have IDs
  name: string;
  quantity: number;
  price: number;
  currency: Currency;
  isManual: boolean;
}

export interface Sale {
  id: string;
  timestamp: number;
  items: CartItem[];
  totalUSD: number;
  totalBsF: number;
  rateAtSale: number;
  paymentMethod: PaymentMethod;
  customerName?: string; // Required for Credit
  paymentReference?: string; // Required for Pago Movil
}

export interface StoreData {
  exchangeRate: number; // BsF per 1 USD
  inventory: Product[];
  sales: Sale[];
}
