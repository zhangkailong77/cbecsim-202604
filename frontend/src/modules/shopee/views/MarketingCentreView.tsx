import {
  BadgeDollarSign,
  BadgePercent,
  ChartNoAxesCombined,
  Coins,
  Globe,
  MessageSquareHeart,
  Radio,
  Store,
  Ticket,
  Truck,
  UsersRound,
  Video,
  ChevronUp,
  ExternalLink,
  Megaphone,
} from 'lucide-react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

interface MarketingAnnouncement {
  id: number;
  title: string;
  summary: string;
  badge_text: string | null;
  published_at: string | null;
}

interface MarketingTool {
  tool_key: string;
  tool_name: string;
  tag_type: string;
  description: string;
  icon_key: string;
  target_route: string;
  is_enabled: boolean;
  is_visible: boolean;
}

interface MarketingEvent {
  id: number;
  title: string;
  image_url: string;
  jump_url: string;
  status: string;
}

interface MarketingBootstrapResponse {
  meta: {
    run_id: number;
    user_id: number;
    market: string;
    lang: string;
    current_tick: string;
  };
  preferences: {
    tools_collapsed: boolean;
    last_viewed_at: string | null;
  };
  announcements: MarketingAnnouncement[];
  tools: MarketingTool[];
  events: MarketingEvent[];
}

interface MarketingCentreViewProps {
  runId: number | null;
  readOnly?: boolean;
}

const toolNameMap: Record<string, string> = {
  Discount: '折扣',
  "My Shop's Flash Sale": '我的店铺限时抢购',
  Vouchers: '代金券',
  'Shopee Ads': 'Shopee 广告',
  'Affiliate Marketing Solution': '联盟营销解决方案',
  'Shipping Fee Promotion': '运费促销',
  'Live Streaming': '直播',
  'Off-Platform Ads': '站外广告',
  'Review Prize': '评价奖励',
  'Shopee International Platform': '国际平台',
  'Seller Coins': '卖家金币',
  'Live Streaming Promotion': '直播推广',
  'Marketing Solution': '营销解决方案',
};

const toolDescriptionMap: Record<string, string> = {
  'Set discounts on your products to boost sales': '为商品设置折扣，帮助提升销量。',
  'Boost product sales by creating limited-time discount offers in your shop': '创建限时折扣活动，提升店铺商品销量。',
  'Increase orders by offering buyers reduced prices at checkout with vouchers': '通过代金券在结算时给买家优惠，提升下单转化。',
  'Increase exposure and drive sales in high traffic areas on Shopee with ads': '通过 Shopee 广告获取更多曝光，在高流量场景中带动销售。',
  "Leverage on Shopee's extensive network of affiliate partners to boost your store promotion": '借助 Shopee 联盟达人网络，为店铺带来更多推广流量。',
  'Set shipping fee discounts to attract shoppers to make orders': '设置运费优惠，吸引买家下单。',
  'Connect Live with your audience and answer shopper questions easily': '通过直播与买家实时互动，更高效地解答问题。',
  'Advertise your products on Meta and Google platforms including Facebook, Instagram, Google Search and YouTube': '在 Meta 与 Google 等站外平台投放广告，扩大商品触达。',
  'Attract customers to leave better reviews by rewarding coins': '通过奖励金币鼓励买家留下更优质的评价。',
  'Helps you to sell on overseas Shopee platforms without any additional effort': '帮助你将商品销往更多海外 Shopee 站点，降低跨站经营门槛。',
  'Top up seller coins as a reward to encourage shoppers to join shop activities': '发放卖家金币作为奖励，鼓励买家参与店铺活动。',
  'Nominate your products to be featured in Shopee Livestream': '提报商品进入 Shopee 直播场景，获取更多曝光。',
  'Combined marketing tools for optimized engagement and returns with mission rewards from completion': '整合多种营销工具，帮助提升互动、转化与活动收益。',
};

const eventTitleMap: Record<string, string> = {
  'Super Voucher Day': '超级代金券日',
  'Mega Campaign Payday': '月中大促',
  'Seller Growth Week': '卖家成长周',
};

