import React from 'react';
import { Activity, ShieldCheck, Clock, Zap, CheckCircle2, FileEdit } from 'lucide-react';

const EVENT_ICONS = {
  created: FileEdit,
  edited: FileEdit,
  extended: Zap,
  closed_won: Clock,
  closed_unsold: Clock,
  approved: ShieldCheck,
  rejected: Activity,
  handover_confirmed: CheckCircle2,
  pickup_failed: Activity,
};

export default function EventsTimeline({ events }) {
  if (!events || events.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-4 border border-slate-800">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-indigo-400" />
        <h4 className="text-sm font-bold text-slate-200 font-heading">
          Lifecycle Audit Trail ({events.length})
        </h4>
      </div>

      <div className="space-y-3 relative pl-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {events.map((ev, index) => {
          const Icon = EVENT_ICONS[ev.type] || Activity;
          const isExtended = ev.type === 'extended';

          return (
            <div key={ev.id || index} className="relative text-xs">
              <span
                className={`absolute -left-4 top-0.5 w-3 h-3 rounded-full border-2 border-slate-950 ${
                  isExtended ? 'bg-amber-400 animate-ping' : 'bg-indigo-500'
                }`}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-200 capitalize">
                  {ev.type.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">{ev.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
