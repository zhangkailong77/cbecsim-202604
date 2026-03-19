import { useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import RightSidebar from './components/RightSidebar';
import NotificationDrawer, { type NotificationOrder } from './components/NotificationDrawer';
import MyOrdersView from './views/MyOrdersView';
import MyOrderDetailView from './views/MyOrderDetailView';
import MyProductsView from './views/MyProductsView';
import NewProductView from './views/NewProductView';
import MyBalanceView from './views/MyBalanceView';
import MyIncomeView from './views/MyIncomeView';
import MyBankAccountsView from './views/MyBankAccountsView';

interface ShopeePageProps {
  run: {
    id: number;
    day_index: number;
  } | null;
  currentUser: {
    public_id: string;
    username: string;
    full_name: string | null;
  } | null;
  onBackToSetup: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

interface NotificationApiOrderRow {
  id: number;
  order_no: string;
  buyer_name: string;
  buyer_payment: number;
  countdown_text: string;
  created_at: string;
}

interface NotificationOrdersResponse {
  counts: {
    toship: number;
  };
  orders: NotificationApiOrderRow[];
}

export default function ShopeePage({ run, currentUser, onBackToSetup }: ShopeePageProps) {
  const [scale, setScale] = useState(1);
  const [activeView, setActiveView] = useState<'dashboard' | 'my-orders' | 'my-products' | 'new-product' | 'my-income' | 'my-balance' | 'bank-accounts'>(() => {
    const path = window.location.pathname;
    if (/\/shopee\/order(?:\/\d+)?\/?$/.test(path)) return 'my-orders';
    if (/\/shopee\/product\/add_news\/?$/.test(path)) return 'new-product';
    if (/\/shopee\/product\/list\/(all|live|violation|review|unpublished)\/?$/.test(path)) return 'my-products';
    if (/\/shopee\/finance\/income\/?$/.test(path)) return 'my-income';
    if (/\/shopee\/finance\/balance\/?$/.test(path)) return 'my-balance';
    if (/\/shopee\/finance\/bank-accounts\/?$/.test(path)) return 'bank-accounts';
    return 'dashboard';
  });
  const [editingListingId, setEditingListingId] = useState<number | null>(() => {
    const search = new URLSearchParams(window.location.search);
    const raw = Number(search.get('listing_id') || '');
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });
  const [activeOrderId, setActiveOrderId] = useState<number | null>(() => {
    const matched = window.location.pathname.match(/\/shopee\/order\/(\d+)\/?$/);
    if (!matched) return null;
    const val = Number(matched[1]);
    return Number.isFinite(val) && val > 0 ? val : null;
  });
  const [orderReturnType, setOrderReturnType] = useState<string>(() => {
    const search = new URLSearchParams(window.location.search);
    return search.get('type') || 'all';
  });
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationOrders, setNotificationOrders] = useState<NotificationOrder[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const BASE_WIDTH = 1920;
  const BASE_HEIGHT = 1080;

  const parseShopeeViewFromPath = () => {
    const path = window.location.pathname;
    if (/\/shopee\/order(?:\/\d+)?\/?$/.test(path)) return 'my-orders';
    if (/\/shopee\/product\/add_news\/?$/.test(path)) return 'new-product';
    if (/\/shopee\/product\/list\/(all|live|violation|review|unpublished)\/?$/.test(path)) return 'my-products';
    if (/\/shopee\/finance\/income\/?$/.test(path)) return 'my-income';
    if (/\/shopee\/finance\/balance\/?$/.test(path)) return 'my-balance';
    if (/\/shopee\/finance\/bank-accounts\/?$/.test(path)) return 'bank-accounts';
    return 'dashboard';
  };

  const buildShopeePath = (view: 'dashboard' | 'my-orders' | 'my-products' | 'new-product' | 'my-income' | 'my-balance' | 'bank-accounts') => {
    const base = `/u/${encodeURIComponent(currentUser?.public_id ?? '')}/shopee`;
    if (view === 'new-product') return `${base}/product/add_news`;
    if (view === 'my-income') return `${base}/finance/income`;
    if (view === 'my-balance') return `${base}/finance/balance`;
    if (view === 'bank-accounts') return `${base}/finance/bank-accounts`;
    return view === 'my-orders' ? `${base}/order` : base;
  };

  const parseOrderIdFromPath = () => {
    const matched = window.location.pathname.match(/\/shopee\/order\/(\d+)\/?$/);
    if (!matched) return null;
    const val = Number(matched[1]);
    return Number.isFinite(val) && val > 0 ? val : null;
  };

  const parseEditingListingIdFromPath = () => {
    const search = new URLSearchParams(window.location.search);
    const raw = Number(search.get('listing_id') || '');
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  };

  useEffect(() => {
    const onPopState = () => {
      setActiveView(parseShopeeViewFromPath());
      setEditingListingId(parseEditingListingIdFromPath());
      setActiveOrderId(parseOrderIdFromPath());
      setOrderReturnType(new URLSearchParams(window.location.search).get('type') || 'all');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!run?.id) {
      setNotificationCount(0);
      setNotificationOrders([]);
      return;
    }

    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setNotificationCount(0);
      setNotificationOrders([]);
      return;
    }

    let cancelled = false;
    const loadNotifications = async () => {
      setNotificationLoading(true);
      try {
        const params = new URLSearchParams({
          type: 'toship',
          source: 'to_process',
          sort_by: 'ship_by_date_asc',
          page: '1',
          page_size: '20',
        });
        const res = await fetch(`${API_BASE_URL}/shopee/runs/${run.id}/orders?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('load notification failed');
        const data = (await res.json()) as NotificationOrdersResponse;
        if (cancelled) return;
        const mapped = (data.orders ?? []).map((item) => ({
          id: item.id,
          orderNo: item.order_no,
          buyerName: item.buyer_name || '买家',
          amountText: `RM${Number(item.buyer_payment || 0).toFixed(2)}`,
          countdownText: item.countdown_text || '请尽快处理',
          createdAtText: new Date(item.created_at).toLocaleString(),
        }));
        setNotificationCount(Math.max(0, Number(data.counts?.toship ?? 0)));
        setNotificationOrders(mapped);
      } catch {
        if (!cancelled) {
          setNotificationCount(0);
          setNotificationOrders([]);
        }
      } finally {
        if (!cancelled) setNotificationLoading(false);
      }
    };

    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run?.id, activeView]);

  const handleSelectView = (view: 'dashboard' | 'my-orders' | 'my-products' | 'new-product' | 'my-income' | 'my-balance' | 'bank-accounts', listingId?: number | null) => {
    if (!currentUser?.public_id) {
      setActiveView(view);
      return;
    }
    let nextPath = '';
    if (view === 'my-orders') {
      const base = buildShopeePath('my-orders');
      const query = orderReturnType && orderReturnType !== 'all' ? `?type=${encodeURIComponent(orderReturnType)}` : '';
      nextPath = `${base}${query}`;
    } else {
      const nextPathBase = view === 'my-products' ? `${buildShopeePath('dashboard')}/product/list/all` : buildShopeePath(view);
      nextPath = view === 'new-product' && listingId && listingId > 0
        ? `${nextPathBase}?listing_id=${listingId}`
        : nextPathBase;
    }
    const currentFullPath = `${window.location.pathname}${window.location.search}`;
    if (currentFullPath !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    setEditingListingId(view === 'new-product' ? (listingId && listingId > 0 ? listingId : null) : null);
    setActiveOrderId(null);
    setActiveView(view);
  };

  const handleOpenOrderDetail = (orderId: number, tabType: string) => {
    if (!currentUser?.public_id) return;
    const path = `/u/${encodeURIComponent(currentUser.public_id)}/shopee/order/${orderId}?type=${encodeURIComponent(tabType || 'all')}`;
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, '', path);
    }
    setActiveView('my-orders');
    setActiveOrderId(orderId);
    setOrderReturnType(tabType || 'all');
  };

  const handleBackToOrderList = () => {
    if (!currentUser?.public_id) return;
    const base = `/u/${encodeURIComponent(currentUser.public_id)}/shopee/order`;
    const query = orderReturnType && orderReturnType !== 'all' ? `?type=${encodeURIComponent(orderReturnType)}` : '';
    const path = `${base}${query}`;
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState(null, '', path);
    }
    setActiveOrderId(null);
    setActiveView('my-orders');
  };

  useEffect(() => {
    const handleResize = () => {
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const widthScale = viewportWidth / BASE_WIDTH;
      const heightScale = viewportHeight / BASE_HEIGHT;
      setScale(Math.max(widthScale, heightScale));
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const playerDisplayName = currentUser?.full_name?.trim() || currentUser?.username || '玩家';

  return (
    <div className="fixed inset-0 overflow-hidden bg-white">
      <div
        ref={containerRef}
        className="bg-white shadow-2xl flex flex-col flex-shrink-0"
        style={{
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          transition: 'transform 0.1s ease-out',
          position: 'absolute',
          left: 0,
          top: 0,
          fontFamily:
            '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif',
          fontSize: '14px',
        }}
      >
        <Header
          playerName={playerDisplayName}
          runId={run?.id ?? null}
          onBackToSetup={onBackToSetup}
          onBackToDashboard={() => handleSelectView('dashboard')}
          onNavigateToView={handleSelectView}
          activeView={activeView}
          isOrderDetail={Boolean(activeOrderId)}
          isProductDetail={activeView === 'new-product' && Boolean(editingListingId)}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 overflow-hidden">
            {activeView !== 'new-product' && !activeOrderId && <Sidebar activeView={activeView} onSelectView={handleSelectView} />}
            {activeView === 'my-orders' ? (
              activeOrderId ? (
                <MyOrderDetailView
                  runId={run?.id ?? null}
                  orderId={activeOrderId}
                  onBack={handleBackToOrderList}
                />
              ) : (
                <MyOrdersView runId={run?.id ?? null} onOpenOrderDetail={handleOpenOrderDetail} />
              )
            ) : activeView === 'my-products' ? (
              <MyProductsView runId={run?.id ?? null} onGotoNewProduct={(listingId) => handleSelectView('new-product', listingId)} />
            ) : activeView === 'new-product' ? (
              <NewProductView
                runId={run?.id ?? null}
                editingListingId={editingListingId}
                onBackToProducts={() => handleSelectView('my-products')}
              />
            ) : activeView === 'my-balance' ? (
              <MyBalanceView runId={run?.id ?? null} onOpenBankAccounts={() => handleSelectView('bank-accounts')} />
            ) : activeView === 'my-income' ? (
              <MyIncomeView runId={run?.id ?? null} />
            ) : activeView === 'bank-accounts' ? (
              <MyBankAccountsView runId={run?.id ?? null} />
            ) : (
              <Dashboard />
            )}
          </div>
          <NotificationDrawer
            open={notificationDrawerOpen}
            loading={notificationLoading}
            orders={notificationOrders}
          />
          <RightSidebar
            notificationOpen={notificationDrawerOpen}
            onToggleNotification={() => setNotificationDrawerOpen((prev) => !prev)}
            notificationCount={notificationCount}
          />
        </div>
      </div>
    </div>
  );
}
