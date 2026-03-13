import React from 'react';
import { HelpCircle, ChevronRight, TrendingUp, ExternalLink, Play, MessageSquare, LayoutDashboard, Bell } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="flex-1 bg-[#f5f5f5] p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-6">
        
        {/* Left Column (Main Content) */}
        <div className="col-span-9 space-y-6">
          
          {/* Top Stats */}
          <div className="bg-white rounded-sm p-8 flex justify-between items-center shadow-sm border border-gray-100">
            <StatItem label="待处理发货" value="0" />
            <StatItem label="已处理发货" value="0" />
            <StatItem label="退货/退款/取消" value="104" />
            <StatItem label="被禁/减价产品" value="0" />
          </div>

          {/* Business Insights */}
          <Section title="商业洞察" subtitle="实时数据截至GMT+7 13:00 (数据变化与昨日数据相比)" moreLink="#">
            <div className="grid grid-cols-5 gap-4 mt-4">
              <InsightItem label="销售量" value="฿0" change="- 0.00%" isNeutral />
              <InsightItem label="访客" value="62" change="▲ 14.81%" isPositive />
              <InsightItem label="产品点击量" value="26" change="▲ 30.00%" isPositive />
              <InsightItem label="订单" value="0" change="- 0.00%" isNeutral />
              <InsightItem label="订单转化率" value="0.00%" change="- 0.00%" isNeutral />
            </div>
          </Section>

          {/* Shopee Ads */}
          <Section title="Shopee广告" moreLink="#">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-[13px] text-gray-500">广告收入 <span className="text-gray-900 font-medium">971.96 泰铢</span></span>
              <div className="bg-[#fff1f0] text-[#ee4d2d] text-[12px] px-2 py-0.5 rounded flex items-center gap-1 border border-[#ffccc7]">
                <span className="text-[10px]">🎁</span> 六折优惠 充值
                <ChevronRight size={12} />
              </div>
              <div className="h-4 w-[1px] bg-gray-200 mx-2"></div>
              <span className="text-[13px] text-gray-500">销售量 <HelpCircle size={14} className="inline ml-1" /> <span className="text-gray-900 font-medium">0.00</span> <span className="text-gray-400">- 0.00%</span></span>
              <span className="text-[13px] text-gray-500 ml-4">ROAS <HelpCircle size={14} className="inline ml-1" /> <span className="text-gray-900 font-medium">0.00</span> <span className="text-gray-400">- 0.00%</span></span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-100 rounded-sm p-4 flex justify-between items-center bg-gray-50/30 relative overflow-hidden">
                <div>
                  <div className="text-[14px] font-medium text-gray-800">充值 700 泰铢广告额度，即可获得 58 泰铢免费广告额度</div>
                  <div className="text-[12px] text-gray-400 mt-1">详情请参阅<span className="text-blue-500 cursor-pointer">广告奖励</span>页面。</div>
                </div>
                <button className="border border-[#ee4d2d] text-[#ee4d2d] px-4 py-1 rounded-sm text-[13px] hover:bg-[#ee4d2d] hover:text-white transition-colors">充值</button>
                <div className="absolute bottom-0 right-0 opacity-10">
                  <TrendingUp size={60} className="text-[#ee4d2d]" />
                </div>
              </div>
              <div className="border border-gray-100 rounded-sm p-4 flex justify-between items-center bg-gray-50/30">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
                    <Bell size={20} />
                  </div>
                  <div>
                    <div className="text-[14px] font-medium text-gray-800">提升你的广告技巧</div>
                    <div className="text-[12px] text-gray-400 mt-1">了解更多关于Shopee广告的信息。找到合适的广告投放方式，让您的广告价格更实惠。</div>
                  </div>
                </div>
                <button className="border border-[#ee4d2d] text-[#ee4d2d] px-4 py-1 rounded-sm text-[13px] whitespace-nowrap">立即学习</button>
              </div>
            </div>
          </Section>

          {/* Affiliate Marketing */}
          <div className="grid grid-cols-2 gap-6">
            <Section title="联盟营销解决方案" moreLink="#">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <InsightItem label="销售量" value="1.8千泰铢" isSmall />
                <InsightItem label="新买家" value="3" isSmall />
                <InsightItem label="投资回报率" value="19.6" isSmall />
              </div>
              <div className="border-t border-gray-100 pt-4">
                <div className="text-[14px] font-medium text-gray-800">推广高潜力产品</div>
                <div className="text-[12px] text-gray-400 mt-1">同类别的6000 多家店铺通过联盟营销提高了销售额。</div>
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex -space-x-2">
                    <img src="https://picsum.photos/seed/p1/40/40" className="w-10 h-10 rounded-sm border-2 border-white" referrerPolicy="no-referrer" />
                    <img src="https://picsum.photos/seed/p2/40/40" className="w-10 h-10 rounded-sm border-2 border-white" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <div className="text-[12px] text-gray-400">潜在销售额：</div>
                    <div className="text-[14px] font-medium text-green-500 flex items-center gap-1">+23% <TrendingUp size={14} /></div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex-1 border border-gray-200 rounded-sm px-3 py-1.5 text-[13px] flex justify-between items-center">
                    <span>9</span>
                    <span className="text-gray-400">建议比例: <span className="text-gray-800 font-medium">9% - 14%</span> <HelpCircle size={12} className="inline" /> | %</span>
                  </div>
                  <button className="w-8 h-8 bg-emerald-50 text-emerald-500 border border-emerald-200 rounded-sm flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </button>
                </div>
              </div>
            </Section>

            <Section title="直播" moreLink="#">
              <div className="bg-orange-50/50 rounded-sm p-6 flex flex-col items-center text-center relative overflow-hidden min-h-[200px]">
                <div className="z-10">
                  <div className="text-[18px] font-bold text-gray-800">现在就开始观看吧！</div>
                  <div className="text-[14px] text-gray-600 mt-1">转化率最高可提升<span className="text-[#ee4d2d] font-bold">2倍！</span></div>
                  <button className="mt-4 bg-[#ee4d2d] text-white px-6 py-1.5 rounded-full text-[14px] flex items-center gap-2 hover:bg-[#d73211]">
                    创建流 <ChevronRight size={16} />
                  </button>
                </div>
                <div className="absolute bottom-0 right-0 w-48 h-32">
                  <img src="https://deo.shopeemobile.com/shopee/shopee-seller-live-sg/mmf/static/img/live-bg.7b7e3e4.png" className="w-full h-full object-contain opacity-80" referrerPolicy="no-referrer" />
                </div>
              </div>
            </Section>
          </div>

          {/* Activities */}
          <Section title="活动" moreLink="#">
            <div className="flex gap-6">
              <div className="w-[240px] flex-shrink-0">
                <img src="https://picsum.photos/seed/activity/240/120" className="w-full h-[120px] rounded-sm object-cover" referrerPolicy="no-referrer" />
                <div className="mt-3">
                  <div className="text-[14px] font-medium text-gray-800">生活准则严苛，但服务费正常。</div>
                  <div className="text-[12px] text-gray-400 mt-1">长期有效</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[#ee4d2d] text-[12px] border border-[#ee4d2d] px-1 rounded">Live Xtra</span>
                    <button className="text-[#ee4d2d] text-[13px] border border-[#ee4d2d] px-4 py-1 rounded-sm">加入</button>
                  </div>
                </div>
              </div>
            </div>
          </Section>

        </div>

        {/* Right Column (Sidebar) */}
        <div className="col-span-3 space-y-6">
          
          {/* Shop Performance */}
          <div className="bg-white rounded-sm p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[16px] font-medium text-gray-800">店铺表现</h3>
            </div>
            <div className="flex justify-between items-center group cursor-pointer">
              <div>
                <div className="text-[15px] text-blue-500 font-medium">出色的</div>
                <div className="text-[12px] text-gray-400 mt-0.5">所有指标均达到目标</div>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500" />
            </div>
          </div>

          {/* Business Suggestions */}
          <div className="bg-white rounded-sm p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[16px] font-medium text-gray-800">商业建议</h3>
              <span className="text-[12px] text-gray-400">3条建议</span>
            </div>
            
            <div className="space-y-4">
              <SuggestionCard 
                icon="🔥" 
                title="优化营销活动激增" 
                content="在广告投放日期期间，自动优化广告支出回报率、预算和出价，以最大限度地提高销售额。"
                stats="商品交易价值 15% 📈 订单 15% 📈"
                action="打开"
              />
              <SuggestionCard 
                icon="💰" 
                title="充值即可享受折扣" 
                content="六折优惠 充值金额 ฿749 803泰铢 (含消费税)"
                footer="截止日期: 3月13日 | 规则 ❓"
                action="充值"
                hasBadge
              />
              <SuggestionCard 
                icon="🎁" 
                title="充值 700 泰铢广告额度" 
                content="58 泰铢 免费广告额度"
                action="查看"
                isGift
              />
            </div>
          </div>

          {/* Announcements */}
          <div className="bg-white rounded-sm p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[16px] font-medium text-gray-800">公告</h3>
              <span className="text-[13px] text-blue-500 cursor-pointer">更多</span>
            </div>
            <div className="space-y-4">
              <img src="https://picsum.photos/seed/ads/300/150" className="w-full h-[150px] rounded-sm object-cover" referrerPolicy="no-referrer" />
              <div className="space-y-3">
                <AnnouncementItem 
                  icon="📢" 
                  title="卖家报纸，2026 年 3 月 9 日。" 
                  content="本周热点新闻：本周你需了解的重要信息！一起来看看吧！"
                  date="2026年3月9日"
                />
                <AnnouncementItem 
                  icon="🔥" 
                  title="全新季节性福利上线！" 
                  content="并修改 PRIME 卖家计划的条款和条件。"
                  date="2026年3月6日"
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="text-center flex-1 border-r border-gray-100 last:border-0">
      <div className="text-[24px] font-bold text-blue-500">{value}</div>
      <div className="text-[13px] text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function Section({ title, subtitle, moreLink, children }: { title: string, subtitle?: string, moreLink?: string, children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-sm p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[16px] font-medium text-gray-800">{title}</h3>
          {subtitle && <span className="text-[12px] text-gray-400">{subtitle}</span>}
        </div>
        {moreLink && (
          <a href={moreLink} className="text-[13px] text-blue-500 flex items-center gap-0.5 hover:underline">
            更多 <ChevronRight size={14} />
          </a>
        )}
      </div>
      {children}
    </div>
  );
}

