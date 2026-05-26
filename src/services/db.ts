import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  type DocumentData,
  onSnapshot,
  collectionGroup
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  OperationType, 
  PaymentMethod,
  TransactionType,
  type Settings,
  type Transaction, 
  type Expense, 
  type CXCAccount, 
  type CXCPayment, 
  type Receipt,
  type CashClosure,
  type Seller,
  type FirestoreErrorInfo 
} from '../types';

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Collections
const TRANSACTIONS_PATH = 'transactions';
const EXPENSES_PATH = 'expenses';
const CXC_ACCOUNTS_PATH = 'cxc_accounts';
const RECEIPTS_PATH = 'receipts';
const CASH_CLOSURES_PATH = 'cash_closures';
const SELLERS_PATH = 'sellers';
const SETTINGS_PATH = 'settings';
const EXCHANGE_RATES_PATH = 'exchange_rates';

export const dbService = {
  // Sellers
  async getSellers() {
    try {
      const snapshot = await getDocs(collection(db, SELLERS_PATH));
      return snapshot.docs.map(doc => ({ ...doc.data() } as Seller));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, SELLERS_PATH);
    }
  },

  async addOrUpdateSeller(seller: Seller) {
    try {
      const sellerRef = doc(db, SELLERS_PATH, seller.id);
      await setDoc(sellerRef, {
        ...seller,
        createdAt: seller.createdAt || serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, SELLERS_PATH);
    }
  },

  async deleteSeller(id: string) {
    try {
      await deleteDoc(doc(db, SELLERS_PATH, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, SELLERS_PATH);
    }
  },

  subscribeToSellers(callback: (sellers: Seller[]) => void) {
    return onSnapshot(collection(db, SELLERS_PATH), (snapshot) => {
      callback(snapshot.docs.map(doc => ({ ...doc.data() } as Seller)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, SELLERS_PATH));
  },

  // Transactions
  async addTransaction(data: Omit<Transaction, 'id' | 'createdAt'>) {
    try {
      return await addDoc(collection(db, TRANSACTIONS_PATH), {
        ...data,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, TRANSACTIONS_PATH);
    }
  },

  async updateTransaction(id: string, data: Partial<Omit<Transaction, 'id' | 'createdAt'>>) {
    try {
      const docRef = doc(db, TRANSACTIONS_PATH, id);
      await updateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, TRANSACTIONS_PATH);
    }
  },

  async getTransactions() {
    try {
      const q = query(collection(db, TRANSACTIONS_PATH), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, TRANSACTIONS_PATH);
    }
  },

  // Expenses
  async addExpense(data: Omit<Expense, 'id' | 'createdAt'>) {
    try {
      return await addDoc(collection(db, EXPENSES_PATH), {
        ...data,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, EXPENSES_PATH);
    }
  },

  async getExpenses() {
    try {
      const q = query(collection(db, EXPENSES_PATH), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, EXPENSES_PATH);
    }
  },

  // CXC Accounts
  async addOrUpdateCXCAccount(clientName: string, balanceDelta: number) {
    try {
      const q = query(collection(db, CXC_ACCOUNTS_PATH), where('clientName', '==', clientName));
      const snapshot = await getDocs(q);
      
      let accountId;
      if (snapshot.empty) {
        const docRef = await addDoc(collection(db, CXC_ACCOUNTS_PATH), {
          clientName,
          totalBalance: balanceDelta,
          lastUpdated: serverTimestamp(),
        });
        accountId = docRef.id;
      } else {
        const accountDoc = snapshot.docs[0];
        accountId = accountDoc.id;
        const currentBalance = accountDoc.data().totalBalance || 0;
        await updateDoc(doc(db, CXC_ACCOUNTS_PATH, accountId), {
          totalBalance: currentBalance + balanceDelta,
          lastUpdated: serverTimestamp(),
        });
      }
      return accountId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, CXC_ACCOUNTS_PATH);
    }
  },

  async addCXCCharge(clientName: string, data: Omit<CXCPayment, 'id' | 'clientId' | 'createdAt'>) {
    try {
      // 1. Get or create account and get ID
      const q = query(collection(db, CXC_ACCOUNTS_PATH), where('clientName', '==', clientName));
      const snapshot = await getDocs(q);
      
      let accountId;
      if (snapshot.empty) {
        const docRef = await addDoc(collection(db, CXC_ACCOUNTS_PATH), {
          clientName,
          totalBalance: data.amountUsd,
          lastUpdated: serverTimestamp(),
        });
        accountId = docRef.id;
      } else {
        const accountDoc = snapshot.docs[0];
        accountId = accountDoc.id;
        const currentBalance = accountDoc.data().totalBalance || 0;
        await updateDoc(doc(db, CXC_ACCOUNTS_PATH, accountId), {
          totalBalance: currentBalance + data.amountUsd,
          lastUpdated: serverTimestamp(),
        });
      }

      // 2. Add the charge to payments subcollection
      const path = `${CXC_ACCOUNTS_PATH}/${accountId}/payments`;
      await addDoc(collection(db, path), {
        ...data,
        type: 'charge',
        clientId: accountId,
        createdAt: serverTimestamp(),
      });

      // 3. Register it as a SALE in standard transactions if needed? 
      // The user registers the CXC charge as an INCOME of type CXC.
      await this.addTransaction({
        date: data.date,
        clientName: clientName,
        concept: `VENTA A CRÉDITO CUENTAS POR COBRAR (CXC) (Item: ${data.item || 'N/A'}): ${data.concept || ''}`,
        amountUsd: data.amountUsd, // Net amount remains amountUsd of transaction
        amountBs: data.amountBs,
        exchangeRate: data.exchangeRate,
        paymentMethod: PaymentMethod.CXC,
        type: TransactionType.SALE,
        isCXC: true,
        amountCXC: data.amountUsd, // Net amount goes to accounts receivable
        totalDailySale: data.grossAmountUsd || data.amountUsd, // Gross amount goes to Daily Sale
        grossAmountUsd: data.grossAmountUsd || data.amountUsd,
        commissionAmountUsd: data.commissionAmountUsd || 0,
        sellerName: data.sellerName || '',
        sellerId: data.sellerId || '',
        rubroName: data.rubroName || ''
      });

      return accountId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, CXC_ACCOUNTS_PATH);
    }
  },
  async getCXCAccounts() {
    try {
      const snapshot = await getDocs(collection(db, CXC_ACCOUNTS_PATH));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCAccount));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CXC_ACCOUNTS_PATH);
    }
  },

  async addCXCPayment(clientId: string, data: Omit<CXCPayment, 'id' | 'clientId' | 'createdAt'>) {
    const path = `${CXC_ACCOUNTS_PATH}/${clientId}/payments`;
    try {
      await addDoc(collection(db, path), {
        ...data,
        type: data.type || 'payment', // Default to payment for backwards compatibility
        clientId,
        createdAt: serverTimestamp(),
      });
      // Also update the account balance
      const accountRef = doc(db, CXC_ACCOUNTS_PATH, clientId);
      const accountSnap = await getDoc(accountRef);
      if (accountSnap.exists()) {
        const currentBalance = accountSnap.data().totalBalance || 0;
        const newBalance = data.type === 'charge' 
          ? currentBalance + data.amountUsd 
          : currentBalance - data.amountUsd;
          
        await updateDoc(accountRef, {
          totalBalance: newBalance,
          lastUpdated: serverTimestamp()
        });
      }

      // Record as income in the main ledger ONLY if it's a payment
      if (data.type !== 'charge') {
        const normalizeText = (str: string): string => {
          if (!str) return '';
          return str
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        };

        const dest = normalizeText(data.destinationBank || '');
        const pMethod = normalizeText(data.paymentMethod || '');
        const concept = normalizeText(data.concept || '');
        
        const isWarranty = dest.includes('GARANT') || pMethod.includes('GARANT') || concept.includes('GARANT');
        const isDonation = dest.includes('DONAC') || pMethod.includes('DONAC') || concept.includes('DONAC') ||
                           dest.includes('EXENC') || pMethod.includes('EXENC') || concept.includes('EXENC') ||
                           dest.includes('EXCENC') || pMethod.includes('EXCENC') || concept.includes('EXCENC') ||
                           dest.includes('EXENT') || pMethod.includes('EXENT') || concept.includes('EXENT') ||
                           dest.includes('EXCENT') || pMethod.includes('EXCENT') || concept.includes('EXCENT') ||
                           dest.includes('CORTES') || pMethod.includes('CORTES') || concept.includes('CORTES') ||
                           dest.includes('DESCUENT') || pMethod.includes('DESCUENT') || concept.includes('DESCUENT') ||
                           dest.includes('ANULA') || pMethod.includes('ANULA') || concept.includes('ANULA') ||
                           dest.includes('BONIF') || pMethod.includes('BONIF') || concept.includes('BONIF');

        if (!isWarranty && !isDonation) {
          let isUsdCash = data.paymentMethod === PaymentMethod.USD_CASH;
          let isZelle = data.paymentMethod === PaymentMethod.ZELLE || data.paymentMethod === PaymentMethod.BINANCE;

          await this.addTransaction({
            date: data.date,
            clientName: accountSnap.exists() ? accountSnap.data().clientName : 'Desconocido',
            concept: `ABONO CUENTAS POR COBRAR: ${data.concept || ''}`,
            amountUsd: data.amountUsd,
            amountBs: data.amountBs,
            exchangeRate: data.exchangeRate,
            paymentMethod: data.paymentMethod || PaymentMethod.USD_CASH,
            destinationBank: data.destinationBank,
            type: TransactionType.INCOME,
            isCXC: false,
            amountUsdCash: isUsdCash ? data.amountUsd : 0,
            amountZelle: isZelle ? data.amountUsd : 0
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  subscribeToGlobalCXCStats(callback: (stats: { 
    totalCharges: number, 
    totalPayments: number, 
    totalPaymentsUsd: number,
    totalPaymentsBs: number,
    totalPaymentsBsUsd: number,
    balance: number, 
    totalGrossCharges: number, 
    totalCommissions: number,
    totalWarranty: number,
    totalDonation: number
  }) => void) {
    const q = query(collectionGroup(db, 'payments'));
    const normalizeText = (str: string): string => {
      if (!str) return '';
      return str
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    };

    return onSnapshot(q, (snapshot) => {
      let totalCharges = 0;
      let totalPayments = 0;
      let totalPaymentsUsd = 0;
      let totalPaymentsBs = 0;
      let totalPaymentsBsUsd = 0;
      let totalGrossCharges = 0;
      let totalCommissions = 0;
      let totalWarranty = 0;
      let totalDonation = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const amt = Number(data.amountUsd) || 0;
        
        if (data.type === 'charge') {
          const grossAmt = Number(data.grossAmountUsd) || amt;
          const commAmt = Number(data.commissionAmountUsd) || (grossAmt > amt ? grossAmt - amt : 0);
          
          totalCharges += amt;
          totalGrossCharges += grossAmt;
          totalCommissions += commAmt;
        } else {
          totalPayments += amt;

          // Check for Warranty or Donation in payment method, destination bank, or concept
          const dest = normalizeText(data.destinationBank);
          const pMethod = normalizeText(data.paymentMethod);
          const concept = normalizeText(data.concept);
          
          let isWarranty = false;
          let isDonation = false;

          if (
            dest.includes('GARANT') || 
            pMethod.includes('GARANT') || 
            concept.includes('GARANT')
          ) {
            totalWarranty += amt;
            isWarranty = true;
          }
          if (
            dest.includes('DONAC') || 
            pMethod.includes('DONAC') || 
            concept.includes('DONAC') ||
            dest.includes('EXENC') || 
            pMethod.includes('EXENC') || 
            concept.includes('EXENC') ||
            dest.includes('EXCENC') || 
            pMethod.includes('EXCENC') || 
            concept.includes('EXCENC') ||
            dest.includes('EXENT') || 
            pMethod.includes('EXENT') || 
            concept.includes('EXENT') ||
            dest.includes('EXCENT') || 
            pMethod.includes('EXCENT') || 
            concept.includes('EXCENT') ||
            dest.includes('CORTES') || 
            pMethod.includes('CORTES') || 
            concept.includes('CORTES') ||
            dest.includes('DESCUENT') || 
            pMethod.includes('DESCUENT') || 
            concept.includes('DESCUENT') ||
            dest.includes('ANULA') || 
            pMethod.includes('ANULA') || 
            concept.includes('ANULA') ||
            dest.includes('BONIF') || 
            pMethod.includes('BONIF') || 
            concept.includes('BONIF')
          ) {
            totalDonation += amt;
            isDonation = true;
          }

          if (!isWarranty && !isDonation) {
            const isBs = data.paymentMethod === 'Transferencia Bs / Pago Móvil' || 
                         data.paymentMethod === 'Bs' || 
                         data.paymentMethod === PaymentMethod.BS || 
                         data.paymentMethod === PaymentMethod.BS_CASH;
            if (isBs) {
              totalPaymentsBs += Number(data.amountBs) || (amt * (Number(data.exchangeRate) || 1));
              totalPaymentsBsUsd += amt;
            } else {
              totalPaymentsUsd += amt;
            }
          }
        }
      });
      callback({ 
        totalCharges, 
        totalPayments: totalPaymentsUsd + totalPaymentsBsUsd, 
        totalPaymentsUsd,
        totalPaymentsBs,
        totalPaymentsBsUsd,
        balance: totalCharges - (totalPaymentsUsd + totalPaymentsBsUsd) - totalWarranty - totalDonation,
        totalGrossCharges,
        totalCommissions,
        totalWarranty,
        totalDonation
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'collectionGroup:payments'));
  },

  async getGlobalCXCStats() {
    const normalizeText = (str: string): string => {
      if (!str) return '';
      return str
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    };

    try {
      const q = query(collectionGroup(db, 'payments'));
      const snapshot = await getDocs(q);
      let totalCharges = 0;
      let totalPayments = 0;
      let totalPaymentsUsd = 0;
      let totalPaymentsBs = 0;
      let totalPaymentsBsUsd = 0;
      let totalGrossCharges = 0;
      let totalCommissions = 0;
      let totalWarranty = 0;
      let totalDonation = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const amt = Number(data.amountUsd) || 0;
        if (data.type === 'charge') {
          const grossAmt = Number(data.grossAmountUsd) || amt;
          const commAmt = Number(data.commissionAmountUsd) || (grossAmt > amt ? grossAmt - amt : 0);
          
          totalCharges += amt;
          totalGrossCharges += grossAmt;
          totalCommissions += commAmt;
        } else {
          totalPayments += amt;

          const dest = normalizeText(data.destinationBank);
          const pMethod = normalizeText(data.paymentMethod);
          const concept = normalizeText(data.concept);
          
          let isWarranty = false;
          let isDonation = false;

          if (
            dest.includes('GARANT') || 
            pMethod.includes('GARANT') || 
            concept.includes('GARANT')
          ) {
            totalWarranty += amt;
            isWarranty = true;
          }
          if (
            dest.includes('DONAC') || 
            pMethod.includes('DONAC') || 
            concept.includes('DONAC') ||
            dest.includes('EXENC') || 
            pMethod.includes('EXENC') || 
            concept.includes('EXENC') ||
            dest.includes('EXCENC') || 
            pMethod.includes('EXCENC') || 
            concept.includes('EXCENC') ||
            dest.includes('EXENT') || 
            pMethod.includes('EXENT') || 
            concept.includes('EXENT') ||
            dest.includes('EXCENT') || 
            pMethod.includes('EXCENT') || 
            concept.includes('EXCENT') ||
            dest.includes('CORTES') || 
            pMethod.includes('CORTES') || 
            concept.includes('CORTES') ||
            dest.includes('DESCUENT') || 
            pMethod.includes('DESCUENT') || 
            concept.includes('DESCUENT') ||
            dest.includes('ANULA') || 
            pMethod.includes('ANULA') || 
            concept.includes('ANULA') ||
            dest.includes('BONIF') || 
            pMethod.includes('BONIF') || 
            concept.includes('BONIF')
          ) {
            totalDonation += amt;
            isDonation = true;
          }

          if (!isWarranty && !isDonation) {
            const isBs = data.paymentMethod === 'Transferencia Bs / Pago Móvil' || 
                         data.paymentMethod === 'Bs' || 
                         data.paymentMethod === PaymentMethod.BS || 
                         data.paymentMethod === PaymentMethod.BS_CASH;
            if (isBs) {
              totalPaymentsBs += Number(data.amountBs) || (amt * (Number(data.exchangeRate) || 1));
              totalPaymentsBsUsd += amt;
            } else {
              totalPaymentsUsd += amt;
            }
          }
        }
      });
      return { 
        totalCharges, 
        totalPayments: totalPaymentsUsd + totalPaymentsBsUsd, 
        totalPaymentsUsd,
        totalPaymentsBs,
        totalPaymentsBsUsd,
        balance: totalCharges - (totalPaymentsUsd + totalPaymentsBsUsd) - totalWarranty - totalDonation,
        totalGrossCharges,
        totalCommissions,
        totalWarranty,
        totalDonation
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'collectionGroup:payments');
      return { 
        totalCharges: 0, 
        totalPayments: 0, 
        totalPaymentsUsd: 0,
        totalPaymentsBs: 0,
        totalPaymentsBsUsd: 0,
        balance: 0, 
        totalGrossCharges: 0, 
        totalCommissions: 0, 
        totalWarranty: 0, 
        totalDonation: 0 
      };
    }
  },

  async getCXCPayments(clientId: string) {
    const path = `${CXC_ACCOUNTS_PATH}/${clientId}/payments`;
    try {
      const q = query(collection(db, path), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCPayment));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async updateCXCPayment(clientId: string, paymentId: string, updates: Partial<CXCPayment>) {
    const path = `${CXC_ACCOUNTS_PATH}/${clientId}/payments/${paymentId}`;
    try {
      const paymentRef = doc(db, CXC_ACCOUNTS_PATH, clientId, 'payments', paymentId);
      const paymentSnap = await getDoc(paymentRef);
      
      if (!paymentSnap.exists()) return;
      
      const oldData = paymentSnap.data() as CXCPayment;
      const oldAmount = oldData.amountUsd;
      const newAmount = updates.amountUsd !== undefined ? updates.amountUsd : oldAmount;
      const oldType = oldData.type || 'payment';
      const newType = updates.type !== undefined ? updates.type : oldType;
      
      await updateDoc(paymentRef, {
        ...updates
      });

      // Update account balance if amount or type changed
      if (oldAmount !== newAmount || oldType !== newType) {
        const accountRef = doc(db, CXC_ACCOUNTS_PATH, clientId);
        const accountSnap = await getDoc(accountRef);
        if (accountSnap.exists()) {
          let currentBalance = accountSnap.data().totalBalance || 0;
          
          // Revert old effect
          if (oldType === 'charge') currentBalance -= oldAmount;
          else currentBalance += oldAmount;

          // Apply new effect
          if (newType === 'charge') currentBalance += newAmount;
          else currentBalance -= newAmount;

          await updateDoc(accountRef, {
            totalBalance: currentBalance,
            lastUpdated: serverTimestamp()
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  // Receipts
  async addReceipt(data: Omit<Receipt, 'id' | 'createdAt'>) {
    try {
      const res = await addDoc(collection(db, RECEIPTS_PATH), {
        ...data,
        createdAt: serverTimestamp(),
      });
      
      // Record as withdrawal in main ledger
      await this.addTransaction({
        date: data.date,
        clientName: data.recipient,
        concept: `RETIRO: ${data.concept}`,
        amountUsd: data.amountUsd,
        paymentMethod: PaymentMethod.USD_CASH,
        type: TransactionType.WITHDRAWAL,
        isCXC: false
      });

      return res;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, RECEIPTS_PATH);
    }
  },

  async getReceipts() {
    try {
      const q = query(collection(db, RECEIPTS_PATH), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, RECEIPTS_PATH);
    }
  },

  // Real-time listeners wrapper
  subscribeToTransactions(callback: (data: Transaction[]) => void) {
    const q = query(collection(db, TRANSACTIONS_PATH), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, TRANSACTIONS_PATH));
  },

  subscribeToExpenses(callback: (data: Expense[]) => void) {
    const q = query(collection(db, EXPENSES_PATH), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, EXPENSES_PATH));
  },

  subscribeToReceipts(callback: (data: Receipt[]) => void) {
    const q = query(collection(db, RECEIPTS_PATH), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, RECEIPTS_PATH));
  },

  subscribeToCXCAccounts(callback: (data: CXCAccount[]) => void) {
    return onSnapshot(collection(db, CXC_ACCOUNTS_PATH), (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCAccount)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, CXC_ACCOUNTS_PATH));
  },

  // Cash Closures
  async addCashClosure(data: Omit<CashClosure, 'id' | 'createdAt'>) {
    try {
      return await addDoc(collection(db, CASH_CLOSURES_PATH), {
        ...data,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, CASH_CLOSURES_PATH);
    }
  },

  async updateCashClosure(id: string, data: Partial<CashClosure>) {
    try {
      const docRef = doc(db, CASH_CLOSURES_PATH, id);
      await updateDoc(docRef, data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, CASH_CLOSURES_PATH);
    }
  },

  async getCashClosures() {
    try {
      const q = query(collection(db, CASH_CLOSURES_PATH), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashClosure));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CASH_CLOSURES_PATH);
    }
  },

  subscribeToCashClosures(callback: (data: CashClosure[]) => void) {
    const q = query(collection(db, CASH_CLOSURES_PATH), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashClosure)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, CASH_CLOSURES_PATH));
  },

  // Settings
  async getSettings() {
    try {
      const docRef = doc(db, 'settings', 'global');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as Settings;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'settings');
    }
  },

  async updateExchangeRate(rate: number, date?: string) {
    try {
      // 1. Update global settings
      const settingsRef = doc(db, 'settings', 'global');
      await setDoc(settingsRef, {
        exchangeRate: rate,
        lastUpdated: serverTimestamp(),
      }, { merge: true });

      // 2. Save to history
      const targetDate = date || new Date().toISOString().split('T')[0];
      const historyRef = doc(db, EXCHANGE_RATES_PATH, targetDate);
      await setDoc(historyRef, {
        date: targetDate,
        rate: rate,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/exchange_rates');
    }
  },

  async getExchangeRateForDate(date: string) {
    try {
      const docRef = doc(db, EXCHANGE_RATES_PATH, date);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data().rate as number;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, EXCHANGE_RATES_PATH);
    }
  },

  subscribeToSettings(callback: (data: Settings | null) => void) {
    return onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        callback(doc.data() as Settings);
      } else {
        callback(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings'));
  },

  subscribeToAllPayments(callback: (data: CXCPayment[]) => void) {
    const q = query(collectionGroup(db, 'payments'));
    return onSnapshot(q, (snapshot) => {
      const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCPayment));
      payments.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
      });
      callback(payments);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'collectionGroup:payments'));
  }
};