const badgeTextMap: Record<string, string> = {
  HOT: '热门',
  SALE: '促销',
  NEW: '上新',
};

const eventStatusMap: Record<string, string> = {
  ongoing: '进行中',
  upcoming: '即将开始',
  ended: '已结束',
  offline: '已下线',
};

const iconMap: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  'badge-percent': BadgePercent,
  store: Store,
  ticket: Ticket,
  'badge-dollar-sign': BadgeDollarSign,
  'users-round': UsersRound,
  truck: Truck,
  video: Video,
  globe: Globe,
  'message-square-heart': MessageSquareHeart,
  earth: Globe,
  coins: Coins,
  radio: Radio,
  'chart-no-axes-combined': ChartNoAxesCombined,
  megaphone: Megaphone,
};

function formatDateLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function tagStyle(tagType: string) {
  if (tagType === 'increase_traffic') {
    return 'border-[#ffd8bf] bg-[#fff4eb] text-[#f97316]';
  }
  if (tagType === 'improve_engagement') {
    return 'border-[#b6f0ea] bg-[#effcf9] text-[#0f9f94]';
  }
  return 'border-[#c9dbff] bg-[#f3f8ff] text-[#2563eb]';
}

function tagLabel(tagType: string) {
  if (tagType === 'increase_traffic') return '提升流量';
  if (tagType === 'improve_engagement') return '提升互动';
  return '提升销量';
}

function getToolName(toolName: string) {
  return toolNameMap[toolName] || toolName;
}

function getToolDescription(description: string) {
  return toolDescriptionMap[description] || description;
}

function getEventTitle(title: string) {
  return eventTitleMap[title] || title;
}

function getBadgeText(badgeText: string | null) {
  if (!badgeText) return '';
  return badgeTextMap[badgeText] || badgeText;
}

function getEventStatus(status: string) {
  return eventStatusMap[status] || status;
}

