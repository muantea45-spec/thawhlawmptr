import React from 'react';
import { Smartphone, Wifi, Battery, Signal, Monitor } from 'lucide-react';

export default function MobileViewContainer({ children, onSwitchDesktop }) {
  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="py-6 px-2 sm:px-4 flex flex-col items-center justify-center min-h-[calc(100vh-70px)] bg-slate-100/80">
      
      <div className="flex items-center justify-between w-full max-w-[430px] mb-3 px-2">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <Smartphone className="w-4 h-4 text-indigo-600" /> Mobile Simulator Mode
        </span>
        <button
          onClick={onSwitchDesktop}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-xs hover:shadow-sm transition-all cursor-pointer"
        >
          <Monitor className="w-3.5 h-3.5" /> Desktop View
        </button>
      </div>

      {/* Smartphone Outer Shell */}
      <div className="mobile-device-shell shadow-2xl">
        
        {/* Dynamic Island */}
        <div className="mobile-dynamic-island">
          <div className="mobile-camera-dot"></div>
          <div className="w-2 h-2 rounded-full bg-indigo-500/80"></div>
        </div>

        {/* Mobile Screen Content Wrapper */}
        <div className="mobile-screen-content flex flex-col">
          
          {/* Mobile Status Bar */}
          <div className="pt-8 px-5 pb-2 flex items-center justify-between text-[11px] font-bold text-slate-700 bg-white/95 border-b border-slate-200 shrink-0">
            <span>{currentTime}</span>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Signal className="w-3 h-3" />
              <Wifi className="w-3 h-3" />
              <Battery className="w-3.5 h-3.5 fill-slate-700" />
            </div>
          </div>

          {/* Children View Content inside Mobile Device */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 sm:p-2 space-y-2">
            {children}
          </div>

          {/* Mobile Screen Home Bar */}
          <div className="py-2 flex justify-center bg-white/95 border-t border-slate-200 shrink-0">
            <div className="w-32 h-1 bg-slate-300 rounded-full"></div>
          </div>

        </div>
      </div>
    </div>
  );
}


