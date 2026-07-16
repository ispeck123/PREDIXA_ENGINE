import { Component, ElementRef, HostListener, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { createChart, CrosshairMode } from 'lightweight-charts';
import moment from 'moment';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';
import { RectangleDrawingTool } from './rectangle-drawing-tool';
import { WebSocketService } from 'src/app/services/web-socket.service';


@Component({
  selector: 'app-bucket-orders',
  templateUrl: './bucket-orders.component.html',
  styleUrls: ['./bucket-orders.component.css']
})
export class BucketOrdersComponent implements OnInit {

  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  Role: any;
  isAdmin: any;
  UserName: any;
  pageSize = 10;
  SelectedCountryId: any;
  SelectedCountryName: any;
  selectedDateRange: any;
  StartDate: any;
  EndDate: any
  showmsg: any;
  colorInterval: any;
  searchText: string = '';
  predictionFilter: any = null;
  statusFilter: any = null;
  selectTradeType: any = "all";
  isChecked: boolean = true;
  SearchDebounceFlag: boolean = false;
  timeframe_forOrderList: any = null;
  searchSubject: Subject<string> = new Subject<string>();
  candles: { color: string; height: number, wickHeight: number }[] = [];
  AllbucketListOrders: any;
  isPopupOpen = false;
  activeTab: string = 'Stocks'; // Default tab
  SelectedStockName: any;
  ModalHeader: any;
  SelectedExpiry: any;
  CandleColor: any;
  Open: any;
  High: any;
  Low: any;
  Close: any;
  dropdownShow: any;
  chart: any;
  FullScreenModeValue: any;
  FullChartResponse: any;
  allData: any;
  preBars: any;
  postBars: any;
  reasons: string[] = [];
  QualifiedZoneFlag = false;
  ViewGraphTimeFrame: any;
  ModelPrediction: any;
  ReplayFlag = false;
  entry_price: any;
  stoploss_price: any;
  target_price: any;
  order_type: any;
  selectedOrderId: any;
  RRR: any;
  SpinnerCounter: any = 0;
  ChartRESPONSE: any;
  timestampInSeconds_completed: any
  SETUPREQ = true;
  purchased_date: any;
  entry_timestamp: any;
  completed_on: any;
  finData: any;
  activeMenu: string = 'Success';
  activeMenuCommodity: string = 'Success';
  activeMenuFuture: string = 'Success';
  today: any;
  xspan: any;
  sevenDaysAgo: any;
  searchDataForm: FormGroup;
  // successPage: string = "1";
  successPage: number = 1;
  SuccessCount: number = 0;
  pageSizeOptions = [2,10, 25, 50, 100, 500];
  lastCMPLine: any = null;
  rectangleTool: any;
  UserID: any;
  toolTipData: any;
  lastTime: any;
  UpdateCnadleStockId: any;
  realTimePrice: any;
  lastBar: any;
  PreviousHighData: any;
  selectedOptions: any = {
    base_candle: false,
    buy_sell_zone: false,
    bad_zone: false,
    setup: false,
    overlap_evaluate: false,
    overlap_analyze: false
  };
   AllZonesData: any;
  BaseCandleData: any;
  BuyZoneData: any;
  SellZoneData: any;
  BadZoneData: any;
  BuyOverlayData: any;
  SellOverlayData: any;
  suggestion: any;
  OverLayCandleData: any;
  QualifiedData: any;
  OptimizedBuySellZoneData: any;
  TotalCount: any = 0;
  successOrders: any;
  highlightedStockTick: string = '';
  MatchedCount: number = 0;
  highlightedTradeId: any=null;
  highlightedIndex: number = -1;
  highlightedStockNames: string[] = [];
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';


  ranges: any = {
    'All': [moment('2019-01-01'), moment()],
    'Today': [moment(), moment()],
    'Last 7 Days': [moment().subtract(6, 'days'), moment()],
    'Last 15 Days': [moment().subtract(14, 'days'), moment()],
    'This Month': [moment().startOf('month'), moment().endOf('month')],
    'Last 3 Months': [moment().subtract(3, 'months').startOf('month'), moment().subtract(1, 'month').endOf('month')], // Last 3 months excluding current month
    'Last 6 Months': [moment().subtract(6, 'months').startOf('month'), moment().subtract(1, 'month').endOf('month')]
  }

  invalidDates: moment.Moment[] = [moment().add(2, 'days'), moment().add(3, 'days'), moment().add(5, 'days')];
  isInvalidDate = (m: moment.Moment) => {
    return this.invalidDates.some(d => d.isSame(m, 'day'))
  }

  private searchSubscription: Subscription;
  constructor(private webSocketService: WebSocketService, private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService) { }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const clickedInsidePopup = (event.target as HTMLElement).closest('.filter-popup');
    const clickedOnButton = (event.target as HTMLElement).closest('.filter-btn');

    if (!clickedInsidePopup && !clickedOnButton) {
      this.isPopupOpen = false;
    }
  }

  togglePopup(event: MouseEvent) {
    event.stopPropagation(); // prevent immediate close
    this.isPopupOpen = !this.isPopupOpen;
  }


  cleanup(): void {
    if (this.chart) {
      this.chart.remove();
    }
  }

  shiftChart(diff: any) {
    const currentPos = this.chart.timeScale().scrollPosition();
    this.chart.timeScale().scrollToPosition(currentPos + diff, false);
  }

  scaleChart(pct: any, zoomIn: any) {
    const currentRange = this.chart.timeScale().getVisibleLogicalRange();
    if (currentRange) {
      const bars = currentRange.to - currentRange.from;
      const direction = zoomIn ? -1 : 1;
      const newRangeBars = bars * pct * direction + bars;
      this.chart.timeScale().setVisibleLogicalRange({
        to: currentRange.to,
        from: currentRange.to - newRangeBars,
      });
    }
  }

  private buildForm() {
    this.today = new Date();
    this.sevenDaysAgo = new Date();
    this.sevenDaysAgo.setDate(this.today.getDate() - 7);
    this.searchDataForm = new FormGroup({
      tick: new FormControl(""),
      selected: new FormControl({
        startDate: moment().subtract(1900, 'days'),
        endDate: moment()
      })
    });
  }

  ngOnDestroy(): void {
    this.disconnectWebSocket();
  }

  disconnectWebSocket(): void {
    this.webSocketService.disconnectStock();
  }

  ngOnInit(): void {
    this.timeframe_forOrderList = null;
    this.SelectedCountryId = localStorage.getItem('selectedCountryId')
    this.SelectedCountryName = localStorage.getItem('selectedCountryName')
    this.selectedDateRange = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.Role = localStorage.getItem('role');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.UserID = localStorage.getItem('UserId');
    this.buildForm();
    this.getAllBucketListOrders(false);
    this.PrepDebounce();
    this.xspan = 3600;
    // this.stockDataFunc();
    this.buildForm();
    this.getorderscount();
    // this.getCommodityorderscount();
    // this.getFuturesorderscount();
  }

  PrepDebounce() {
    // Unsubscribe any previous search listener
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }

    // Set up one active subscription based on activeTab
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(400)
    ).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchText = trimmed;
      if (this.activeTab === "Stocks") {
        this.getAllBucketListOrders(true);
        // if (this.activeMenu === 'Success') {
        //   this.getSuccessOrders(true);
        // } else if (this.activeMenu === 'Failed') {
        //   this.getFailedOrders(true);
        // } else if (this.activeMenu === 'Pending') {
        //   this.getPendingOrders(true);
        // } else if (this.activeMenu === 'Progress') {
        //   this.getProgressOrders(true);
        // }
      }

      else if (this.activeTab === "Commodity") {
        // if (this.activeMenuCommodity === 'Success') {
        //   this.getSuccessOrdersCommodity(true);
        // } else if (this.activeMenuCommodity === 'Failed') {
        //   this.getFailedOrdersCommodity(true);
        // } else if (this.activeMenuCommodity === 'Pending') {
        //   this.getPendingOrdersCommodity(true);
        // } else {
        //   this.getProgressOrdersCommodity(true);
        // }
      }

      else if (this.activeTab === "Future") {
        // if (this.activeMenuFuture === 'Success') {
        //   this.getSuccessOrdersFuture(true);
        // } else if (this.activeMenuFuture === 'Failed') {
        //   this.getFailedOrdersFuture(true);
        // } else if (this.activeMenuFuture === 'Pending') {
        //   this.getPendingOrdersFuture(true);
        // } else {
        //   this.getProgressOrdersFuture(true);
        // }
      }
    });
  }

  onSearchInput(value: string) {
    this.SearchDebounceFlag = true;
    this.searchSubject.next(value);
  }


  getorderscount() {
    const requestPayload = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      stock_tick: this.searchText,
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      status: "all",
      time_frame: this.timeframe_forOrderList,
      order_type: this.selectTradeType,
      prediction_type: this.predictionFilter
    };
    this.apiService.getBucketOrdersCountService(requestPayload).subscribe(resp => {
      console.log("getbucketordercount",resp)
         this.TotalCount = resp.response[0].count;
          console.log("getbucketordercount",  this.TotalCount)
    })
       
  }

  resetFilter() {
    this.isChecked = false;
    this.selectTradeType = "all";
    this.predictionFilter = null
    this.timeframe_forOrderList = null
    this.selectedDateRange = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.PrepDebounce();
    this.onPredictionFilterChange();
    this.getAllBucketListOrders(false);
    this.getorderscount();
  }

  togglePopsup() {
    this.isPopupOpen = !this.isPopupOpen;
  }

  openPopup() {
    this.isPopupOpen = true;
  }

  onCmpToggle(event: Event) {
    this.isChecked = (event.target as HTMLInputElement).checked;
    if (this.activeTab == 'Stocks') {
      this.getAllBucketListOrders(true);
      this.getorderscount();
    }
    else if (this.activeTab == 'Commodity') {
      return;
    }
    else {
      return;
    }
  }

  onTimeframeChangeForSuccess() {
    if (this.activeTab == 'Stocks') {
      this.getAllBucketListOrders(true);
      this.getorderscount();
    }
    else if (this.activeTab == 'Commodity') {
      return;
    }
    else {
      return;
    }
  }

  onOrderTypeChangeFilter() {
    if (this.activeTab == 'Stocks') {
      this.getAllBucketListOrders(true);
      this.getorderscount();
    }
    else if (this.activeTab == 'Commodity') {
      return;
    }
    else {
      return;
    }
  }

  onPredictionFilterChange() {
    //  if (this.activeTab == 'Stocks') {
    //     this.getSuccessOrders();
    //     this.getFailedOrders();
    //     this.getPendingOrders();
    //     this.getProgressOrders();
    //     this.getorderscount();
    //   }
    //   else if (this.activeTab == 'Commodity') {
    //     this.getSuccessOrdersCommodity();
    //     this.getFailedOrdersCommodity();
    //     this.getPendingOrdersCommodity();
    //     this.getProgressOrdersCommodity();
    //     this.getCommodityorderscount();
    //   }
    //   else {
    //     this.getSuccessOrdersFuture();
    //     this.getFailedOrdersFuture();
    //     this.getPendingOrdersFuture();
    //     this.getProgressOrdersFuture();
    //     this.getFuturesorderscount();
    //   }
    this.getorderscount();
    this.getAllBucketListOrders(true);
  }

  SwitchMasterMenu(menu: string) {
    this.activeTab = menu;
     this.activeMenu = "";
    this.activeMenuCommodity = "";
   this.activeMenuFuture = "";
    this.searchText = '';
   this.MatchedCount = 0;
    this.highlightedStockTick = '';
     this.PrepDebounce();
    this.timeframe_forOrderList = null;
    if (menu === 'Stocks') {
      // this.activeMenu = "Success"
      // this.successPage = 1;
      // this.getSuccessOrders()
    } else if (menu === 'Commodity') {
      // this.activeMenuCommodity = "Success";
      // this.successPagecommodity = 1;
      // this.getSuccessOrdersCommodity()
    } else if (menu === 'Future') {
      // this.activeMenuFuture = "Success";
      // this.successPageFuture = 1;
      // this.getSuccessOrdersFuture()

    }
  }

  getTimeFrameLabel(time_frame: number) {
    if (this.activeTab == "Stocks") {
      switch (time_frame) {
        case 1: return "Daily";
        case 2: return "60 Minute";
        case 3: return "15 Minute";
        case 25: return "75 Minute";
        case 5: return "125 Minute";
        case 6: return "25 Minute";
        default: return "Unknown";
      }
    }
    else if (this.activeTab == "Commodity") {
      switch (time_frame) {
        case 1: return "Daily";
        case 2: return "240 Minute";
        case 3: return "120 Minute";
        case 4: return "60 Minute";
        default: return "Unknown";
      }
    }
    else if (this.activeTab == "Future") {
      switch (time_frame) {
        case 1: return "Daily";
        case 2: return "60 Minute";
        case 3: return "15 Minute";
        case 25: return "75 Minute";
        default: return "Unknown";
      }
    }
    else {
      return null;
    }
  }

  calculateRR(entry_price: number, stoploss_price: number, target_price: number) {
    const risk = Math.abs(entry_price - stoploss_price);
    const reward = Math.abs(target_price - entry_price);

    if (risk === 0) {
      throw new Error("Stoploss cannot be equal to entry price, risk would be zero.");
    }

    return reward / risk;
  }

  checkOptions(): boolean {
    for (let key in this.selectedOptions) {
      if (this.selectedOptions[key]) {
        return false;
      }
    }
    return true;
  }

  isTradeSignalHighlighted(item: any): boolean {
    return item.TRADE_SIGNAL_ID != null; // highlight only if not null
  }

  isHighlighted(stockTick: string): boolean {
    return this.highlightedStockNames
      .some(x => (x || '').toLowerCase() === (stockTick || '').toLowerCase());
  }

  // getAllBucketListOrders(highlight: boolean = false) {
  //   this.showmsg = "Fetching Data!";
  //   this.spinner.show();
  //   let obj = {
  //     country_id: Number(localStorage.getItem('selectedCountryId')),
  //     stock_tick: this.searchText,
  //     start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
  //     end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
  //     status: "all",
  //     time_frame: this.timeframe_forOrderList,
  //     page_no: this.SearchDebounceFlag ? null : String(this.successPage),
  //     limit: this.pageSize,
  //     order_by_purchased_cmp_date: this.isChecked,
  //     order_type: this.selectTradeType,
  //     trade_id: null,
  //     prediction_type: this.predictionFilter
  //   }
  //   console.log("Bucket Object", obj);
  //   this.apiService.getAllBucketListOrderService(obj).subscribe(resp => {
  //     this.SearchDebounceFlag = false;
  //     this.AllbucketListOrders = [];
  //     this.AllbucketListOrders = resp.response.orders;
  //     console.log("bucketlist resp", this.AllbucketListOrders);
  //     this.spinner.hide();

  //     if (highlight && this.searchText) {
  //       const lowerSearch = this.searchText.trim().toLowerCase();

  //       const matches = this.AllbucketListOrders.filter((item: any) =>
  //         (item.stock_tick || '').toLowerCase().includes(lowerSearch)
  //         || (item.stock_symbol || '').toLowerCase().includes(lowerSearch) // optional
  //       );

  //       this.MatchedCount = matches.length;

  //       // ✅ store the SAME key that HTML uses in data-stock
  //       this.highlightedStockNames = matches.map((x: any) => x.stock_tick);

  //       if (matches.length > 0) {
  //         const firstTick = matches[0].stock_tick;

  //         setTimeout(() => {
  //           const target = this.stockCells.find(cell =>
  //             (cell.nativeElement.getAttribute('data-stock') || '').toLowerCase() === firstTick.toLowerCase()
  //           );
  //           console.log("TARGET", target)
  //           if (target) {
  //             target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  //             this.successPage = resp.response.page_no;
  //           }
  //         });
  //       }
  //     } else {
  //       this.highlightedStockNames = [];
  //       this.MatchedCount = 0;
  //     }

  //   })
  // }

  getAllBucketListOrders(highlight: boolean = false) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();

    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      stock_tick: this.searchText,
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      status: "all",
      time_frame: this.timeframe_forOrderList,
      page_no: this.SearchDebounceFlag ? null : String(this.successPage),
      limit: this.pageSize,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: null,
      prediction_type: this.predictionFilter
    };

    console.log("Bucket Object", obj);

    this.apiService.getAllBucketListOrderService(obj).subscribe(resp => {
      this.SearchDebounceFlag = false;
      this.AllbucketListOrders = [];
      this.AllbucketListOrders = resp.response.orders;
      console.log("bucketlist resp", this.AllbucketListOrders);
      this.spinner.hide();

      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.trim().toLowerCase();

        const getValue = (item: any) =>
          String(item.stock_tick || item.stock_symbol || '').toLowerCase();

        const exactMatches = this.AllbucketListOrders.filter((item: any) =>
          getValue(item) === lowerSearch
        );

        const startsWithMatches = this.AllbucketListOrders.filter((item: any) =>
          getValue(item).startsWith(lowerSearch)
        );

        const includesMatches = this.AllbucketListOrders.filter((item: any) =>
          getValue(item).includes(lowerSearch)
        );

        let prioritizedMatches: any[] = [];

        if (exactMatches.length > 0) {
          prioritizedMatches = exactMatches;
        } else if (startsWithMatches.length > 0) {
          prioritizedMatches = startsWithMatches;
        } else {
          prioritizedMatches = includesMatches;
        }

        this.MatchedCount = prioritizedMatches.length;

        this.highlightedStockNames = prioritizedMatches.map((x: any) => x.stock_tick);

        if (prioritizedMatches.length > 0) {
          const firstTick = prioritizedMatches[0].stock_tick;

          setTimeout(() => {
            const target = this.stockCells.find(cell =>
              (cell.nativeElement.getAttribute('data-stock') || '').toLowerCase() === firstTick.toLowerCase()
            );

            console.log("TARGET", target);

            if (target) {
              target.nativeElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });

              this.successPage = resp.response.page_no;
            }
          });
        }
      } else {
        this.highlightedStockNames = [];
        this.MatchedCount = 0;
      }
    });
  }

  approveBucketOrder(bucket_id: any, status: any) {

    const confirmMsg =
      status === 'approved'
        ? 'Are you sure you want to approve this bucket order?'
        : 'Are you sure you want to reject this bucket order?';

    const isConfirmed = confirm(confirmMsg);

    if (!isConfirmed) {
      return;
    }

    this.showmsg = "Please Wait..!";
    this.spinner.show();

    let obj = {
      bucket_id: bucket_id,
      approved_by: this.UserID,
      status: status
    };

    this.apiService.approveBucketOrderService(obj).subscribe(resp => {
      console.log("approveBucketOrder resp", resp);

      this.spinner.hide();

      if (resp.msg == "success") {
        this.getAllBucketListOrders(false);
        this.toastr.success(resp.response);
      }
      else {
        this.toastr.error(resp.response);
      }
    });
  }

  goToNextPage() {
    const totalPages = this.getTotalPages();
    if (this.successPage < totalPages) {
      this.successPage++;
      this.getAllBucketListOrders(true);
    }
  }

  goToPreviousPage() {
  if (this.successPage > 1) {
    this.successPage--;
    this.getAllBucketListOrders(true);
  }
}

  getTotalPages(): number {
    return Math.ceil(this.TotalCount / this.pageSize);
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
    return this.successPage;
  }

  goToPage(page: number) {
    if (page !== this.successPage) {
      this.successPage = page;
      this.getAllBucketListOrders(true);
    }
  }

  onPageSizeChange() {
    this.successPage = 1
    this.getAllBucketListOrders(true);
  }

  onSearchButtonClick() {
    this.successPage = 1;
    // this.progressPage = 1;
    // this.pendingPage = 1;
    // this.failedPage = 1;
    this.getAllBucketListOrders(true);
    this.getorderscount();
    this.highlightedIndex = -1
  }

  ViewAnalytics(stock_tick: any, time_frame: any) {
    this.router.navigate(['chart_analytics', stock_tick.toLowerCase(), time_frame]);
  }

  sortBucketOrders(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    const direction = this.sortDirection === 'asc' ? 1 : -1;

    this.AllbucketListOrders = [...this.AllbucketListOrders].sort((a: any, b: any) => {
      let av: any;
      let bv: any;

      switch (column) {
        case 'stock_tick':
          av = String(a.stock_tick || '').toLowerCase();
          bv = String(b.stock_tick || '').toLowerCase();
          return av.localeCompare(bv) * direction;

        case 'time_frame':
          av = Number(a.time_frame || 0);
          bv = Number(b.time_frame || 0);
          return (av - bv) * direction;

        case 'order_type':
          av = String(a.order_type || '').toLowerCase();
          bv = String(b.order_type || '').toLowerCase();
          return av.localeCompare(bv) * direction;

        case 'entry_price':
          av = Number(a.entry_price || 0);
          bv = Number(b.entry_price || 0);
          return (av - bv) * direction;

        case 'stoploss_price':
          av = Number(a.stoploss_price || 0);
          bv = Number(b.stoploss_price || 0);
          return (av - bv) * direction;

        case 'target_price':
          av = Number(a.target_price || 0);
          bv = Number(b.target_price || 0);
          return (av - bv) * direction;

        case 'stock_quantity':
          av = Number(a.stock_quantity || 0);
          bv = Number(b.stock_quantity || 0);
          return (av - bv) * direction;

        case 'purchased_cmp_date':
          av = new Date(a.purchased_cmp_date || 0).getTime();
          bv = new Date(b.purchased_cmp_date || 0).getTime();
          return (av - bv) * direction;

        case 'arima_ab_model_prediction':
          av = String(a.arima_ab_model_prediction || '').toLowerCase();
          bv = String(b.arima_ab_model_prediction || '').toLowerCase();
          return av.localeCompare(bv) * direction;

        case 'arima_ab_model_prob':
          av = Number(a.arima_ab_model_prob || 0);
          bv = Number(b.arima_ab_model_prob || 0);
          return (av - bv) * direction;

        case 'approval_status':
          av = String(a.approval_status || '').toLowerCase();
          bv = String(b.approval_status || '').toLowerCase();
          return av.localeCompare(bv) * direction;

        default:
          return 0;
      }
    });
  }

}

