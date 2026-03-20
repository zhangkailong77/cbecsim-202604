import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, RefreshCw, Package, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

type TabType = 'all' | 'unpaid' | 'toship' | 'shipping' | 'completed' | 'return_refund_cancel';
type OrderBucket = 'unpaid' | 'toship' | 'shipping' | 'completed' | 'cancelled';
type OrderType = 'all' | 'order' | 'command' | 'advance';
type OrderStatus = 'all' | 'processing' | 'processed';
type Priority = 'all' | 'overdue' | 'today' | 'tomorrow';

interface OrderItem {
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: number;
  image_url: string | null;
}

interface OrderRow {
  id: number;
  order_no: string;
  buyer_name: string;
  buyer_payment: number;
  order_type: OrderType;
  type_bucket: OrderBucket;
  process_status: OrderStatus;
  shipping_priority: string;
  shipping_channel: string;
  destination: string;
  countdown_text: string;
  action_text: string;
  ship_by_at?: string | null;
  tracking_no?: string | null;
  waybill_no?: string | null;
  listing_id?: number | null;
  variant_id?: number | null;
  stock_fulfillment_status: 'in_stock' | 'backorder' | 'restocked' | string;
  backorder_qty: number;
  must_restock_before_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  cancel_source?: string | null;
  eta_start_at?: string | null;
  eta_end_at?: string | null;
  distance_km?: number | null;
  delivery_line_label?: string | null;
  promised_transit_days_text?: string | null;
  transit_days_expected?: number | null;
  transit_days_elapsed?: number | null;
  transit_days_remaining?: number | null;
  created_at: string;
  items: OrderItem[];
}

interface OrdersResponse {
  counts: {
    all: number;
    unpaid: number;
    toship: number;
    shipping: number;
    completed: number;
    return_refund_cancel: number;
  };
  page: number;
  page_size: number;
  total: number;
  simulated_recent_1h: number;
  last_simulated_at: string | null;
  orders: OrderRow[];
}

interface SettlementResponse {
  order_id: number;
  settlement_status: string;
  buyer_payment: number;
  platform_commission_amount: number;
  payment_fee_amount: number;
  shipping_cost_amount: number;
  shipping_subsidy_amount: number;
  net_income_amount: number;
  settled_at: string | null;
}

interface MyOrdersViewProps {
  runId: number | null;
  onOpenOrderDetail: (orderId: number, tabType: TabType) => void;
}

function queryFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const tabType = (params.get('type') ?? 'all') as TabType;
  const pageNum = Number(params.get('page') ?? '1');
  return {
    type: ['all', 'unpaid', 'toship', 'shipping', 'completed', 'return_refund_cancel'].includes(tabType) ? tabType : 'all',
    source: params.get('source') ?? '',
    sortBy: params.get('sort_by') ?? '',
    orderType: (params.get('order_type') ?? 'all') as OrderType,
    orderStatus: (params.get('order_status') ?? 'all') as OrderStatus,
    priority: (params.get('priority') ?? 'all') as Priority,
    keyword: params.get('keyword') ?? '',
    channel: params.get('channel') ?? '',
    page: Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1,
  };
}

function buildBaseParamsByType(type: TabType) {
  const params = new URLSearchParams();
  if (type === 'unpaid') params.set('type', 'unpaid');
  if (type === 'shipping') params.set('type', 'shipping');
  if (type === 'completed') params.set('type', 'completed');
  if (type === 'return_refund_cancel') params.set('type', 'return_refund_cancel');
  if (type === 'toship') {
    params.set('type', 'toship');
    params.set('source', 'to_process');
    params.set('sort_by', 'ship_by_date_asc');
  }
  return params;
}

