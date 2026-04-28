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
  runTransaction,
  increment
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

export const dbService = {
  // ─── Transactions ───────────────────────────────────────────

  async addTransaction(data: Omit<Transaction, 'id' | 'createdAt'>) {
    try {
      return await addDoc(collection(db, TRANSACTIONS_PATH), {
        ...data,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, TRANSACTIONS_PATH);
      return null; // C-01: explicit fallback (handleFirestoreError throws, but TS needs this)
    }
  },

  async getTransactions(): Promise<Transaction[]> {
    try {
      const q = query(collection(db, TRANSACTIONS_PATH), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, TRANSACTIONS_PATH);
      return []; // C-01: safe fallback prevents .map() on undefined
    }
  },

  // ─── Expenses ───────────────────────────────────────────────

  async addExpense(data: Omit<Expense, 'id' | 'createdAt'>) {
    try {
      return await addDoc(collection(db, EXPENSES_PATH), {
        ...data,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, EXPENSES_PATH);
      return null;
    }
  },

  async getExpenses(): Promise<Expense[]> {
    try {
      const q = query(collection(db, EXPENSES_PATH), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, EXPENSES_PATH);
      return [];
    }
  },

  // ─── CXC Accounts ──────────────────────────────────────────

  // C-04 FIX: Uses increment() instead of read-modify-write to prevent race conditions
  async addOrUpdateCXCAccount(clientName: string, balanceDelta: number) {
    try {
      const q = query(collection(db, CXC_ACCOUNTS_PATH), where('clientName', '==', clientName));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return await addDoc(collection(db, CXC_ACCOUNTS_PATH), {
          clientName,
          totalBalance: balanceDelta,
          lastUpdated: serverTimestamp(),
        });
      } else {
        const accountDoc = snapshot.docs[0];
        const accountRef = doc(db, CXC_ACCOUNTS_PATH, accountDoc.id);
        await updateDoc(accountRef, {
          totalBalance: increment(balanceDelta), // C-04: atomic increment prevents lost updates
          lastUpdated: serverTimestamp(),
        });
        return accountRef;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, CXC_ACCOUNTS_PATH);
      return null;
    }
  },

  async getCXCAccounts(): Promise<CXCAccount[]> {
    try {
      const snapshot = await getDocs(collection(db, CXC_ACCOUNTS_PATH));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCAccount));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CXC_ACCOUNTS_PATH);
      return [];
    }
  },

  // C-03 & C-04 FIX: All 3 writes wrapped in a single Firestore transaction
  async addCXCPayment(clientId: string, data: Omit<CXCPayment, 'id' | 'clientId' | 'createdAt'>) {
    const path = `${CXC_ACCOUNTS_PATH}/${clientId}/payments`;
    try {
      await runTransaction(db, async (transaction) => {
        // Read the account first (required before writes in a transaction)
        const accountRef = doc(db, CXC_ACCOUNTS_PATH, clientId);
        const accountSnap = await transaction.get(accountRef);
        const clientName = accountSnap.exists() ? accountSnap.data().clientName : 'Desconocido';

        // 1. Add payment to subcollection
        const paymentRef = doc(collection(db, path));
        transaction.set(paymentRef, {
          ...data,
          clientId,
          createdAt: serverTimestamp(),
        });

        // 2. Update account balance atomically
        if (accountSnap.exists()) {
          transaction.update(accountRef, {
            totalBalance: increment(-data.amountUsd),
            lastUpdated: serverTimestamp(),
          });
        }

        // 3. Record as income in the main ledger
        const txRef = doc(collection(db, TRANSACTIONS_PATH));
        transaction.set(txRef, {
          date: data.date,
          clientName,
          concept: `ABONO CXC: ${data.concept || ''}`,
          amountUsd: data.amountUsd,
          paymentMethod: PaymentMethod.USD_CASH,
          type: TransactionType.INCOME,
          isCXC: false,
          createdAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async getCXCPayments(clientId: string): Promise<CXCPayment[]> {
    const path = `${CXC_ACCOUNTS_PATH}/${clientId}/payments`;
    try {
      const q = query(collection(db, path), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCPayment));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  // ─── Receipts ───────────────────────────────────────────────

  // C-02 FIX: Atomic receipt counter (no duplicates)
  // C-03 FIX: All 3 writes (receipt + CXC + ledger) in a single transaction
  async addReceipt(data: Omit<Receipt, 'id' | 'createdAt' | 'receiptNumber'>) {
    try {
      // Query for existing CXC account outside transaction (reads for queries)
      const cxcQuery = query(collection(db, CXC_ACCOUNTS_PATH), where('clientName', '==', data.recipient));
      const cxcSnapshot = await getDocs(cxcQuery);

      // Pre-generate the receipt doc ref so we can return it
      const receiptRef = doc(collection(db, RECEIPTS_PATH));

      await runTransaction(db, async (transaction) => {
        // C-02: Atomic counter for receipt numbers
        const counterRef = doc(db, 'settings', 'receiptCounter');
        const counterSnap = await transaction.get(counterRef);
        const currentCount = counterSnap.exists() ? (counterSnap.data().count || 0) : 0;
        const nextNum = (currentCount + 1).toString().padStart(5, '0');
        transaction.set(counterRef, { count: currentCount + 1 }, { merge: true });

        // 1. Create the receipt with atomic number
        transaction.set(receiptRef, {
          ...data,
          receiptNumber: nextNum,
          createdAt: serverTimestamp(),
        });

        // 2. Update or create CXC account for the recipient
        if (cxcSnapshot.empty) {
          const newAccountRef = doc(collection(db, CXC_ACCOUNTS_PATH));
          transaction.set(newAccountRef, {
            clientName: data.recipient,
            totalBalance: data.amountUsd,
            lastUpdated: serverTimestamp(),
          });
        } else {
          const accountDoc = cxcSnapshot.docs[0];
          transaction.update(doc(db, CXC_ACCOUNTS_PATH, accountDoc.id), {
            totalBalance: increment(data.amountUsd),
            lastUpdated: serverTimestamp(),
          });
        }

        // 3. Record as withdrawal in main ledger
        const txRef = doc(collection(db, TRANSACTIONS_PATH));
        transaction.set(txRef, {
          date: data.date,
          clientName: data.recipient,
          concept: `RETIRO: ${data.concept}`,
          amountUsd: data.amountUsd,
          paymentMethod: PaymentMethod.USD_CASH,
          type: TransactionType.WITHDRAWAL,
          isCXC: true,
          createdAt: serverTimestamp(),
        });
      });

      return receiptRef;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, RECEIPTS_PATH);
      return null;
    }
  },

  async getReceipts(): Promise<Receipt[]> {
    try {
      const q = query(collection(db, RECEIPTS_PATH), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, RECEIPTS_PATH);
      return [];
    }
  },

  // ─── Real-time listeners ───────────────────────────────────

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

  subscribeToCXCAccounts(callback: (data: CXCAccount[]) => void) {
    return onSnapshot(collection(db, CXC_ACCOUNTS_PATH), (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCAccount)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, CXC_ACCOUNTS_PATH));
  },

  // C-05 FIX: New real-time listener for receipts (was missing)
  subscribeToReceipts(callback: (data: Receipt[]) => void) {
    const q = query(collection(db, RECEIPTS_PATH), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, RECEIPTS_PATH));
  },

  // ─── Settings ──────────────────────────────────────────────

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
      return null;
    }
  },

  async updateExchangeRate(rate: number) {
    try {
      const docRef = doc(db, 'settings', 'global');
      await setDoc(docRef, {
        exchangeRate: rate,
        lastUpdated: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
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
  }
};
