import React from 'react';
import { Gavel, ShieldCheck, HeartHandshake, Zap } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950/60 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Gavel className="w-4 h-4" />
              </div>
              <span className="text-lg font-bold text-white font-heading">Campus Auction</span>
            </div>
            <p className="text-sm text-slate-400 max-w-sm">
              The real-time peer-to-peer campus marketplace designed exclusively for students. Buy and sell cycles, calculators, books, and hostel gear with atomic bidding security.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">Guarantees</h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Server-Verified Clock
              </li>
              <li className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" /> Atomic 30s Extension
              </li>
              <li className="flex items-center gap-1.5">
                <HeartHandshake className="w-4 h-4 text-cyan-400" /> Campus Handover Check
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">Campus Protocol</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Always meet at common public campus spots (library foyer, canteen, main gate) for physical item inspection and handover.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} Campus Auction — Built for students, powered by Node & React.</p>
          <div className="flex items-center gap-4">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Live System Active
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
