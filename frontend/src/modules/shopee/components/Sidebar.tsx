import React from 'react';
import { 
  ChevronDown
} from 'lucide-react';
import { useState } from 'react';

type ShopeeView = 'dashboard' | 'my-orders' | 'my-products' | 'new-product' | 'my-income' | 'my-balance' | 'bank-accounts';

const menuItems = [
  {
    title: '命令',
    children: ['我的订单', '大规模运输', '交接中心', '退货/退款/取消', '发货设置']
  },
  {
    title: '产品',
    children: ['我的产品', '添加新产品', 'Shopee标准产品', 'AI优化器']
  },
  {
    title: '营销中心',
    children: ['营销中心', 'Shopee上最便宜', 'Shopee广告', '联盟营销', '直播和视频', '折扣', '我的店铺限时抢购', '代金券', '活动', '国际平台']
  },
  {
    title: '客户服务',
    children: ['聊天管理', '审查管理']
  },
  {
    title: '金融',
    children: ['我的收入', '我的余额', '快速支付', '银行账户', '卖家轻松现金']
  },
  {
    title: '数据',
    children: ['商业洞察', '账户健康状况']
  }
];

interface SidebarProps {
  activeView: ShopeeView;
  onSelectView: (view: ShopeeView) => void;
}

export default function Sidebar({ activeView, onSelectView }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    命令: true,
    产品: true,
    营销中心: true,
    客户服务: true,
    金融: true,
    数据: true,
  });

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <div className="w-[200px] bg-white border-r border-gray-200 h-full overflow-y-auto custom-scrollbar flex-shrink-0">
      <div className="py-4">
        {menuItems.map((item, index) => (
          <div key={index} className="mb-4">
            <button
              type="button"
              onClick={() => toggleSection(item.title)}
              className="w-full px-6 py-2 flex items-center justify-between text-[#999999] cursor-pointer hover:bg-gray-50 group"
            >
              <span className="text-[14px] font-normal group-hover:text-[#333333] transition-colors">{item.title}</span>
              <ChevronDown
                size={14}
                className={`text-[#cccccc] transition-transform ${
                  expandedSections[item.title] ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
            {expandedSections[item.title] && (
              <div className="mt-0.5">
                {item.children.map((child, childIndex) => (
                  <button
                    key={childIndex}
                    type="button"
                    onClick={() => {
                      if (child === '我的订单') {
                        onSelectView('my-orders');
                      }
                      if (child === '我的产品') {
                        onSelectView('my-products');
                      }
                      if (child === '添加新产品') {
                        onSelectView('new-product');
                      }
                      if (child === '我的收入') {
                        onSelectView('my-income');
                      }
                      if (child === '我的余额') {
                        onSelectView('my-balance');
                      }
                      if (child === '银行账户') {
                        onSelectView('bank-accounts');
                      }
                    }}
                    className={`w-full text-left pl-10 pr-6 py-2 text-[14px] transition-colors font-normal ${
                      ((child === '我的订单' && activeView === 'my-orders') ||
                        (child === '我的产品' && activeView === 'my-products') ||
                        (child === '添加新产品' && activeView === 'new-product') ||
                        (child === '我的收入' && activeView === 'my-income') ||
                        (child === '我的余额' && activeView === 'my-balance') ||
                        (child === '银行账户' && activeView === 'bank-accounts'))
                        ? 'text-[#ee4d2d] border-l-2 border-[#ee4d2d] bg-[#fff7f5]'
                        : 'text-[#333333] hover:text-[#ee4d2d]'
                    }`}
                  >
                    {child}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
