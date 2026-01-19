import { useState, useMemo, useEffect } from 'react';
import { useHydrationStore } from './store/hydrationStore';
import { bleService } from './services/ble';
import { HydrationRing } from './components/HydrationRing';
import { Timeline } from './components/Timeline';
import { QuickAddScreen } from './components/QuickAddScreen';
import { GoalEditScreen } from './components/GoalEditScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { Plus, Bluetooth, Settings, Battery, Edit2 } from 'lucide-react';
import { clsx } from 'clsx';
import { AnimatePresence } from 'framer-motion';

import { DateNavigator } from './components/DateNavigator';
import { format, startOfDay, endOfDay } from 'date-fns';

import { supabase } from './services/supabase';
import { syncService } from './services/syncService';

function App() {
  const { bottleSips, manualEntries, dailyGoals, defaultGoal, deviceStatus, deviceName, batteryLevel, setGoalForDate, theme, setUser, user } = useHydrationStore();
  const [isAddScreenOpen, setisAddScreenOpen] = useState(false);
  const [isGoalScreenOpen, setIsGoalScreenOpen] = useState(false);
  const [isSettingsScreenOpen, setIsSettingsScreenOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);

      // Clean URL hash if it contains auth tokens
      if (session && window.location.hash && window.location.hash.includes('access_token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }

    });

    return () => subscription.unsubscribe();
  }, [setUser]);

  // Fetch History whenever user is set (Login, Reload, Session Restore)
  useEffect(() => {
    if (user && navigator.onLine) {
      syncService.fetchHistory(user.id);
    }
  }, [user]);

  // Sync Listener (Auto-sync when data changes)
  useEffect(() => {
    if (!user) return;

    const handleSync = () => {
      if (navigator.onLine) {
        syncService.syncAll(user.id);
      }
    };

    // Initial sync
    handleSync();
    window.addEventListener('online', handleSync);

    // Subscribe to Realtime Updates (Garmin Sync Status & Deletions)
    const channel = supabase.channel('sips_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sips' },
        (payload) => {
          // Handle DELETE
          if (payload.eventType === 'DELETE') {
            const oldRecord = payload.old; // { id: "..." }
            if (!oldRecord || !oldRecord.id) return;

            // Check if it's a bottle sip or manual entry based on ID format
            // Bottle: uuid-timestamp-bottle
            // Manual: uuid

            const { deleteBottleSip, deleteManualEntry } = useHydrationStore.getState();

            if (oldRecord.id.endsWith('-bottle')) {
              // Parse timestamp
              const parts = oldRecord.id.split('-');
              if (parts.length >= 2) {
                const tsStr = parts[parts.length - 2];
                const ts = parseInt(tsStr);
                if (!isNaN(ts)) {
                  deleteBottleSip(ts);
                }
              }
            } else {
              // Manual Entry
              deleteManualEntry(oldRecord.id);
            }
            return;
          }

          // Handle UPDATE (Garmin Sync Status)
          if (payload.eventType === 'UPDATE') {
            const newRecord = payload.new;
            if (newRecord.user_id !== user.id) return; // Ignore other users

            if (newRecord.is_synced_garmin) {
              const { markSipsAsSyncedGarmin, markManualEntriesAsSyncedGarmin } = useHydrationStore.getState();

              if (newRecord.source === 'bottle') {
                const parts = newRecord.id.split('-');
                if (parts.length >= 6) {
                  const tsStr = parts[parts.length - 2];
                  const ts = parseInt(tsStr);
                  if (!isNaN(ts)) {
                    markSipsAsSyncedGarmin([ts]);
                  }
                }
              } else if (newRecord.source === 'manual') {
                markManualEntriesAsSyncedGarmin([newRecord.id]);
              }
            }
          }
        }
      )
      .subscribe();

    const timeout = setTimeout(handleSync, 2000);

    return () => {
      window.removeEventListener('online', handleSync);
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    }
  }, [user, bottleSips, manualEntries]);

  // Apply Theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // Goal for selected date
  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const dailyGoal = dailyGoals[dateKey] || defaultGoal;

  // Filter entries for selected date
  const filteredData = useMemo(() => {
    const start = startOfDay(selectedDate).getTime();
    const end = endOfDay(selectedDate).getTime();

    return {
      sips: bottleSips.filter(s => s.timestamp >= start && s.timestamp <= end),
      manual: manualEntries.filter(e => e.timestamp >= start && e.timestamp <= end)
    };
  }, [selectedDate, bottleSips, manualEntries]);

  const totalMl = useMemo(() => {
    const sips = filteredData.sips.reduce((acc, s) => acc + s.volumeMl, 0);
    const manual = filteredData.manual.reduce((acc, e) => acc + e.calculatedVolumeMl, 0);
    return sips + manual;
  }, [filteredData]);

  const handleConnect = () => {
    bleService.connect();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-brand-blue/30 relative overflow-hidden transition-colors duration-300">
      {/* Header */}
      <header className="p-4 flex justify-between items-center sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border/20">
        <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent font-display">
          HydroSync
        </h1>
        <div className="flex gap-2 items-center">
          {/* Battery Indicator */}
          {deviceStatus === 'connected' && batteryLevel !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 text-xs font-semibold border border-border/20 animate-in fade-in duration-300">
              <Battery className={clsx("w-3.5 h-3.5", batteryLevel < 20 ? "text-destructive" : "text-green-400")} />
              <span>{batteryLevel}%</span>
            </div>
          )}

          <button
            onClick={handleConnect}
            className={clsx(
              "flex items-center gap-1 px-4 py-2 rounded-full text-xs font-bold transition active:scale-95 border",
              deviceStatus === 'connected' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                deviceStatus === 'connecting' ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse" :
                  "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
            )}
          >
            <Bluetooth className="w-3.5 h-3.5" />
            {deviceStatus === 'connected' ? (deviceName || 'Connected') :
              deviceStatus === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>

          <button
            onClick={() => setIsSettingsScreenOpen(true)}
            className="p-3 rounded-full bg-card hover:bg-secondary text-muted-foreground border border-border transition active:scale-95 shadow-sm"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full gap-6">
        {/* Date Navigator */}
        <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />

        {/* Progress Section */}
        <section className="flex flex-col items-center justify-center py-4">
          <HydrationRing totalMl={totalMl} goalMl={dailyGoal} />

          <div className="mt-8 grid grid-cols-2 gap-4 w-full">
            <button
              onClick={() => setIsGoalScreenOpen(true)}
              className="flex flex-col items-center p-6 bg-card rounded-[2rem] border border-transparent relative group cursor-pointer shadow-sm active:scale-95 transition-transform hover:bg-secondary/50"
            >
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1 mb-1">
                Goal <Edit2 className="w-3 h-3 opacity-50" />
              </span>
              <span className="text-2xl font-bold text-display text-foreground">{dailyGoal}ml</span>
            </button>
            <div className="flex flex-col items-center p-6 bg-card rounded-[2rem] border border-border/20 shadow-sm">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Remaining</span>
              <span className="text-2xl font-bold text-display text-primary">{Math.max(0, dailyGoal - totalMl)}ml</span>
            </div>
          </div>
        </section>

        {/* Timeline */}
        <Timeline bottleSips={filteredData.sips} manualEntries={filteredData.manual} />

      </main>

      {/* FAB (Extended) */}
      <div className="fixed bottom-8 right-6 z-40">
        <button
          onClick={() => setisAddScreenOpen(true)}
          className="flex items-center gap-2 pl-5 pr-7 py-4 bg-[#d946ef] hover:bg-[#c026d3] text-white rounded-[2rem] shadow-xl shadow-[#d946ef]/30 transition-all hover:scale-105 active:scale-95 group"
        >
          <Plus className="w-8 h-8 transition-transform group-active:rotate-90" />
          <span className="text-lg font-bold font-display tracking-wide">Add Entry</span>
        </button>
      </div>

      <div className="fixed bottom-1 left-0 right-0 z-[9999] text-center pointer-events-auto opacity-90 flex flex-col items-center justify-center gap-1">
        <span className="text-[10px] uppercase font-bold tracking-widest text-white bg-red-500 px-2 py-0.5 rounded-full shadow-sm">v1.3.7</span>
        <button
          onClick={async () => {
            if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (let registration of registrations) {
                await registration.unregister();
              }
            }
            window.location.reload();
          }}
          className="text-[9px] text-violet-500 underline font-bold"
        >
          HARD RESET APP
        </button>
      </div>

      {/* Full Screen Modals */}
      <AnimatePresence>
        {isAddScreenOpen && (
          <QuickAddScreen onClose={() => setisAddScreenOpen(false)} />
        )}
        {isGoalScreenOpen && (
          <GoalEditScreen
            onClose={() => setIsGoalScreenOpen(false)}
            currentGoal={dailyGoal}
            dateLabel={format(selectedDate, 'MMM d')}
            onSave={(val) => setGoalForDate(dateKey, val)}
          />
        )}
        {isSettingsScreenOpen && (
          <SettingsScreen onClose={() => setIsSettingsScreenOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}



export default App;
