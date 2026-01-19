
export interface BottleSip {
    timestamp: number;
    volumeMl: number;
    source: 'bottle';
    is_synced_cloud?: boolean;
    is_synced_garmin?: boolean;
}

export interface ManualEntry {
    id: string;
    timestamp: number;
    name: string;
    volumeMl: number; // Raw volume
    // factor percentage (0-100), e.g., 90 for 90%
    hydrationFactor: number;
    calculatedVolumeMl: number; // volumeMl * (hydrationFactor / 100)
    source: 'manual';
    icon?: string; // Optional icon identifier
    is_synced_cloud?: boolean;
    is_synced_garmin?: boolean;
}

export interface HydrationPreset {
    id: string;
    name: string;
    volumeMl: number;
    hydrationFactor: number;
    icon?: string;
    is_synced_cloud?: boolean;
}

export type ThemeType = 'light' | 'dark' | 'system';

export interface HydrationState {
    bottleSips: BottleSip[];
    manualEntries: ManualEntry[];
    presets: HydrationPreset[];
    dailyGoals: Record<string, number>; // Map 'YYYY-MM-DD' -> goal
    defaultGoal: number;

    // Device status
    deviceStatus: 'disconnected' | 'connecting' | 'connected';
    deviceName: string | null;
    batteryLevel: number | null;

    // Actions
    addBottleSip: (sip: BottleSip) => void;
    addManualEntry: (entry: Omit<ManualEntry, 'id' | 'timestamp' | 'calculatedVolumeMl' | 'source'>) => void;
    updateManualEntry: (id: string, entry: Partial<ManualEntry>) => void;
    deleteManualEntry: (id: string) => void;

    savePreset: (preset: Omit<HydrationPreset, 'id'>) => void;
    updatePreset: (id: string, preset: Partial<HydrationPreset>) => void;
    deletePreset: (id: string) => void;

    setDailyGoal: (goal: number) => void;
    setGoalForDate: (date: string, goal: number) => void;
    setDeviceStatus: (status: HydrationState['deviceStatus']) => void;
    setDeviceName: (name: string | null) => void;

    theme: ThemeType;
    setTheme: (theme: ThemeType) => void;

    // Sync Helpers
    markSipsAsSyncedCloud: (timestamps: number[]) => void;
    markManualEntriesAsSyncedCloud: (ids: string[]) => void;
    markSipsAsSyncedGarmin: (timestamps: number[]) => void;
    markManualEntriesAsSyncedGarmin: (ids: string[]) => void;

    // Phase 2.0 Auth & Sync
    pendingDeletions: string[];
    pendingPresetDeletions: string[]; // Queue for preset deletions
    user: User | null;
    setUser: (user: User | null) => void;
    deleteBottleSip: (timestamp: number) => void;

    // Sync Methods
    markPresetsAsSyncedCloud: (ids: string[]) => void;
    mergeSyncData: (serverSips: BottleSip[], serverManual: ManualEntry[]) => void;
    mergePresetSyncData: (serverPresets: HydrationPreset[]) => void;
}

// Re-export User if needed or just use it in the interface above
import type { User } from '@supabase/supabase-js';