function InsightItem({ label, value, change, isPositive, isNeutral, isSmall }: { label: string, value: string, change?: string, isPositive?: boolean, isNeutral?: boolean, isSmall?: boolean }) {
  return (
    <div className="group cursor-pointer">
      <div className="text-[13px] text-gray-500 flex items-center gap-1">
        {label} <HelpCircle size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className={`${isSmall ? 'text-[18px]' : 'text-[22px]'} font-bold text-gray-800 mt-1`}>{value}</div>
      {change && (
        <div className={`text-[12px] mt-1 ${isPositive ? 'text-green-500' : isNeutral ? 'text-gray-400' : 'text-red-500'}`}>
          {change}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ icon, title, content, stats, footer, action, hasBadge, isGift }: { icon: string, title: string, content: string, stats?: string, footer?: string, action: string, hasBadge?: boolean, isGift?: boolean }) {
  return (
    <div className="border border-gray-100 rounded-sm p-4 bg-gray-50/30 relative">
      <div className="flex items-start gap-3">
        <span className="text-[18px]">{icon}</span>
        <div className="flex-1">
          <div className="text-[14px] font-medium text-gray-800">{title}</div>
          <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">{content}</div>
          {stats && <div className="text-[12px] text-green-500 mt-2 font-medium">{stats}</div>}
          {footer && <div className="text-[11px] text-gray-400 mt-2">{footer}</div>}
          <div className="mt-3 flex justify-end gap-2">
            {!isGift && <button className="text-[12px] text-gray-500 hover:text-gray-700">查看详情</button>}
            <button className="bg-white border border-[#ee4d2d] text-[#ee4d2d] px-3 py-0.5 rounded-sm text-[12px] hover:bg-[#ee4d2d] hover:text-white transition-colors">{action}</button>
          </div>
        </div>
      </div>
      {hasBadge && (
        <div className="absolute top-4 right-4">
          <div className="w-8 h-8 bg-orange-100 rounded flex items-center justify-center">
            <span className="text-[14px]">🎫</span>
          </div>
        </div>
      )}
      {isGift && (
        <div className="absolute top-4 right-4">
          <div className="w-8 h-8 bg-red-50 rounded flex items-center justify-center">
            <span className="text-[18px]">🏆</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AnnouncementItem({ icon, title, content, date }: { icon: string, title: string, content: string, date: string }) {
  return (
    <div className="group cursor-pointer">
      <div className="flex items-start gap-2">
        <span className="text-[14px] mt-0.5">{icon}</span>
        <div>
          <div className="text-[14px] font-medium text-gray-800 group-hover:text-blue-500 transition-colors">{title}</div>
          <div className="text-[12px] text-gray-500 mt-1 line-clamp-2">{content}</div>
          <div className="text-[11px] text-gray-400 mt-1">{date}</div>
        </div>
      </div>
    </div>
  );
}

function FloatingButton({ icon, badge, color, textColor }: { icon: React.ReactNode, badge?: string, color: string, textColor: string }) {
  return (
    <div className={`w-10 h-10 ${color} ${textColor} rounded-full flex items-center justify-center shadow-md cursor-pointer relative hover:scale-110 transition-transform`}>
      {icon}
      {badge && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1 rounded-full border border-white">
          {badge}
        </span>
      )}
    </div>
  );
}
