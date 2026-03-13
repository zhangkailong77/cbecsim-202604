import React from 'react';
import { Grid, BookOpen, Bell, User } from 'lucide-react';
import shopeeLogo from '../assets/shopee-logo.svg';

export default function Header() {
  return (
    <header className="h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <img 
          src={shopeeLogo}
          alt="Shopee Logo" 
          className="h-8"
        />
        <span className="text-[17px] font-normal text-[#333333] ml-1">卖家中心</span>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-gray-500">
          <button className="hover:text-[#ee4d2d] cursor-pointer">
            <Grid size={20} />
          </button>
          <button className="hover:text-[#ee4d2d] cursor-pointer">
            <BookOpen size={20} />
          </button>
          <button className="hover:text-[#ee4d2d] cursor-pointer relative">
            <Bell size={20} />
            <span className="absolute -top-1 -right-1 bg-[#ee4d2d] text-white text-[10px] px-1 rounded-full border border-white">99+</span>
          </button>
        </div>
        
        <div className="h-6 w-[1px] bg-gray-200"></div>
        
        <div className="flex items-center gap-3 cursor-pointer group">
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ee4d2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="text-[10px] text-[#ee4d2d] -mt-1 font-bold scale-75">Homeneat</span>
          </div>
          <span className="text-[16px] text-[#333333] group-hover:text-[#ee4d2d] ml-1">霍尼特</span>
          <ChevronDown size={16} className="text-gray-400" />
        </div>
      </div>
    </header>
  );
}

function ChevronDown({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
