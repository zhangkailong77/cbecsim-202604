import { CalendarDays, ChevronDown, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import logoImg from '../../assets/home/logo.png';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

interface MarketIntelPageProps {
  run: {
    id: number;
    market: string;
    initial_cash: number;
  } | null;
  currentUser: {
    username: string;
    full_name: string | null;
  } | null;
  onBackToSetup: () => void;
  onEnterShopee: () => void;
}

interface LeaderboardItem {
  id: number;
  market: string;
  category: string;
  product_name: string;
  supplier_price: number;
  suggested_price: number;
  monthly_sales: number;
  monthly_revenue: number;
  growth_rate: number;
  competition_level: string;
}

interface LeaderboardResponse {
  items: LeaderboardItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface ProcurementSummary {
  run_id: number;
  total_cash: number;
  spent_total: number;
  remaining_cash: number;
}

interface ProcurementOrder {
  id: number;
  total_amount: number;
  created_at: string;
  items: Array<{
    product_id: number;
    product_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>;
}

interface ProcurementOrdersResponse {
  orders: ProcurementOrder[];
}

interface CartItem {
  product: LeaderboardItem;
  quantity: number;
}

const subMenus = ['销量榜', '新品榜', '热推榜'] as const;
const countries = ['马来西亚'];

const boardValueMap: Record<(typeof subMenus)[number], 'sales' | 'new' | 'hot'> = {
  销量榜: 'sales',
  新品榜: 'new',
  热推榜: 'hot',
};

export default function MarketIntelPage({ run, currentUser, onBackToSetup, onEnterShopee }: MarketIntelPageProps) {
  const [scale, setScale] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState<string[]>(['全部']);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeBoard, setActiveBoard] = useState<(typeof subMenus)[number]>('销量榜');
  const [activeCountry] = useState('马来西亚');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [sortBy, setSortBy] = useState<'sales' | 'growth' | 'revenue' | 'margin'>('sales');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [rows, setRows] = useState<LeaderboardItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [jumpPage, setJumpPage] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  const [orderHistory, setOrderHistory] = useState<ProcurementOrder[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [rowQtyMap, setRowQtyMap] = useState<Record<number, string>>({});
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ProcurementOrder | null>(null);

  const market = run?.market ?? 'MY';
  const playerDisplayName = currentUser?.full_name?.trim() || currentUser?.username || '玩家';

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.product.supplier_price * item.quantity, 0),
    [cartItems],
  );
  const budgetRemainingBeforeOrder = summary?.remaining_cash ?? 0;
  const budgetRemainingAfterOrder = budgetRemainingBeforeOrder - cartTotal;

  useEffect(() => {
    const resize = () => {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const ws = vw / BASE_WIDTH;
      const hs = vh / BASE_HEIGHT;
      setScale(Math.max(ws, hs));
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const loadCategories = async () => {
      const response = await fetch(`${API_BASE_URL}/market/categories?market=${market}`);
      if (!response.ok) return;
      const data = (await response.json()) as Array<{ category: string }>;
      setCategories(['全部', ...data.map((x) => x.category)]);
    };
    void loadCategories();
  }, [market]);

  const loadProcurementSummary = async () => {
    if (!run?.id) {
      setSummary(null);
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    const response = await fetch(`${API_BASE_URL}/game/runs/${run.id}/procurement/cart-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const data = (await response.json()) as ProcurementSummary;
    setSummary(data);
  };

  const loadOrderHistory = async () => {
    if (!run?.id) {
      setOrderHistory([]);
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    const response = await fetch(`${API_BASE_URL}/game/runs/${run.id}/procurement/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const data = (await response.json()) as ProcurementOrdersResponse;
    setOrderHistory(data.orders);
  };

  useEffect(() => {
    void loadProcurementSummary();
    void loadOrderHistory();
  }, [run?.id]);

  useEffect(() => {
    const loadRows = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          market,
          q: keyword.trim(),
          sort_by: sortBy,
          order: sortOrder,
          page: String(page),
          board_type: boardValueMap[activeBoard],
        });
        if (activeCategory !== '全部') params.set('category', activeCategory);
        const response = await fetch(`${API_BASE_URL}/market/leaderboard?${params.toString()}`);
        if (!response.ok) {
          setRows([]);
          setTotal(0);
          setTotalPages(0);
          return;
        }
        const data = (await response.json()) as LeaderboardResponse;
        setRows(data.items);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      } finally {
        setLoading(false);
      }
    };
    void loadRows();
  }, [market, activeCategory, sortBy, sortOrder, page, keyword, activeBoard]);

  useEffect(() => {
    setPage(1);
  }, [activeCategory, sortBy, sortOrder, keyword, activeBoard]);

  const toggleSort = (key: 'sales' | 'growth' | 'revenue' | 'margin') => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortBy(key);
    setSortOrder('desc');
  };

  const getSortHint = (key: 'sales' | 'growth' | 'revenue' | 'margin') => {
    if (sortBy !== key) return '点击降序';
    return sortOrder === 'desc' ? '点击升序' : '点击降序';
  };

  const addToCart = (product: LeaderboardItem) => {
    const rawQty = rowQtyMap[product.id] ?? '1000';
    const quantity = Number(rawQty);
    if (!Number.isInteger(quantity) || quantity < 1000) {
      setSubmitError('采购数量保底为 1000 个。');
      return;
    }
    setSubmitError('');
    setCartItems((prev) => {
      const found = prev.find((item) => item.product.id === product.id);
      if (!found) {
        return [...prev, { product, quantity }];
      }
      return prev.map((item) =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item,
      );
    });
    setRowQtyMap((prev) => ({ ...prev, [product.id]: '1000' }));
  };

  const updateCartQty = (productId: number, value: string) => {
    const clean = value.replace(/[^\d]/g, '');
    const quantity = Number(clean || '0');
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity: quantity < 1000 ? 1000 : quantity,
            }
          : item,
      ),
    );
  };

  const removeCartItem = (productId: number) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleSubmitOrder = async () => {
    if (!run?.id || cartItems.length === 0) return;
    if (budgetRemainingAfterOrder < 0) {
      setSubmitError('采购金额超出可用资金。');
      return;
    }

    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setSubmitError('登录状态失效，请重新登录。');
      return;
    }

    setSubmittingOrder(true);
    setSubmitError('');
    try {
      const response = await fetch(`${API_BASE_URL}/game/runs/${run.id}/procurement/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setSubmitError(payload.detail ?? '下单失败，请稍后重试。');
        return;
      }
      setCartItems([]);
      await Promise.all([loadProcurementSummary(), loadOrderHistory()]);
    } catch {
      setSubmitError('下单失败，请检查网络后重试。');
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#eef4ff]">
      <div
        style={{
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          left: 0,
          top: 0,
        }}
        className="bg-[#eef4ff]"
      >
        <header className="h-[74px] border-b border-[#eceef3] bg-white px-5">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="relative h-11 w-11">
                  <span className="logo-breathe absolute inset-[-6px] rounded-full bg-blue-400/35 blur-lg" />
                  <span className="logo-breathe logo-breathe-delay absolute inset-[-12px] rounded-full bg-blue-300/25 blur-xl" />
                  <div className="relative h-11 w-11 overflow-hidden rounded-full border border-blue-100 bg-white p-1 shadow-[0_10px_24px_rgba(37,99,235,0.25)]">
                    <img src={logoImg} alt="CbecMoss Logo" className="h-full w-full rounded-full object-cover" />
                  </div>
                </div>
                <div>
                  <div className="text-[30px] font-black leading-none text-[#2563eb]">CbecMoss</div>
                  <div className="-mt-0.5 text-[12px] font-semibold text-[#60a5fa]">跨境选品数据分析</div>
                </div>
              </div>
              <div className="flex h-11 w-[460px] items-center overflow-hidden rounded-full bg-[#f3f7ff] ring-1 ring-[#dbeafe]">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="输入要搜索的内容"
                  className="h-full flex-1 bg-transparent px-5 text-[14px] text-[#374151] outline-none"
                />
                <button className="mr-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#2563eb] text-white">
                  <Search size={16} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[14px] font-semibold text-[#374151]">
              <button onClick={onBackToSetup} className="rounded-full border border-[#e5e7eb] px-4 py-1.5 text-[#6b7280]">
                返回开局
              </button>
              <button onClick={onEnterShopee} className="rounded-full bg-[#2563eb] px-5 py-1.5 text-white">
                进入物流清关
              </button>
              <div className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-4 py-1.5 text-[#1d4ed8]">
                玩家：{playerDisplayName}
              </div>
            </div>
          </div>
        </header>

        <div className="flex h-[calc(1080px-74px)]">
          <aside className="w-[200px] border-r border-[#eceef3] bg-white">
            <div className="px-3 py-4">
              <div className="px-3 pb-2 text-[28px] font-black text-[#111827]">商品搜索</div>
              {subMenus.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setActiveBoard(sub)}
                  className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-[14px] ${
                    sub === activeBoard ? 'bg-[#e8f1ff] font-bold text-[#2563eb]' : 'text-[#374151]'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </aside>

          <main className="flex-1 overflow-auto p-5">
            <h1 className="mb-3 text-[34px] font-black text-[#111827]">{activeBoard}</h1>

            <section className="mb-4 rounded-2xl border border-[#eceef3] bg-white p-5">
              <div className="mb-3 flex items-center text-[14px]">
                <div className="w-[96px] font-bold text-[#4b5563]">时间筛选:</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#2563eb] px-3 py-1.5 text-[13px] font-semibold text-white"
                  >
                    月榜
                  </button>
                  <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] text-[#334155]">
                    <input
                      type="month"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-transparent outline-none"
                    />
                    <CalendarDays size={14} className="text-slate-400" />
                  </label>
                </div>
              </div>
              <FilterRow label="国家/地区" options={countries} active={activeCountry} />
              <FilterRow label="商品分类" options={categories} active={activeCategory} onSelect={setActiveCategory} />
              <div className="mt-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold text-slate-700">已选条件:</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-3 py-1 text-[#1d4ed8]">
                    时间: {selectedDate}
                    <CalendarDays size={12} />
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-3 py-1 text-[#1d4ed8]">
                    国家/地区: {activeCountry}
                  </span>
                  {activeCategory !== '全部' && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory('全部')}
                      className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-3 py-1 text-[#1d4ed8]"
                    >
                      商品分类: {activeCategory}
                      <X size={12} />
                    </button>
                  )}
                  {keyword.trim() && (
                    <button
                      type="button"
                      onClick={() => setKeyword('')}
                      className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-3 py-1 text-[#1d4ed8]"
                    >
                      关键词: {keyword.trim()}
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-[1fr_420px] gap-4">
              <section className="rounded-2xl border border-[#eceef3] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[14px] text-[#6b7280]">
                    当前筛选共 {total} 条数据
                  </div>
                  <div className="rounded-lg bg-[#e8f1ff] px-3 py-1 text-[12px] font-bold text-[#2563eb]">数据导出</div>
                </div>

                <table className="w-full text-left">
                  <thead className="bg-[#fafafb] text-[12px] font-bold text-[#6b7280]">
                    <tr>
                      <th className="px-4 py-3">排名</th>
                      <th className="px-4 py-3">商品</th>
                      <th className="px-4 py-3">国家/地区</th>
                      <th className="px-4 py-3">商品分类</th>
                      <th className="px-4 py-3">
                        <button type="button" onClick={() => toggleSort('sales')} className="group relative inline-flex items-center gap-1">
                          <span>销量</span>
                          <span>{sortBy === 'sales' ? (sortOrder === 'desc' ? '↓' : '↑') : '▼'}</span>
                          <span className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#4b5563] px-2 py-1 text-[11px] font-semibold text-white shadow-lg group-hover:block">
                            {getSortHint('sales')}
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#4b5563]" />
                          </span>
                        </button>
                      </th>
                      <th className="px-4 py-3">
                        <button type="button" onClick={() => toggleSort('growth')} className="group relative inline-flex items-center gap-1">
                          <span>销量环比</span>
                          <span>{sortBy === 'growth' ? (sortOrder === 'desc' ? '↓' : '↑') : '▼'}</span>
                          <span className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#4b5563] px-2 py-1 text-[11px] font-semibold text-white shadow-lg group-hover:block">
                            {getSortHint('growth')}
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#4b5563]" />
                          </span>
                        </button>
                      </th>
                      <th className="px-4 py-3">
                        <button type="button" onClick={() => toggleSort('revenue')} className="group relative inline-flex items-center gap-1">
                          <span>销售额</span>
                          <span>{sortBy === 'revenue' ? (sortOrder === 'desc' ? '↓' : '↑') : '▼'}</span>
                          <span className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#4b5563] px-2 py-1 text-[11px] font-semibold text-white shadow-lg group-hover:block">
                            {getSortHint('revenue')}
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#4b5563]" />
                          </span>
                        </button>
                      </th>
                      <th className="px-4 py-3">
                        <button type="button" onClick={() => toggleSort('margin')} className="group relative inline-flex items-center gap-1">
                          <span>毛利空间</span>
                          <span>{sortBy === 'margin' ? (sortOrder === 'desc' ? '↓' : '↑') : '▼'}</span>
                          <span className="pointer-events-none absolute -top-10 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#4b5563] px-2 py-1 text-[11px] font-semibold text-white shadow-lg group-hover:block">
                            {getSortHint('margin')}
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#4b5563]" />
                          </span>
                        </button>
                      </th>
                      <th className="px-4 py-3">采购</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-[13px] text-[#9ca3af]">
                          正在加载榜单...
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      rows.map((item, idx) => (
                        <tr key={item.id} className="border-t border-[#f3f4f6] text-[14px] text-[#111827]">
                          <td className="px-4 py-4 font-bold">{(page - 1) * 20 + idx + 1}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 rounded bg-[#f3f4f6]" />
                              <div>
                                <div className="max-w-[290px] truncate font-semibold">{item.product_name}</div>
                                <div className="text-[12px] text-[#6b7280]">采购价: {item.supplier_price} / 售价: {item.suggested_price}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">{item.market}</td>
                          <td className="px-4 py-4">{item.category}</td>
                          <td className="px-4 py-4 font-bold">{(item.monthly_sales / 10000).toFixed(2)}万</td>
                          <td className="px-4 py-4">{item.growth_rate.toFixed(2)}%</td>
                          <td className="px-4 py-4">{item.monthly_revenue.toLocaleString()}</td>
                          <td className="px-4 py-4 text-[#2563eb]">{item.suggested_price - item.supplier_price}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <input
                                value={rowQtyMap[item.id] ?? '1000'}
                                onChange={(e) => setRowQtyMap((prev) => ({ ...prev, [item.id]: e.target.value.replace(/[^\d]/g, '') }))}
                                placeholder=">=1000"
                                className="h-8 w-16 rounded border border-slate-200 px-2 text-center text-[12px] outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => addToCart(item)}
                                className="rounded-lg bg-[#e8f1ff] px-3 py-1 text-[12px] font-bold text-[#2563eb]"
                              >
                                加入采购
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <span className="px-2 text-slate-600">
                    第 {page} / {Math.max(totalPages, 1)} 页
                  </span>
                  <button
                    type="button"
                    disabled={totalPages === 0 || page >= totalPages}
                    onClick={() => setPage((p) => (totalPages > 0 ? Math.min(totalPages, p + 1) : p))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
                  >
                    下一页
                  </button>
                  <input
                    value={jumpPage}
                    onChange={(e) => setJumpPage(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="页码"
                    className="ml-2 h-8 w-16 rounded-lg border border-slate-200 px-2 text-center outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = Number(jumpPage);
                      if (!n || totalPages === 0) return;
                      setPage(Math.min(Math.max(1, n), totalPages));
                    }}
                    className="rounded-lg bg-[#2563eb] px-3 py-1.5 font-semibold text-white"
                  >
                    跳转
                  </button>
                </div>
              </section>

              <aside className="rounded-2xl border border-[#eceef3] bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-[16px] font-black text-[#111827]">
                  <ShoppingCart size={18} />
                  采购面板
                </div>

                <div className="mb-3 rounded-xl bg-[#f8fbff] p-3 text-[13px] text-[#334155]">
                  <div className="mb-1 rounded-lg bg-[#eef6ff] px-2 py-1 text-[12px] font-semibold text-[#1d4ed8]">
                    当前玩家：{playerDisplayName}
                  </div>
                  <div className="flex items-center justify-between py-1"><span>总资金</span><span className="font-bold">{summary?.total_cash.toLocaleString() ?? '--'} RMB</span></div>
                  <div className="flex items-center justify-between py-1"><span>已采购</span><span className="font-bold">{summary?.spent_total.toLocaleString() ?? '--'} RMB</span></div>
                  <div className="flex items-center justify-between py-1"><span>下单前剩余</span><span className="font-bold">{budgetRemainingBeforeOrder.toLocaleString()} RMB</span></div>
                  <div className="flex items-center justify-between py-1"><span>本次采购</span><span className="font-bold text-[#2563eb]">{cartTotal.toLocaleString()} RMB</span></div>
                  <div className="flex items-center justify-between py-1"><span>下单后剩余</span><span className={`font-bold ${budgetRemainingAfterOrder < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{budgetRemainingAfterOrder.toLocaleString()} RMB</span></div>
                </div>

                <div className="max-h-[420px] space-y-2 overflow-auto">
                  {cartItems.length === 0 && <div className="py-8 text-center text-[13px] text-slate-400">购物车为空，请从榜单加入商品。</div>}
                  {cartItems.map((item) => (
                    <div key={item.product.id} className="rounded-lg border border-slate-200 px-2 py-1.5">
                      <div className="text-[13px] font-semibold leading-snug text-slate-700">{item.product.product_name}</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[12px] text-slate-500">
                          <span>单价 {item.product.supplier_price} RMB/件</span>
                          <span>·</span>
                          <span>数量</span>
                          <input
                            value={String(item.quantity)}
                            onChange={(e) => updateCartQty(item.product.id, e.target.value)}
                            className="h-7 w-16 rounded border border-slate-200 px-1 text-center text-[12px] outline-none"
                          />
                          <span>件</span>
                        </div>
                        <button type="button" onClick={() => removeCartItem(item.product.id)} className="text-rose-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-1 text-right text-[12px] font-bold text-slate-700">
                        小计 {(item.product.supplier_price * item.quantity).toLocaleString()} RMB
                      </div>
                    </div>
                  ))}
                </div>

                {submitError && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[12px] text-rose-600">{submitError}</div>}

                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={cartItems.length === 0 || budgetRemainingAfterOrder < 0 || submittingOrder}
                  className="mt-3 h-10 w-full rounded-xl bg-[#2563eb] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingOrder ? '下单中...' : '确认采购并扣款'}
                </button>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="mb-2 text-[12px] font-semibold text-slate-500">本局采购历史（最近 5 笔）</div>
                  <div className="space-y-1 text-[12px] text-slate-600">
                    <div className="mb-1 text-[11px] text-slate-400">点击订单可查看订单详情</div>
                    {orderHistory.slice(0, 5).map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() =>
                          setSelectedOrder((prev) => (prev?.id === order.id ? null : order))
                        }
                        className="flex w-full items-center justify-between rounded bg-slate-50 px-2 py-1 text-left hover:bg-slate-100"
                      >
                        <span>订单 #{order.id}</span>
                        <span className="font-semibold">{order.total_amount.toLocaleString()} RMB</span>
                      </button>
                    ))}
                    {orderHistory.length === 0 && <div className="text-slate-400">暂无采购订单</div>}
                    {selectedOrder && (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                        <div className="mb-1 text-[11px] text-slate-500">
                          订单 #{selectedOrder.id} · {new Date(selectedOrder.created_at).toLocaleString('zh-CN')}
                        </div>
                        <div className="max-h-[190px] overflow-auto rounded border border-slate-100">
                          <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
                              <tr>
                                <th className="px-2 py-1">商品</th>
                                <th className="px-2 py-1">数量</th>
                                <th className="px-2 py-1">小计</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedOrder.items.map((item) => (
                                <tr key={`${selectedOrder.id}-${item.product_id}`} className="border-t border-slate-100 text-[11px] text-slate-700">
                                  <td className="px-2 py-1">{item.product_name}</td>
                                  <td className="px-2 py-1">{item.quantity.toLocaleString()} 件</td>
                                  <td className="px-2 py-1">{item.line_total.toLocaleString()} RMB</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-1 text-right text-[12px] font-semibold text-slate-700">
                          合计：{selectedOrder.total_amount.toLocaleString()} RMB
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: string[];
  active: string;
  onSelect?: (value: string) => void;
}) {
  return (
    <div className="mb-3 flex items-center text-[14px]">
      <div className="w-[96px] font-bold text-[#4b5563]">{label}:</div>
      <div className="flex flex-wrap items-center gap-3">
        {options.map((item) => {
          const isActive = item === active;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onSelect?.(item)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                isActive ? 'bg-[#2563eb] text-white' : 'bg-[#f3f7ff] text-[#374151]'
              }`}
            >
              {item}
            </button>
          );
        })}
        <button className="inline-flex items-center gap-1 rounded-full bg-[#e8f1ff] px-3 py-1.5 text-[13px] font-semibold text-[#2563eb]">
          展开
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}
