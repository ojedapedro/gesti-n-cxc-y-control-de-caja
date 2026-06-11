import { 
  collection, 
  getDocs, 
  collectionGroup 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface BackupConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'closure';
  actionType: 'download' | 'browser' | 'both';
  lastBackupAt?: string; // ISO string
}

export interface SavedBackupEntry {
  id: string;
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

const CONFIG_KEY = 'db_backup_config';
const BACKUPS_LIST_KEY = 'db_backups_list';

const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  frequency: 'daily',
  actionType: 'download',
};

export const backupService = {
  getBackupConfig(): BackupConfig {
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Error reading backup config", e);
    }
    return DEFAULT_CONFIG;
  },

  saveBackupConfig(config: BackupConfig): void {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error("Error saving backup config", e);
    }
  },

  getSavedBackupsList(): SavedBackupEntry[] {
    try {
      const stored = localStorage.getItem(BACKUPS_LIST_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("Error reading backups list", e);
    }
    return [];
  },

  getBackupData(id: string): string | null {
    try {
      return localStorage.getItem(`db_backup_data_${id}`);
    } catch (e) {
      console.error("Error getting backup data", e);
      return null;
    }
  },

  saveBackupToBrowser(filename: string, jsonData: string): boolean {
    try {
      const id = Date.now().toString();
      const sizeBytes = new Blob([jsonData]).size;
      
      // Save data under its own key
      localStorage.setItem(`db_backup_data_${id}`, jsonData);
      
      // Update inventory list
      const list = this.getSavedBackupsList();
      list.unshift({
        id,
        filename,
        timestamp: new Date().toISOString(),
        sizeBytes,
      });

      // Simple limit: keep only top 5 browser backups to prevent storage quota issues
      while (list.length > 5) {
        const removed = list.pop();
        if (removed) {
          localStorage.removeItem(`db_backup_data_${removed.id}`);
        }
      }

      localStorage.setItem(BACKUPS_LIST_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error("Error saving backup to browser storage:", e);
      return false;
    }
  },

  deleteBackup(id: string): void {
    try {
      localStorage.removeItem(`db_backup_data_${id}`);
      const list = this.getSavedBackupsList().filter(b => b.id !== id);
      localStorage.setItem(BACKUPS_LIST_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("Error deleting backup", e);
    }
  },

  triggerDownload(jsonData: string, filename: string): void {
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  async exportFirestoreToJSON(): Promise<string> {
    const collectionsToExport = [
      { name: 'sellers', path: 'sellers' },
      { name: 'transactions', path: 'transactions' },
      { name: 'expenses', path: 'expenses' },
      { name: 'cxc_accounts', path: 'cxc_accounts' },
      { name: 'receipts', path: 'receipts' },
      { name: 'cash_closures', path: 'cash_closures' },
      { name: 'settings', path: 'settings' },
      { name: 'exchange_rates', path: 'exchange_rates' }
    ];

    const exportData: Record<string, any> = {
      metadata: {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        app: "Cartera y Balance de Liquidez (Control de Ventas, Gastos y Cobranzas)",
        environment: "Production Backup"
      },
      collections: {}
    };

    for (const coll of collectionsToExport) {
      try {
        const snap = await getDocs(collection(db, coll.path));
        exportData.collections[coll.name] = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (e) {
        console.warn(`Could not export collection ${coll.path}`, e);
        exportData.collections[coll.name] = [];
      }
    }

    // Include collectionGroup payments (subcollections)
    try {
      const snap = await getDocs(collectionGroup(db, 'payments'));
      exportData.collections['payments'] = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (e) {
      console.warn(`Could not export collectionGroup payments`, e);
      exportData.collections['payments'] = [];
    }

    return JSON.stringify(exportData, null, 2);
  },

  async runScheduledBackupCheck(): Promise<{ executed: boolean; method?: string; error?: string }> {
    const config = this.getBackupConfig();
    if (!config.enabled) {
      return { executed: false };
    }

    // Skip timer-based logic for closure frequency (that is handled by explicit trigger)
    if (config.frequency === 'closure') {
      return { executed: false };
    }

    const lastBackupTime = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
    const now = Date.now();
    let isDue = false;

    if (!config.lastBackupAt) {
      isDue = true;
    } else {
      const diffMs = now - lastBackupTime;
      const hours = diffMs / (1000 * 60 * 60);

      if (config.frequency === 'daily' && hours >= 23.5) {
        isDue = true;
      } else if (config.frequency === 'weekly' && hours >= 167.5) {
        isDue = true;
      } else if (config.frequency === 'monthly' && hours >= 719.5) {
        isDue = true;
      }
    }

    if (!isDue) {
      return { executed: false };
    }

    try {
      const data = await this.exportFirestoreToJSON();
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `autobackup_firestore_${dateStr}.json`;

      let browserSaved = false;

      if (config.actionType === 'download' || config.actionType === 'both') {
        this.triggerDownload(data, filename);
      }

      if (config.actionType === 'browser' || config.actionType === 'both') {
        browserSaved = this.saveBackupToBrowser(filename, data);
      }

      config.lastBackupAt = new Date().toISOString();
      this.saveBackupConfig(config);

      return { 
        executed: true, 
        method: config.actionType === 'both' 
          ? 'Descarga y Almacenamiento local' 
          : config.actionType === 'browser' 
            ? 'Almacenamiento local' 
            : 'Descarga de archivo'
      };
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      console.error("Scheduled backup check error", e);
      return { executed: false, error: errMessage };
    }
  },

  async triggerClosureBackup(): Promise<{ executed: boolean; method?: string }> {
    const config = this.getBackupConfig();
    if (!config.enabled || config.frequency !== 'closure') {
      return { executed: false };
    }

    try {
      const data = await this.exportFirestoreToJSON();
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `cierre_autobackup_firestore_${dateStr}.json`;

      if (config.actionType === 'download' || config.actionType === 'both') {
        this.triggerDownload(data, filename);
      }

      if (config.actionType === 'browser' || config.actionType === 'both') {
        this.saveBackupToBrowser(filename, data);
      }

      config.lastBackupAt = new Date().toISOString();
      this.saveBackupConfig(config);

      return { 
        executed: true, 
        method: config.actionType === 'both' 
          ? 'Descarga y Almacenamiento local' 
          : config.actionType === 'browser' 
            ? 'Almacenamiento local' 
            : 'Descarga de archivo'
      };
    } catch (e) {
      console.error("Closure backup error", e);
      return { executed: false };
    }
  }
};
