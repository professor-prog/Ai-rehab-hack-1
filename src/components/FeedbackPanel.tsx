'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ExerciseState, JointStress, ExerciseDefinition } from '@/types';

interface FeedbackPanelProps {
    exerciseState: ExerciseState;
    exercise: ExerciseDefinition | undefined;
    elapsedTime: number;
}

export default function FeedbackPanel({
    exerciseState,
    exercise,
    elapsedTime,
}: FeedbackPanelProps) {
    const [repBounce, setRepBounce] = useState(false);
    const prevRepRef = useRef(0);

    // Trigger bounce animation on new rep
    useEffect(() => {
        if (exerciseState.repCount > prevRepRef.current) {
            prevRepRef.current = exerciseState.repCount;
            setRepBounce(true);
            const t = setTimeout(() => setRepBounce(false), 600);
            return () => clearTimeout(t);
        }
    }, [exerciseState.repCount]);

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getFormColor = (score: number): string => {
        if (score >= 80) return 'text-green-400';
        if (score >= 60) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getFormGradient = (score: number): string => {
        if (score >= 80) return 'from-green-500 to-emerald-500';
        if (score >= 60) return 'from-yellow-500 to-orange-500';
        return 'from-red-500 to-rose-500';
    };

    const getPhaseConfig = (phase: string): { label: string; color: string; bg: string; border: string } => {
        switch (phase) {
            case 'IDLE': return { label: '⏸ Ready', color: 'text-slate-400', bg: 'bg-slate-800/60', border: 'border-slate-600/40' };
            case 'DOWN': return { label: '⬇ Lowering', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/40' };
            case 'UP': return { label: '⬆ Rising', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/40' };
            case 'HOLD': return { label: '✋ Hold!', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/40' };
            case 'COMPLETE': return { label: '✅ Rep Done!', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/40' };
            default: return { label: phase, color: 'text-white', bg: 'bg-slate-800/60', border: 'border-slate-600/40' };
        }
    };

    const badFormFeedback = exerciseState.jointStress.filter(
        (js) => js.stressLevel === 'bad' && js.message
    );

    const warningFeedback = exerciseState.jointStress.filter(
        (js) => js.stressLevel === 'warning' && js.message
    );

    const phaseConfig = getPhaseConfig(exerciseState.phase);

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Main stats */}
            <div className="grid grid-cols-2 gap-4">
                {/* Rep counter */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-6">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-full blur-2xl" />
                    <div className="relative">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">{exercise?.id === 'plank' ? 'Hold Time' : 'Reps'}</p>
                        <p className={`text-6xl font-black text-white transition-transform duration-300 ${repBounce ? 'scale-125 text-cyan-400' : 'scale-100'}`}>
                            {exerciseState.repCount}
                            {exercise?.id === 'plank' && <span className="text-2xl ml-1 font-bold text-slate-400">s</span>}
                        </p>
                        <div className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${phaseConfig.bg} ${phaseConfig.color} ${phaseConfig.border}`}>
                            {phaseConfig.label}
                        </div>
                    </div>
                </div>

                {/* Timer */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-6">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-2xl" />
                    <div className="relative">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Time</p>
                        <p className="text-4xl font-black text-white font-mono">{formatTime(elapsedTime)}</p>
                        <p className="text-purple-400 text-xs mt-2 font-semibold uppercase tracking-widest">⏱ Active</p>
                    </div>
                </div>
            </div>

            {/* Form score */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-slate-400 text-sm">Form Score</p>
                        <p className={`text-4xl font-black ${getFormColor(exerciseState.formScore)}`}>
                            {exerciseState.formScore}%
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-slate-400 text-sm">Symmetry</p>
                        <p className="text-2xl font-bold text-cyan-400">{exerciseState.symmetryScore}%</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full bg-gradient-to-r ${getFormGradient(exerciseState.formScore)} transition-all duration-300`}
                        style={{ width: `${exerciseState.formScore}%` }}
                    />
                </div>
            </div>

            {/* Joint angle & velocity */}
            <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-slate-800/50 border border-slate-700/30 p-4">
                    <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Joint Angle</p>
                    <div className="flex items-end gap-2 mb-2">
                        <p className="text-3xl font-black text-white">{Math.round(exerciseState.currentAngle)}°</p>
                    </div>
                    {/* Angle arc visualization */}
                    <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-200"
                            style={{
                                width: `${Math.min(100, Math.max(0, (exerciseState.currentAngle / 180) * 100))}%`,
                                background: `linear-gradient(90deg, #06b6d4, #8b5cf6)`
                            }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                        <span>0°</span><span>90°</span><span>180°</span>
                    </div>
                </div>
                <div className={`rounded-2xl bg-slate-800/50 border border-slate-700/30 p-4 transition-all duration-500 ${exerciseState.painScore > 60 ? 'shadow-[0_0_20px_rgba(239,68,68,0.2)] border-red-500/50' : ''}`}>
                    <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">Pain Detector</p>
                    <div className="flex items-center gap-2">
                        <p className={`text-xl font-bold transition-colors ${exerciseState.painScore > 60 ? 'text-red-400 animate-pulse' :
                            exerciseState.painScore > 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {exerciseState.painScore > 60 ? '🚨 Alert' : exerciseState.painScore > 30 ? '⚠️ Strained' : '✅ Safe'}
                        </p>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden mt-3">
                        <div
                            className={`h-full transition-all duration-300 rounded-full ${exerciseState.painScore > 60 ? 'bg-red-500' :
                                exerciseState.painScore > 30 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                            style={{ width: `${exerciseState.painScore}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Joint Stress Monitoring */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-700/30 p-4">
                <p className="text-slate-400 text-sm font-medium mb-3">Joint Health Monitor</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {exerciseState.jointStress.map((js, idx) => (
                        <div
                            key={idx}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 border ${js.stressLevel === 'bad' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                js.stressLevel === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                                    'bg-green-500/10 border-green-500/30 text-green-400'
                                }`}
                        >
                            <span>Joint {js.jointId}</span>
                            <div className={`w-2 h-2 rounded-full ${js.stressLevel === 'bad' ? 'bg-red-500 pulse' :
                                js.stressLevel === 'warning' ? 'bg-yellow-500' :
                                    'bg-green-500'
                                }`} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Real-time feedback */}
            <div className="flex-1 rounded-2xl bg-slate-800/50 border border-slate-700/30 p-4 overflow-auto">
                <p className="text-slate-400 text-sm font-medium mb-3">Real-time Feedback</p>

                {badFormFeedback.length > 0 && (
                    <div className="space-y-2 mb-3">
                        {badFormFeedback.map((fb, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30"
                            >
                                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                                    ⚠️
                                </div>
                                <p className="text-red-400 text-sm font-medium">{fb.message}</p>
                            </div>
                        ))}
                    </div>
                )}

                {warningFeedback.length > 0 && (
                    <div className="space-y-2 mb-3">
                        {warningFeedback.map((fb, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30"
                            >
                                <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400">
                                    💡
                                </div>
                                <p className="text-yellow-400 text-sm font-medium">{fb.message}</p>
                            </div>
                        ))}
                    </div>
                )}

                {badFormFeedback.length === 0 && warningFeedback.length === 0 && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                            ✓
                        </div>
                        <p className="text-green-400 text-sm font-medium">Great form! Keep it up!</p>
                    </div>
                )}
            </div>

            {/* Exercise info */}
            {exercise && (
                <div className="rounded-2xl bg-slate-800/50 border border-slate-700/30 p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{exercise.icon}</span>
                        <div>
                            <p className="text-white font-semibold">{exercise.name}</p>
                            <p className="text-slate-400 text-xs">
                                {exercise.primaryMuscles.slice(0, 2).join(', ')}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
