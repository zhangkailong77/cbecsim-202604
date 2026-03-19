import React from 'react';
import { Grid, BookOpen, Bell, User, ArrowLeft } from 'lucide-react';
import shopeeLogo from '../assets/shopee-logo.svg';

interface HeaderProps {
  playerName: string;
  runId: number | null;
  onBackToSetup: () => void;
  onBackToDashboard: () => void;
  onNavigateToView: (view: 'dashboard' | 'my-orders' | 'my-products' | 'new-product' | 'my-income' | 'my-balance' | 'bank-accounts') => void;
  activeView: 'dashboard' | 'my-orders' | 'my-products' | 'new-product' | 'my-income' | 'my-balance' | 'bank-accounts';
  isOrderDetail?: boolean;
  isProductDetail?: boolean;
}

export default function Header({
  playerName,
  runId,
  onBackToSetup,
  onBackToDashboard,
  onNavigateToView,
  activeView,
  isOrderDetail = false,
  isProductDetail = false,
}: HeaderProps) {
  const renderBreadcrumb = () => {
    if (activeView === 'dashboard') return null;
    if (activeView === 'my-orders') {
      return (
        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-gray-300">{'>'}</span>
          <button type="button" onClick={() => onNavigateToView('my-orders')} className="text-gray-700 hover:text-[#ee4d2d]">
            我的订单
          </button>
          {isOrderDetail && (
            <>
              <span className="text-gray-300">{'>'}</span>
              <span className="text-gray-700">订单详情</span>
            </>
          )}
        </div>
      );
    }
    if (activeView === 'my-products') {
      return (
        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-gray-300">{'>'}</span>
          <button type="button" onClick={() => onNavigateToView('my-products')} className="text-gray-700 hover:text-[#ee4d2d]">
            我的产品
          </button>
        </div>
      );
    }
    if (activeView === 'my-income' || activeView === 'my-balance' || activeView === 'bank-accounts') {
      return (
        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-gray-300">{'>'}</span>
          <button
            type="button"
            onClick={() => onNavigateToView(activeView)}
            className="text-gray-700 hover:text-[#ee4d2d]"
          >
            {activeView === 'my-income' ? '我的收入' : activeView === 'my-balance' ? '我的余额' : '银行账户'}
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-[14px]">
        <span className="text-gray-300">{'>'}</span>
        <button type="button" onClick={() => onNavigateToView('my-products')} className="text-gray-700 hover:text-[#ee4d2d]">
          我的产品
        </button>
        <span className="text-gray-300">{'>'}</span>
        <button type="button" onClick={() => onNavigateToView('new-product')} className="text-gray-700 hover:text-[#ee4d2d]">
          {isProductDetail ? '产品详情' : '添加新商品'}
        </button>
      </div>
    );
  };

  return (
    <header className="h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBackToDashboard} className="flex items-center gap-2">
          <img 
            src={shopeeLogo}
            alt="Shopee Logo" 
            className="h-8"
          />
          <span className="text-[17px] font-normal text-[#333333] ml-1 hover:text-[#ee4d2d]">卖家中心</span>
        </button>
        {renderBreadcrumb()}
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
        
        <div className="h-6 w-[1px] bg-gray-200"></div>

        <button
          type="button"
          onClick={onBackToSetup}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={14} />
          返回工作台
        </button>

        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
          <User size={14} className="text-slate-500" />
          <span className="text-[12px] font-semibold text-slate-700">玩家: {playerName}</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5">
          <span className="text-[12px] font-semibold text-slate-700">局 #{runId ?? '-'}</span>
        </div>
      </div>
    </header>
  );
}
