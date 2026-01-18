import React, { useState } from 'react';
import { useHydrationStore } from '../store/hydrationStore';
import { Plus, X, Coffee, GlassWater, Save, Pencil, Trash2, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

interface QuickAddScreenProps {
    onClose: () => void;
}

export const QuickAddScreen: React.FC<QuickAddScreenProps> = ({ onClose }) => {
    const { addManualEntry, presets, savePreset, updatePreset, deletePreset, theme } = useHydrationStore();

    // Resolve Theme for Background
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = theme === 'system' ? (isSystemDark ? 'dark' : 'light') : theme;
    const bgColor = resolvedTheme === 'dark' ? '#020617' : '#FDF7FF';

    // Main Form State
    const [name, setName] = useState('Water');
    const [volume, setVolume] = useState('250');
    const [factor, setFactor] = useState('100');
    const [isSaveToggleOn, setIsSaveToggleOn] = useState(false);

    // Edit Dialog State
    const [editingPreset, setEditingPreset] = useState<any | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Add Entry
        addManualEntry({
            name,
            volumeMl: Number(volume),
            hydrationFactor: Number(factor),
        });

        // Save New Preset?
        if (isSaveToggleOn) {
            savePreset({ name, volumeMl: Number(volume), hydrationFactor: Number(factor) });
        }

        onClose();
    };

    const applyPresetValues = (preset: any) => {
        setName(preset.name);
        setVolume(String(preset.volumeMl));
        setFactor(String(preset.hydrationFactor));
        setIsSaveToggleOn(false);
    };

    // --- Edit Dialog Logic ---
    const EditPresetDialog = () => {
        if (!editingPreset) return null;

        const [editName, setEditName] = useState(editingPreset.name);
        const [editVol, setEditVol] = useState(String(editingPreset.volumeMl));
        const [editFactor, setEditFactor] = useState(String(editingPreset.hydrationFactor));

        const handleSaveEdit = () => {
            updatePreset(editingPreset.id, {
                name: editName,
                volumeMl: Number(editVol),
                hydrationFactor: Number(editFactor)
            });
            setEditingPreset(null);
        };

        return (
            <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div
                    className="bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4 scale-100 animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xl font-bold text-violet-950 font-display">Edit Preset</h3>
                        <button onClick={() => setEditingPreset(null)} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Name</label>
                            <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-slate-900" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Vol (ml)</label>
                                <input type="number" value={editVol} onChange={e => setEditVol(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-slate-900" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Hydration %</label>
                                <input type="number" value={editFactor} onChange={e => setEditFactor(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-slate-900" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <button
                            onClick={() => { deletePreset(editingPreset.id); setEditingPreset(null); }}
                            className="p-4 rounded-[1.25rem] bg-red-50 text-red-600 font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition"
                        >
                            <Trash2 className="w-5 h-5" /> Delete
                        </button>
                        <button
                            onClick={handleSaveEdit}
                            className="p-4 rounded-[1.25rem] bg-violet-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-violet-700 transition"
                        >
                            <Save className="w-5 h-5" /> Save
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[99999] flex flex-col h-[100dvh]"
            style={{ backgroundColor: bgColor }}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-6 z-10 shrink-0">
                <h2 className="text-3xl font-display font-bold tracking-tight text-foreground">
                    Quick Add
                </h2>
                <button
                    onClick={onClose}
                    className="p-3 rounded-full bg-card hover:bg-secondary text-foreground shadow-sm transition active:scale-95 border border-border"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 pb-40 relative">

                {/* Section Title */}
                <h3 className="text-sm font-bold text-violet-800/60 uppercase tracking-widest mb-4 px-1">Presets</h3>

                {/* Presets - Horizontal Scroll */}
                <div className="flex gap-4 overflow-x-auto pb-8 -mx-6 px-6 scrollbar-hide snap-x">
                    {/* Default Chips (Always apply values only) */}
                    <button
                        type="button"
                        onClick={() => applyPresetValues({ name: 'Water', volumeMl: 250, hydrationFactor: 100 })}
                        className="flex flex-col items-center justify-center min-w-[100px] h-[100px] rounded-[2rem] bg-white border border-violet-100 shadow-sm hover:bg-violet-50 transition active:scale-95 p-4 shrink-0 snap-center"
                    >
                        <GlassWater className="w-8 h-8 mb-2 text-violet-500" />
                        <span className="text-sm font-semibold text-violet-900">Water</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => applyPresetValues({ name: 'Coffee', volumeMl: 300, hydrationFactor: 90 })}
                        className="flex flex-col items-center justify-center min-w-[100px] h-[100px] rounded-[2rem] bg-white border border-violet-100 shadow-sm hover:bg-violet-50 transition active:scale-95 p-4 shrink-0 snap-center"
                    >
                        <Coffee className="w-8 h-8 mb-2 text-fuchsia-500" />
                        <span className="text-sm font-semibold text-violet-900">Coffee</span>
                    </button>

                    {/* User Presets */}
                    {presets.map(p => (
                        <div key={p.id} className="relative group shrink-0 snap-center pt-2">
                            <button
                                type="button"
                                onClick={() => applyPresetValues(p)}
                                className="flex flex-col items-center justify-center min-w-[100px] h-[100px] rounded-[2rem] transition active:scale-95 p-4 border border-violet-100 bg-white shadow-sm hover:bg-violet-50 relative overflow-visible"
                            >
                                <div className="w-8 h-8 mb-2 rounded-full bg-violet-100 flex items-center justify-center text-lg font-bold text-violet-700">
                                    {p.name[0]}
                                </div>
                                <span className="text-sm font-semibold truncate w-full text-center max-w-[80px] text-violet-900">{p.name}</span>
                            </button>

                            {/* Edit Button (Pencil) */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setEditingPreset(p); }}
                                className="absolute -top-2 -right-2 z-[60] bg-white text-violet-600 rounded-full p-2 shadow-md border border-violet-100 transition active:scale-90 hover:bg-fuchsia-50"
                                aria-label="Edit Preset"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-8 mt-4">
                    <div className="space-y-6">
                        <div>
                            <label className="text-sm font-bold text-violet-800/60 uppercase tracking-widest block mb-3 pl-1">Drink Details</label>
                            <input
                                type="text"
                                placeholder="Name (e.g. Protein Shake)"
                                value={name} onChange={e => { setName(e.target.value); }}
                                className="w-full bg-white border border-violet-100 rounded-[2rem] p-5 text-xl font-medium text-violet-950 focus:ring-2 ring-violet-500 outline-none transition placeholder:text-violet-300 shadow-sm"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-violet-800/60 uppercase tracking-wide block mb-2 pl-4">Volume (ml)</label>
                                <input
                                    type="number"
                                    value={volume} onChange={e => setVolume(e.target.value)}
                                    className="w-full bg-white border border-violet-100 rounded-[2rem] p-5 text-xl font-medium text-violet-950 focus:ring-2 ring-violet-500 outline-none transition shadow-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-violet-800/60 uppercase tracking-wide block mb-2 pl-4">Hydration %</label>
                                <input
                                    type="number"
                                    value={factor} onChange={e => setFactor(e.target.value)}
                                    className="w-full bg-white border border-violet-100 rounded-[2rem] p-5 text-xl font-medium text-violet-950 focus:ring-2 ring-violet-500 outline-none transition shadow-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Save New Preset Toggle */}
                    <div
                        className={clsx(
                            "flex items-center gap-4 cursor-pointer p-4 rounded-[1.5rem] border shadow-sm transition active:scale-98",
                            isSaveToggleOn ? "bg-fuchsia-50 border-fuchsia-200" : "bg-white border-violet-100"
                        )}
                        onClick={() => setIsSaveToggleOn(!isSaveToggleOn)}
                    >
                        <div className={clsx("w-8 h-8 border-2 rounded-xl flex items-center justify-center transition", isSaveToggleOn ? "bg-fuchsia-500 border-fuchsia-500" : "border-violet-200")}>
                            {isSaveToggleOn && <Check className="w-5 h-5 text-white" />}
                        </div>
                        <div>
                            <span className={clsx("block text-base font-semibold", isSaveToggleOn ? "text-fuchsia-900" : "text-violet-900")}>
                                Save as new preset
                            </span>
                            <span className="text-xs text-violet-500/80">
                                Available in Quick Add for next time
                            </span>
                        </div>
                    </div>
                </form>
            </div>

            {/* M3 Extended FAB (Bottom Right) - Standard Place */}
            <div className="absolute bottom-8 right-6 z-50">
                <button
                    onClick={handleSubmit}
                    className="flex items-center gap-3 px-8 py-5 rounded-[2rem] bg-violet-600 hover:bg-violet-700 text-white shadow-xl shadow-violet-500/30 transition-all hover:scale-105 active:scale-95 active:shadow-sm"
                >
                    <Plus className="w-7 h-7" />
                    <span className="font-display font-bold text-xl tracking-wide whitespace-nowrap">Add Entry</span>
                </button>
            </div>

            {/* Edit Preset Dialog */}
            {editingPreset && <EditPresetDialog />}

        </motion.div>
    );
};
