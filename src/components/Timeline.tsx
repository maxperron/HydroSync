import React, { useMemo, useState } from 'react';
import { useHydrationStore } from '../store/hydrationStore';
import { Trash2, Edit2, Droplet, Coffee, Wine, Beer, Milk, Cloud, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { BottleSip, ManualEntry } from '../types';

interface TimelineProps {
    bottleSips: BottleSip[];
    manualEntries: ManualEntry[];
}

// Simple icon mapper based on name
const getIcon = (name: string, source: 'bottle' | 'manual') => {
    if (source === 'bottle') return <Droplet className="w-5 h-5 text-brand-blue" />;
    const lower = name.toLowerCase();
    if (lower.includes('coffee')) return <Coffee className="w-5 h-5 text-amber-600" />;
    if (lower.includes('tea')) return <Coffee className="w-5 h-5 text-green-600" />;
    if (lower.includes('beer')) return <Beer className="w-5 h-5 text-yellow-500" />;
    if (lower.includes('wine')) return <Wine className="w-5 h-5 text-red-500" />;
    if (lower.includes('milk')) return <Milk className="w-5 h-5 text-slate-200" />;
    return <Droplet className="w-5 h-5 text-sky-400" />; // Default manual
};

const SyncStatus = ({ synced, type }: { synced: boolean, type: 'cloud' | 'garmin' }) => {
    const Icon = type === 'cloud' ? Cloud : Activity;
    const colorClass = synced
        ? (type === 'cloud' ? "text-green-500" : "text-blue-500")
        : "text-muted-foreground/30";

    return (
        <motion.div
            className={clsx("p-1 rounded-full", colorClass)}
            animate={!synced ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
            transition={!synced ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
        >
            <Icon className="w-3.5 h-3.5" />
        </motion.div>
    );
};

export const Timeline: React.FC<TimelineProps> = ({ bottleSips, manualEntries }) => {
    const { deleteManualEntry, deleteBottleSip, user } = useHydrationStore();
    const [isEditMode, setIsEditMode] = useState(false);

    const mergedEntries = useMemo(() => {
        const sips = bottleSips.map(s => ({
            ...s,
            id: `sip-${s.timestamp}`,
            type: 'bottle',
            name: 'Smart Bottle',
            calculatedVolumeMl: s.volumeMl,
            is_synced_cloud: s.is_synced_cloud || false,
            is_synced_garmin: s.is_synced_garmin || false
        }));
        const manual = manualEntries.map(e => ({
            ...e,
            type: 'manual',
            is_synced_cloud: e.is_synced_cloud || false,
            is_synced_garmin: e.is_synced_garmin || false
        }));
        return [...sips, ...manual].sort((a, b) => b.timestamp - a.timestamp);
    }, [bottleSips, manualEntries]);

    const formatTime = (ts: number) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date(ts));
    const formatDate = (ts: number) => {
        const d = new Date(ts);
        const today = new Date();
        return d.toDateString() === today.toDateString() ? 'Today' : d.toLocaleDateString();
    };

    return (
        <div className="flex flex-col w-full">
            <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-xl font-bold tracking-tight">History</h3>
                <button
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={clsx(
                        "p-3 rounded-full transition active:scale-95",
                        isEditMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                    )}
                >
                    <Edit2 className="w-5 h-5" />
                </button>
            </div>

            <div className="space-y-4 pb-24">
                {mergedEntries.length === 0 && (
                    <div className="text-center text-muted-foreground py-10 opacity-50 font-medium">
                        No hydration data yet.
                    </div>
                )}

                {mergedEntries.map((entry, index) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, type: "spring", stiffness: 100 }}
                        key={entry.id}
                        className="flex items-center justify-between p-4 bg-card text-card-foreground rounded-[2rem] border border-border/20 shadow-sm hover:bg-secondary/30 transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-secondary rounded-full">
                                {getIcon(entry.name, entry.type as any)}
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-base">{entry.name}</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground font-medium">
                                        {formatDate(entry.timestamp)}, {formatTime(entry.timestamp)}
                                    </span>
                                    {/* Sync Status Chips */}
                                    {user && (
                                        <div className="flex gap-0.5 items-center pl-1 border-l border-border/30 ml-1">
                                            <SyncStatus synced={entry.is_synced_cloud} type="cloud" />
                                            <SyncStatus synced={entry.is_synced_garmin} type="garmin" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-lg text-display">+{entry.calculatedVolumeMl} ml</span>
                                {entry.type === 'manual' && typeof (entry as any).hydrationFactor === 'number' && (entry as any).hydrationFactor !== 100 && (
                                    <span className="text-[10px] text-muted-foreground font-medium bg-secondary/50 px-1.5 py-0.5 rounded-full">
                                        {(entry as any).hydrationFactor}% eff.
                                    </span>
                                )}
                            </div>

                            {isEditMode && (
                                <button
                                    onClick={() => {
                                        if (entry.type === 'manual') {
                                            deleteManualEntry(entry.id);
                                        } else {
                                            // Bottle sip ID is sip-timestamp. Or use original timestamp from entry.
                                            deleteBottleSip(entry.timestamp);
                                        }
                                    }}
                                    className="p-3 text-destructive hover:bg-destructive/10 rounded-full transition active:scale-90"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};
