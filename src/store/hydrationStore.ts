import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HydrationState, ManualEntry, BottleSip } from '../types';

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

            addManualEntry: (entryData) => {
                const calculatedVolumeMl = Math.round(entryData.volumeMl * (entryData.hydrationFactor / 100));
                const newEntry: ManualEntry = {
                    id: generateId(),
                    timestamp: Date.now(),
                    source: 'manual',
                    calculatedVolumeMl,
                    is_synced_cloud: false,
                    is_synced_garmin: false,
                    ...entryData
                };
                set((state) => ({
                    manualEntries: [...state.manualEntries, newEntry]
                }));
            },

            updateManualEntry: (id, updates) => set((state) => {
                const newEntries = state.manualEntries.map((entry) => {
                    if (entry.id !== id) return entry;

                    // Recalculate if volume or factor changes
                    const volumeMl = updates.volumeMl ?? entry.volumeMl;
                    const hydrationFactor = updates.hydrationFactor ?? entry.hydrationFactor;
                    const calculatedVolumeMl = Math.round(volumeMl * (hydrationFactor / 100));

                    return { ...entry, ...updates, calculatedVolumeMl };
                });
                return { manualEntries: newEntries };
            }),
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

            // Merge server data with local state
            mergeSyncData: (serverSips: BottleSip[], serverManual: ManualEntry[]) => set((state) => {
                // Merge Bottle Sips
                const existingTimestamps = new Set(state.bottleSips.map(s => s.timestamp));
                const newSips = serverSips.filter(s => !existingTimestamps.has(s.timestamp));
                // We could also update existing synced flags, but simplistic merge is:
                // Keep local state (preserves pending syncs), add strictly new server items.
                // But what if server is "more synced" than local? 
                // Let's assume server data is grounded truth for those timestamps.

                // Better approach: Rebuild list by map
                const sipMap = new Map<number, BottleSip>();
                // 1. Put server data first (trusted, synced)
                serverSips.forEach(s => sipMap.set(s.timestamp, { ...s, is_synced_cloud: true })); // Ensure they are marked synced
                // 2. Overlay local "unsynced" data (pending upload)
                state.bottleSips.forEach(s => {
                    if (!s.is_synced_cloud) {
                        sipMap.set(s.timestamp, s);
                    } else if (!sipMap.has(s.timestamp)) {
                        // It was synced locally but server doesn't have it? 
                        // Maybe deleted on server? If so, we should drop it?
                        // For Phase 2 simple sync: Keep it.
                        sipMap.set(s.timestamp, s);
                    }
                });

                // Merge Manual Entries
                const manualMap = new Map<string, ManualEntry>();
                serverManual.forEach(e => manualMap.set(e.id, { ...e, is_synced_cloud: true }));
                state.manualEntries.forEach(e => {
                    if (!e.is_synced_cloud) {
                        manualMap.set(e.id, e);
                    } else if (!manualMap.has(e.id)) {
                        manualMap.set(e.id, e);
                    }
                });

                return {
                    bottleSips: Array.from(sipMap.values()).sort((a, b) => a.timestamp - b.timestamp),
                    manualEntries: Array.from(manualMap.values()).sort((a, b) => a.timestamp - b.timestamp)
                };
            }),
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
