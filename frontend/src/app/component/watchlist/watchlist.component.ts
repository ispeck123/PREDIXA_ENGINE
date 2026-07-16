import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';
import { WebSocketService } from 'src/app/services/web-socket.service';
import Swal from 'sweetalert2';

type WatchlistWsResponse = {
  total_stocks: number;
  page_no: number;
  stocks: any[];
  msg?: string;
  message?: string;
};

@Component({
  selector: 'app-watchlist',
  templateUrl: './watchlist.component.html',
  styleUrls: ['./watchlist.component.css']
})
export class WatchlistComponent {
  activeMenu: string = 'stock';

  private wlSub?: Subscription;
  private lastRequestKey = '';
  private autoLocateOnce = false;
  private searchTimer: any = null;

  @ViewChildren('wlRow') wlRows!: QueryList<ElementRef<HTMLElement>>;

  errorMsg = '';
  isNoData = false;
  isLoading = true;

  searchText = '';
  serverSearchKey = '';

  WatchlistData: any[] = [];
  totalStocks = 0;

  pageNo = 1;
  pageSize = 10;
  totalPages = 1;

  sortKey: 'stock' | 'price' | 'day_change_percentage' = 'stock';
  sortDir: 'asc' | 'desc' = 'asc';

  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  UserId: any;
  countryId: any;

  jumpToPageInput = '';

  constructor(
    private toastr: ToastrService,
    private webSocketService: WebSocketService,
    private router: Router,
    private apiService: ApiService
  ) {}

  ngOnInit(): void {
    this.UserId = localStorage.getItem('UserId');
    this.countryId = localStorage.getItem('selectedCountryId');
    this.Role = localStorage.getItem('role');
    this.isAdmin = this.Role === 'admin';
    this.UserName = localStorage.getItem('UserName');

    this.connectWatchListWebsocket();
  }

  ngOnDestroy(): void {
    this.wlSub?.unsubscribe();
    this.disconnectWebSocket();
    clearTimeout(this.searchTimer);
  }

  disconnectWebSocket(): void {
    this.webSocketService.disconnectWatchlistSocket?.();
  }

  connectWatchListWebsocket(): void {
    this.isLoading = true;

    this.wlSub?.unsubscribe();
    this.disconnectWebSocket();

    const key = (this.serverSearchKey || '').trim();

    // only send null page on first search hit, so backend can auto-locate the page
    const pageToSend: any = key && this.autoLocateOnce ? null : this.pageNo;

    this.webSocketService.connectWatchlist(
      this.UserId,
      this.countryId,
      'NSE',
      pageToSend,
      this.pageSize,
      key
    );

    const requestKey = `${this.UserId}|${this.countryId}|NSE|${pageToSend}|${this.pageSize}|${key}`;
    this.lastRequestKey = requestKey;

    this.wlSub = this.webSocketService.getWatchlistData().subscribe({
      next: (data: any) => {
        if (this.lastRequestKey !== requestKey) return;

        this.errorMsg = '';
        this.isNoData = false;

        let ws: WatchlistWsResponse | null = null;

        try {
          ws = JSON.parse(data);
        } catch (e) {
          const s = String(data || '').toLowerCase();
          if (s.includes('error')) {
            this.handleNoDataState(key ? 'No data found for your search.' : 'No watchlist found.');
          }
          return;
        }

        const msg = String(ws?.msg || ws?.message || '').toLowerCase();
        if (msg.includes('error fetching stock price') || msg.includes('error')) {
          this.handleNoDataState(key ? 'No data found for your search.' : 'No watchlist found.');
          return;
        }

        this.pageNo = this.toNumber(ws?.page_no) || 1;
        this.totalStocks = this.toNumber(ws?.total_stocks);
        this.totalPages = Math.max(1, Math.ceil(this.totalStocks / this.pageSize));

        const raw = Array.isArray(ws?.stocks) ? ws!.stocks : [];

        this.WatchlistData = raw.map((item: any) => ({
          ...item,
          day_change_percentage: this.toNumber(item?.day_change_percentage),
          day_change: this.normalizeChangeText(item?.day_change),
          __highlight: false
        }));

        // Always re-apply current sort after websocket response
        this.applyClientSideSort();

        // Then apply highlight based on current search
        this.applyHighlightForSearch();

        // Then scroll
        this.scrollToHighlight();

        if (!this.WatchlistData.length) {
          this.isNoData = true;
          this.errorMsg = key ? 'No data found for your search.' : 'No watchlist found.';
        }

        if (key && this.autoLocateOnce) {
          this.autoLocateOnce = false;
        }

        this.isLoading = false;
      },
      error: () => {
        this.handleNoDataState(key ? 'No data found for your search.' : 'No watchlist found.');
      }
    });
  }

