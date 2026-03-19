import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, ChevronDown, RotateCcw } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

type ProductType = 'all' | 'live' | 'violation' | 'review' | 'unpublished';

interface ProductRow {
  id: number;
  title: string;
  category: string | null;
  sku_code: string | null;
  model_id: string | null;
  cover_url: string | null;
  sales_count: number;
  price: number;
  original_price: number;
  stock_available: number;
  quality_status: string;
  status: string;
  created_at: string;
  variants: ProductVariantRow[];
}

interface ProductVariantRow {
  id: number;
  option_value: string;
  option_note: string | null;
  price: number;
  stock: number;
  sales_count: number;
  sku: string | null;
  image_url: string | null;
}

interface ProductsResponse {
  counts: {
    all: number;
    live: number;
    violation: number;
    review: number;
    unpublished: number;
  };
  page: number;
  page_size: number;
  total: number;
  listings: ProductRow[];
}

interface MyProductsViewProps {
  runId: number | null;
  onGotoNewProduct: (listingId?: number) => void;
}

function parseTypeFromPath(): ProductType {
  const matched = window.location.pathname.match(/\/shopee\/product\/list\/(all|live|violation|review|unpublished)\/?$/);
  if (!matched) return 'all';
  return matched[1] as ProductType;
}

function baseShopeePathFromPathname(): string {
  const matched = window.location.pathname.match(/^(\/u\/[^/]+\/shopee)/);
  return matched?.[1] ?? '/shopee';
}

function typeLabel(type: ProductType, counts: ProductsResponse['counts'] | null): string {
  if (!counts) {
    const fallback: Record<ProductType, string> = {
      all: '全部',
      live: '在线',
      violation: '违规',
      review: 'Shopee 审核中',
      unpublished: '未发布',
    };
    return fallback[type];
  }
  if (type === 'all') return '全部';
  if (type === 'live') return `在线 (${counts.live})`;
  if (type === 'violation') return `违规 (${counts.violation})`;
  if (type === 'review') return `Shopee 审核中 (${counts.review})`;
  return `未发布 (${counts.unpublished})`;
}

