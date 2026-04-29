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
  onSnapshot
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
        concept: `VENTA A CRÉDITO CXC (Item: ${data.item || 'N/A'}): ${data.concept || ''}`,
        amountUsd: data.amountUsd,
        paymentMethod: PaymentMethod.CXC,
        type: TransactionType.SALE,
        isCXC: true,
        amountCXC: data.amountUsd
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
        await this.addTransaction({
          date: data.date,
          clientName: accountSnap.exists() ? accountSnap.data().clientName : 'Desconocido',
          concept: `ABONO CXC: ${data.concept || ''}`,
          amountUsd: data.amountUsd,
          paymentMethod: PaymentMethod.USD_CASH, // Assuming payments are cash
          type: TransactionType.INCOME,
          isCXC: false
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
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

  // Receipts
  async addReceipt(data: Omit<Receipt, 'id' | 'createdAt'>) {
    try {
      const res = await addDoc(collection(db, RECEIPTS_PATH), {
        ...data,
        createdAt: serverTimestamp(),
      });
      
      // If it's a withdrawal for CXC, we should also track it in CXC
      // The user said: "recibo para justificar retiros en efectivos por caja los cuales seran parte de las CXC"
      // So every receipt creates a CXC entry? Or just if specified?
      // For now, let's assume receipts are always CXC additions for the recipient
      await this.addOrUpdateCXCAccount(data.recipient, data.amountUsd);
      
      // Record as withdrawal in main ledger
      await this.addTransaction({
        date: data.date,
        clientName: data.recipient,
        concept: `RETIRO: ${data.concept}`,
        amountUsd: data.amountUsd,
        paymentMethod: PaymentMethod.USD_CASH,
        type: TransactionType.WITHDRAWAL,
        isCXC: true
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

  subscribeToCXCAccounts(callback: (data: CXCAccount[]) => void) {
    return onSnapshot(collection(db, CXC_ACCOUNTS_PATH), (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CXCAccount)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, CXC_ACCOUNTS_PATH));
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
