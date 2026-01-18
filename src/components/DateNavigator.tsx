import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, addDays, subDays, isSameDay } from 'date-fns';

interface DateNavigatorProps {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

export function DateNavigator({ selectedDate, onDateChange }: DateNavigatorProps) {
    const isToday = isSameDay(selectedDate, new Date());

    const handlePrev = () => onDateChange(subDays(selectedDate, 1));
    const handleNext = () => onDateChange(addDays(selectedDate, 1));

    return (
        <div className="flex items-center justify-between bg-card text-card-foreground rounded-[2rem] p-3 mb-6 shadow-sm border border-transparent">
            <button
                onClick={handlePrev}
                className="p-3 hover:bg-secondary rounded-full text-muted-foreground transition active:scale-95"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 font-medium">
                <CalendarIcon className="w-4 h-4 text-primary" />
                <span className="text-lg tracking-tight">
                    {isToday ? 'Today, ' : ''}
                    {format(selectedDate, 'MMM d, yyyy')}
                </span>
            </div>

            <button
                onClick={handleNext}
                disabled={isToday}
                className={`p-3 rounded-full transition active:scale-95 ${isToday
                    ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                    : 'hover:bg-secondary text-muted-foreground'
                    }`}
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
    );
}
