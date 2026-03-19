import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronDown, Download, FileText, CalendarDays, ChevronsLeft, ChevronsRight } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

interface FinanceOverview {
  wallet_balance: number;
  total_income: number;
  today_income: number;
  week_income?: number;
  month_income?: number;
  transaction_count: number;
  current_tick: string;
}

interface IncomeRow {
  id: number;
  order_id: number;
  order_no: string;
  buyer_name: string;
  product_name: string | null;
  variant_name: string | null;
  image_url: string | null;
  amount: number;
  status: string;
  credited_at: string;
}

interface IncomeResponse {
  page: number;
  page_size: number;
  rows: IncomeRow[];
}

interface PendingOrderItem {
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: number;
  image_url: string | null;
}

interface PendingOrderRow {
  id: number;
  order_no: string;
  buyer_name: string;
  buyer_payment: number;
  type_bucket?: string;
  shipping_channel?: string;
  distance_km?: number | null;
  ship_by_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  items: PendingOrderItem[];
}

interface PendingOrdersResponse {
  page: number;
  page_size: number;
  total: number;
  orders: PendingOrderRow[];
}

interface MyIncomeViewProps {
  runId: number | null;
}

type IncomeTab = 'pending' | 'released';
type DateRangeKey = 'this_week' | 'this_month' | 'past_3_months' | 'custom';

function formatMoney(amount: number) {
  return `RM ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcShippingCost(distanceKm: number, shippingChannel?: string): number {
  const channelBase: Record<string, [number, number]> = {
    快捷快递: [4.5, 0.14],
    标准大件: [8.0, 0.11],
    标准快递: [6.0, 0.12],
  };
  const [base, perKm] = channelBase[shippingChannel || ''] ?? channelBase['标准快递'];
  return Number((base + Math.max(0, distanceKm || 0) * perKm).toFixed(2));
}

function calcPendingNetIncome(order: PendingOrderRow): number {
  const buyerPayment = Number(order.buyer_payment || 0);
  const shippingCost = calcShippingCost(Number(order.distance_km || 0), order.shipping_channel);
  const commission = Number((buyerPayment * 0.06).toFixed(2));
  const paymentFee = Number((buyerPayment * 0.02).toFixed(2));
  const subsidyRateMap: Record<string, number> = {
    快捷快递: 0.2,
    标准快递: 0.12,
    标准大件: 0.08,
  };
  const subsidyRate = subsidyRateMap[order.shipping_channel || ''] ?? 0.1;
  const shippingSubsidy = Number((shippingCost * subsidyRate).toFixed(2));
  return Number((buyerPayment - commission - paymentFee - shippingCost + shippingSubsidy).toFixed(2));
}

function formatDateText(raw: string) {
  const d = new Date(raw);
  return d.toLocaleDateString();
}

function formatDateTimeText(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  return formatDateTimeValue(d);
}

function formatDateTimeValue(d: Date) {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

function formatDateDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function resolveImageUrl(raw?: string | null): string {
  if (!raw) return 'https://picsum.photos/seed/shopee-income/56/56';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${API_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function weekRangeLabel(base: Date) {
  const now = new Date(base);
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${formatDateDDMMYYYY(monday)} - ${formatDateDDMMYYYY(sunday)}`;
}

function monthRangeLabel(base: Date) {
  const now = new Date(base);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return `${formatDateDDMMYYYY(first)} - ${formatDateDDMMYYYY(now)}`;
}

function getPresetRange(range: Exclude<DateRangeKey, 'custom'>, base: Date): { start: Date; end: Date } {
  const now = new Date(base);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { start, end };
  }

  if (range === 'past_3_months') {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return { start: monday, end };
}

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isWithinRange(
  iso: string,
  range: DateRangeKey,
  customRange: { start: Date | null; end: Date | null },
  base: Date,
): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;

  if (range === 'custom') {
    if (!customRange.start || !customRange.end) return true;
    return d >= startOfDay(customRange.start) && d <= endOfDay(customRange.end);
  }

  const preset = getPresetRange(range, base);
  return d >= preset.start && d <= preset.end;
}

function buildMonthCells(base: Date) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const start = new Date(year, month, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = startOfDay(day).getTime();
  return t > startOfDay(start).getTime() && t < startOfDay(end).getTime();
}

