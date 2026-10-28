import React from 'react';
import { useCountdown } from '../lib/time.js';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function Countdown({ closesAt, isUrgentAlert = true, size = 'default' }) {
  const { formatted, isClosed, isUrgent, totalSeconds } = useCountdown(closesAt);

  if (isClosed) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
        <span>Ended</span>
      </div>
    );
  }

  const isWarning = totalSeconds <= 300 && totalSeconds > 60; // < 5 mins
  const isCritical = isUrgent; // <= 60s

  let containerStyles = 'bg-slate-800/80 text-slate-200 border-slate-700';
  let iconColor = 'text-indigo-400';

  if (isCritical && isUrgentAlert) {
    containerStyles = 'bg-rose-950/80 text-rose-300 border-rose-500 animate-urgent font-bold';
    iconColor = 'text-rose-400 animate-pulse';
  } else if (isWarning) {
    containerStyles = 'bg-amber-950/60 text-amber-300 border-amber-600/60';
    iconColor = 'text-amber-400';
  }

  const sizeStyles = size === 'large'
    ? 'text-lg px-4 py-2 gap-2.5'
    : 'text-xs px-2.5 py-1 gap-1.5';

  return (
    <div
      className={`inline-flex items-center rounded-xl font-mono tracking-tight border transition-all ${containerStyles} ${sizeStyles}`}
      title={isCritical ? 'Ending within 60s! Last-minute bid extends auction by 60s.' : 'Time remaining'}
    >
      {isCritical ? (
        <AlertTriangle className={`w-3.5 h-3.5 ${iconColor}`} />
      ) : (
        <Clock className={`w-3.5 h-3.5 ${iconColor}`} />
      )}
      <span>{formatted}</span>
    </div>
  );
}
