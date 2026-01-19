import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HydrationState, ManualEntry } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 9);

interface DebugState {
    lastPacketHex: string | null;
    setLastPacketHex: (hex: string) => void;
}

export const useHydrationStore = create<HydrationState & DebugState>()(
    persist(
        (set) => ({
            bottleSips: [],
            manualEntries: [],
            presets: [],
            dailyGoals: {},
            defaultGoal: 2500, // Default 2.5L
            deviceStatus: 'disconnected',
            deviceName: null,
            batteryLevel: null,
            lastPacketHex: null,

            pendingDeletions: [],

            user: null,
            setUser: (user) => set({ user }),

            addBottleSip: (sip) => set((state) => ({
                bottleSips: [...state.bottleSips, { ...sip, is_synced_cloud: false, is_synced_garmin: false }]
            })),

            deleteBottleSip: (timestamp) => set((state) => {
                const pending = [...state.pendingDeletions];
                if (state.user) {
                    // key format matching syncService logic
                    pending.push(`${state.user.id}-${timestamp}-bottle`);
                }
                return {
                    bottleSips: state.bottleSips.filter(s => s.timestamp !== timestamp),
                    pendingDeletions: pending
                };
            }),

            deleteManualEntry: (id) => set((state) => {
                const pending = [...state.pendingDeletions];
                // For manual entries, the ID is already the UUID used in DB
                // But we only want to delete from cloud if it was ever synced? 
                // Actually, if we delete it before it syncs, we just remove it.
                // But simpler to just always attempt push delete.
                if (state.user) {
                    pending.push(id);
                }
                return {
                    manualEntries: state.manualEntries.filter((e) => e.id !== id),
                    pendingDeletions: pending
                };
            }),

            savePreset: (presetData) => set((state) => ({
                presets: [...state.presets, { id: generateId(), ...presetData }]
            })),

            updatePreset: (id, updates) => set((state) => ({
                presets: state.presets.map(p => p.id === id ? { ...p, ...updates } : p)
            })),

            deletePreset: (id) => set((state) => ({
                presets: state.presets.filter((p) => p.id !== id)
            })),

            setDailyGoal: (goal) => set({ defaultGoal: goal }),
            setGoalForDate: (date, goal) => set((state) => ({
                dailyGoals: { ...state.dailyGoals, [date]: goal }
            })),
            setDeviceStatus: (status) => set({ deviceStatus: status }),
            setDeviceName: (name) => set({ deviceName: name }),
            setLastPacketHex: (hex) => set({ lastPacketHex: hex }),

            // Sync Actions
            markSipsAsSyncedCloud: (timestamps: number[]) => set((state) => ({
                bottleSips: state.bottleSips.map(s => timestamps.includes(s.timestamp) ? { ...s, is_synced_cloud: true } : s)
            })),
            markManualEntriesAsSyncedCloud: (ids: string[]) => set((state) => ({
                manualEntries: state.manualEntries.map(e => ids.includes(e.id) ? { ...e, is_synced_cloud: true } : e)
            })),

            markSipsAsSyncedGarmin: (timestamps: number[]) => set((state) => ({
                bottleSips: state.bottleSips.map(s => timestamps.includes(s.timestamp) ? { ...s, is_synced_garmin: true } : s)
            })),
            markManualEntriesAsSyncedGarmin: (ids: string[]) => set((state) => ({
                manualEntries: state.manualEntries.map(e => ids.includes(e.id) ? { ...e, is_synced_garmin: true } : e)
            })),

            theme: 'system',
            setTheme: (theme) => set({ theme }),
        }),
        {
            name: 'hydration-storage', // name of the item in the storage (must be unique)
            storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
            partialize: (state) => ({
                // Only persist these fields
                bottleSips: state.bottleSips,
                manualEntries: state.manualEntries,
                presets: state.presets,
                dailyGoals: state.dailyGoals,
                defaultGoal: state.defaultGoal,
                theme: state.theme,
                pendingDeletions: state.pendingDeletions,
                // Don't persist user, let supabase auth listener handle it
            }),
        }
    )
);
