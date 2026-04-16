import { ChevronDown, HelpCircle, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import DateOnlyPicker from '../components/DateOnlyPicker';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

type DiscountType = 'all' | 'discount' | 'bundle' | 'add_on';
type DiscountStatus = 'all' | 'draft' | 'upcoming' | 'ongoing' | 'ended' | 'disabled';
type SearchField = 'campaign_name' | 'campaign_id';

interface DiscountCreateCard {
  type: DiscountType | 'discount' | 'bundle' | 'add_on';
  title: string;
  description: string;
  enabled: boolean;
  target_route: string;
}

interface DiscountTab {
  key: DiscountType;
  label: string;
  count: number;
  active: boolean;
}

interface DiscountMetric {
  key: string;
  label: string;
  value: string | number;
  delta: number;
}

interface DiscountPerformance {
  label: string;
  range_text: string;
  metrics: DiscountMetric[];
}

interface DiscountFilters {
  discount_type: DiscountType;
  status: DiscountStatus;
  search_field: SearchField;
  keyword: string;
  date_from: string | null;
  date_to: string | null;
}

interface DiscountProductThumb {
  image_url: string | null;
}

interface DiscountCampaignRow {
  id: number;
  campaign_name: string;
  status: string;
  status_label: string;
  campaign_type: string;
  campaign_type_label: string;
  products: DiscountProductThumb[];
  products_overflow_count: number;
  period_text: string;
  actions: string[];
}

interface DiscountPagination {
  page: number;
  page_size: number;
  total: number;
}

interface DiscountBootstrapResponse {
  meta: {
    run_id: number;
    user_id: number;
    market: string;
    currency: string;
    read_only: boolean;
    current_tick: string;
  };
  create_cards: DiscountCreateCard[];
  tabs: DiscountTab[];
  performance: DiscountPerformance;
  filters: DiscountFilters;
  list: {
    items: DiscountCampaignRow[];
    pagination: DiscountPagination;
  };
  preferences: {
    selected_discount_type: DiscountType;
    selected_status: DiscountStatus;
    search_field: SearchField;
    keyword: string;
    date_from: string | null;
    date_to: string | null;
    last_viewed_at: string | null;
  };
}

interface MarketingDiscountViewProps {
  runId: number | null;
  readOnly?: boolean;
}

const overallMarketRows = [
  { market: '新加坡', discountRate: '-', status: '-', period: '-', action: '创建' },
  { market: '马来西亚', discountRate: '-', status: '-', period: '-', action: '创建' },
  { market: '越南', discountRate: '-', status: '-', period: '-', action: '创建' },
  { market: '菲律宾', discountRate: '-', status: '-', period: '-', action: '创建' },
  { market: '老挝', discountRate: '-', status: '-', period: '-', action: '创建' },
];

const statusBadgeClassMap: Record<string, string> = {
  ongoing: 'bg-[#ebfff1] text-[#1f9d55]',
  upcoming: 'bg-[#fff7e8] text-[#d97706]',
  ended: 'bg-[#f4f4f4] text-[#7a7a7a]',
  disabled: 'bg-[#f4f4f4] text-[#7a7a7a]',
  draft: 'bg-[#eef2ff] text-[#4f46e5]',
};

function buildQuery(filters: {
  discountType: DiscountType;
  status: DiscountStatus;
  searchField: SearchField;
  keyword: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams();
  params.set('discount_type', filters.discountType);
  params.set('status', filters.status);
  params.set('search_field', filters.searchField);
  params.set('keyword', filters.keyword);
  params.set('page', String(filters.page));
  params.set('page_size', String(filters.pageSize));
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  return params.toString();
}

function MetricCard({ metric }: { metric: DiscountMetric }) {
  const deltaText = `${metric.delta >= 0 ? '' : '-'}${Math.abs(metric.delta * 100).toFixed(2)}%`;
  return (
    <div className="border-l border-[#efefef] px-6 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-1 text-[13px] text-[#555]">
        <span>{metric.label}</span>
        <HelpCircle size={12} className="text-[#b0b0b0]" />
      </div>
      <div className="mt-2 text-[22px] font-semibold text-[#222]">{metric.value}</div>
      <div className="mt-2 text-[12px] text-[#8a8a8a]">较上一周期 {deltaText}</div>
    </div>
  );
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export default function MarketingDiscountView({ runId, readOnly = false }: MarketingDiscountViewProps) {
  const [data, setData] = useState<DiscountBootstrapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draftType, setDraftType] = useState<DiscountType>('all');
  const [draftStatus, setDraftStatus] = useState<DiscountStatus>('all');
  const [draftSearchField, setDraftSearchField] = useState<SearchField>('campaign_name');
  const [draftKeyword, setDraftKeyword] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [gotoPageInput, setGotoPageInput] = useState('1');
  const [appliedQuery, setAppliedQuery] = useState({
    discountType: 'all' as DiscountType,
    status: 'all' as DiscountStatus,
    searchField: 'campaign_name' as SearchField,
    keyword: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
  });
  const pageSize = 10;

  useEffect(() => {
    if (!runId) {
      setData(null);
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录状态失效，请重新登录。');
      setData(null);
      return;
    }

    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const query = buildQuery({ ...appliedQuery, pageSize });
        const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/discount/bootstrap?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('load failed');
        const result = (await response.json()) as DiscountBootstrapResponse;
        if (cancelled) return;
        setData(result);
        setDraftType(result.filters.discount_type);
        setDraftStatus(result.filters.status);
        setDraftSearchField(result.filters.search_field);
        setDraftKeyword(result.filters.keyword || '');
        setDraftDateFrom(result.filters.date_from || '');
        setDraftDateTo(result.filters.date_to || '');
        setGotoPageInput(String(result.list.pagination.page || 1));
      } catch {
        if (cancelled) return;
        setData(null);
        setError('折扣页加载失败，请稍后重试。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [appliedQuery, runId]);

  const persistPreferences = async () => {
    if (!runId || readOnly) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/discount/preferences`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selected_discount_type: draftType,
          selected_status: draftStatus,
          search_field: draftSearchField,
          keyword: draftKeyword.trim(),
          date_from: draftDateFrom || null,
          date_to: draftDateTo || null,
        }),
      });
    } catch {
      // Ignore preference save errors to keep the page responsive.
    }
  };

  const handleApplyFilters = () => {
    setAppliedQuery({
      discountType: draftType,
      status: draftStatus,
      searchField: draftSearchField,
      keyword: draftKeyword.trim(),
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      page: 1,
    });
    void persistPreferences();
  };

  const handleReset = () => {
    setDraftType('all');
    setDraftStatus('all');
    setDraftSearchField('campaign_name');
    setDraftKeyword('');
    setDraftDateFrom('');
    setDraftDateTo('');
    setAppliedQuery({
      discountType: 'all',
      status: 'all',
      searchField: 'campaign_name',
      keyword: '',
      dateFrom: '',
      dateTo: '',
      page: 1,
    });
    if (!readOnly) {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (runId && token) {
        void fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/discount/preferences`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            selected_discount_type: 'all',
            selected_status: 'all',
            search_field: 'campaign_name',
            keyword: '',
            date_from: null,
            date_to: null,
          }),
        });
      }
    }
  };

  const handleTabChange = (nextType: DiscountType) => {
    setDraftType(nextType);
    setAppliedQuery((prev) => ({
      ...prev,
      discountType: nextType,
      status: draftStatus,
      searchField: draftSearchField,
      keyword: draftKeyword.trim(),
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
      page: 1,
    }));
    if (!readOnly) {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (runId && token) {
        void fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/discount/preferences`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            selected_discount_type: nextType,
            selected_status: draftStatus,
            search_field: draftSearchField,
            keyword: draftKeyword.trim(),
            date_from: draftDateFrom || null,
            date_to: draftDateTo || null,
          }),
        });
      }
    }
  };

  const handleCreate = (card: DiscountCreateCard) => {
    if (readOnly) {
      window.alert('历史对局回溯模式下仅可浏览，不能创建折扣活动。');
      return;
    }
    if (!card.enabled) {
      window.alert('该活动创建能力暂未开放。');
      return;
    }
    window.history.pushState(null, '', card.target_route);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleActionClick = (action: string) => {
    if (readOnly && action !== '详情') {
      window.alert('历史对局回溯模式下仅可浏览，不能执行该操作。');
      return;
    }
    window.alert(`${action} 功能页将在下一阶段继续接入。`);
  };

  const currentPage = data?.list.pagination.page ?? appliedQuery.page;
  const total = data?.list.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginationItems = buildPaginationItems(currentPage, totalPages);

  return (
    <div className="flex-1 overflow-y-auto bg-[#f6f6f6] px-9 py-6 custom-scrollbar">
      <div className="mx-auto max-w-[1660px]">
        {readOnly ? (
          <div className="mb-5 border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-700">
            当前为历史对局回溯模式：可浏览折扣页，但不会保存筛选偏好，也无法创建或编辑活动。
          </div>
        ) : null}
        {error ? (
          <div className="mb-5 border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</div>
        ) : null}

        <section className="border border-[#ececec] bg-white px-6 py-6 shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div className="text-[18px] font-semibold text-[#2f2f2f]">创建折扣</div>
          <div className="mt-2 text-[14px] text-[#8a8a8a]">通过设置折扣活动提升销量与转化表现。</div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {(data?.create_cards ?? []).map((card) => (
              <div key={card.type} className="border border-[#e9e9e9] bg-white px-5 py-4">
                <div className="text-[14px] font-semibold text-[#333]">{card.title}</div>
                <div className="mt-2 min-h-[42px] text-[13px] leading-6 text-[#707070]">{card.description}</div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleCreate(card)}
                    className={`h-8 px-5 text-[13px] font-medium ${card.enabled ? 'bg-[#ee4d2d] text-white hover:bg-[#d83f21]' : 'bg-[#f1f1f1] text-[#9a9a9a]'}`}
                  >
                    创建
                  </button>
                </div>
              </div>
            ))}
            {loading && !(data?.create_cards?.length) ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-[134px] animate-pulse bg-[#f3f3f3]" />) : null}
          </div>
        </section>

        <section className="mt-5 border border-[#ececec] bg-white shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div className="border-b border-[#efefef] px-6">
            <div className="flex items-center gap-8 text-[15px]">
              {(data?.tabs ?? []).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`border-b-2 px-1 py-4 ${draftType === tab.key ? 'border-[#ee4d2d] font-semibold text-[#ee4d2d]' : 'border-transparent text-[#444]'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-[#efefef] px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 text-[18px] font-semibold text-[#2f2f2f]">
                  <span>{data?.performance.label ?? '促销表现'}</span>
                  <span className="text-[13px] font-normal text-[#9a9a9a]">{data?.performance.range_text ?? ''}</span>
                </div>
              </div>
              <button type="button" className="text-[14px] text-[#2563eb]">更多</button>
            </div>
            <div className="mt-5 grid grid-cols-4 border border-[#efefef] bg-white px-4 py-4">
              {(data?.performance.metrics ?? []).map((metric) => (
                <div key={metric.key}>
                  <MetricCard metric={metric} />
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="text-[18px] font-semibold text-[#2f2f2f]">活动列表</div>
            <div className="mt-5 flex items-end gap-5">
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-[#444]">搜索</span>
                <div className="flex h-10 items-center border border-[#d9d9d9] bg-white pl-3 pr-2 text-[14px] text-[#555]">
                  <select value={draftSearchField} onChange={(event) => setDraftSearchField(event.target.value as SearchField)} className="bg-transparent pr-2 outline-none">
                    <option value="campaign_name">活动名称</option>
                    <option value="campaign_id">活动 ID</option>
                  </select>
                  <ChevronDown size={14} className="text-[#999]" />
                </div>
                <div className="flex h-10 w-[280px] items-center border border-[#d9d9d9] bg-white px-3">
                  <Search size={14} className="text-[#b0b0b0]" />
                  <input
                    value={draftKeyword}
                    onChange={(event) => setDraftKeyword(event.target.value)}
                    placeholder="请输入关键字"
                    className="ml-2 w-full bg-transparent text-[14px] text-[#555] outline-none placeholder:text-[#b7b7b7]"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3">
                <span className="pb-2 text-[14px] text-[#444]">活动时间</span>
                <div className="flex w-[180px] items-center gap-2">
                  <DateOnlyPicker value={draftDateFrom} onChange={setDraftDateFrom} placeholder="开始日期" />
                </div>
                <span className="pb-2 text-[#999]">至</span>
                <div className="flex w-[180px] items-center gap-2">
                  <DateOnlyPicker value={draftDateTo} onChange={setDraftDateTo} placeholder="结束日期" />
                </div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <button type="button" onClick={handleApplyFilters} className="h-10 border border-[#ee4d2d] px-6 text-[14px] text-[#ee4d2d] hover:bg-[#fff6f4]">
                  查询
                </button>
                <button type="button" onClick={handleReset} className="h-10 border border-[#d9d9d9] px-6 text-[14px] text-[#666] hover:bg-[#fafafa]">
                  重置
                </button>
              </div>
            </div>

            <div className="mt-6 border border-[#efefef]">
              <div className="grid grid-cols-[2.3fr_1.1fr_1.8fr_1.3fr_1fr] bg-[#fafafa] px-4 py-3 text-[14px] text-[#666]">
                <div>活动名称</div>
                <div>活动类型</div>
                <div>商品</div>
                <div>活动周期</div>
                <div>操作</div>
              </div>

              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-[82px] animate-pulse bg-[#f3f3f3]" />
                  ))}
                </div>
              ) : data?.list.items.length ? (
                data.list.items.map((row) => (
                  <div key={row.id} className="grid grid-cols-[2.3fr_1.1fr_1.8fr_1.3fr_1fr] border-t border-[#f1f1f1] px-4 py-4 text-[14px] text-[#333]">
                    <div>
                      <div className={`inline-flex px-2 py-0.5 text-[12px] ${statusBadgeClassMap[row.status] ?? 'bg-[#f4f4f4] text-[#7a7a7a]'}`}>
                        {row.status_label}
                      </div>
                      <div className="mt-2 text-[14px] font-medium text-[#333]">{row.campaign_name}</div>
                    </div>
                    <div className="pt-7 text-[#555]">{row.campaign_type_label}</div>
                    <div className="pt-5">
                      <div className="flex items-center gap-2">
                        {row.products.map((product, index) => (
                          <div
                            key={`${row.id}-${index}`}
                            className="flex h-9 w-9 items-center justify-center overflow-hidden border border-[#e8e8e8] bg-[#f6f6f6] text-[10px] text-[#999]"
                            style={product.image_url ? { backgroundImage: `url(${product.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                          >
                            {!product.image_url ? '图' : ''}
                          </div>
                        ))}
                        {row.products_overflow_count > 0 ? (
                          <div className="flex h-9 w-9 items-center justify-center border border-[#d6d6d6] bg-[#4b5563] text-[11px] text-white">
                            +{row.products_overflow_count}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="whitespace-pre-line pt-4 leading-6 text-[#555]">{row.period_text.replace(' - ', '\n-\n')}</div>
                    <div className="flex flex-col items-start gap-2 pt-1">
                      {row.actions.map((action) => (
                        <button key={`${row.id}-${action}`} type="button" onClick={() => handleActionClick(action)} className="text-[14px] text-[#2563eb] hover:opacity-80">
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-16 text-center text-[14px] text-[#999]">
                  暂无折扣活动，先创建一个活动开始运营吧。
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[#f1f1f1] px-2 pt-6 text-[13px] text-[#777]">
              <div />
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2 text-[14px] text-[#666]">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setAppliedQuery((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                    className="px-2 text-[#888] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'<'}
                  </button>
                  {paginationItems.map((item, index) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${index}`} className="px-1 text-[#999]">
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setAppliedQuery((prev) => ({ ...prev, page: item }));
                          setGotoPageInput(String(item));
                        }}
                        className={`min-w-[24px] text-[14px] ${item === currentPage ? 'font-semibold text-[#ee4d2d]' : 'text-[#555] hover:text-[#ee4d2d]'}`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setAppliedQuery((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                    className="px-2 text-[#888] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'>'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-[#888]">跳转到页</span>
                  <input
                    value={gotoPageInput}
                    onChange={(event) => setGotoPageInput(event.target.value.replace(/[^0-9]/g, ''))}
                    className="h-8 w-[54px] border border-[#d9d9d9] bg-white px-2 text-center text-[14px] text-[#444] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextPage = Number(gotoPageInput || '1');
                      if (!Number.isFinite(nextPage) || nextPage <= 0) {
                        setGotoPageInput(String(currentPage));
                        return;
                      }
                      const safePage = Math.min(totalPages, Math.max(1, nextPage));
                      setAppliedQuery((prev) => ({ ...prev, page: safePage }));
                      setGotoPageInput(String(safePage));
                    }}
                    className="h-8 border border-[#d9d9d9] bg-white px-4 text-[14px] font-medium text-[#444] hover:bg-[#fafafa]"
                  >
                    前往
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 border border-[#ececec] bg-white px-6 py-6 shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div className="text-[18px] font-semibold text-[#2f2f2f]">跨站点整体折扣</div>
          <div className="mt-2 text-[14px] text-[#8a8a8a]">
            为海外店铺中的全部商品统一设置折扣。
            <button type="button" className="ml-1 text-[#2563eb] hover:opacity-80">了解更多</button>
          </div>
          <div className="mt-4 border border-[#efefef]">
            <div className="grid grid-cols-[1.2fr_1.2fr_1.2fr_2fr_1fr] bg-[#fafafa] px-4 py-3 text-[14px] text-[#666]">
              <div>国际站点</div>
              <div className="flex items-center gap-1">
                <span>折扣比例</span>
                <HelpCircle size={12} className="text-[#b0b0b0]" />
              </div>
              <div>状态</div>
              <div>活动周期</div>
              <div>操作</div>
            </div>
            {overallMarketRows.map((row) => (
              <div key={row.market} className="grid grid-cols-[1.2fr_1.2fr_1.2fr_2fr_1fr] border-t border-[#f1f1f1] px-4 py-4 text-[14px] text-[#444]">
                <div>{row.market}</div>
                <div>{row.discountRate}</div>
                <div>{row.status}</div>
                <div>{row.period}</div>
                <button
                  type="button"
                  onClick={() => window.alert('Overall Market Discount 功能将在下一阶段继续接入。')}
                  className="w-fit text-[14px] text-[#2563eb] hover:opacity-80"
                >
                  {row.action}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
