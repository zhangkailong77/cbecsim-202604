import { useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

interface OrderItem {
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: number;
  image_url: string | null;
}

interface OrderDetailResponse {
  id: number;
  order_no: string;
  buyer_name: string;
  buyer_payment: number;
  type_bucket: string;
  process_status: string;
  shipping_channel: string;
  destination: string;
  countdown_text: string;
  tracking_no?: string | null;
  waybill_no?: string | null;
  eta_start_at?: string | null;
  eta_end_at?: string | null;
  delivery_line_label?: string | null;
  promised_transit_days_text?: string | null;
  transit_days_expected?: number | null;
  transit_days_elapsed?: number | null;
  transit_days_remaining?: number | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  cancel_source?: string | null;
  created_at: string;
  items: OrderItem[];
}

interface LogisticsEvent {
  event_code: string;
  event_title: string;
  event_desc: string | null;
  event_time: string;
}

interface LogisticsResponse {
  order_id: number;
  order_no: string;
  tracking_no: string | null;
  waybill_no: string | null;
  shipping_channel: string;
  destination: string;
  eta_start_at: string | null;
  eta_end_at: string | null;
  delivery_line_label?: string | null;
  promised_transit_days_text?: string | null;
  transit_days_expected?: number | null;
  transit_days_elapsed?: number | null;
  transit_days_remaining?: number | null;
  events: LogisticsEvent[];
}

interface MyOrderDetailViewProps {
  runId: number | null;
  orderId: number;
  onBack: () => void;
}

function formatMoney(amount: number) {
  return `RM${Math.max(0, Number(amount || 0)).toFixed(2)}`;
}

function formatDateTime(val?: string | null) {
  if (!val) return '-';
  return new Date(val).toLocaleString();
}

function formatEtaRange(start?: string | null, end?: string | null) {
  if (!start || !end) return '-';
  return `${new Date(start).toLocaleDateString()} ~ ${new Date(end).toLocaleDateString()}`;
}

function formatTransitSummary(
  expected?: number | null,
  elapsed?: number | null,
  remaining?: number | null,
) {
  if (typeof expected !== 'number') return '-';
  return `预计 ${expected} 天 · 已运输 ${Math.max(0, elapsed ?? 0)} 天 · 剩余 ${Math.max(0, remaining ?? 0)} 天`;
}

export default function MyOrderDetailView({ runId, orderId, onBack }: MyOrderDetailViewProps) {
  const [order, setOrder] = useState<OrderDetailResponse | null>(null);
  const [logistics, setLogistics] = useState<LogisticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressing, setProgressing] = useState(false);

  const token = localStorage.getItem(ACCESS_TOKEN_KEY);

  const authedFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error('未登录');
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || '请求失败');
    }
    return res.json();
  };

  const loadData = async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const [orderRes, logisticsRes] = await Promise.all([
        authedFetch<OrderDetailResponse>(`${API_BASE_URL}/shopee/runs/${runId}/orders/${orderId}`),
        authedFetch<LogisticsResponse>(`${API_BASE_URL}/shopee/runs/${runId}/orders/${orderId}/logistics`),
      ]);
      setOrder(orderRes);
      setLogistics(logisticsRes);
    } catch (err) {
      alert(err instanceof Error ? err.message : '加载详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleProgress = async () => {
    if (!runId) return;
    if (logistics?.events?.[0]?.event_code === 'delivered') return;
    setProgressing(true);
    try {
      await authedFetch(`${API_BASE_URL}/shopee/runs/${runId}/orders/${orderId}/logistics/progress`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '推进失败');
    } finally {
      setProgressing(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, orderId]);

  if (loading && !order) {
    return <div className="flex-1 p-8 text-[14px] text-gray-500">加载中...</div>;
  }

  if (!order || !logistics) {
    return (
      <div className="flex-1 p-8">
        <button type="button" onClick={onBack} className="text-[13px] text-[#3478f6] hover:underline">
          返回订单列表
        </button>
        <div className="mt-4 text-[14px] text-gray-500">订单详情不存在或加载失败</div>
      </div>
    );
  }

  const latestEvent = logistics.events[0];
  const isCancelled = order.type_bucket === 'cancelled';
  const statusTitle = isCancelled ? '已取消' : latestEvent?.event_code === 'delivered' ? '已签收' : '运输中';
  const statusDesc = isCancelled
    ? (order.cancel_reason || '卖家超时未发货，买家已取消订单')
    : latestEvent?.event_desc || '订单正在配送中';
  const canProgress = !isCancelled && latestEvent?.event_code !== 'delivered';

  return (
    <div className="flex-1 bg-[#f5f5f5] p-5 overflow-y-auto custom-scrollbar">
      <div className="max-w-[1220px] mx-auto">
        <div className="mt-2 grid grid-cols-[1fr_250px] gap-4 items-start">
          <div className="space-y-4">
            <div className="rounded border border-gray-200 bg-white px-6 py-5 min-h-[140px]">
              <div className="text-[52px] leading-none font-semibold text-gray-800 tracking-tight">{statusTitle}</div>
              <div className="mt-2 text-[13px] text-gray-500">{statusDesc}</div>
            </div>

            <div className="rounded border border-gray-200 bg-white px-6 py-5">
              <div className="text-[14px] font-semibold text-gray-800">订单编号</div>
              <div className="mt-1 text-[13px] text-gray-600">{order.order_no}</div>

              <div className="mt-4 text-[14px] font-semibold text-gray-800">收货地址</div>
              <div className="mt-1 text-[13px] text-gray-600">{order.destination || '-'}</div>

              <div className="mt-5 text-[15px] font-semibold text-gray-800">物流信息</div>
              <div className="mt-2 text-[13px] text-gray-700">
                包裹1：{order.shipping_channel} | 追踪号 <span className="px-2 rounded bg-[#00bfa5] text-white">{order.tracking_no || '-'}</span>
              </div>
              <div className="mt-1 text-[12px] text-gray-500">预计送达：{formatEtaRange(order.eta_start_at, order.eta_end_at)}</div>
              <div className="mt-1 text-[12px] text-gray-500">配送线路：{order.delivery_line_label || logistics.delivery_line_label || '-'}</div>
              <div className="mt-1 text-[12px] text-gray-500">线路时效：{order.promised_transit_days_text || logistics.promised_transit_days_text || '-'}</div>
              <div className="mt-1 text-[12px] text-gray-500">
                运输进度：
                {formatTransitSummary(
                  order.transit_days_expected ?? logistics.transit_days_expected,
                  order.transit_days_elapsed ?? logistics.transit_days_elapsed,
                  order.transit_days_remaining ?? logistics.transit_days_remaining,
                )}
              </div>
              <div className="mt-1 text-[12px] text-gray-500">面单号：{order.waybill_no || '-'}</div>
              {isCancelled && (
                <div className="mt-1 text-[12px] text-gray-500">
                  取消信息：{order.cancel_reason || '-'}（来源：{order.cancel_source || '-'}，时间：{formatDateTime(order.cancelled_at)}）
                </div>
              )}

              <div className="mt-4 border border-gray-100 rounded bg-[#fafafa]">
                {logistics.events.map((event, idx) => (
                  <div key={`${event.event_code}-${event.event_time}`} className={`px-4 py-3 ${idx !== logistics.events.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="text-[14px] text-gray-800">{event.event_title}</div>
                    <div className="mt-1 text-[12px] text-gray-500">{event.event_desc || '-'}</div>
                    <div className="mt-1 text-[12px] text-gray-400">{formatDateTime(event.event_time)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button type="button" onClick={onBack} className="text-[13px] text-[#3478f6] hover:underline">
                  返回订单列表
                </button>
                <button
                  type="button"
                  onClick={handleProgress}
                  disabled={progressing || !canProgress}
                  className="h-9 px-4 rounded bg-[#ee4d2d] text-white text-[13px] hover:bg-[#d73211] disabled:cursor-not-allowed disabled:bg-[#f3a08f] disabled:opacity-100"
                >
                  {!canProgress ? (isCancelled ? '已取消' : '已签收') : progressing ? '推进中...' : '推进到下一节点'}
                </button>
              </div>
            </div>

            <div className="rounded border border-gray-200 bg-white px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
                    <img
                      src={order.items[0]?.image_url ?? 'https://picsum.photos/seed/shopee-buyer/64/64'}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="text-[26px] leading-none text-gray-700">{order.buyer_name}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className="h-9 px-8 rounded bg-[#ee4d2d] text-white text-[15px] hover:bg-[#d73211]">Follow</button>
                  <button type="button" className="h-9 px-8 rounded border border-gray-200 text-[#ee4d2d] text-[15px] hover:bg-[#fff7f5]">Chat Now</button>
                </div>
              </div>
            </div>

            <div className="rounded border border-gray-200 bg-white px-6 py-5">
              <div className="text-[15px] font-semibold text-gray-800">付款信息</div>
              <div className="mt-1 flex justify-end">
                <button type="button" className="text-[12px] text-[#3b82f6] hover:underline">View transaction history</button>
              </div>
              <div className="mt-2 rounded border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-[2fr_120px_80px_120px] bg-[#fafafa] px-4 py-2 text-[12px] text-gray-500">
                  <div>商品</div>
                  <div>单价</div>
                  <div>数量</div>
                  <div>小计</div>
                </div>
                {order.items.map((item, idx) => (
                  <div key={`${item.product_name}-${idx}`} className="grid grid-cols-[2fr_120px_80px_120px] items-center px-4 py-3 text-[13px] border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.image_url ?? 'https://picsum.photos/seed/shopee-fallback/80/80'}
                        className="w-12 h-12 rounded border border-gray-100 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <div className="text-gray-800">{item.product_name}</div>
                        <div className="text-[12px] text-gray-500">{item.variant_name || '-'}</div>
                      </div>
                    </div>
                    <div className="text-gray-700">{formatMoney(item.unit_price)}</div>
                    <div className="text-gray-700">{item.quantity}</div>
                    <div className="text-gray-700">{formatMoney(item.unit_price * item.quantity)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end text-[14px]">
                <div className="w-[420px] space-y-1">
                  <div className="flex items-center justify-between text-gray-600">
                    <span>商品小计</span>
                    <span>{formatMoney(order.buyer_payment)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600">
                    <span className="text-[12px] text-gray-400">Product Price</span>
                    <span className="text-[12px] text-gray-400">{formatMoney(order.buyer_payment)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 mt-2">
                    <span>预计运费小计</span>
                    <span>{formatMoney(0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="text-[12px]">Shipping Fee Paid by Buyer</span>
                    <span className="text-[12px]">{formatMoney(0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="text-[12px]">Estimated Shipping Fee Charged by Logistic Provider</span>
                    <span className="text-[12px]">-{formatMoney(Math.round(order.buyer_payment * 0.08))}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="text-[12px]">Estimated Shipping Fee Rebate from Shopee</span>
                    <span className="text-[12px]">{formatMoney(Math.round(order.buyer_payment * 0.08))}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 mt-2">
                    <span>费用与收费</span>
                    <span>-{formatMoney(Math.round(order.buyer_payment * 0.08))}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="text-[12px]">Commission Fee</span>
                    <span className="text-[12px]">-{formatMoney(Math.round(order.buyer_payment * 0.06))}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="text-[12px]">Service Fee</span>
                    <span className="text-[12px]">-{formatMoney(Math.round(order.buyer_payment * 0.02))}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="text-[12px]">Transaction Fee</span>
                    <span className="text-[12px]">-{formatMoney(15)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 mt-2">
                    <span>买家增值服务小计</span>
                    <span>{formatMoney(0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-700 mt-2">
                    <span>预计订单收入</span>
                    <span className="text-[34px] leading-none text-[#ee4d2d]">
                      {formatMoney(Math.max(0, order.buyer_payment - Math.round(order.buyer_payment * 0.06) - Math.round(order.buyer_payment * 0.02) - 15))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded border border-gray-200 bg-white px-5 py-5 min-h-[92px]">
              <div className="text-[14px] text-gray-400">添加备注</div>
            </div>
            <div className="rounded border border-gray-200 bg-white px-5 py-5 min-h-[140px]">
              <div className="text-[12px] text-gray-400">订单历史</div>
              <div className="mt-3 text-[14px] text-[#10b981]">新订单</div>
              <div className="mt-1 text-[12px] text-gray-400">{formatDateTime(order.created_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
