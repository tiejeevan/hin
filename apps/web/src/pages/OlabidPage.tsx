import { useState, useEffect } from 'react';
import {
  Gavel,
  Clock,
  TrendingUp,
  RefreshCw,
  Package,
  Truck,
  Award,
  Search,
  X,
  MapPin,
  SlidersHorizontal,
  ChevronDown,
  Flame,
  Sparkles,
} from 'lucide-react';
import { API_URL } from '../config';

interface OlabidItem {
  id: number;
  name: string;
  retailPrice: number;
  currentBidderId?: number;
  currentBidAmount: number;
  nextBidAmount: number;
  inWatchlist: boolean;
  auctionEndsAt: string;
  auctionFinishesInMs: number;
  previewBlobUrl?: string;
  status: string;
  shippingIsUnavailable?: boolean;
  shippingIsFree?: boolean;
  pickupIsUnavailable?: boolean;
  isWithoutFees?: boolean;
}

interface OlabidListResponse {
  pageContext: {
    page: number;
    size: number;
  };
  items: OlabidItem[];
}

interface OlabidCategory {
  id: number;
  name: string;
}

interface OlabidWarehouse {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

type SectionFilter = '' | 'topDeals' | 'trending' | 'freeShipping' | 'noFees';

const SECTIONS: { id: SectionFilter; label: string; icon?: 'flame' | 'sparkles' | 'truck' | 'award' }[] = [
  { id: '', label: 'All' },
  { id: 'topDeals', label: 'Top Deals', icon: 'flame' },
  { id: 'trending', label: 'Trending', icon: 'sparkles' },
  { id: 'freeShipping', label: 'Free Shipping', icon: 'truck' },
  { id: 'noFees', label: 'No Fees', icon: 'award' },
];

const SORT_LABELS: Record<string, string> = {
  '(EndTime:asc)': 'Ending Soon',
  '(EndTime:desc)': 'Ending Later',
  '(NextBid:asc)': 'Lowest Bid',
  '(NextBid:desc)': 'Highest Bid',
  '(RetailPrice:asc)': 'Price: Low→High',
  '(RetailPrice:desc)': 'Price: High→Low',
  '(CurrentBid:asc)': 'Current Bid: Low→High',
  '(CurrentBid:desc)': 'Current Bid: High→Low',
  '(ListedAt:desc)': 'Newly Listed',
};

interface OlabidPageProps {
  onOpenItem: (itemId: number) => void;
}

export function OlabidPage({ onOpenItem }: OlabidPageProps) {
  const [items, setItems] = useState<OlabidItem[]>([]);
  const [categories, setCategories] = useState<OlabidCategory[]>([]);
  const [warehouses, setWarehouses] = useState<OlabidWarehouse[]>([]);
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Filters — default All to match user request
  const [section, setSection] = useState<SectionFilter>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('(EndTime:asc)');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');

  const sectionActive = section !== '';
  const allWarehousesSelected =
    warehouses.length > 0 && selectedWarehouseIds.length === warehouses.length;

  const warehouseIdsParam = (ids: number[] = selectedWarehouseIds) =>
    ids.length > 0 ? ids.join(',') : undefined;

  const fetchMeta = async (): Promise<number[]> => {
    const [catRes, whRes] = await Promise.all([
      fetch(`${API_URL}/api/olabid/categories`, { cache: 'no-store' }),
      fetch(`${API_URL}/api/olabid/warehouses`, { cache: 'no-store' }),
    ]);

    if (catRes.ok) {
      setCategories(await catRes.json());
    }

    if (whRes.ok) {
      const data: OlabidWarehouse[] = await whRes.json();
      setWarehouses(data);
      const ids = data.map((w) => w.id);
      setSelectedWarehouseIds(ids);
      return ids;
    }

    return [];
  };

  const fetchItems = async (
    pageNum: number,
    opts?: {
      search?: string;
      section?: SectionFilter;
      categoryId?: string;
      sortBy?: string;
      minPrice?: string;
      maxPrice?: string;
      warehouseIds?: number[];
    }
  ) => {
    const nextSearch = opts?.search ?? activeSearch;
    const nextSection = opts?.section ?? section;
    const nextCategoryId = opts?.categoryId ?? categoryId;
    const nextSortBy = opts?.sortBy ?? sortBy;
    const nextMinPrice = opts?.minPrice ?? minPrice;
    const nextMaxPrice = opts?.maxPrice ?? maxPrice;
    const nextWarehouseIds = opts?.warehouseIds ?? selectedWarehouseIds;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        size: '20',
        _: String(Date.now()), // bust any intermediate caches
      });

