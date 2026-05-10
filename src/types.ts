export enum TransactionType {
  INCOME = 'income',
  SALE = 'sale',
  WITHDRAWAL = 'withdrawal',
}

export enum PaymentMethod {
  BS = 'Bolivares',
  USD_CASH = 'Dolares Efectivo',
  ZELLE = 'Zelle',
  CXC = 'CXC',
}

export interface Transaction {
  id?: string;
  date: string; // ISO string
  clientName?: string;
  concept: string;
  amountBs?: number;
  exchangeRate?: number;
  amountUsd: number;
  paymentMethod: PaymentMethod;
  type: TransactionType;
  isCXC: boolean;
  cxcBalance?: number;
  currency?: string;
  destinationBank?: string;
  // Breakdown fields for Daily Box
  amountUsdCash?: number;
  amountZelle?: number;
  amountCXC?: number;
  totalDailySale?: number;
  createdAt: any; // Server Timestamp
}

export interface Expense {
  id?: string;
  date: string;
  category: string;
  note?: string;
  amountBs?: number;
  amountUsd: number;
  createdAt: any;
}

export interface CXCAccount {
  id?: string; // This will be the client identifier or generated ID
  clientName: string;
  totalBalance: number;
  lastUpdated: any;
}

export interface CXCPayment {
  id?: string;
  clientId: string;
  date: string;
  amountUsd: number;
  amountBs?: number;
  exchangeRate?: number;
  concept?: string;
  type?: 'payment' | 'charge';
  item?: string; // Correlative item
  invoiceNumber?: string;
  sellerName?: string;
  paymentMethod?: PaymentMethod;
  destinationBank?: string;
  createdAt: any;
}

export interface Receipt {
  id?: string;
  receiptNumber: string;
  amountUsd: number;
  recipient: string;
  concept: string;
  date: string;
  createdAt: any;
}

export interface Settings {
  exchangeRate: number;
  lastUpdated: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}