function FilterChip({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-full border px-4 text-[14px] transition-colors ${
        active
          ? 'border-[#ee4d2d] text-[#ee4d2d] bg-white'
          : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
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

function formatTransitExplain(row: OrderRow) {
  const expected = row.transit_days_expected;
  const elapsed = row.transit_days_elapsed;
  const remaining = row.transit_days_remaining;
  const line = row.delivery_line_label || row.shipping_channel || '-';
  const promised = row.promised_transit_days_text ? `（线路时效 ${row.promised_transit_days_text}）` : '';
  if (typeof expected === 'number') {
    return `预计运输 ${expected} 天 · 已运输 ${Math.max(0, elapsed ?? 0)} 天 · 剩余 ${Math.max(0, remaining ?? 0)} 天 · ${line}${promised}`;
  }
  return `线路：${line}${promised}`;
}

function formatSettlementStatus(status: string) {
  const labelMap: Record<string, string> = {
    pending: '待结算',
    settled: '已结算',
  };
  return labelMap[status] ?? status;
}

function formatBackorderDeadline(val?: string | null) {
  if (!val) return '-';
  return new Date(val).toLocaleString();
}

function parseApiErrorDetail(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '请求失败';
  try {
    const parsed = JSON.parse(text) as { detail?: string };
    if (parsed?.detail && String(parsed.detail).trim()) {
      return String(parsed.detail).trim();
    }
  } catch {
    // ignore JSON parse error and fallback to raw text
  }
  return text;
}

export default function MyOrdersView({ runId, onOpenOrderDetail }: MyOrdersViewProps) {
  const [query, setQuery] = useState(queryFromLocation());
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoadingOrderId, setActionLoadingOrderId] = useState<number | null>(null);
  const [batchShipping, setBatchShipping] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [searchField, setSearchField] = useState('订单号');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [settlementDialog, setSettlementDialog] = useState<SettlementResponse | null>(null);
  const searchDropdownRef = useRef<HTMLDivElement | null>(null);

  const token = useMemo(() => localStorage.getItem(ACCESS_TOKEN_KEY), []);

  const updateUrl = (params: URLSearchParams) => {
    const next = params.toString();
    const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.pushState(null, '', nextUrl);
    setQuery(queryFromLocation());
  };

  const reloadOrders = () => {
    if (!runId || !token) return;
    const params = new URLSearchParams(window.location.search);
    params.set('page', String(query.page || 1));
    params.set('page_size', '20');

    setLoading(true);
    fetch(`${API_BASE_URL}/shopee/runs/${runId}/orders?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('load failed');
        return res.json();
      })
      .then((res: OrdersResponse) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  const applyQueryPatch = (patch: Partial<typeof query>) => {
    const base = buildBaseParamsByType(query.type);
    const next = { ...query, ...patch, page: patch.page ?? 1 };

    if (next.type === 'toship') {
      if (next.orderType !== 'all') base.set('order_type', next.orderType);
      if (next.orderStatus !== 'all') base.set('order_status', next.orderStatus);
      if (next.priority !== 'all') base.set('priority', next.priority);
    }
    if (next.keyword.trim()) base.set('keyword', next.keyword.trim());
    if (next.channel.trim()) base.set('channel', next.channel.trim());
    if ((next.page ?? 1) > 1) base.set('page', String(next.page));
    updateUrl(base);
  };

  const switchTab = (type: TabType) => {
    const base = buildBaseParamsByType(type);
    updateUrl(base);
  };

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
      const text = await res.text();
      throw new Error(text || '请求失败');
    }
    return res.json();
  };

  const handleShipOrder = async (order: OrderRow) => {
    if (!runId) return;
    try {
      setActionLoadingOrderId(order.id);
      await authedFetch(`${API_BASE_URL}/shopee/runs/${runId}/orders/${order.id}/ship`, {
        method: 'POST',
        body: JSON.stringify({ shipping_channel: order.shipping_channel }),
      });
      reloadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : '安排发货失败');
    } finally {
      setActionLoadingOrderId(null);
    }
  };

  const handleBatchShipOrders = async () => {
    if (!runId) return;
    const orderMap = new Map((data?.orders ?? []).map((row) => [row.id, row]));
    const targets = selectedOrderIds
      .map((id) => orderMap.get(id))
      .filter((row): row is OrderRow => Boolean(row && row.type_bucket === 'toship'));
    if (targets.length === 0) {
      alert('请先勾选待出货订单');
      return;
    }
    setBatchShipping(true);
    let successCount = 0;
    let failCount = 0;
    const failReasonCounter = new Map<string, number>();
    try {
      for (const row of targets) {
        try {
          await authedFetch(`${API_BASE_URL}/shopee/runs/${runId}/orders/${row.id}/ship`, {
            method: 'POST',
            body: JSON.stringify({ shipping_channel: row.shipping_channel }),
          });
          successCount += 1;
        } catch (err) {
          failCount += 1;
          const reason = err instanceof Error ? parseApiErrorDetail(err.message) : '请求失败';
          failReasonCounter.set(reason, (failReasonCounter.get(reason) ?? 0) + 1);
        }
      }
      if (failCount > 0) {
        const reasonLines = Array.from(failReasonCounter.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => `- ${reason}：${count} 单`)
          .join('\n');
        alert(`批量发货完成：成功 ${successCount} 单，失败 ${failCount} 单\n失败原因：\n${reasonLines}`);
      } else {
        alert(`批量发货完成：成功 ${successCount} 单，失败 ${failCount} 单`);
      }
      setSelectedOrderIds([]);
      reloadOrders();
    } finally {
      setBatchShipping(false);
    }
  };

  const handleOpenSettlement = async (orderId: number) => {
    if (!runId) return;
    try {
      const res = await authedFetch<SettlementResponse>(`${API_BASE_URL}/shopee/runs/${runId}/orders/${orderId}/settlement`);
      setSettlementDialog(res);
    } catch (err) {
      alert(err instanceof Error ? err.message : '结算未生成');
    }
  };

  const handlePrintWaybill = (order: OrderRow) => {
    const text = `面单号: ${order.waybill_no || '-'}\n追踪号: ${order.tracking_no || '-'}\n订单号: ${order.order_no}`;
    alert(text);
  };

  useEffect(() => {
    const onPop = () => setQuery(queryFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!searchDropdownRef.current) return;
      if (!searchDropdownRef.current.contains(event.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    reloadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, query, token]);

  useEffect(() => {
    const validIds = new Set(
      (data?.orders ?? [])
        .filter((row) => row.type_bucket === 'toship')
        .map((row) => row.id),
    );
    setSelectedOrderIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [data]);

  const countText = useMemo(() => {
    if (!data) return '0';
    return String(data.total ?? 0);
  }, [data]);

  const shippingChannelOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.orders ?? []).forEach((row) => set.add(row.shipping_channel));
    return ['所有频道', ...Array.from(set)];
  }, [data]);

  const keywordPlaceholderMap: Record<string, string> = {
    订单号: '输入订单/预订编号',
    买方名称: '输入买方名称',
    产品: '输入产品关键词',
    追踪号码: '输入追踪号码',
    '返回请求 ID': '输入返回请求 ID',
    退货追踪号: '输入退货追踪号',
  };

  const searchFieldOptions = ['订单号', '买方名称', '产品', '追踪号码', '返回请求 ID', '退货追踪号'];
  const isShippingView = query.type === 'shipping';
  const isCompletedView = query.type === 'completed';
  const isCancelView = query.type === 'return_refund_cancel';
  const isToShipView = query.type === 'toship';
  const toshipOrderIdsOnPage = useMemo(
    () => (data?.orders ?? []).filter((row) => row.type_bucket === 'toship').map((row) => row.id),
    [data],
  );
  const allCheckedOnPage = toshipOrderIdsOnPage.length > 0 && toshipOrderIdsOnPage.every((id) => selectedOrderIds.includes(id));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / Math.max(1, data?.page_size ?? 20)));
  const currentPage = Math.max(1, data?.page ?? query.page ?? 1);
  const makePageItems = (current: number, total: number): Array<number | '...'> => {
    if (total <= 7) return Array.from({ length: total }, (_, idx) => idx + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  };
  const pageItems = makePageItems(currentPage, totalPages);
  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(totalPages, page));
    applyQueryPatch({ page: target });
  };

  return (
    <div className="flex-1 bg-[#f5f5f5] p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-[1600px] mx-auto">
        <div className="bg-white border border-gray-100 rounded-sm p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] leading-none font-semibold text-gray-800">我的订单</h2>
            <div className="flex items-center gap-3">
              <button type="button" className="h-9 px-5 rounded border border-gray-300 text-[14px] text-gray-700 hover:bg-gray-50">
                出口
              </button>
              <button type="button" className="h-9 px-5 rounded border border-gray-300 text-[14px] text-gray-700 hover:bg-gray-50 relative">
                出口历史
              </button>
            </div>
          </div>

          <div className="mt-7 border-b border-gray-200 flex items-center gap-8">
            <button
              type="button"
              onClick={() => switchTab('all')}
              className={`pb-3 text-[14px] ${query.type === 'all' ? 'text-[#ee4d2d] border-b-2 border-[#ee4d2d]' : 'text-gray-600'}`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => switchTab('unpaid')}
              className={`pb-3 text-[14px] ${query.type === 'unpaid' ? 'text-[#ee4d2d] border-b-2 border-[#ee4d2d]' : 'text-gray-600'}`}
            >
              待付款（{data?.counts.unpaid ?? 0}）
            </button>
            <button
              type="button"
              onClick={() => switchTab('toship')}
              className={`pb-3 text-[14px] ${query.type === 'toship' ? 'text-[#ee4d2d] border-b-2 border-[#ee4d2d]' : 'text-gray-600'}`}
            >
              待出货（{data?.counts.toship ?? 0}）
            </button>
            <button
              type="button"
              onClick={() => switchTab('shipping')}
              className={`pb-3 text-[14px] ${query.type === 'shipping' ? 'text-[#ee4d2d] border-b-2 border-[#ee4d2d]' : 'text-gray-600'}`}
            >
              运输中（{data?.counts.shipping ?? 0}）
            </button>
            <button
              type="button"
              onClick={() => switchTab('completed')}
              className={`pb-3 text-[14px] ${query.type === 'completed' ? 'text-[#ee4d2d] border-b-2 border-[#ee4d2d]' : 'text-gray-600'}`}
            >
              已完成（{data?.counts.completed ?? 0}）
            </button>
            <button
              type="button"
              onClick={() => switchTab('return_refund_cancel')}
              className={`pb-3 text-[14px] ${query.type === 'return_refund_cancel' ? 'text-[#ee4d2d] border-b-2 border-[#ee4d2d]' : 'text-gray-600'}`}
            >
              退货/退款/取消（{data?.counts.return_refund_cancel ?? 0}）
            </button>
          </div>

          {(data?.simulated_recent_1h ?? 0) > 0 && (
            <div className="mt-4 rounded border border-[#fcd9d1] bg-[#fff6f4] px-4 py-2 text-[13px] text-[#c2410c]">
              最近1小时新增 <span className="font-bold">{data?.simulated_recent_1h ?? 0}</span> 单（买家池系统模拟）
              {data?.last_simulated_at ? `，最近一次：${new Date(data.last_simulated_at).toLocaleString()}` : ''}
            </div>
          )}

          {(query.type === 'all' || query.type === 'shipping') && (
            <div className="mt-8">
              <div className="flex items-center gap-4">
                <div className="w-[94px] text-[14px] text-gray-500">订单类型</div>
                <div className="flex items-center gap-2">
                  <FilterChip
                    label={`订单（${data?.total ?? 0}）`}
                    active={query.orderType === 'order' || query.orderType === 'all'}
                    onClick={() => applyQueryPatch({ orderType: 'order' })}
                  />
                  <FilterChip
                    label="提前履行(0)"
                    active={query.orderType === 'advance'}
                    onClick={() => applyQueryPatch({ orderType: 'advance' })}
                  />
                </div>
              </div>
            </div>
          )}

          {query.type === 'toship' && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-[94px] text-[14px] text-gray-500">订单类型</div>
                <div className="flex items-center gap-2">
                  <FilterChip label="全部" active={query.orderType === 'all'} onClick={() => applyQueryPatch({ orderType: 'all' })} />
                  <FilterChip label="命令" active={query.orderType === 'command'} onClick={() => applyQueryPatch({ orderType: 'command' })} />
                  <FilterChip label="提前履行" active={query.orderType === 'advance'} onClick={() => applyQueryPatch({ orderType: 'advance' })} />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-[94px] text-[14px] text-gray-500">订单状态</div>
                <div className="flex items-center gap-2">
                  <FilterChip label="全部" active={query.orderStatus === 'all'} onClick={() => applyQueryPatch({ orderStatus: 'all' })} />
                  <FilterChip label="处理" active={query.orderStatus === 'processing'} onClick={() => applyQueryPatch({ orderStatus: 'processing' })} />
                  <FilterChip label="已处理" active={query.orderStatus === 'processed'} onClick={() => applyQueryPatch({ orderStatus: 'processed' })} />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-[94px] text-[14px] text-gray-500">优先发货</div>
                <div className="flex items-center gap-2">
                  <FilterChip label="全部" active={query.priority === 'all'} onClick={() => applyQueryPatch({ priority: 'all' })} />
                  <FilterChip label="逾期" active={query.priority === 'overdue'} onClick={() => applyQueryPatch({ priority: 'overdue' })} />
                  <FilterChip label="当日发货" active={query.priority === 'today'} onClick={() => applyQueryPatch({ priority: 'today' })} />
                  <FilterChip label="明日发货" active={query.priority === 'tomorrow'} onClick={() => applyQueryPatch({ priority: 'tomorrow' })} />
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <div ref={searchDropdownRef} className="relative h-10 w-[240px]">
              <button
                type="button"
                onClick={() => setSearchDropdownOpen((prev) => !prev)}
                className={`flex h-full w-full items-center justify-between border px-4 text-[14px] text-gray-700 bg-white ${
                  searchDropdownOpen ? 'border-[#ee4d2d]' : 'border-gray-300'
                } rounded`}
              >
                <span>{searchField}</span>
                {searchDropdownOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>
              {searchDropdownOpen && (
                <div className="absolute left-0 top-[42px] z-20 w-full overflow-hidden rounded border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                  {searchFieldOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSearchField(option);
                        setSearchDropdownOpen(false);
                      }}
                      className={`block h-10 w-full px-4 text-left text-[14px] ${
                        option === searchField ? 'text-[#ee4d2d] bg-[#fff7f5]' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              value={query.keyword}
              onChange={(e) => setQuery((prev) => ({ ...prev, keyword: e.target.value }))}
              className="h-10 flex-1 border border-gray-300 rounded px-4 text-[14px] text-gray-700"
              placeholder={keywordPlaceholderMap[searchField] ?? '输入关键词'}
            />
            <select
              value={query.channel || '所有频道'}
              onChange={(e) => {
                const value = e.target.value === '所有频道' ? '' : e.target.value;
                setQuery((prev) => ({ ...prev, channel: value }));
              }}
              className="h-10 w-[420px] border border-gray-300 rounded px-4 text-[14px] text-gray-700"
            >
              {shippingChannelOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => applyQueryPatch({ keyword: query.keyword, channel: query.channel })}
              className="h-10 px-7 rounded border border-[#ee4d2d] text-[#ee4d2d] text-[14px] hover:bg-[#fff7f5]"
            >
              申请
            </button>
            <button
              type="button"
              onClick={() => updateUrl(buildBaseParamsByType(query.type))}
              className="h-10 px-7 rounded border border-gray-300 text-gray-700 text-[14px] hover:bg-gray-50"
            >
              重设
            </button>
          </div>

          {!isShippingView && (
            <div className="mt-6 flex items-center justify-end text-[14px] text-[#3478f6] gap-2">
              <RefreshCw size={14} />
              发货后快速付款
            </div>
          )}

          {!isShippingView && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[16px] font-semibold text-gray-800">
                <span>{countText} 单</span>
                <HelpCircle size={16} className="text-gray-400 mt-0.5" />
              </div>
              <div className="flex items-center gap-6">
                <div className="text-[14px] text-gray-600">排序方式： 按发货日期排序（最早的在前）</div>
                {query.type === 'toship' && (
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-[13px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={allCheckedOnPage}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrderIds((prev) => Array.from(new Set([...prev, ...toshipOrderIdsOnPage])));
                          } else {
                            setSelectedOrderIds((prev) => prev.filter((id) => !toshipOrderIdsOnPage.includes(id)));
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-[#ee4d2d] focus:ring-[#ee4d2d]"
                      />
                      全选本页
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleBatchShipOrders()}
                      disabled={batchShipping || selectedOrderIds.length === 0}
                      className="h-10 px-5 rounded bg-[#ee4d2d] text-white text-[14px] hover:bg-[#d73211] disabled:cursor-not-allowed disabled:bg-[#f2a18f] flex items-center gap-2"
                    >
                      <Package size={14} />
                      {batchShipping ? '批量发货中...' : `批量发货（${selectedOrderIds.length}）`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isShippingView && (
            <div className="mt-4 text-[30px] leading-none">
              <div className="flex items-center gap-1 text-[32px] font-semibold text-gray-800">
                <span className="text-[32px]">订单</span>
              </div>
            </div>
          )}

          <div className="mt-3 border border-gray-200 rounded-sm overflow-hidden">
            {isShippingView || isCompletedView || isCancelView ? (
              <div className="h-12 bg-[#fafafa] border-b border-gray-200 px-4 grid grid-cols-[3fr_1fr_1fr_1.4fr_1.6fr_1fr] items-center text-[14px] text-gray-500">
                <div>产品</div>
                <div>买家实付</div>
                <div>状态</div>
                <div>倒计时</div>
                <div>物流渠道</div>
                <div>操作</div>
              </div>
            ) : (
              <div className="h-12 bg-[#fafafa] border-b border-gray-200 px-4 grid grid-cols-[3fr_1fr_2fr_1.5fr_1fr] items-center text-[14px] text-gray-500">
                <div>产品</div>
                <div>买家实付</div>
                <div>状态 / 倒计时</div>
                <div>物流渠道</div>
                <div>操作</div>
              </div>
            )}
            <div className="min-h-[420px] bg-white">
              {!loading && (data?.orders?.length ?? 0) === 0 && (
                <div className="h-[420px] flex items-center justify-center text-center">
                  <div>
                    <div className="mt-4 text-[15px] text-gray-400">暂无订单</div>
                    <button type="button" className="mt-1 text-[15px] text-[#3478f6] hover:underline" onClick={reloadOrders}>
                      点击刷新
                    </button>
                  </div>
                </div>
              )}

              {loading && (
                <div className="h-[420px] flex items-center justify-center text-[14px] text-gray-500">加载中...</div>
              )}

              {!loading &&
                (data?.orders ?? []).map((row) => {
                  const firstItem = row.items[0];
                  return (
                    <div key={row.id} className="border-b border-gray-100 p-4">
                      <div className="mb-3 -mx-1 rounded-sm border border-gray-100 bg-[#f6f6f6] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                        <div className="flex items-center justify-between text-[13px] text-gray-500">
                          <span className="inline-flex items-center gap-2">
                            {row.buyer_name}
                            {row.order_no.startsWith('SIM') && (
                              <span className="rounded-full bg-[#fff1ec] px-2 py-0.5 text-[11px] font-semibold text-[#ea580c]">
                                系统模拟
                              </span>
                            )}
                          </span>
                          <span>订单号 {row.order_no}</span>
                        </div>
                      </div>
                      <div className={isShippingView || isCompletedView || isCancelView ? 'grid grid-cols-[3fr_1fr_1fr_1.4fr_1.6fr_1fr] items-start text-[14px]' : 'grid grid-cols-[3fr_1fr_2fr_1.5fr_1fr] items-start text-[14px]'}>
                        <div className="flex items-start gap-3">
                          {isToShipView && (
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(row.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOrderIds((prev) => Array.from(new Set([...prev, row.id])));
                                } else {
                                  setSelectedOrderIds((prev) => prev.filter((id) => id !== row.id));
                                }
                              }}
                              className="mt-4 h-4 w-4 rounded border-gray-300 text-[#ee4d2d] focus:ring-[#ee4d2d]"
                            />
                          )}
                          <img
                            src={firstItem?.image_url ?? 'https://picsum.photos/seed/shopee-fallback/80/80'}
                            className="w-14 h-14 rounded border border-gray-100 object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="text-gray-800">{firstItem?.product_name ?? '-'}</div>
                            <div className="text-[12px] text-gray-500 mt-1">
                              规格：{firstItem?.variant_name ?? '-'} · x{firstItem?.quantity ?? 0}
                            </div>
                          </div>
                        </div>
                        <div className="text-gray-800">{formatMoney(row.buyer_payment)}</div>
                        {isShippingView ? (
                          <>
                            <div>
                              <div className="text-gray-800">运输中</div>
                              <div className="text-[12px] text-gray-500 mt-1">订单正在配送中</div>
                            </div>
                            <div>
                              <div className="text-[12px] text-gray-500">{row.countdown_text || '-'}</div>
                              <div className="text-[12px] text-gray-500 mt-1">ETA：{formatEtaRange(row.eta_start_at, row.eta_end_at)}</div>
                              <div className="text-[12px] text-gray-500 mt-1">{formatTransitExplain(row)}</div>
                            </div>
                            <div>
                              <div className="text-gray-800">{row.shipping_channel}</div>
                              <div className="text-[12px] text-gray-500 mt-1">追踪号：{row.tracking_no || '-'}</div>
                              <div className="text-[12px] text-gray-500 mt-1">配送线路：{row.delivery_line_label || '-'}</div>
                            </div>
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenOrderDetail(row.id, query.type)}
                                className="text-[13px] leading-5 text-[#3478f6] hover:underline"
                              >
                                查看物流详情
                              </button>
                            </div>
                          </>
                        ) : isCompletedView ? (
                          <>
                            <div>
                              <div className="text-gray-800">已完成</div>
                              <div className="text-[12px] text-gray-500 mt-1">订单已签收</div>
                            </div>
                            <div>
                              <div className="text-[12px] text-gray-500">{row.countdown_text || '-'}</div>
                              <div className="text-[12px] text-gray-500 mt-1">签收时间：{formatDateTime(row.delivered_at)}</div>
                            </div>
                            <div>
                              <div className="text-gray-800">{row.shipping_channel}</div>
                              <div className="text-[12px] text-gray-500 mt-1">追踪号：{row.tracking_no || '-'}</div>
                            </div>
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenSettlement(row.id)}
                                className="text-[13px] leading-5 text-[#3478f6] hover:underline"
                              >
                                查看结算详情
                              </button>
                            </div>
                          </>
                        ) : isCancelView ? (
                          <>
                            <div>
                              <div className="text-gray-800">已取消</div>
                              <div className="text-[12px] text-gray-500 mt-1">{row.cancel_reason || '卖家超时未发货'}</div>
                            </div>
                            <div>
                              <div className="text-[12px] text-gray-500">{row.countdown_text || '-'}</div>
                              <div className="text-[12px] text-gray-500 mt-1">取消时间：{formatDateTime(row.cancelled_at)}</div>
                            </div>
                            <div>
                              <div className="text-gray-800">{row.shipping_channel}</div>
                              <div className="text-[12px] text-gray-500 mt-1">取消来源：{row.cancel_source || '-'}</div>
                            </div>
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenOrderDetail(row.id, query.type)}
                                className="text-[13px] leading-5 text-[#3478f6] hover:underline"
                              >
                                查看物流详情
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="text-gray-800">
                                {row.type_bucket === 'cancelled' ? '已取消' : row.process_status === 'processing' ? '待处理' : '已处理'}
                              </div>
                              <div className="text-[12px] text-gray-500 mt-1">{row.countdown_text}</div>
                              {row.type_bucket === 'toship' && (
                                <div className="mt-1 text-[12px]">
                                  {(row.stock_fulfillment_status || '').trim() === 'backorder' && Number(row.backorder_qty || 0) > 0 ? (
                                    <div className="space-y-1">
                                      <div className="inline-flex rounded bg-[#fff3ef] px-2 py-0.5 text-[#e85d04]">待补货（缺口 {row.backorder_qty} 件）</div>
                                      <div className="text-gray-500">最晚补货：{formatBackorderDeadline(row.must_restock_before_at)}</div>
                                    </div>
                                  ) : (
                                    <div className="inline-flex rounded bg-[#ecfdf3] px-2 py-0.5 text-[#0f766e]">现货可发</div>
                                  )}
                                </div>
                              )}
                              {row.type_bucket === 'shipping' && (
                                <>
                                  <div className="text-[12px] text-gray-500 mt-1">追踪号：{row.tracking_no || '-'}</div>
                                  <div className="text-[12px] text-gray-500">ETA：{formatEtaRange(row.eta_start_at, row.eta_end_at)}</div>
                                  <div className="text-[12px] text-gray-500">{formatTransitExplain(row)}</div>
                                </>
                              )}
                              {row.type_bucket === 'completed' && (
                                <div className="text-[12px] text-gray-500 mt-1">签收时间：{formatDateTime(row.delivered_at)}</div>
                              )}
                              {row.type_bucket === 'cancelled' && (
                                <div className="text-[12px] text-gray-500 mt-1">取消时间：{formatDateTime(row.cancelled_at)}</div>
                              )}
                            </div>
                            <div>
                              <div className="text-gray-800">{row.shipping_channel}</div>
                              <div className="text-[12px] text-gray-500 mt-1">MY线路 · {row.distance_km ? `${row.distance_km.toFixed(1)}km` : '-'}</div>
                            </div>
                            <div className="flex flex-col items-start gap-1">
                              {row.type_bucket === 'toship' && (
                                <button
                                  type="button"
                                  onClick={() => handleShipOrder(row)}
                                  disabled={actionLoadingOrderId === row.id || batchShipping}
                                  className="text-[13px] leading-5 text-[#ee4d2d] hover:underline disabled:opacity-50"
                                >
                                  {actionLoadingOrderId === row.id ? '发货中...' : '安排发货'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenOrderDetail(row.id, query.type)}
                                className="text-[13px] leading-5 text-[#3478f6] hover:underline"
                              >
                                查看物流详情
                              </button>
                              <button
                                type="button"
                                onClick={() => alert(`订单详情：${row.order_no}`)}
                                className="text-[13px] leading-5 text-[#3478f6] hover:underline"
                              >
                                {row.action_text?.trim() || '查看详情'}
                              </button>
                              {row.type_bucket !== 'cancelled' && (
                                <button
                                  type="button"
                                  onClick={() => handlePrintWaybill(row)}
                                  className="text-[13px] leading-5 text-[#3478f6] hover:underline"
                                >
                                  打印面单
                                </button>
                              )}
                              {row.type_bucket === 'completed' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettlement(row.id)}
                                  className="text-[13px] leading-5 text-[#3478f6] hover:underline"
                                >
                                  查看结算详情
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-1 text-[14px] text-gray-600">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="h-8 min-w-8 rounded border border-gray-300 px-2 disabled:cursor-not-allowed disabled:text-gray-300"
            >
              ‹
            </button>
            {pageItems.map((item, idx) =>
              item === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${item}`}
                  type="button"
                  onClick={() => goToPage(item)}
                  className={`h-8 min-w-8 rounded px-2 ${
                    item === currentPage
                      ? 'bg-white text-[#ee4d2d] font-semibold'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {item}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="h-8 min-w-8 rounded border border-gray-300 px-2 disabled:cursor-not-allowed disabled:text-gray-300"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {settlementDialog && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-[620px] rounded bg-white p-5">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-[16px] font-semibold text-gray-800">结算详情 · #{settlementDialog.order_id}</h3>
              <button type="button" onClick={() => setSettlementDialog(null)} className="text-gray-500 hover:text-gray-700">关闭</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
              <div>买家实付</div><div className="text-right">{formatMoney(settlementDialog.buyer_payment)}</div>
              <div>平台佣金</div><div className="text-right">-{formatMoney(settlementDialog.platform_commission_amount)}</div>
              <div>支付手续费</div><div className="text-right">-{formatMoney(settlementDialog.payment_fee_amount)}</div>
              <div>运费成本</div><div className="text-right">-{formatMoney(settlementDialog.shipping_cost_amount)}</div>
              <div>运费补贴</div><div className="text-right">+{formatMoney(settlementDialog.shipping_subsidy_amount)}</div>
              <div className="font-semibold">净入账</div><div className="text-right font-semibold text-[#ee4d2d]">{formatMoney(settlementDialog.net_income_amount)}</div>
            </div>
            <div className="mt-3 text-[12px] text-gray-500">
              结算状态：{formatSettlementStatus(settlementDialog.settlement_status)}，结算时间：{formatDateTime(settlementDialog.settled_at)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
