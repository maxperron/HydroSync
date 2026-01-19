import { supabase } from './supabase';
import { useHydrationStore } from '../store/hydrationStore';


export const syncService = {
    isSyncing: false,

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
            // ... (rest of function)
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
