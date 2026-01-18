import React, { useState } from 'react';
import { useHydrationStore } from '../store/hydrationStore';
import { Save, X, Target } from 'lucide-react';
import { motion } from 'framer-motion';

interface GoalEditScreenProps {
    onClose: () => void;
    currentGoal: number;
    dateLabel: string;
    onSave: (newGoal: number) => void;
}

export const GoalEditScreen: React.FC<GoalEditScreenProps> = ({ onClose, currentGoal, dateLabel, onSave }) => {
    const { theme } = useHydrationStore();
    const [goal, setGoal] = useState(String(currentGoal));

    // Resolve Theme for Background
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = theme === 'system' ? (isSystemDark ? 'dark' : 'light') : theme;
    const bgColor = resolvedTheme === 'dark' ? '#020617' : '#FDF7FF';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const val = parseInt(goal);
        if (!isNaN(val) && val > 0) {
            onSave(val);
            onClose();
        }
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
                    Edit Goal
                </h2>
                <button
                    onClick={onClose}
                    className="p-3 rounded-full bg-card hover:bg-secondary text-foreground shadow-sm transition active:scale-95 border border-border"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 flex flex-col justify-center max-w-sm mx-auto w-full">

                <div className="flex flex-col items-center mb-8">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                        <Target className="w-10 h-10" />
                    </div>
                    <p className="text-muted-foreground font-medium uppercase tracking-widest text-sm">Target for {dateLabel}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    <div>
                        <label className="text-sm font-bold text-primary uppercase tracking-widest block mb-3 pl-1">Daily Target (ml)</label>
                        <input
                            type="number"
                            autoFocus
                            value={goal}
                            onChange={e => setGoal(e.target.value)}
                            className="w-full bg-card border border-border rounded-[2rem] p-6 text-4xl font-display font-bold text-center text-foreground focus:ring-2 ring-primary outline-none transition shadow-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-3 px-8 py-5 rounded-[2rem] bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/30 transition-all hover:scale-105 active:scale-95 active:shadow-sm"
                    >
                        <Save className="w-6 h-6" />
                        <span className="font-display font-bold text-xl tracking-wide">Save Goal</span>
                    </button>
                </form>
            </div>
        </motion.div>
    );
};