      const wh = warehouseIdsParam(nextWarehouseIds);
      if (wh) params.set('warehouseIds', wh);

      if (nextSection) {
        params.set('filterBy', nextSection);
      } else {
        params.set('orderBy', nextSortBy);
        if (nextSearch) params.set('searchPattern', nextSearch);
        if (nextCategoryId) params.set('categoryIds', nextCategoryId);
        if (nextMinPrice) params.set('minRetailPrice', nextMinPrice);
        if (nextMaxPrice) params.set('maxRetailPrice', nextMaxPrice);
      }

      const response = await fetch(`${API_URL}/api/olabid/items?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch auction items');
      }

      const data: OlabidListResponse = await response.json();
      setItems(data.items);
      setPage(data.pageContext.page);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = searchQuery.trim();
    setActiveSearch(q);
    setSection('');
    setPage(1);
    fetchItems(1, { search: q, section: '' });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setActiveSearch('');
    setPage(1);
    // Return to All section after clearing search
    setSection('');
    fetchItems(1, { search: '', section: '' });
  };

  const handleSectionChange = (next: SectionFilter) => {
    setSection(next);
    setPage(1);
    if (next) {
      setActiveSearch('');
      setSearchQuery('');
    }
    fetchItems(1, { section: next, search: next ? '' : activeSearch });
  };

  const toggleWarehouse = (id: number) => {
    setSelectedWarehouseIds((prev) => {
      const exists = prev.includes(id);
      // Keep at least one warehouse selected
      if (exists && prev.length === 1) return prev;
      const next = exists ? prev.filter((w) => w !== id) : [...prev, id];
      setPage(1);
      fetchItems(1, { warehouseIds: next });
      return next;
    });
  };

  const selectAllWarehouses = () => {
    const ids = warehouses.map((w) => w.id);
    setSelectedWarehouseIds(ids);
    setPage(1);
    fetchItems(1, { warehouseIds: ids });
  };

  const clearFilters = () => {
    const ids = warehouses.map((w) => w.id);
    setSortBy('(EndTime:asc)');
    setMinPrice('');
    setMaxPrice('');
    setCategoryId('');
    setSection('');
    setSelectedWarehouseIds(ids);
    setPage(1);
    fetchItems(1, {
      sortBy: '(EndTime:asc)',
      minPrice: '',
      maxPrice: '',
      categoryId: '',
      section: '',
      warehouseIds: ids,
    });
  };

  useEffect(() => {
    (async () => {
      const ids = await fetchMeta();
      await fetchItems(1, { warehouseIds: ids, section: '' });
    })();
  }, []);

  // Refetch when list filters change (not used for sections)
  useEffect(() => {
    if (!hasLoaded || sectionActive) return;
    setPage(1);
    fetchItems(1);
  }, [sortBy, minPrice, maxPrice]);

  const formatTimeRemaining = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const calculateSavings = (retail: number, current: number): number => {
    if (current === 0) return 100;
    return Math.round(((retail - current) / retail) * 100);
  };

  const handleItemClick = (itemId: number) => {
    onOpenItem(itemId);
  };

  const categoryName = categories.find((c) => String(c.id) === categoryId)?.name;
  const hasActiveFilters =
    !!categoryId ||
    !!minPrice ||
    !!maxPrice ||
    sortBy !== '(EndTime:asc)' ||
    (warehouses.length > 0 && !allWarehousesSelected);

  const sectionIcon = (icon?: (typeof SECTIONS)[number]['icon']) => {
    switch (icon) {
      case 'flame':
        return <Flame className="h-3.5 w-3.5" />;
      case 'sparkles':
        return <Sparkles className="h-3.5 w-3.5" />;
      case 'truck':
        return <Truck className="h-3.5 w-3.5" />;
      case 'award':
        return <Award className="h-3.5 w-3.5" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-secondary/95 backdrop-blur-md border-b border-border">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-4">
            {/* Top Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
                  <Gavel className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Olabid Auctions</h1>
                  <p className="text-sm text-text-secondary">Live liquidation deals • Bid now!</p>
                </div>
              </div>
              <button
                onClick={() => fetchItems(page)}
                className="p-2.5 hover:bg-bg-tertiary rounded-xl transition-all hover:scale-105 active:scale-95"
                disabled={loading}
              >
                <RefreshCw className={`h-5 w-5 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Section chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {SECTIONS.map((s) => {
                const active = section === s.id;
                return (
                  <button
                    key={s.id || 'all'}
                    type="button"
                    onClick={() => handleSectionChange(s.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-sm font-medium transition-all ${
                      active
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md'
                        : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border'
                    }`}
                  >
                    {sectionIcon(s.icon)}
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search auctions... (e.g., juicer, laptop, toys)"
                  className="w-full pl-10 pr-10 py-3 bg-bg-tertiary border border-border rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                />
                {(searchQuery || activeSearch) && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-bg-primary rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4 text-text-tertiary hover:text-text-primary" />
                  </button>
                )}
              </div>
              {activeSearch && (
                <div className="mt-2 text-sm text-text-secondary">
                  Searching for: <span className="font-semibold text-text-primary">"{activeSearch}"</span>
                </div>
              )}
            </form>

            {/* Filters Toggle Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2.5 bg-bg-tertiary hover:bg-bg-primary border border-border rounded-xl transition-all text-text-primary font-medium"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                  ON
                </span>
              )}
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* Filters Panel */}
            {showFilters && (
              <div className="bg-bg-tertiary border border-border rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Category
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCategoryId(next);
                        setSection('');
                        setPage(1);
                        fetchItems(1, { categoryId: next, section: '' });
                      }}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">All Categories</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={String(cat.id)}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sort By */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Sort By
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      disabled={sectionActive}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                    >
                      <option value="(EndTime:asc)">Ending Soon</option>
                      <option value="(EndTime:desc)">Ending Later</option>
                      <option value="(NextBid:asc)">Lowest Bid</option>
                      <option value="(NextBid:desc)">Highest Bid</option>
                      <option value="(RetailPrice:asc)">Price: Low to High</option>
                      <option value="(RetailPrice:desc)">Price: High to Low</option>
                      <option value="(CurrentBid:asc)">Current Bid: Low to High</option>
                      <option value="(CurrentBid:desc)">Current Bid: High to Low</option>
                      <option value="(ListedAt:desc)">Newly Listed</option>
                    </select>
                  </div>

                  {/* Min Price */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Min Retail Price
                    </label>
                    <input
                      type="number"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      placeholder="$0"
                      min="0"
                      disabled={sectionActive}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Max Price */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Max Retail Price
                    </label>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder="$1000+"
                      min="0"
                      disabled={sectionActive}
                      className="w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Clear Filters Button */}
                  <div className="flex items-end">
                    <button
                      onClick={clearFilters}
                      className="w-full px-4 py-2 bg-bg-secondary hover:bg-bg-primary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-all font-medium"
                    >
                      Clear Filters
                    </button>
                  </div>
                </div>

                {/* Warehouses */}
                {warehouses.length > 0 && (
                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-amber-500" />
                        Warehouses
                      </label>
                      {!allWarehousesSelected && (
                        <button
                          type="button"
                          onClick={selectAllWarehouses}
                          className="text-xs font-medium text-amber-600 hover:text-amber-500"
                        >
                          Select all
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {warehouses.map((wh) => {
                        const active = selectedWarehouseIds.includes(wh.id);
                        return (
                          <button
                            key={wh.id}
                            type="button"
                            onClick={() => toggleWarehouse(wh.id)}
                            title={`${wh.street}, ${wh.city}, ${wh.state} ${wh.zipCode}`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                              active
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400'
                                : 'bg-bg-secondary border-border text-text-tertiary hover:text-text-secondary'
                            }`}
                          >
                            {wh.name}
                            <span className="ml-1 opacity-70">({wh.city})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Filters Summary */}
                {hasActiveFilters && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <span className="text-xs text-text-secondary">Active filters:</span>
                    {sectionActive && (
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-md text-xs font-medium">
                        {SECTIONS.find((s) => s.id === section)?.label}
                      </span>
                    )}
                    {categoryName && !sectionActive && (
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-md text-xs font-medium">
                        {categoryName}
                      </span>
                    )}
                    {!sectionActive && minPrice && (
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-md text-xs font-medium">
                        Min: ${minPrice}
                      </span>
                    )}
                    {!sectionActive && maxPrice && (
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-md text-xs font-medium">
                        Max: ${maxPrice}
                      </span>
                    )}
                    {!sectionActive && sortBy !== '(EndTime:asc)' && (
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-md text-xs font-medium">
                        {SORT_LABELS[sortBy] || 'Custom'}
                      </span>
                    )}
                    {!allWarehousesSelected && (
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-md text-xs font-medium">
                        {selectedWarehouseIds.length} warehouse
                        {selectedWarehouseIds.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
            <p className="text-red-500 text-sm font-medium">{error}</p>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="bg-bg-secondary rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-square bg-bg-tertiary" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-bg-tertiary rounded w-3/4" />
                  <div className="h-3 bg-bg-tertiary rounded w-1/2" />
                  <div className="h-6 bg-bg-tertiary rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-text-secondary">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-text-primary">No auctions found</p>
            <p className="text-sm mt-1">Try a different section, category, or search.</p>
          </div>
        ) : (
          <>
            {/* Items Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
              {items.map((item) => {
                const savings = calculateSavings(item.retailPrice, item.currentBidAmount);
                const hasBids = item.currentBidAmount > 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className="bg-bg-secondary rounded-xl overflow-hidden hover:ring-2 hover:ring-amber-500 transition-all group cursor-pointer hover:scale-[1.02] active:scale-[0.98] text-left"
                  >
                    {/* Image */}
                    <div className="aspect-square bg-bg-tertiary relative overflow-hidden">
                      {item.previewBlobUrl ? (
                        <img
                          src={item.previewBlobUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-16 w-16 text-text-tertiary opacity-50" />
                        </div>
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
                        {savings >= 50 && (
                          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {savings}% OFF
                          </div>
                        )}

                        {item.isWithoutFees && (
                          <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1 ml-auto">
                            <Award className="h-3 w-3" />
                            NO FEES
                          </div>
                        )}
                      </div>

                      {/* Bottom Badges */}
                      <div className="absolute bottom-2 left-2 right-2 flex gap-1.5">
                        {item.shippingIsFree && (
                          <div className="bg-emerald-600/90 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            Free Ship
                          </div>
                        )}
                        {item.shippingIsUnavailable && (
                          <div className="bg-black/80 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            Pickup Only
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="p-4">
                      <h3 className="text-sm font-medium text-text-primary line-clamp-2 mb-3 min-h-[2.5rem] leading-tight">
                        {item.name}
                      </h3>

                      {/* Pricing */}
                      <div className="space-y-2 mb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                              ${item.currentBidAmount}
                            </span>
                            {item.retailPrice > 0 && (
                              <span className="text-xs text-text-tertiary line-through">
                                ${item.retailPrice}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">
                            Next bid: <span className="font-semibold text-text-primary">${item.nextBidAmount}</span>
                          </span>
                          {hasBids && (
                            <span className="text-amber-600 font-medium">
                              {item.currentBidderId ? 'Active' : 'No bids'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Time Remaining */}
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-bg-tertiary rounded-lg">
                        <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        <span className="text-xs font-medium text-text-secondary">
                          Ends in {formatTimeRemaining(item.auctionFinishesInMs)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-3 pb-8">
              <button
                onClick={() => fetchItems(page - 1)}
                disabled={page === 1 || loading}
                className="px-6 py-3 bg-bg-secondary text-text-primary rounded-xl hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium hover:scale-105 active:scale-95 disabled:hover:scale-100"
              >
                Previous
              </button>
              <span className="text-text-secondary text-sm font-medium px-4 py-3 bg-bg-secondary rounded-xl">
                Page {page}
              </span>
              <button
                onClick={() => fetchItems(page + 1)}
                disabled={loading || items.length < 20}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium hover:scale-105 active:scale-95 disabled:hover:scale-100 shadow-lg"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
