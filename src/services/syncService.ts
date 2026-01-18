import { supabase } from './supabase';
import { useHydrationStore } from '../store/hydrationStore';


export const syncService = {
    isSyncing: false,

    async uploadPendingSips(userId: string) {
        if (this.isSyncing) return;
        this.isSyncing = true;

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
