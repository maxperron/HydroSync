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
            console.log(`Fetched ${bottleSips.length} sips and ${manualEntries.length} manual entries.`);
        }
    },

    async deletePendingSips() {
        // Can run concurrently with upload, but let's be safe
        const { pendingDeletions } = useHydrationStore.getState();
        if (pendingDeletions.length === 0) return;

        console.log(`Syncing deletions: ${pendingDeletions.length} items`);

        try {
            // We can batch delete by IDs
            const { error } = await supabase
                .from('sips')
                .delete()
                .in('id', pendingDeletions);

            if (error) {
                console.error("Delete sync failed:", error);
            } else {
                console.log("Delete sync successful");
                // Remove from pendingDeletions
                // We need to modify the store directly here? No, store needs a method?
                // Ideally store should handle its state updates.
                // But we don't have a 'removePendingDeletions' method.
                // We can use setState from zustand if exported, or just add a helper to store.
                // For now, let's just hack it via direct setState or assume we can add a method.

                // Let's add removePendingDeletions to store first? 
                // Or actually, just update the store with a filter.
                useHydrationStore.setState((state) => ({
                    pendingDeletions: state.pendingDeletions.filter(id => !pendingDeletions.includes(id))
                }));
            }
        } catch (err) {
            console.error("Delete sync error:", err);
        }
    },

    async uploadPendingSips(userId: string) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        // Also run deletions!
        await this.deletePendingSips();

        const { bottleSips, manualEntries, markSipsAsSyncedCloud, markManualEntriesAsSyncedCloud } = useHydrationStore.getState();

        try {
            // 1. Filter Pending Items
            const pendingSips = bottleSips.filter(s => !s.is_synced_cloud);
            const pendingManual = manualEntries.filter(e => !e.is_synced_cloud);

            if (pendingSips.length === 0 && pendingManual.length === 0) {
                this.isSyncing = false;
                return;
            }

            console.log(`Syncing ${pendingSips.length} sips and ${pendingManual.length} manual entries...`);

            // 2. Prepare Data for Supabase
            // We use 'id' as timestamp string for bottle items if we really need a unique ID, 
            // but bottle sips don't have a specific ID in our store, just timestamp.
            // Let's generate a unique composite ID: `${userId}-${timestamp}-bottle`

            const sipsPayload = pendingSips.map(s => ({
                id: `${userId}-${s.timestamp}-bottle`,
                user_id: userId,
                timestamp: s.timestamp,
                volume_ml: s.volumeMl,
                source: 'bottle',
                is_synced_garmin: s.is_synced_garmin || false
            }));

            const manualPayload = pendingManual.map(e => ({
                id: e.id, // Manual entries have UUIDs already
                user_id: userId,
                timestamp: e.timestamp,
                volume_ml: e.calculatedVolumeMl, // We store the Calculated Volume as the truth
                source: 'manual',
                hydration_factor: e.hydrationFactor,
                name: e.name, // Save Name
                icon: e.icon, // Save Icon
                is_synced_garmin: e.is_synced_garmin || false
            }));

            const allPayload = [...sipsPayload, ...manualPayload];

            // 3. Push to Supabase
            const { error } = await supabase
                .from('sips')
                .upsert(allPayload, { onConflict: 'id' });

            if (error) {
                console.error("Sync failed:", error);
            } else {
                // 4. Mark as Synced Locally
                if (pendingSips.length > 0) {
                    markSipsAsSyncedCloud(pendingSips.map(s => s.timestamp));
                }
                if (pendingManual.length > 0) {
                    markManualEntriesAsSyncedCloud(pendingManual.map(e => e.id));
                }
                console.log("Sync successful");
            }

        } catch (err) {
            console.error("Sync error:", err);
        } finally {
            this.isSyncing = false;
        }
    }
};
