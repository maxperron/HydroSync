
import React from 'react';
import { motion } from 'framer-motion';

interface HydrationRingProps {
    totalMl: number;
    goalMl: number;
}

export const HydrationRing: React.FC<HydrationRingProps> = ({ totalMl, goalMl }) => {
    const percentage = Math.min(100, (totalMl / goalMl) * 100);
    const radius = 80;
    const stroke = 12;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center w-[160px] h-[160px]">
            <svg
                height={radius * 2}
                width={radius * 2}
                className="transform -rotate-90 overflow-visible"
            >
                {/* Background Track */}
                <circle
                    stroke="hsl(var(--secondary))"
                    strokeWidth={stroke}
                    fill="transparent"
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                />

                {/* Progress Ring with Spring Physics */}
                <motion.circle
                    stroke="hsl(var(--primary))"
                    strokeWidth={stroke}
                    strokeDasharray={circumference + ' ' + circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{
                        type: "spring",
                        stiffness: 100,
                        damping: 15, // Expressive Fast Spatial
                        mass: 1
                    }}
                    strokeLinecap="round"
                    fill="transparent"
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                    className="drop-shadow-[0_0_4px_rgba(var(--primary),0.5)]"
                />

                {/* "Slosh" Wave Effect (Visual Candy) */}
                {percentage > 0 && percentage < 100 && (
                    <motion.circle
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="transparent"
                        opacity={0.5}
                        r={normalizedRadius + stroke / 1.5}
                        cx={radius}
                        cy={radius}
                        animate={{
                            scale: [1, 1.05, 1],
                            rotate: [0, 5, -5, 0]
                        }}
                        transition={{
                            repeat: Infinity,
                            duration: 4,
                            ease: "easeInOut"
                        }}
                    />
                )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center leading-none">
                    <span className="text-3xl font-display font-bold text-foreground">
                        {totalMl} ml
                    </span>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        of {goalMl} ml
                    </span>
                </div>
            </div>
        </div>
    );
};
