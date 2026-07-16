import { ChangeDetectorRef, Component, ElementRef, HostListener, QueryList, ViewChildren } from '@angular/core';
import { ActivatedRoute, RouteConfigLoadEnd, Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { RectangleDrawingTool } from './rectangle-drawing-tool';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { fromEvent, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, map } from 'rxjs/operators';


@Component({
  selector: 'app-index-stock-list',
  templateUrl: './index-stock-list.component.html',
  styleUrls: ['./index-stock-list.component.css']
})
export class IndexStockListComponent {

  orders: any;
  order_id: any;
  ChartRESPONSE: any;
  private areaSeries: any;
  private candlestickSeries: any;
  xspan: any;
  rectangleTool: any;
  toolTipData: any;
  Open: any;
  High: any;
  Low: any;
  Close: any;
  CandleColor: any;
  ModalHeader: any;
  chart: any;
  SelectedStockName: any;
  private buylineSeries: any;
  private targetlineSeries: any;
  private stoplosslineSeries: any;
  Order_Status: any;
  status: any;
  timestampInSeconds_completed: any
  finData: any;
  selectedOptions: any = {
    base_candle: false,
    buy_sell_zone: false,
    bad_zone: false,
    setup: false,
    overlap_evaluate: false,
    overlap_analyze: false
  };
  showmsg: any;
  ModelPrediction: any;
  AllZonesData: any;
  FullScreenModeValue: any;
  BaseCandleData: any;
  BuyZoneData: any;
  SellZoneData: any;
  BadZoneData: any;
  BuyOverlayData: any;
  SellOverlayData: any;
  dropdownShow: any;
  suggestion: any;
  OverLayCandleData: any;
  lastTime: any;
  purchased_date: any;
  entry_timestamp: any;
  completed_on: any;
  entry_price: any;
  stoploss_price: any;
  target_price: any;
  order_type: any;
  buyZoneMarkers: any = [];
  QualifiedData: any;
  setupData: any;
  isMaximized = false;
  selected: any;
  alwaysShowCalendars: boolean;
  today: any;
  sevenDaysAgo: any;
  searchDataForm: FormGroup;
  stockData: any;
  candles: { color: string; height: number, wickHeight: number }[] = [];
  colorInterval: any;
  SpinnerCounter: any = 0;
  IsLoadingVisible: boolean = false;
  currentPostIndex = 0;
  allData: any;
  barReplaytimestampInSeconds_entry: any;
  barReplaytimestampInSeconds_completed: any;
  barReplayorder_type: any;
  ReplayFlag = false;
  selectedOrderId: any;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  Index_Id: any;
  listData: any[] = [];
  filteredListData: any[] = [...this.listData];
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  UserId: any;
  WatchlistData: any;
  watchlistIds: any;
  watchlistMap: { [stock_id: number]: number } = {}; // Initialize as empty object
  currentPage: any=1;
  itemsPerPage: number = 10; // default
  totalCount: any;
  searchText: string = '';
  searchSubject = new Subject<string>();
  highlightedStockName: string = '';
  private keySub!: Subscription;
  highlightedStockTick: string = '';
  MatchedCount: number = 0;
  pageSize = 10;
  pageSizeOptions = [10, 25, 50, 100];
  TotalCount: any = 0;
  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  highlightedStockNames: string[] = [];



  constructor(private cdr: ChangeDetectorRef, private webSocketService: WebSocketService, private route: ActivatedRoute, private cdRef: ChangeDetectorRef, private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService,) { }


  ngOnInit(): void {
    this.webSocketService.disconnectListParam();
    const id = this.route.snapshot.paramMap.get('id');
    this.Index_Id = id;
    console.log('Received ID:', id);
    this.Role = localStorage.getItem('role');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.UserId = localStorage.getItem('UserId');
    this.getStockDataByIndex(false);
    this.PrepDebounce();

  }

  PrepDebounce() {
    this.searchSubject.pipe(
      debounceTime(400)
    ).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchText = trimmed;
      this.currentPage = null;
      this.getStockDataByIndex(true);
    });
  }

  getStockDataByIndex(highlight: boolean = false) {
    // this.filteredListData = [];
    this.webSocketService.disconnectStockByIndex();
    this.IsLoadingVisible = true;

    this.webSocketService.StockByIndexParam({
      index_id: this.Index_Id,
      page: this.currentPage,
      offset: this.pageSize,
      IndexName: "NSE",
      searchKey: this.searchText,
      userId:  this.UserId
    });

    this.webSocketService.StockByIndexMessageParam().subscribe((data) => {
      console.log('📥 Received WebSocket data:', data);
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

        this.filteredListData = parsedData.stocks || [];
        console.log(" this.filteredListData", this.filteredListData)
        this.totalCount = parsedData.total_stocks || 0;
        this.applySorting();
        this.IsLoadingVisible = false;
        // this.getWatchlistData()

        if (highlight && this.searchText) {
          const lowerSearch = this.searchText.trim().toLowerCase();

          const matches = this.filteredListData.filter((item: { stock: string }) =>
            item.stock?.toLowerCase().includes(lowerSearch)
          );

          this.MatchedCount = matches.length;
          this.highlightedStockNames = matches.map(item => item.stock);

          if (matches.length > 0) {
            const firstMatchName = matches[0].stock;

            setTimeout(() => {
              const target = this.stockCells.find(cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === firstMatchName.toLowerCase()
              );

              if (target) {
                this.currentPage=parsedData.page_no
                target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          } else {
            this.highlightedStockNames = [];
          }
        } else {
          this.highlightedStockNames = [];
          this.MatchedCount = 0;
        }

      } catch (error) {
        console.error("Error parsing WebSocket data:", error);
        this.filteredListData = [];
        this.IsLoadingVisible = false;
      }
    });
  }

  isHighlighted(stockName: string): boolean {
    return this.highlightedStockNames
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  ngOnDestroy() {
    if (this.keySub) {
      this.keySub.unsubscribe();
    }
  }

  stock_screener() {
    this.router.navigate(['home']);
  }

  dashboard() {
    this.router.navigate(['dashboard']);
  }

  alerts() {
    this.router.navigate(['alerts']);
  }

  logout() {
    this.router.navigate(['landing']);
  }

  autoorders() {
    this.router.navigate(['auto-order-list']);
  }

  orderss() {
    this.router.navigate(['orderlist']);
  }

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  news() {
    this.router.navigate(['news']);
  }

  ViewOrderList() {
    this.router.navigate(['orderlist']);
  }

  home() {
    this.router.navigate(['home']);
  }

  autoorderlist() {
    this.router.navigate(['auto-order-list']);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }


  getTextColor(value: any): string {
    if (!value) return ''; // Handle null or undefined cases

    let cleanedValue = value.toString().match(/-?\d+(\.\d+)?/); // Extract only the number (including decimals)
    let numericValue = cleanedValue ? Number(cleanedValue[0]) : NaN;
    return isNaN(numericValue) ? '' : (numericValue < 0 ? 'text-danger' : 'text-success');
  }

  // stockDataFunc(index_id: any, page: number = this.currentPage) {
  //   this.listData = [];
  //   this.filteredListData = [];
  //   this.webSocketService.disconnectListParam();
  //   this.IsLoadingVisible = true;

  //   const selectedCountry = localStorage.getItem('selectedCountryName');

  //   this.webSocketService.listindexParam({
  //     index_id,
  //     page,
  //     offset: this.itemsPerPage,
  //     selectedCountry
  //   });

  //   this.webSocketService.getListMessageParam().subscribe((data) => {
  //     if (!data) {
  //       console.warn("No data received");
  //       this.IsLoadingVisible = false;
  //       return;
  //     }

  //     try {
  //       const parsedData = typeof data === "string" ? JSON.parse(data) : data;
  //       this.totalCount = parsedData.total_count;
  //       const stockData = parsedData.price_response;

  //       this.listData = Object.keys(stockData).map((key) => ({
  //         name: key,
  //         ...stockData[key],
  //       }));

  //       // ✅ Preserve the current search filter
  //       const searchTerm = this.searchText?.trim().toLowerCase() || '';
  //       if (searchTerm) {
  //         this.filteredListData = this.listData.filter(item =>
  //           item.name.toLowerCase().startsWith(searchTerm)
  //         );
  //       } else {
  //         this.filteredListData = [...this.listData];
  //       }

  //       console.log("object", this.listData);

  //     } catch (error) {
  //       console.error("Error parsing WebSocket data:", error);
  //     }

  //     this.IsLoadingVisible = false;
  //     this.getWatchlistData();
  //   });
  // }

  // getWatchlistData() {
  // this.apiService.getWatchlistService(this.UserId, localStorage.getItem('selectedCountryId')).subscribe((res: any) => {
  //   if (res.msg === "success" && Array.isArray(res.response?.watchlist)) {
  //     this.WatchlistData = res.response.watchlist;
  //     this.watchlistMap = {};
  //     console.log("Watchlist Data", this.WatchlistData);
  //     for (const item of this.WatchlistData) {
  //       this.watchlistMap[item.stock_id] = item.watchlist_id;
  //     }

  //     this.cdr.detectChanges(); 
  //   }
  // });
  // }

  ViewAnalytics(stock_tick: any) {
    this.router.navigate(['chart_analytics', stock_tick.toLowerCase()]);
  }

  addToWatchlist(Stock_Id: any) {
    let obj = {
      user_id: localStorage.getItem('UserId'),
      stock_id: Stock_Id,
      country: localStorage.getItem('selectedCountryId'),
    }
    console.log("WATCHLIST SEND DATA", obj);
    this.apiService.AddToWatchListService(obj).subscribe((res: any) => {
      console.log(res);
      if (res.msg == "success") {
        this.getStockDataByIndex(false)
        this.toastr.success('Added to Watchlist');
      }
      else {
        this.toastr.error('Already Added to Watchlist');
      }
    })
  }

  removeFromWatchlist(watchlist_id: any) {
    this.apiService.removeFromWatchlist(watchlist_id).subscribe(resp => {
      console.log(resp);
      if (resp.msg == "success") {
        this.toastr.success("Removed !")
      }
      else {
        this.toastr.error("Failed !")
      }
    })
  }

  get totalPages(): number {
    return this.itemsPerPage > 0 ? Math.ceil(this.totalCount / this.itemsPerPage) : 1;
  }

  sortData(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.applySorting(); // Apply to already received data
  }

  applySorting() {
  if (!this.sortColumn) return;

  this.filteredListData.sort((a, b) => {
    let valA = a[this.sortColumn];
    let valB = b[this.sortColumn];

    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    const isNumeric = !isNaN(numA) && !isNaN(numB);

    if (isNumeric) {
      valA = numA;
      valB = numB;
    } else {
      valA = valA?.toString().toLowerCase();
      valB = valB?.toString().toLowerCase();
    }

    if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  }


  goToNextPage() {
    const totalPages = this.getTotalPages();
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.getStockDataByIndex(true);
    }
  }

  goToPreviousPage() {
    this.currentPage--;
    this.getStockDataByIndex(true);
  }

  getTotalPages(): number {
    const total = this.totalCount || 0;
    return Math.ceil(total / this.pageSize);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const currentPage = this.getCurrentPage();

    const maxVisible = 5;
    let startPage = Math.max(currentPage - Math.floor(maxVisible / 2), 1);
    let endPage = Math.min(startPage + maxVisible - 1, totalPages);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(endPage - maxVisible + 1, 1);
    }

    const pageNumbers: number[] = [];
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return pageNumbers;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.getStockDataByIndex(true);
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.getStockDataByIndex(true);
  }

  onSearchInput(value: string) {
    this.searchSubject.next(value);
  }


}

