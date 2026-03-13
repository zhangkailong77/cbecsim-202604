import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export default function RightSidebar() {
  return (
    <div className="w-[60px] bg-white border-l border-gray-200 h-full flex flex-col items-center py-8 gap-8 flex-shrink-0">
      {/* Notification Bell */}
      <div className="relative group cursor-pointer">
        <div className="w-10 h-10 flex items-center justify-center text-[#ee4d2d]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
          </svg>
        </div>
        <span className="absolute -top-1 -right-2 bg-[#ee4d2d] text-white text-[10px] font-bold px-1 rounded-full border border-white min-w-[20px] text-center">99+</span>
      </div>

      {/* Customer Service Headset */}
      <div className="group cursor-pointer">
        <div className="w-10 h-10 flex items-center justify-center text-[#ee4d2d]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
          </svg>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="relative group cursor-pointer">
        <div className="w-10 h-10 flex items-center justify-center text-[#ee4d2d]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        </div>
        <span className="absolute -top-1 -right-1 bg-[#ee4d2d] text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white">1</span>
      </div>

      {/* Blue Dashboard Icon */}
      <div className="mt-auto mb-4">
        <div className="w-10 h-10 bg-[#3478f6] rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer hover:brightness-110 transition-all hover:scale-110">
          <LayoutDashboard size={20} />
        </div>
      </div>
    </div>
  );
}
