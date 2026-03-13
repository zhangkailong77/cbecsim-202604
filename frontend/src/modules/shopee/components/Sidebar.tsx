import React from 'react';
import { 
  ChevronDown
} from 'lucide-react';

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

export default function Sidebar() {
  return (
    <div className="w-[200px] bg-white border-r border-gray-200 h-full overflow-y-auto custom-scrollbar flex-shrink-0">
      <div className="py-4">
        {menuItems.map((item, index) => (
          <div key={index} className="mb-4">
            <div className="px-6 py-2 flex items-center justify-between text-[#999999] cursor-pointer hover:bg-gray-50 group">
              <span className="text-[14px] font-normal group-hover:text-[#333333] transition-colors">{item.title}</span>
              <ChevronDown size={14} className="text-[#cccccc]" />
            </div>
            <div className="mt-0.5">
              {item.children.map((child, childIndex) => (
                <div 
                  key={childIndex} 
                  className="pl-10 pr-6 py-2 text-[14px] text-[#333333] cursor-pointer hover:text-[#ee4d2d] transition-colors font-normal"
                >
                  {child}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
