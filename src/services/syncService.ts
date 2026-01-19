import { supabase } from './supabase';
import { useHydrationStore } from '../store/hydrationStore';


export const syncService = {
    isSyncing: false,

    // Fetch history from Supabase (Down-Sync)
    async fetchHistory(userId: string) {
        console.log("Fetching history...");
        const { data, error } = await supabase
            .from('sips')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error("Error fetching history:", error);
            return;
        }

        if (data && data.length > 0) {
            // Parse data into BottleSip and ManualEntry
            /* Data format from DB:
               {
                 id: string,
                 user_id: string,
                 timestamp: number,
                 volume_ml: number,
                 source: 'bottle' | 'manual',
                 hydration_factor: number (default 100),
                 created_at: string,
                 is_synced_garmin: boolean
               }
            */

            const bottleSips: any[] = [];
            const manualEntries: any[] = [];

            data.forEach(row => {
                if (row.source === 'bottle') {
                    bottleSips.push({
                        timestamp: row.timestamp,
                        volumeMl: row.volume_ml,
                        source: 'bottle',
                        is_synced_cloud: true,
                        is_synced_garmin: row.is_synced_garmin
                    });
                } else {
                    manualEntries.push({
                        id: row.id,
                        timestamp: row.timestamp,
                        name: row.name || 'Manual Entry', // Restore name or default
                        icon: row.icon,                   // Restore icon
                        volumeMl: Math.round(row.volume_ml / (row.hydration_factor / 100)),
                        // Wait, DB stores volume_ml which IS calculatedVolumeMl for manual entries based on my upload logic.
                        // And we store hydration_factor.
                        // So raw volumeMl = row.volume_ml / factor.
                        // Actually, in uploadPendingSips: 
                        // volume_ml: e.calculatedVolumeMl
                        // hydration_factor: e.hydrationFactor
                        // So to reconstruct ManualEntry:
                        // calculatedVolumeMl = row.volume_ml
                        // hydrationFactor = row.hydration_factor
                        // volumeMl (raw) = row.volume_ml / (row.hydration_factor/100)

                        hydrationFactor: row.hydration_factor,
                        calculatedVolumeMl: row.volume_ml,
                        source: 'manual',
                        is_synced_cloud: true,
                        is_synced_garmin: row.is_synced_garmin
                    });
                }
            });

            // Reconstruct raw volume for manual entries if needed
            manualEntries.forEach(e => {
                if (e.hydrationFactor > 0) {
                    e.volumeMl = Math.round(e.calculatedVolumeMl / (e.hydrationFactor / 100));
                } else {
                    e.volumeMl = e.calculatedVolumeMl;
                }
            });

            // Update Store
            useHydrationStore.getState().mergeSyncData(bottleSips, manualEntries);

            // Fetch Presets
            const { data: presetData, error: presetError } = await supabase
                .from('presets')
                .select('*')
                .eq('user_id', userId);

            if (presetError) {
                console.error("Error fetching presets:", presetError);
            } else if (presetData) {
                const presets: any[] = presetData.map(p => ({
                    id: p.id,
                    name: p.name,
                    volumeMl: p.volume_ml,
                    hydrationFactor: p.hydration_factor,
                    icon: p.icon,
                    is_synced_cloud: true
                }));
                useHydrationStore.getState().mergePresetSyncData(presets);
                console.log(`Fetched ${presets.length} presets.`);
            }

            console.log(`Fetched ${bottleSips.length} sips and ${manualEntries.length} manual entries.`);
        }
    },

    async deletePendingItems() {
        const { pendingDeletions, pendingPresetDeletions } = useHydrationStore.getState();

        // 1. Delete Sips
        if (pendingDeletions.length > 0) {
            console.log(`Deleting ${pendingDeletions.length} sips...`);
            const { error } = await supabase.from('sips').delete().in('id', pendingDeletions);
            if (!error) {
                // Cleanup store queue
                useHydrationStore.setState((state) => ({
                    pendingDeletions: state.pendingDeletions.filter(id => !pendingDeletions.includes(id))
                }));
            } else {
                console.error("Error deleting sips:", error);
            }
        }

        // 2. Delete Presets
        if (pendingPresetDeletions.length > 0) {
            console.log(`Deleting ${pendingPresetDeletions.length} presets...`);
            const { error } = await supabase.from('presets').delete().in('id', pendingPresetDeletions);
            if (!error) {
                useHydrationStore.setState((state) => ({
                    pendingPresetDeletions: state.pendingPresetDeletions.filter(id => !pendingPresetDeletions.includes(id))
                }));
            } else {
                console.error("Error deleting presets:", error);
            }
        }
    },

    async syncAll(userId: string) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            // 1. Run Deletions
            await this.deletePendingItems();

            const { bottleSips, manualEntries, presets, markSipsAsSyncedCloud, markManualEntriesAsSyncedCloud, markPresetsAsSyncedCloud } = useHydrationStore.getState();

            // 2. Sync Sips & Manual Entries
            const pendingSips = bottleSips.filter(s => !s.is_synced_cloud);
            const pendingManual = manualEntries.filter(e => !e.is_synced_cloud);

            if (pendingSips.length > 0 || pendingManual.length > 0) {
                console.log(`Syncing ${pendingSips.length} sips and ${pendingManual.length} manual entries...`);

                const sipsPayload = pendingSips.map(s => ({
                    id: `${userId}-${s.timestamp}-bottle`,
                    user_id: userId,
                    timestamp: s.timestamp,
                    volume_ml: s.volumeMl,
                    source: 'bottle',
                    is_synced_garmin: s.is_synced_garmin || false
                }));

                const manualPayload = pendingManual.map(e => ({
                    id: e.id,
                    user_id: userId,
                    timestamp: e.timestamp,
                    volume_ml: e.calculatedVolumeMl,
                    source: 'manual',
                    hydration_factor: e.hydrationFactor,
                    name: e.name,
                    icon: e.icon,
                    is_synced_garmin: e.is_synced_garmin || false
                }));

                const allPayload = [...sipsPayload, ...manualPayload];

                const { error } = await supabase.from('sips').upsert(allPayload, { onConflict: 'id' });

                if (error) {
                    console.error("Sync failed:", error);
                } else {
                    if (pendingSips.length > 0) markSipsAsSyncedCloud(pendingSips.map(s => s.timestamp));
                    if (pendingManual.length > 0) markManualEntriesAsSyncedCloud(pendingManual.map(e => e.id));
                    console.log("Sips synced successfully");
                }
            }

            // 3. Sync Presets
            const pendingPresets = presets.filter(p => !p.is_synced_cloud);
            if (pendingPresets.length > 0) {
                console.log(`Syncing ${pendingPresets.length} presets...`);
                const presetPayload = pendingPresets.map(p => ({
                    id: p.id,
                    user_id: userId,
                    name: p.name,
                    volume_ml: p.volumeMl,
                    hydration_factor: p.hydrationFactor,
                    icon: p.icon
                }));

                const { error } = await supabase.from('presets').upsert(presetPayload, { onConflict: 'id' });

                if (error) {
                    console.error("Preset sync failed:", error);
                } else {
                    markPresetsAsSyncedCloud(pendingPresets.map(p => p.id));
                    console.log("Presets synced successfully");
                }
            }

        } catch (err) {
            console.error("Sync error:", err);
        } finally {
            this.isSyncing = false;
        }
    }
};
