import { useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import RightSidebar from './components/RightSidebar';
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
          <RightSidebar />
        </div>
      </div>
    </div>
  );
}