function resolveImageUrl(raw: string | null): string {
  if (!raw) return 'https://picsum.photos/seed/shopee-product-fallback/72/72';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${API_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export default function MyProductsView({ runId, onGotoNewProduct }: MyProductsViewProps) {
  const [activeType, setActiveType] = useState<ProductType>(parseTypeFromPath());
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [keywordType, setKeywordType] = useState('产品名称');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('全部类目');
  const [program, setProgram] = useState('全部计划');
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const [batchActing, setBatchActing] = useState(false);

  const switchType = (nextType: ProductType) => {
    const nextPath = `${baseShopeePathFromPathname()}/product/list/${nextType}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    setActiveType(nextType);
  };

  useEffect(() => {
    const onPopState = () => {
      setActiveType(parseTypeFromPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const fetchData = (currentType: ProductType, currentKeyword: string) => {
    if (!runId) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;

    const params = new URLSearchParams({
      type: currentType,
      page: '1',
      page_size: '20',
    });
    if (currentKeyword.trim()) {
      params.set('keyword', currentKeyword.trim());
    }

    setLoading(true);
    fetch(`${API_BASE_URL}/shopee/runs/${runId}/products?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('load products failed');
        return res.json();
      })
      .then((res: ProductsResponse) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  const runBatchAction = async (action: 'delete' | 'unpublish') => {
    if (!runId) return;
    if (selectedProductIds.length === 0) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    const actionLabel = action === 'delete' ? '删除' : '下架';
    const ok = window.confirm(`确定要批量${actionLabel}已选中的 ${selectedProductIds.length} 个商品吗？`);
    if (!ok) return;

    setBatchActing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/products/batch-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listing_ids: selectedProductIds,
          action,
        }),
      });
      if (!res.ok) throw new Error('batch action failed');
      setSelectedProductIds([]);
      fetchData(activeType, keyword);
    } catch {
      window.alert(`批量${actionLabel}失败，请稍后重试`);
    } finally {
      setBatchActing(false);
    }
  };

  useEffect(() => {
    fetchData(activeType, keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, runId]);

  const tabList: ProductType[] = ['all', 'live', 'violation', 'review', 'unpublished'];

  const productCountLabel = useMemo(() => {
    const total = data?.total ?? 0;
    return `${total} 个商品`;
  }, [data]);

  const placeholder = keywordType === '产品名称' ? '搜索产品名称、父 SKU、SKU、商品 ID' : `输入${keywordType}`;

  const formatPrice = (amount: number) => `RMB ${Number.isFinite(amount) ? amount : 0}`;
  const listingIds = useMemo(() => (data?.listings ?? []).map((row) => row.id), [data?.listings]);
  const isAllSelected = listingIds.length > 0 && selectedProductIds.length === listingIds.length;
  const isPartiallySelected = selectedProductIds.length > 0 && selectedProductIds.length < listingIds.length;

  useEffect(() => {
    setSelectedProductIds((prev) => prev.filter((id) => listingIds.includes(id)));
  }, [listingIds]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  return (
    <div className="flex-1 bg-[#f5f5f5] p-6 pb-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-[1600px] mx-auto bg-white border border-gray-100 rounded-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-gray-800">我的产品</h2>
          <div className="flex items-center gap-3">
            <button type="button" className="h-9 px-4 rounded border border-gray-300 text-[13px] text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2">
              产品设置 <ChevronDown size={14} />
            </button>
            <button type="button" className="h-9 px-4 rounded border border-gray-300 text-[13px] text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2">
              批量功能 <ChevronDown size={14} />
            </button>
            <button type="button" onClick={onGotoNewProduct} className="h-9 px-5 rounded bg-[#ee4d2d] text-white text-[13px] hover:bg-[#d73211]">+ 添加新商品</button>
          </div>
        </div>

        <div className="mt-6 border-b border-gray-200 flex items-center gap-8">
          {tabList.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchType(tab)}
              className={`pb-3 text-[14px] ${
                activeType === tab ? 'text-[#ee4d2d] border-b-2 border-[#ee4d2d]' : 'text-gray-600'
              }`}
            >
              {typeLabel(tab, data?.counts ?? null)}
            </button>
          ))}
        </div>

        <div className="mt-5 border border-gray-200 rounded-sm p-4 bg-[#fafafa]">
          <div className="flex items-center gap-3">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={placeholder}
              className="h-10 w-[420px] border border-gray-300 rounded px-3 text-[13px] text-gray-700"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-[260px] border border-gray-300 rounded px-3 text-[13px] text-gray-700"
            >
              <option>全部类目</option>
            </select>
            <select
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              className="h-10 w-[260px] border border-gray-300 rounded px-3 text-[13px] text-gray-700"
            >
              <option>全部计划</option>
            </select>
            <button
              type="button"
              onClick={() => fetchData(activeType, keyword)}
              className="h-10 px-6 rounded border border-[#ee4d2d] text-[#ee4d2d] text-[13px] hover:bg-[#fff7f5]"
            >
              申请
            </button>
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setCategory('全部类目');
                setProgram('全部计划');
                fetchData(activeType, '');
              }}
              className="h-10 px-6 rounded border border-gray-300 text-gray-700 text-[13px] hover:bg-gray-50 inline-flex items-center gap-2"
            >
              <RotateCcw size={14} /> 重置
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[22px] font-semibold text-gray-800">
            <span>{productCountLabel}</span>
            <span className="text-[12px] font-normal text-gray-400">上限: 5000</span>
            <HelpCircle size={14} className="text-gray-400" />
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 border border-gray-300 rounded text-[12px] text-gray-600 hover:bg-gray-50">按推荐排序</button>
          </div>
        </div>

        <div className="mt-4 border border-gray-200 rounded-sm overflow-hidden">
          <div className="h-12 bg-[#fafafa] border-b border-gray-200 px-4 grid grid-cols-[4fr_1fr_1.2fr_1.4fr_1.8fr_1.5fr_1fr] items-center text-[13px] text-gray-500">
            <div className="flex items-center gap-2">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={isAllSelected}
                onChange={(e) => setSelectedProductIds(e.target.checked ? listingIds : [])}
                className="h-4 w-4 rounded border-gray-300"
                style={{ accentColor: '#ee4d2d' }}
              />
              <span>产品</span>
            </div>
            <div>销量</div>
            <div>价格</div>
            <div>库存</div>
            <div>提前履约库存</div>
            <div>内容质量</div>
            <div>操作</div>
          </div>

          <div className="min-h-[520px] bg-white">
            {loading && <div className="h-[520px] flex items-center justify-center text-[14px] text-gray-500">加载中...</div>}

            {!loading && (data?.listings?.length ?? 0) === 0 && (
              <div className="h-[520px] flex items-center justify-center text-center">
                <div>
                  <div className="text-[15px] text-gray-400">暂无商品数据</div>
                  <div className="mt-1 text-[13px] text-gray-400">你可以先从库存商品中创建上架。</div>
                </div>
              </div>
            )}

            {!loading && (data?.listings ?? []).map((row) => {
              const variants = row.variants ?? [];
              const priceList = variants.length > 0 ? variants.map((variant) => variant.price || 0) : [row.price || 0];
              const stockTotal = variants.length > 0 ? variants.reduce((sum, variant) => sum + (variant.stock || 0), 0) : row.stock_available;
              const minPrice = Math.min(...priceList);
              const maxPrice = Math.max(...priceList);
              const showRange = variants.length > 0 && minPrice !== maxPrice;
              const expanded = !!expandedGroups[row.id];
              const visibleVariants = expanded ? variants : variants.slice(0, 3);

              return (
                <div key={row.id} className="border-b border-gray-100">
                  <div className="px-4 py-4 grid grid-cols-[4fr_1fr_1.2fr_1.4fr_1.8fr_1.5fr_1fr] items-start text-[13px]">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(row.id)}
                        onChange={(e) =>
                          setSelectedProductIds((prev) =>
                            e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                          )
                        }
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                        style={{ accentColor: '#ee4d2d' }}
                      />
                      <img
                        src={resolveImageUrl(row.cover_url)}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded border border-gray-100 object-cover"
                      />
                      <div className="min-w-0">
                        <div className="text-gray-800 leading-5 break-all">{row.title}</div>
                        <div className="text-[12px] text-gray-500 mt-1">Parent SKU: -</div>
                        <div className="text-[12px] text-gray-500">Item ID: {row.id}</div>
                        <div className="mt-1 inline-flex rounded border border-[#f5d8ce] bg-[#fff7f5] px-1.5 py-0.5 text-[11px] text-[#ee4d2d]">标准商品候选</div>
                      </div>
                    </div>
                    <div className="text-gray-700">{row.sales_count}</div>
                    <div>
                      <div className="text-gray-700">{showRange ? `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}` : formatPrice(minPrice)}</div>
                    </div>
                    <div className="text-gray-700">{stockTotal}</div>
                    <div className="text-gray-500">-</div>
                    <div className="inline-flex items-center gap-2 text-gray-700">
                      <span className="h-2 w-2 rounded-full bg-[#19b26b]" />
                      <span>{row.quality_status || '内容待完善'}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => onGotoNewProduct(row.id)}
                        className="text-left text-[#3478f6] hover:underline"
                      >
                        编辑
                      </button>
                      <button className="text-left text-[#3478f6] hover:underline">提升</button>
                      <button className="text-left text-[#3478f6] hover:underline">更多</button>
                    </div>
                  </div>

                  {variants.length > 0 && (
                    <div className="bg-[#fff] px-4 pb-3">
                      <div className="rounded-sm border border-[#eaeaea] bg-[#fcfcfc]">
                      {visibleVariants.map((variant) => (
                        <div key={variant.id} className="grid grid-cols-[4fr_1fr_1.2fr_1.4fr_1.8fr_1.5fr_1fr] items-start text-[13px] py-3 border-b border-dashed border-gray-100 last:border-b-0">
                          <div className="flex items-start gap-3 pl-11">
                            <img
                              src={resolveImageUrl(variant.image_url)}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded border border-gray-100 object-cover"
                            />
                            <div>
                              <div className="text-gray-800">[{variant.option_value || '默认变体'}]</div>
                              <div className="text-[12px] text-gray-500">SKU: {variant.sku ?? '-'}</div>
                              <div className="text-[12px] text-gray-500">Model ID: {variant.id}</div>
                            </div>
                          </div>
                          <div className="text-gray-700">{variant.sales_count ?? 0}</div>
                          <div>
                            <div className="text-gray-700">{formatPrice(variant.price)}</div>
                          </div>
                          <div className="text-gray-700">{variant.stock}</div>
                          <div className="text-gray-500">-</div>
                          <div />
                          <div />
                        </div>
                      ))}
                      <div className="py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((prev) => ({ ...prev, [row.id]: !expanded }))}
                          className="text-[13px] text-gray-600 hover:text-[#ee4d2d]"
                        >
                          {variants.length <= 3
                            ? `View More (${variants.length} Products SKUs)`
                            : expanded
                              ? '收起变体'
                              : `View More (${variants.length} Products SKUs)`}
                        </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedProductIds.length > 0 && (
        <div className="sticky bottom-0 z-40 -mx-6">
          <div className="mx-auto max-w-[1600px] border-t border-[#f1d6cf] bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            <div className="h-14 px-6 flex items-center justify-between">
              <label className="inline-flex items-center gap-3 text-[14px] text-[#4a4f57]">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => setSelectedProductIds(e.target.checked ? listingIds : [])}
                  className="h-4 w-4 rounded border-gray-300"
                  style={{ accentColor: '#ee4d2d' }}
                />
                全选
              </label>

              <div className="flex items-center gap-3 text-[14px] text-[#4a4f57]">
                <span>{selectedProductIds.length} 件产品</span>
                <button
                  type="button"
                  onClick={() => runBatchAction('delete')}
                  disabled={batchActing}
                  className="h-8 px-4 rounded border border-[#d9d9d9] text-[13px] text-[#4a4f57] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  删除
                </button>
                <button
                  type="button"
                  onClick={() => runBatchAction('unpublish')}
                  disabled={batchActing}
                  className="h-8 px-4 rounded border border-[#d9d9d9] text-[13px] text-[#4a4f57] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下架
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
