import React from 'react';
import { useHydrationStore } from '../store/hydrationStore';
import { supabase, signInWithGoogle, signOut } from '../services/supabase';
import { X, Moon, Sun, Monitor, LogOut, Check, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { ThemeType } from '../types';

interface SettingsScreenProps {
    onClose: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
    const { theme, setTheme, deviceStatus, deviceName, setDeviceStatus, setDeviceName, user, setUser } = useHydrationStore();

    const handleSignIn = async () => {
        await signInWithGoogle();
    };

    const handleSignOut = async () => {
        await signOut();
        setUser(null);
    };

    // Resolve Theme for Background
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = theme === 'system' ? (isSystemDark ? 'dark' : 'light') : theme;
    const bgColor = resolvedTheme === 'dark' ? '#020617' : '#FDF7FF';

    const handleDisconnect = () => {
        // Rough disconnect logic; ideal would be calling bleService.disconnect()
        // but that's a singleton. For now we just reset state.
        setDeviceStatus('disconnected');
        setDeviceName(null);
        // Force reload to clear GATT cache if needed
        window.location.reload();
    };

    const ThemeOption = ({ mode, icon: Icon, label }: { mode: ThemeType, icon: any, label: string }) => (
        <button
            onClick={() => setTheme(mode)}
            className={clsx(
                "flex-1 flex flex-col items-center justify-center gap-3 p-4 rounded-[1.5rem] border transition active:scale-95",
                theme === mode
                    ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                    : "bg-card text-muted-foreground border-border hover:bg-secondary/50"
            )}
        >
            <Icon className="w-6 h-6" />
            <span className="font-bold text-sm tracking-wide">{label}</span>
        </button>
    );

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
                    Settings
                </h2>
                <button
                    onClick={onClose}
                    className="p-3 rounded-full bg-card hover:bg-secondary text-foreground shadow-sm transition active:scale-95 border border-border"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 pb-40 relative space-y-8">

                {/* Theme Section */}
                <section>
                    <h3 className="text-sm font-bold text-primary uppercase tracking-widest mb-4 pl-1">Appearance</h3>
                    <div className="flex gap-3">
                        <ThemeOption mode="light" icon={Sun} label="Light" />
                        <ThemeOption mode="dark" icon={Moon} label="Dark" />
                        <ThemeOption mode="system" icon={Monitor} label="System" />
                    </div>
                </section>

                {/* Account Section */}
                <section>
                    <h3 className="text-sm font-bold text-primary uppercase tracking-widest mb-4 pl-1">Account</h3>
                    <div className="bg-card rounded-[2rem] border border-border p-6 shadow-sm">
                        {user ? (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4">
                                    {user.user_metadata.avatar_url && (
                                        <img src={user.user_metadata.avatar_url} alt="Profile" className="w-12 h-12 rounded-full border border-border" />
                                    )}
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="font-bold text-foreground truncate">{user.user_metadata.full_name || user.email}</span>
                                        <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSignOut}
                                    className="w-full flex items-center justify-center gap-2 p-4 rounded-[1.25rem] bg-secondary text-foreground font-bold hover:bg-secondary/80 transition"
                                >
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleSignIn}
                                className="w-full flex items-center justify-center gap-2 p-4 rounded-[1.25rem] bg-[#4285F4] text-white font-bold hover:bg-[#4285F4]/90 transition shadow-md shadow-blue-500/20"
                            >
                                <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                <span>Sign in with Google</span>
                            </button>
                        )}
                    </div>
                </section>

                {/* Device Section */}
                <section>
                    <h3 className="text-sm font-bold text-primary uppercase tracking-widest mb-4 pl-1">Device</h3>
                    <div className="bg-card rounded-[2rem] border border-border p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-foreground font-bold text-lg">{deviceName || 'No Device'}</span>
                            <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase",
                                deviceStatus === 'connected' ? "bg-green-500/10 text-green-500" : "bg-slate-100 text-slate-500")}>
                                {deviceStatus}
                            </span>
                        </div>

                        {deviceStatus === 'connected' && (
                            <button
                                onClick={handleDisconnect}
                                className="w-full flex items-center justify-center gap-2 p-4 rounded-[1.25rem] bg-destructive/10 text-destructive font-bold hover:bg-destructive/20 transition"
                            >
                                <LogOut className="w-5 h-5" />
                                Disconnect Device
                            </button>
                        )}
                        {deviceStatus !== 'connected' && (
                            <p className="text-sm text-muted-foreground text-center">
                                Tap the Bluetooth button on the main screen to connect.
                            </p>
                        )}
                    </div>
                </section>

                {/* Integrations Section */}
                <section>
                    <h3 className="text-sm font-bold text-primary uppercase tracking-widest mb-4 pl-1">Integrations</h3>
                    <div className="bg-card rounded-[2rem] border border-border p-6 shadow-sm">
                        <div className="pt-6 border-t border-border/20">
                            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">Garmin Connect</h4>

                            <div className="bg-secondary/30 rounded-2xl p-4 border border-border/20">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-[#007cc3]/10 rounded-full">
                                        <Activity className="w-5 h-5 text-[#007cc3]" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-base">Garmin Connect</span>
                                        <span className="text-xs text-muted-foreground">Sync hydration data automatically</span>
                                    </div>
                                </div>

                                <form
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        const form = e.target as HTMLFormElement;
                                        const email = (form.elements.namedItem('email') as HTMLInputElement).value;
                                        const password = (form.elements.namedItem('password') as HTMLInputElement).value;

                                        if (!user) return;
                                        const { error } = await supabase
                                            .from('user_integrations')
                                            .upsert({ user_id: user.id, garmin_email: email, garmin_password: password });

                                        if (error) {
                                            alert('Error saving credentials: ' + error.message);
                                        } else {
                                            alert('Garmin credentials saved!');
                                            // Optionally clear password field for security UI, but keeping it simple for now
                                        }
                                    }}
                                    className="space-y-3"
                                >
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground ml-1">Email</label>
                                        <input
                                            name="email"
                                            type="email"
                                            placeholder="Garmin Email"
                                            className="w-full mt-1 p-3 rounded-xl bg-card border border-border/20 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground ml-1">Password</label>
                                        <input
                                            name="password"
                                            type="password"
                                            placeholder="Garmin Password"
                                            className="w-full mt-1 p-3 rounded-xl bg-card border border-border/20 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full py-3 mt-2 bg-[#007cc3] hover:bg-[#005a8e] text-white rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-[#007cc3]/20"
                                    >
                                        Link Account
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </section>

                {/* App Info */}
                <div className="text-center pt-8 opacity-50">
                    <p className="text-xs font-bold uppercase tracking-widest">HydroSync v1.3.0</p>
                </div>

            </div>
        </motion.div>
    );
};