export default function MarketingCentreView({ runId, readOnly = false }: MarketingCentreViewProps) {
  const [data, setData] = useState<MarketingBootstrapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toolsCollapsed, setToolsCollapsed] = useState(false);

  useEffect(() => {
    if (!runId) {
      setData(null);
      setError('');
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setData(null);
      setError('登录状态失效，请重新登录。');
      return;
    }

    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing-centre/bootstrap`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('load failed');
        const result = (await response.json()) as MarketingBootstrapResponse;
        if (cancelled) return;
        setData(result);
        setToolsCollapsed(Boolean(result.preferences?.tools_collapsed));
      } catch {
        if (cancelled) return;
        setData(null);
        setError('营销中心加载失败，请稍后重试。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const persistCollapse = async (nextValue: boolean) => {
    if (!runId || readOnly) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/preferences`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tools_collapsed: nextValue }),
      });
    } catch {
      // Keep UI responsive even when preference persistence fails.
    }
  };

  const handleToggleCollapse = () => {
    if (readOnly) return;
    const nextValue = !toolsCollapsed;
    setToolsCollapsed(nextValue);
    void persistCollapse(nextValue);
  };

  const handleOpenRoute = (targetRoute: string, isEnabled: boolean) => {
    if (!isEnabled) {
      window.alert('该营销工具暂未开放，后续会继续接入。');
      return;
    }
    const implementedRoutePatterns = [
      /\/shopee\/marketing-centre\/?$/,
      /\/shopee\/marketing\/discount\/?$/,
    ];
    if (!implementedRoutePatterns.some((pattern) => pattern.test(targetRoute))) {
      window.alert('该营销工具主页已预留，具体功能页将在后续阶段继续接入。');
      return;
    }
    if (`${window.location.pathname}${window.location.search}` === targetRoute) return;
    window.history.pushState(null, '', targetRoute);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const visibleTools = toolsCollapsed ? (data?.tools ?? []).slice(0, 6) : (data?.tools ?? []);
  const hiddenToolsCount = Math.max((data?.tools ?? []).length - visibleTools.length, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-[#f6f6f6] px-9 py-6 custom-scrollbar">
      <div className="mx-auto max-w-[1660px]">
        {readOnly ? (
          <div className="mb-5 border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-700">
            当前为历史对局回溯模式：可浏览营销中心，但不会保存折叠偏好。
          </div>
        ) : null}
        {error ? (
          <div className="mb-5 border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</div>
        ) : null}

        <SectionCard title="公告" rightText="更多">
          <div className="grid grid-cols-3 gap-6">
            {(data?.announcements ?? []).map((item) => (
              <div key={item.id} className="min-h-[92px] border border-[#f0f0f0] bg-white px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[15px] font-semibold text-[#333333]">{item.title}</div>
                  {item.badge_text ? (
                    <span className="bg-[#fff1ed] px-1.5 py-0.5 text-[10px] font-semibold text-[#ee4d2d]">
                      {getBadgeText(item.badge_text)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-[#6b6b6b]">{item.summary}</div>
                <div className="mt-2 text-[12px] text-[#a0a0a0]">{formatDateLabel(item.published_at)}</div>
              </div>
            ))}
              {loading && !(data?.announcements?.length) ? (
                Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-[92px] animate-pulse bg-[#f1f1f1]" />
              ))
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="营销工具">
          {visibleTools.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {visibleTools.map((tool) => {
                const ToolIcon = iconMap[tool.icon_key] || Megaphone;
                return (
                  <button
                    key={tool.tool_key}
                    type="button"
                    onClick={() => handleOpenRoute(tool.target_route, tool.is_enabled)}
                    className={`border bg-white px-6 py-5 text-left transition-all ${
                      tool.is_enabled
                        ? 'border-[#e9e9e9] hover:-translate-y-0.5 hover:border-[#ffcabd] hover:shadow-[0_12px_32px_rgba(238,77,45,0.08)]'
                        : 'cursor-not-allowed border-[#efefef] opacity-70'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f85f36] text-white">
                        <ToolIcon size={22} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-[15px] font-semibold text-[#303030]">{getToolName(tool.tool_name)}</div>
                          {!tool.is_enabled ? (
                            <span className="bg-[#f4f4f4] px-1.5 py-0.5 text-[10px] text-[#888888]">SOON</span>
                          ) : null}
                        </div>
                        <div className={`mt-1 inline-flex border px-1.5 py-[1px] text-[11px] ${tagStyle(tool.tag_type)}`}>
                          {tagLabel(tool.tag_type)}
                        </div>
                        <div className="mt-2 text-[13px] leading-5 text-[#666666]">{getToolDescription(tool.description)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="mt-6 border-t border-dashed border-[#e8e8e8] pt-4 text-center">
            <button
              type="button"
              onClick={handleToggleCollapse}
              className="inline-flex items-center gap-1 text-[13px] text-[#2563eb] hover:opacity-80"
            >
              {toolsCollapsed ? `View More Tools (${hiddenToolsCount})` : '收起'}
              <ChevronUp size={14} className={toolsCollapsed ? 'rotate-180' : ''} />
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Shopee 活动" rightText="更多">
          <div className="grid grid-cols-3 gap-4">
            {(data?.events ?? []).map((item) => (
              <button
              key={item.id}
              type="button"
              onClick={() => handleOpenRoute(item.jump_url, true)}
              className="overflow-hidden border border-[#ececec] bg-white text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
            >
                <div
                  className="relative h-[150px] px-6 py-5 text-white"
                  style={{ backgroundImage: item.image_url, backgroundSize: 'cover' }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.06),rgba(15,23,42,0.24))]" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="inline-flex w-fit bg-white/18 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                      {getEventStatus(item.status)}
                    </div>
                    <div>
                      <div className="max-w-[260px] text-[26px] font-extrabold leading-none">{getEventTitle(item.title)}</div>
                      <div className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold">
                        查看活动 <ExternalLink size={14} />
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  rightText,
  children,
}: {
  title: string;
  rightText?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 border border-[#ececec] bg-white px-6 py-6 shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-[18px] font-semibold text-[#2f2f2f]">{title}</div>
        {rightText ? <div className="text-[14px] text-[#2563eb]">{rightText}</div> : null}
      </div>
      {children}
    </section>
  );
}