  private handleNoDataState(message: string): void {
    this.WatchlistData = [];
    this.totalStocks = 0;
    this.totalPages = 1;
    this.isNoData = true;
    this.errorMsg = message;
    this.isLoading = false;
  }

  private applyClientSideSort(): void {
    const arr = [...this.WatchlistData];

    arr.sort((a, b) => {
      const dir = this.sortDir === 'asc' ? 1 : -1;
      const k = this.sortKey;

      const av =
        k === 'stock'
          ? String(a?.stock ?? '').toLowerCase()
          : this.toNumber(a?.[k]);

      const bv =
        k === 'stock'
          ? String(b?.stock ?? '').toLowerCase()
          : this.toNumber(b?.[k]);

      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }

      return (Number(av) - Number(bv)) * dir;
    });

    this.WatchlistData = arr;
  }

  // private applyClientSideSort(): void {
  //   const arr = [...this.WatchlistData];
  //   const searchKey = (this.serverSearchKey || '').trim().toLowerCase();

  //   const getSearchRank = (stock: any): number => {
  //     if (!searchKey) return 999;

  //     const name = String(stock?.stock ?? '').toLowerCase();

  //     if (name === searchKey) return 0;          // highest priority
  //     if (name.startsWith(searchKey)) return 1;  // second priority
  //     if (name.includes(searchKey)) return 2;    // third priority

  //     return 999;
  //   };

  //   arr.sort((a, b) => {
  //     const aRank = getSearchRank(a);
  //     const bRank = getSearchRank(b);

  //     // first sort by search priority
  //     if (aRank !== bRank) {
  //       return aRank - bRank;
  //     }

  //     // then apply existing column sort
  //     const dir = this.sortDir === 'asc' ? 1 : -1;
  //     const k = this.sortKey;

  //     const av =
  //       k === 'stock'
  //         ? String(a?.stock ?? '').toLowerCase()
  //         : this.toNumber(a?.[k]);

  //     const bv =
  //       k === 'stock'
  //         ? String(b?.stock ?? '').toLowerCase()
  //         : this.toNumber(b?.[k]);

  //     if (typeof av === 'string' && typeof bv === 'string') {
  //       return av.localeCompare(bv) * dir;
  //     }

  //     return (Number(av) - Number(bv)) * dir;
  //   });

  //   this.WatchlistData = arr;
  // }

  // private applyHighlightForSearch(): void {
  //   const key = (this.serverSearchKey || '').trim().toLowerCase();

  //   // clear previous highlight without removing rows
  //   this.WatchlistData = this.WatchlistData.map((item: any) => ({
  //     ...item,
  //     __highlight: false
  //   }));

  //   if (!key) return;

  //   let bestIndex = this.WatchlistData.findIndex((x: any) =>
  //     String(x?.stock || '').toLowerCase() === key
  //   );

  //   if (bestIndex < 0) {
  //     bestIndex = this.WatchlistData.findIndex((x: any) =>
  //       String(x?.stock || '').toLowerCase().startsWith(key)
  //     );
  //   }

  //   if (bestIndex < 0) {
  //     bestIndex = this.WatchlistData.findIndex((x: any) =>
  //       String(x?.stock || '').toLowerCase().includes(key)
  //     );
  //   }

  //   if (bestIndex >= 0) {
  //     this.WatchlistData[bestIndex].__highlight = true;
  //   }
  // }

  private applyHighlightForSearch(): void {
    const key = (this.serverSearchKey || '').trim().toLowerCase();

    this.WatchlistData = this.WatchlistData.map((item: any) => ({
      ...item,
      __highlight: false
    }));

    if (!key) return;

    let bestIndex = -1;

    // 1. exact match
    bestIndex = this.WatchlistData.findIndex((x: any) =>
      String(x?.stock || '').toLowerCase() === key
    );

    // 2. startsWith match
    if (bestIndex < 0) {
      bestIndex = this.WatchlistData.findIndex((x: any) =>
        String(x?.stock || '').toLowerCase().startsWith(key)
      );
    }

    // 3. contains match anywhere
    if (bestIndex < 0) {
      bestIndex = this.WatchlistData.findIndex((x: any) =>
        String(x?.stock || '').toLowerCase().includes(key)
      );
    }

    if (bestIndex >= 0) {
      this.WatchlistData[bestIndex].__highlight = true;
    }
  }

  private scrollToHighlight(): void {
    if (!this.serverSearchKey) return;

    setTimeout(() => {
      const rows = this.wlRows?.toArray() || [];
      if (!rows.length) return;

      const idx = this.WatchlistData.findIndex((x: any) => x.__highlight);
      if (idx < 0) return;

      const el = rows[idx]?.nativeElement;
      if (!el) return;

      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

      el.classList.add('wl-pulse');
      setTimeout(() => {
        el.classList.remove('wl-pulse');
      }, 900);
    }, 80);
  }

  toNumber(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

    const s = String(val).trim();
    if (!s) return 0;

    const cleaned = s.replace(/%/g, '').replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  normalizeChangeText(v: any): string {
    const s = String(v ?? '').trim();
    return s || '-';
  }

  getChangeClass(stock: any): string {
    const pct = this.toNumber(stock?.day_change_percentage);
    if (pct > 0) return 'up';
    if (pct < 0) return 'down';
    return 'flat';
  }

  // pagination
  goToPage(p: number): void {
    const next = Math.min(Math.max(1, p), this.totalPages);
    if (next === this.pageNo) return;

    this.pageNo = next;
    this.connectWatchListWebsocket();
  }

  nextPage(): void {
    this.goToPage(this.pageNo + 1);
  }

  prevPage(): void {
    this.goToPage(this.pageNo - 1);
  }

 changePageSize(size: number): void {
  const newSize = Number(size) || 10;

  if (newSize === this.pageSize) return;

  this.pageSize = newSize;
  this.pageNo = 1;

  // keep current sort state, just reload data
  this.connectWatchListWebsocket();
}

  getVisiblePages(): (number | '...')[] {
    const total = this.totalPages;
    const current = this.pageNo;

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: (number | '...')[] = [];
    const add = (p: number | '...') => pages.push(p);

    add(1);

    if (current > 4) add('...');

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let p = start; p <= end; p++) {
      add(p);
    }

    if (current < total - 3) add('...');

    add(total);

    return pages;
  }

  jumpToPage(): void {
    const n = Number(String(this.jumpToPageInput).trim());
    if (!Number.isFinite(n)) return;

    this.goToPage(n);
    this.jumpToPageInput = '';
  }

  onPageClick(p: number | '...'): void {
    if (p === '...') return;
    this.goToPage(p);
  }

  onSearchChange(): void {
    clearTimeout(this.searchTimer);

    this.searchTimer = setTimeout(() => {
      const key = (this.searchText || '').trim();

      if (!key) {
        this.serverSearchKey = '';
        this.autoLocateOnce = false;
        this.pageNo = 1;
        this.connectWatchListWebsocket();
        return;
      }

      this.serverSearchKey = key;
      this.autoLocateOnce = true;
      this.pageNo = 1;
      this.connectWatchListWebsocket();
    }, 350);
  }

  toggleSort(key: 'stock' | 'price' | 'day_change_percentage'): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'asc';
    }

    this.applyClientSideSort();
    this.applyHighlightForSearch();
    this.scrollToHighlight();
  }

  ViewAnalytics(stock_tick: any): void {
    this.router.navigate(['chart_analytics', stock_tick.toLowerCase()]);
  }

  removeFromWatchlist(watchlist_id: any, stockName?: string): void {
    Swal.fire({
      title: 'Remove from Watchlist?',
      html: `<div style="font-size:13px;color:#6b7280;margin-top:6px;">
              ${stockName ? `<b>${stockName}</b><br/>` : ''}
              This will remove the stock from your watchlist.
            </div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, remove',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
      buttonsStyling: false,
      customClass: {
        popup: 'swal-pro-popup',
        title: 'swal-pro-title',
        confirmButton: 'swal-pro-confirm',
        cancelButton: 'swal-pro-cancel',
        actions: 'swal-pro-actions'
      }
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.apiService.removeFromWatchlist(watchlist_id).subscribe({
        next: (resp: any) => {
          if (resp?.msg === 'success') {
            this.toastr.success('Removed!');
            this.connectWatchListWebsocket();
          } else {
            this.toastr.error('Failed!');
          }
        },
        error: () => {
          this.toastr.error('Failed!');
        }
      });
    });
  }

  clearSearch(): void {
    this.searchText = '';
    this.serverSearchKey = '';
    this.autoLocateOnce = false;

    this.errorMsg = '';
    this.isNoData = false;

    this.pageNo = 1;
    this.jumpToPageInput = '';

    this.connectWatchListWebsocket();
  }
}