function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getRangeLabel(range: DateRangeKey, customRange: { start: Date | null; end: Date | null }, base: Date) {
  if (range === 'custom') {
    if (!customRange.start || !customRange.end) return '请选择日期';
    return `${formatDateDDMMYYYY(customRange.start)} - ${formatDateDDMMYYYY(customRange.end)}`;
  }
  const preset = getPresetRange(range, base);
  return `${formatDateDDMMYYYY(preset.start)} - ${formatDateDDMMYYYY(preset.end)}`;
}

function getRangeTitle(range: DateRangeKey) {
  if (range === 'this_month') return '本月：';
  if (range === 'past_3_months') return '过去三个月：';
  if (range === 'custom') return '自定义：';
  return '本周：';
}

export default function MyIncomeView({ runId }: MyIncomeViewProps) {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [pendingRows, setPendingRows] = useState<PendingOrderRow[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<IncomeTab>('released');
  const [dateRangeDraft, setDateRangeDraft] = useState<DateRangeKey>('this_week');
  const [dateRange, setDateRange] = useState<DateRangeKey>('this_week');
  const [customRangeDraft, setCustomRangeDraft] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [customRange, setCustomRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [showCalendarPanel, setShowCalendarPanel] = useState(false);
  const [hoveredRange, setHoveredRange] = useState<DateRangeKey | null>(null);
  const [calendarBaseMonth, setCalendarBaseMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const dateMenuRef = useRef<HTMLDivElement | null>(null);

  const token = useMemo(() => localStorage.getItem(ACCESS_TOKEN_KEY), []);

  const authedFetch = async <T,>(url: string): Promise<T> => {
    if (!token) throw new Error('missing token');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<T>;
  };

  const loadOverview = async () => {
    if (!runId || !token) return;
    const data = await authedFetch<FinanceOverview>(`${API_BASE_URL}/shopee/runs/${runId}/finance/overview`);
    setOverview(data);
  };

  const loadIncome = async () => {
    if (!runId || !token) return;
    const params = new URLSearchParams({
      page: '1',
      page_size: '100',
    });
    if (keyword.trim()) params.set('keyword', keyword.trim());
    setLoading(true);
    try {
      const data = await authedFetch<IncomeResponse>(`${API_BASE_URL}/shopee/runs/${runId}/finance/income?${params.toString()}`);
      setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingOrders = async () => {
    if (!runId || !token) return;
    const queryKeyword = keyword.trim();
    const anchorTick = overview?.current_tick ? new Date(overview.current_tick) : new Date();
    const shippingParams = new URLSearchParams({
      type: 'shipping',
      page: '1',
      page_size: '100',
    });
    const toShipParams = new URLSearchParams({
      type: 'toship',
      source: 'to_process',
      sort_by: 'ship_by_date_asc',
      page: '1',
      page_size: '100',
    });
    const completedParams = new URLSearchParams({
      type: 'completed',
      page: '1',
      page_size: '100',
    });
    if (queryKeyword) {
      shippingParams.set('keyword', queryKeyword);
      toShipParams.set('keyword', queryKeyword);
      completedParams.set('keyword', queryKeyword);
    }

    setLoading(true);
    try {
      const [shippingResp, toShipResp, completedResp] = await Promise.all([
        authedFetch<PendingOrdersResponse>(`${API_BASE_URL}/shopee/runs/${runId}/orders?${shippingParams.toString()}`),
        authedFetch<PendingOrdersResponse>(`${API_BASE_URL}/shopee/runs/${runId}/orders?${toShipParams.toString()}`),
        authedFetch<PendingOrdersResponse>(`${API_BASE_URL}/shopee/runs/${runId}/orders?${completedParams.toString()}`),
      ]);
      const unreleasedCompleted = (completedResp.orders ?? []).filter((row) => {
        if (row.cancelled_at) return false;
        if (!row.delivered_at) return false;
        const deliveredAt = new Date(row.delivered_at);
        if (Number.isNaN(deliveredAt.getTime())) return false;
        const releaseAt = new Date(deliveredAt.getTime() + 3 * 24 * 60 * 60 * 1000);
        return anchorTick < releaseAt;
      });
      const merged = [...(toShipResp.orders ?? []), ...(shippingResp.orders ?? []), ...unreleasedCompleted];
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPendingRows(merged);
    } catch (error) {
      console.error('loadPendingOrders failed:', error);
      setPendingRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    void loadIncome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, keyword]);

  useEffect(() => {
    if (activeTab !== 'pending') return;
    void loadPendingOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, runId, keyword, overview?.current_tick]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!dateMenuRef.current) return;
      if (!dateMenuRef.current.contains(e.target as Node)) {
        setDateMenuOpen(false);
        setShowCalendarPanel(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const pickCustomDay = (day: Date) => {
    const picked = startOfDay(day);
    if (!customRangeDraft.start || (customRangeDraft.start && customRangeDraft.end)) {
      setCustomRangeDraft({ start: picked, end: null });
      return;
    }
    if (picked.getTime() < startOfDay(customRangeDraft.start).getTime()) {
      setCustomRangeDraft({ start: picked, end: customRangeDraft.start });
      return;
    }
    setCustomRangeDraft({ start: customRangeDraft.start, end: picked });
  };

  const filteredRows = useMemo(() => {
    if (activeTab === 'pending') return [] as IncomeRow[];
    const anchor = overview?.current_tick ? new Date(overview.current_tick) : new Date();
    return rows.filter((row) => isWithinRange(row.credited_at, dateRange, customRange, anchor));
  }, [activeTab, rows, dateRange, customRange, overview?.current_tick]);

  const releasedPagedRows = useMemo(() => {
    if (activeTab !== 'released') return [] as IncomeRow[];
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [activeTab, filteredRows, page, pageSize]);

  const pendingPagedRows = useMemo(() => {
    if (activeTab !== 'pending') return [] as PendingOrderRow[];
    const start = (page - 1) * pageSize;
    return pendingRows.slice(start, start + pageSize);
  }, [activeTab, pendingRows, page, pageSize]);

  const totalRecords = activeTab === 'pending' ? pendingRows.length : filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const releasedThisWeek = useMemo(() => Number(overview?.week_income ?? 0), [overview?.week_income]);
  const releasedThisMonth = useMemo(() => Number(overview?.month_income ?? 0), [overview?.month_income]);
  const releasedTotal = useMemo(() => Number(overview?.total_income ?? 0), [overview?.total_income]);
  const pendingTotal = useMemo(
    () => pendingRows.reduce((sum, row) => sum + calcPendingNetIncome(row), 0),
    [pendingRows],
  );
  const anchorDate = overview?.current_tick ? new Date(overview.current_tick) : new Date();
  const selectedRangeLabel = getRangeLabel(dateRangeDraft, customRangeDraft, anchorDate);
  const selectedRangeTitle = getRangeTitle(dateRangeDraft);
  const leftMonth = calendarBaseMonth;
  const rightMonth = new Date(calendarBaseMonth.getFullYear(), calendarBaseMonth.getMonth() + 1, 1);
  const weekNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f5] p-6 custom-scrollbar">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_360px] gap-4">
        <section className="col-span-2 rounded border border-[#f5d8d2] bg-[#feefeb] px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded bg-[#ffd8cd] text-[30px]">📈</div>
              <div>
                <h2 className="text-[17px] font-semibold leading-none text-[#2b2b2b]">想提升销量？试试 Shopee 广告！</h2>
                <p className="mt-2 text-[12px] text-[#6b6b6b]">
                  使用 Shopee 广告的卖家，平均可获得 <span className="text-[#ee4d2d]">16%</span> 的额外订单增长。
                </p>
              </div>
            </div>
            <button type="button" className="h-9 rounded bg-[#ee4d2d] px-4 text-[12px] text-white">
              立即投放广告
            </button>
          </div>
        </section>

        <section className="rounded border border-gray-200 bg-white p-4">
          <h3 className="text-[17px] font-semibold text-[#2f2f2f]">收入总览</h3>
          <div className="mt-3 flex items-center gap-2 rounded border border-[#7da9e3] bg-[#edf5ff] px-3 py-2 text-[13px] text-[#5578ad]">
            <FileText size={14} />
            <span>以下数据暂不包含调整项，如需核对请查看收入报表。</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[16px] font-semibold text-[#2f2f2f]">待入账</div>
              <div className="mt-1 text-[13px] text-gray-500">合计</div>
              <div className="mt-1 text-[20px] font-semibold text-[#2f2f2f]">{formatMoney(pendingTotal)}</div>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-[#2f2f2f]">已入账</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[13px] text-gray-500">
                <div> 本周 </div>
                <div> 本月 </div>
                <div> 累计 </div>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div className="text-[20px] font-semibold text-[#2f2f2f]">{formatMoney(releasedThisWeek)}</div>
                <div className="text-[20px] font-semibold text-[#2f2f2f]">{formatMoney(releasedThisMonth)}</div>
                <div className="text-[20px] font-semibold text-[#2f2f2f]">{formatMoney(releasedTotal)}</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[17px] font-semibold text-[#2f2f2f]">收入账单</h4>
              <button type="button" className="text-[13px] text-[#2b6adf]">
                更多
              </button>
            </div>
            <div className="mt-4 space-y-3 text-[13px] text-gray-600">
              <div className="flex items-center justify-between"><span>9 Mar - 15 Mar 2026</span><Download size={14} className="text-[#2b6adf]" /></div>
              <div className="flex items-center justify-between"><span>2 Mar - 8 Mar 2026</span><Download size={14} className="text-[#2b6adf]" /></div>
              <div className="flex items-center justify-between"><span>23 Feb - 1 Mar 2026</span><Download size={14} className="text-[#2b6adf]" /></div>
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-4 text-[13px] text-[#2b6adf]">我的税务发票</div>
        </aside>

        <section className="rounded border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[17px] font-semibold text-[#2f2f2f]">收入明细</h3>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setKeyword(keywordInput.trim());
                    setPage(1);
                  }
                }}
                placeholder="搜索订单号"
                className="h-8 w-[210px] rounded border border-gray-200 pl-7 pr-2 text-[12px] outline-none focus:border-[#ee4d2d]"
              />
            </div>
          </div>

          <div className="border-b border-gray-200">
            <div className="flex items-end gap-8 px-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('pending');
                  setPage(1);
                }}
                className={`h-10 border-b-2 text-[13px] ${
                  activeTab === 'pending' ? 'border-[#ee4d2d] font-semibold text-[#ee4d2d]' : 'border-transparent text-gray-500'
                }`}
              >
                待入账
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('released');
                  setPage(1);
                }}
                className={`h-10 border-b-2 text-[13px] ${
                  activeTab === 'released' ? 'border-[#ee4d2d] font-semibold text-[#ee4d2d]' : 'border-transparent text-gray-500'
                }`}
              >
                已入账
              </button>
            </div>
          </div>

          {activeTab === 'released' && (
            <div className="mt-3 flex items-center justify-between">
            <div className="relative" ref={dateMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setDateMenuOpen((open) => !open);
                  if (dateRangeDraft !== 'custom') setShowCalendarPanel(false);
                  if (!dateMenuOpen) setHoveredRange(null);
                }}
                className="flex h-9 min-w-[430px] items-center gap-2 rounded border border-gray-200 px-4 text-[13px] text-gray-700"
              >
                <CalendarDays size={14} />
                <span className="font-semibold text-[#2f2f2f]">{selectedRangeTitle}</span>
                <span>{selectedRangeLabel}</span>
                <ChevronDown size={14} className="ml-auto text-gray-400" />
              </button>

              {dateMenuOpen && (
                <div
                  className={`absolute left-0 top-10 z-30 flex overflow-hidden rounded border border-gray-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${
                    showCalendarPanel ? 'w-[820px]' : 'w-[340px]'
                  }`}
                >
                  <div className="w-[340px]">
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredRange('this_week')}
                      onMouseLeave={() => setHoveredRange(null)}
                      onClick={() => {
                        setDateRangeDraft('this_week');
                        setDateRange('this_week');
                        setCustomRange(customRangeDraft);
                        setShowCalendarPanel(false);
                        setDateMenuOpen(false);
                        setHoveredRange(null);
                        setPage(1);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] ${
                        dateRangeDraft === 'this_week' ? 'text-[#ee4d2d]' : 'text-[#2f2f2f]'
                      }`}
                    >
                      <span>本周</span>
                      {hoveredRange === 'this_week' ? (
                        <span className="text-[13px] text-gray-400">{weekRangeLabel(anchorDate)}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredRange('this_month')}
                      onMouseLeave={() => setHoveredRange(null)}
                      onClick={() => {
                        setDateRangeDraft('this_month');
                        setDateRange('this_month');
                        setCustomRange(customRangeDraft);
                        setShowCalendarPanel(false);
                        setDateMenuOpen(false);
                        setHoveredRange(null);
                        setPage(1);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] ${
                        dateRangeDraft === 'this_month' ? 'text-[#ee4d2d]' : 'text-[#2f2f2f]'
                      }`}
                    >
                      <span>本月内</span>
                      {hoveredRange === 'this_month' ? (
                        <span className="text-[13px] text-gray-400">{monthRangeLabel(anchorDate)}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredRange('past_3_months')}
                      onMouseLeave={() => setHoveredRange(null)}
                      onClick={() => {
                        setDateRangeDraft('past_3_months');
                        setDateRange('past_3_months');
                        setCustomRange(customRangeDraft);
                        setShowCalendarPanel(false);
                        setDateMenuOpen(false);
                        setHoveredRange(null);
                        setPage(1);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] ${
                        dateRangeDraft === 'past_3_months' ? 'text-[#ee4d2d]' : 'text-[#2f2f2f]'
                      }`}
                    >
                      <span>过去三个月</span>
                      {hoveredRange === 'past_3_months' ? (
                        <span className="text-[13px] text-gray-400">
                          {getRangeLabel('past_3_months', customRangeDraft, anchorDate)}
                        </span>
                      ) : null}
                    </button>
                    <div className="mx-4 my-2 border-t border-gray-200" />
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredRange('custom')}
                      onMouseLeave={() => setHoveredRange(null)}
                      onFocus={() => setShowCalendarPanel(true)}
                      onClick={() => {
                        setDateRangeDraft('custom');
                        setShowCalendarPanel(true);
                      }}
                      onMouseMove={() => {
                        if (!showCalendarPanel) {
                          setShowCalendarPanel(true);
                        }
                      }}
                      className={`flex w-full items-center justify-between px-4 py-4 text-left text-[14px] ${
                        dateRangeDraft === 'custom' ? 'text-[#ee4d2d]' : 'text-[#2f2f2f]'
                      }`}
                    >
                      <span>选择日期</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {showCalendarPanel && (
                    <div className="w-[480px] border-l border-gray-200 p-3">
                      <div className="grid grid-cols-2 gap-6">
                        {[leftMonth, rightMonth].map((monthDate, idx) => {
                          const inViewMonth = monthDate.getMonth();
                          const cells = buildMonthCells(monthDate);
                          return (
                            <div key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}>
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-1 text-gray-400">
                                  {idx === 0 && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCalendarBaseMonth((m) => new Date(m.getFullYear() - 1, m.getMonth(), 1))
                                        }
                                      >
                                        <ChevronsLeft size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCalendarBaseMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                                        }
                                      >
                                        <ChevronLeft size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
                                <div className="text-[30px] font-semibold text-[#2f2f2f]">{formatMonthTitle(monthDate)}</div>
                                <div className="flex items-center gap-1 text-gray-400">
                                  {idx === 1 && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCalendarBaseMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                                        }
                                      >
                                        <ChevronRight size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCalendarBaseMonth((m) => new Date(m.getFullYear() + 1, m.getMonth(), 1))
                                        }
                                      >
                                        <ChevronsRight size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-7 gap-y-1 text-center text-[12px] text-gray-500">
                                {weekNames.map((w) => (
                                  <div key={`${idx}-${w}`} className="py-1">
                                    {w}
                                  </div>
                                ))}
                                {cells.map((day) => {
                                  const isCurrentMonth = day.getMonth() === inViewMonth;
                                  const isStart = sameDay(day, customRangeDraft.start);
                                  const isEnd = sameDay(day, customRangeDraft.end);
                                  const isMid = inRange(day, customRangeDraft.start, customRangeDraft.end);
                                  return (
                                    <button
                                      key={`${idx}-${day.toISOString()}`}
                                      type="button"
                                      onClick={() => pickCustomDay(day)}
                                      className={`mx-auto my-0.5 h-7 w-7 rounded text-[14px] ${
                                        isStart || isEnd
                                          ? 'bg-[#ee4d2d] text-white'
                                          : isMid
                                            ? 'bg-[#fce9e4] text-[#ee4d2d]'
                                            : isCurrentMonth
                                              ? 'text-[#2f2f2f] hover:bg-gray-100'
                                              : 'text-gray-300 hover:bg-gray-50'
                                      }`}
                                    >
                                      {day.getDate()}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setKeyword(keywordInput.trim());
                  setDateRange(dateRangeDraft);
                  setCustomRange(customRangeDraft);
                  setDateMenuOpen(false);
                  setShowCalendarPanel(false);
                  setHoveredRange(null);
                  setPage(1);
                }}
                className="h-8 rounded border border-gray-200 px-3 text-[13px] text-gray-700"
              >
                应用
              </button>
              <button type="button" className="h-8 rounded border border-gray-200 px-3 text-[13px] text-gray-700">
                导出
              </button>
            </div>
          </div>
          )}

          <div className="mt-3 overflow-hidden rounded border border-gray-200">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-gray-500">
                {activeTab === 'pending' ? (
                  <tr>
                    <th className="px-3 py-3 text-left font-medium">订单</th>
                    <th className="px-3 py-3 text-left font-medium">预计入账日期</th>
                    <th className="px-3 py-3 text-left font-medium">状态</th>
                    <th className="px-3 py-3 text-left font-medium">支付方式</th>
                    <th className="px-3 py-3 text-left font-medium">待入账金额</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-3 py-3 text-left font-medium">订单</th>
                    <th className="px-3 py-3 text-left font-medium">入账时间</th>
                    <th className="px-3 py-3 text-left font-medium">状态</th>
                    <th className="px-3 py-3 text-left font-medium">支付方式</th>
                    <th className="px-3 py-3 text-left font-medium">入账金额</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeTab === 'pending' && pendingPagedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      {loading ? '加载中...' : '暂无待入账记录'}
                    </td>
                  </tr>
                )}
                {activeTab === 'pending' &&
                  pendingPagedRows.map((row) => {
                    const firstItem = row.items?.[0];
                    return (
                      <tr key={row.id} className="border-t border-gray-100">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <img
                              src={resolveImageUrl(firstItem?.image_url)}
                              alt={firstItem?.product_name || 'product'}
                              className="h-11 w-11 rounded object-cover"
                            />
                            <div>
                              <div className="text-[#2f2f2f]">{row.order_no}</div>
                              <div className="text-[12px] text-gray-400">买家：{row.buyer_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          {row.delivered_at
                            ? (() => {
                                const releaseAt = new Date(new Date(row.delivered_at as string).getTime() + 3 * 24 * 60 * 60 * 1000);
                                return formatDateTimeValue(releaseAt);
                              })()
                            : '订单完成后 3 天内释放'}
                        </td>
                        <td className="px-3 py-3 text-gray-700">{row.type_bucket === 'completed' ? '等待打款释放' : '等待订单完成'}</td>
                        <td className="px-3 py-3 text-gray-700">货到付款</td>
                        <td className="px-3 py-3 text-gray-700">
                          <div className="inline-flex items-center gap-1">
                            <span>{formatMoney(calcPendingNetIncome(row))}</span>
                            <ChevronDown size={14} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {activeTab === 'released' && releasedPagedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      {loading ? '加载中...' : '暂无收入记录'}
                    </td>
                  </tr>
                )}
                {activeTab === 'released' &&
                  releasedPagedRows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <img src={resolveImageUrl(row.image_url)} alt={row.product_name || 'product'} className="h-11 w-11 rounded object-cover" />
                          <div>
                            <div className="text-[#2f2f2f]">{row.order_no}</div>
                            <div className="text-[12px] text-gray-400">买家：{row.buyer_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-700">{formatDateText(row.credited_at)}</td>
                      <td className="px-3 py-3 text-gray-700">打款成功</td>
                      <td className="px-3 py-3 text-gray-700">货到付款</td>
                      <td className="px-3 py-3 text-gray-700">
                        <div className="inline-flex items-center gap-1">
                          <span>{formatMoney(row.amount)}</span>
                          <ChevronDown size={14} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-end gap-4 text-[13px] text-gray-600">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 items-center rounded border border-gray-200 px-3 disabled:opacity-50"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[#ee4d2d]">{page}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-8 items-center rounded border border-gray-200 px-3 disabled:opacity-50"
            >
              <ChevronRight size={14} />
            </button>
            <div className="inline-flex h-8 items-center gap-1 rounded border border-gray-200 px-3">
              <span>{pageSize}</span>
              <span>/页</span>
              <ChevronDown size={14} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
