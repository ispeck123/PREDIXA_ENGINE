import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, NgZone, Output, Renderer2, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgxSpinnerService } from 'ngx-spinner';
import { ApiService } from 'src/app/services/api.service';
import * as PlotlyJS from 'plotly.js-dist-min';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { ISeriesApi, createChart, LineStyle, CrosshairMode, BarData, PriceLineOptions, IPriceLine } from 'lightweight-charts';
import moment from 'moment';
import { RectangleDrawingTool } from '../homecandles/rectangle-drawing-tool';
import { ThisReceiver } from '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { AnyCatcher } from 'rxjs/internal/AnyCatcher';
import { catchError, debounceTime, of, Subject, Subscription, switchMap } from 'rxjs';
import { DatePipe } from '@angular/common';
import { ScripDataServiceService } from 'src/app/services/scrip-data-service.service';
import { NotificationCenterService, StockNotificationState } from 'src/app/services/notification-center.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})

export class DashboardComponent {
  xspan: any;
  Role: any;
  candles: { color: string; height: number; wickHeight: number }[] = [];
  showmsg: any;
  colorInterval: any; UserName: any;
  isAdmin: boolean = false;
  CustomLoader = false;
  showCustomizePanel = false;
  dashboardData: any[] = [];
  subscription!: Subscription;
  stockSearch: string = '';
  futureSearch: string = '';
  searchResults: string[] = [];
  searchResult: any = null;
  searchSubject = new Subject<string>();
  stockSearchResult: any = null;
  stockSearchResultus: any = null;
  stockSearchSubject = new Subject<string>();
  stockSearchSubjectus = new Subject<string>();
  selectedCountryName: any;
  requestupdationforcustomdashboard: boolean = false;
  private chart: any;
  private areaSeries: any;
  private candlestickSeries: any;
  rectangleTool: any;
  WatchlistData: any;
  UserId: any;
  countryId: any;
  Index_Id = 1;
  TopNiftyData: any;
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  private sub!: Subscription;
  Stocknotifications: any[] = [];
  chartStateMap: { [key: string]: 'loading' | 'ready' | 'empty' } = {};
  orderedDashboardData: any[] = [];
  isStockSearching = false;
  isFutureSearching = false;



  private getDayChangePercent(value: string): number { if (!value) return 0; return parseFloat(value.replace('%', '').trim()); }


  constructor(private zone: NgZone, private cdr: ChangeDetectorRef, private notificationCenter: NotificationCenterService, private spinner: NgxSpinnerService, private elementRef: ElementRef, private scripDataService: ScripDataServiceService, private http: HttpClient, private datePipe: DatePipe, private toastr: ToastrService, private router: Router, private webSocketService: WebSocketService, private apiService: ApiService) { }


  getChartKey(item: any, index: number): string {
    if (item.type === 'stock') {
      return `stock_${item.stock_tick}_${index}`;
    }
    return `future_${item.future_symbol}_${index}`;
  }

  getChartId(item: any, index: number): string {
    return `chart_${this.getChartKey(item, index)}`;
  }

  ngOnDestroy(): void {
    this.disconnectWebSocket();
  }

  disconnectWebSocket(): void {
    this.webSocketService.disconnectStock();
  }

  ngOnInit() {
    this.CustomLoader = true;
    const checkInterval = setInterval(() => {
      const countryName = localStorage.getItem('selectedCountryName');
      this.countryId = localStorage.getItem('selectedCountryId');
      if (this.countryId && countryName) {
        clearInterval(checkInterval);
        this.Role = localStorage.getItem('role');
        this.isAdmin = this.Role === "admin";
        this.UserName = localStorage.getItem('UserName');
        this.selectedCountryName = countryName;
        this.UserId = localStorage.getItem('UserId');
        this.xspan = 3600;
        this.setupDebouncedSearch();
        this.setupDebouncedStockSearch();
        this.connectWatchListWebsocket();
        this.getStockDataByIndex();
        this.StockNotification();
        this.notificationCenter.refreshHistory();
        this.notificationCenter.refreshStockHistory();
        this.fetchCustomDashboard(this.UserId, this.countryId);
      }
    }, 200); // checks every 200ms
  }

  setupDebouncedSearch(): void {
    this.subscription = this.searchSubject
      .pipe(
        debounceTime(500),
        switchMap((searchKey: string) => {
          if (!searchKey || searchKey.trim() === '') {
            this.isFutureSearching = false;
            this.searchResult = null;
            return of(null);
          }

          this.isFutureSearching = true;
          this.searchResult = null;

          return this.apiService.getFuturesExpiryDate(searchKey).pipe(
            catchError((err) => {
              console.error('Future search API error:', err);
              this.isFutureSearching = false;
              return of(null);
            })
          );
        })
      )
      .subscribe((res) => {
        if (res?.msg === 'success' && res.response?.length > 0) {
          this.searchResult = res.response[0];
        } else {
          this.searchResult = null;
        }

        this.isFutureSearching = false;
        console.log('Search Result:', this.searchResult);
      });
  }

  setupDebouncedStockSearch(): void {
    this.stockSearchSubject
      .pipe(
        debounceTime(400),
        switchMap((searchKey: string) => {
          if (!searchKey || searchKey.trim() === '') {
            this.isStockSearching = false;
            this.stockSearchResult = null;
            return of(null);
          }

          this.isStockSearching = true;
          this.stockSearchResult = null;

          return this.apiService.getStockSearch(1, searchKey).pipe(
            catchError((err) => {
              console.error('Stock search API error:', err);
              this.isStockSearching = false;
              return of(null);
            })
          );
        })
      )
      .subscribe((res) => {
        if (res?.msg === 'success' && res.response) {
          this.stockSearchResult = res.response;
          console.log('Stock Search Result:', this.stockSearchResult);
        } else {
          this.stockSearchResult = null;
        }

        this.isStockSearching = false;
      });
  }

  StockNotification() {
    this.sub = this.notificationCenter.stateStock$.subscribe((state: StockNotificationState) => {
      this.zone.run(() => {
        this.Stocknotifications = state.notifications.slice(0, 5);
        this.cdr.detectChanges();
      });
    });
  }

  trackByAlertId(index: number, item: any) {
    return item?.id ?? index;
  }

  // badge color class
  badgeClass(n: any): string {
    const t = (n?.notification_type || '').toLowerCase();
    if (t.includes('target') || t.includes('success')) return 'ok';
    if (t.includes('stop') || t.includes('failed')) return 'err';
    if (t.includes('risk')) return 'err';
    return 'warn';
  }

  // badge text
  badgeText(n: any): string {
    const t = (n?.notification_type || '').toUpperCase();
    if (t === 'TARGET_HIT') return 'TP';
    if (t === 'STOPLOSS_HIT') return 'SL';
    if (t) return t.replaceAll('_', ' ');
    return (n?.alertType || 'ALERT').toUpperCase();
  }

  // title line
  alertTitle(n: any): string {
    return n?.fullText;
  }

  // bottom line
  alertSub(n: any): string {
    return `${(n?.exchange || 'NSE')} • ${n?.timeframe ? n.timeframe + 'm' : ''}`.trim();
  }

  onViewClick(n: any) {
    console.log("DATA", n)
    localStorage.removeItem('SelectedTrade');
    this.apiService.getCurrentStatus(n.trade_signal_id, n.exchange).subscribe(resp => {
      console.log("RESPNSE", resp)
      if (resp.msg == "success") {
        let obj = {
          Trade_id: n.trade_signal_id,
          ExchangeName: n.exchange,
          ActiveMenu: resp.response.order_status
        }
        localStorage.setItem('SelectedTrade', JSON.stringify(obj));
        const currentRoute = this.router.url.split('/')[1];

        if (currentRoute === 'orderlist') {
          // Force Angular to reload the same route
          this.router.routeReuseStrategy.shouldReuseRoute = () => false;
          // Navigate to same route again (Angular will now reload it)
          this.router.onSameUrlNavigation = 'reload';
          this.router.navigate(['orderlist']);

          return;
        }
        this.router.navigate(['orderlist'])
      }
      else {
        this.toastr.error("No Order Found")
      }
    });

  }

  get activeList() {
    return this.Stocknotifications;
  }

  connectWatchListWebsocket(): void {
    this.webSocketService.connectWatchlist(this.UserId, this.countryId, "NSE", 1, 5);
    this.webSocketService.getWatchlistData().subscribe((data) => {
      this.WatchlistData = JSON.parse(data);
      this.WatchlistData = this.WatchlistData.stocks.map((item: any) => ({
        ...item,
        day_change_percentage: this.toNumber(item.day_change_percentage),
      }));
    });
  }

  toNumber(val: any): number {
    if (val === null || val === undefined) return 0;

    // already a number
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

    // string cases
    const s = String(val).trim();
    if (!s) return 0;

    // remove %, commas, spaces (keeps - and .)
    const cleaned = s.replace(/%/g, '').replace(/,/g, '').trim();
    const n = Number(cleaned);

    return Number.isFinite(n) ? n : 0;
  }

  ViewAnalytics(stock_tick: any) {
    this.router.navigate(['chart_analytics', stock_tick]);
  }

  stock_screener() {
    this.router.navigate(['home']);
  }

  alerts() {
    this.router.navigate(['alerts']);
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['landing']);
  }

  orders() {
    this.router.navigate(['orderlist']);
  }

  autoorders() {
    this.router.navigate(['auto-order-list']);
  }

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  news() {
    this.router.navigate(['news']);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }

  watchlist() {
    this.router.navigate(['watchlist']);
  }

  getWatchList() {
    this.UserId = localStorage.getItem('UserId');
    this.apiService.getWatchlistService(this.UserId, localStorage.getItem('selectedCountryId')).subscribe(resp => {
      this.WatchlistData = resp.response.watchlist.slice(0, 5);
      this.CustomLoader = false;;
    });
  }



  closeCustomizePanel() {
    this.showCustomizePanel = false;
  }

  openCustomizePanel(): void {
    this.showCustomizePanel = true;

    const savedStock = this.dashboardData.find((item: any) => item.type === 'stock');
    if (savedStock) {
      this.stockSearch = savedStock.stock_tick;
      this.stockSearchResult = {
        stock_tick: savedStock.stock_tick,
        kite_symbol: savedStock.stock_tick,
        id: savedStock.stock_id
      };
    }

    const savedFuture = this.dashboardData.find((item: any) => item.type === 'future');
    if (savedFuture) {
      this.futureSearch = savedFuture.future_symbol;
      this.searchResult = {
        symbol: savedFuture.future_symbol,
        expiry_date: savedFuture.expiry_date
      };
    }
  }

  onStockSearchChange(searchKey: string): void {
    this.stockSearchSubject.next(searchKey);
    if (!searchKey || searchKey.trim() === '') {
      this.stockSearchResult = null;
    }
  }

  onStockSearchChangeUS(searchKey: string): void {
    this.stockSearchSubjectus.next(searchKey);
    if (!searchKey || searchKey.trim() === '') {
      this.stockSearchResultus = null;
    }
  }

  get isFormValid(): boolean {
    return !!this.stockSearch?.trim() && !!this.futureSearch?.trim();
  }

  onSearchChange(searchKey: string): void {
    this.searchSubject.next(searchKey);
    if (!searchKey || searchKey.trim() === '') {
      this.searchResult = null;
    }
  }

  submitDashboardConfig() {
    const payload: any[] = [];

    const userId = localStorage.getItem('UserId');
    const countryId = localStorage.getItem('selectedCountryId');

    // === STOCK ===
    if (this.stockSearchResult) {
      const existingStock = this.dashboardData.find(
        (item: any) => item.type === 'stock'
      );

      payload.push({
        id: existingStock?.id,  // ensure the same dashboard entry is updated
        user_id: userId,
        country_id: countryId,
        stock_id: this.stockSearchResult.id,
        stock_tick: this.stockSearchResult.stock_tick,
        type: 'stock'
      });
    }

    // === FUTURE ===
    if (this.searchResult && this.selectedCountryName === 'India') {
      const existingFuture = this.dashboardData.find(
        (item: any) => item.type === 'future'
      );

      payload.push({
        id: existingFuture?.id,
        user_id: userId,
        country_id: countryId,
        future_symbol: this.searchResult.symbol,
        expiry_date: this.searchResult.expiry_date,
        type: 'future'
      });
    }

    if (payload.length === 0) {
      this.toastr.warning('No dashboard items to save.');
      return;
    }

    this.apiService.saveCustomDashboard(payload).subscribe({
      next: () => {
        this.toastr.success('Dashboard updated successfully!');
        this.clearChart()
        this.fetchCustomDashboard(userId, countryId);
        this.closeCustomizePanel();
      },
      error: (err) => {
        console.error('Dashboard save failed:', err);
        this.toastr.error('Failed to update dashboard.');
      }
    });
  }

  

  clearSearch(): void {
    if (this.searchResult) {
      this.searchResult = null;
      this.futureSearch = '';

    }
  }

  clearStockSearch(): void {
    if (this.stockSearchResult) {
      this.stockSearchResult = null;
      this.stockSearch = '';

    }
  }

  clearChart() {
    const stockDiv = this.elementRef.nativeElement.querySelector('#stockdashboardChart');
    const futureDiv = this.elementRef.nativeElement.querySelector('#futuredashboardChart');
    if (stockDiv) {
      stockDiv.innerHTML = '';
    }
    if (futureDiv) {
      futureDiv.innerHTML = '';
    }
  }


  // fetchCustomDashboard(userId: any, countryId: any): void {
  //   this.apiService.getCustomDashboard(userId, countryId).subscribe({
  //     next: (res: any) => {
  //       if (res.msg === 'success' && res.response?.length > 0) {
  //         this.dashboardData = res.response;
  //         this.requestupdationforcustomdashboard = true;
  //         this.dashboardData.forEach((item: any, index: number) => {
  //           let tick = '';
  //           if (item.type === 'stock' && item.stock_tick) {
  //             tick = item.stock_tick;

  //             const obj = {
  //               country: this.selectedCountryName,
  //               tick: tick,
  //               time_frame: '1',
  //               last_d_time: moment().format('YYYY-MM-DD HH:mm:ss'),
  //             };
  //             this.apiService.fetchCandleData(obj).subscribe((data: any) => {
  //               const candleData = data.response?.daily || [];
  //               this.LoadChart(candleData, "stockdashboardChart");
  //             });

  //           } else if (item.type === 'future' && item.future_symbol && item.expiry_date) {
  //             const formattedExpiry = this.datePipe.transform(item.expiry_date, 'dd-MM-yyyy');
  //             const last_d_time = moment().format('YYYY-MM-DD HH:mm:ss')
  //             this.apiService.getFutureData(item.future_symbol, formattedExpiry, 1,last_d_time).subscribe(response => {
  //               const dailyData = response.response?.daily || [];
  //               this.LoadChart(dailyData, "futuredashboardChart");
  //             });
  //           }
  //         });
  //         this.CustomLoader = false;
  //       } else {
  //         this.CustomLoader = false;
  //         this.dashboardData = [];
  //         this.toastr.warning('No dashboard configuration found.');
  //         this.requestupdationforcustomdashboard = false;
  //       }
  //     },
  //     error: (err) => {
  //       this.CustomLoader = false;
  //       console.error('Dashboard fetch failed:', err);
  //       this.toastr.error('Failed to fetch dashboard.');
  //       this.requestupdationforcustomdashboard = false;
  //     }
  //   });
  // }

  fetchCustomDashboard(userId: any, countryId: any): void {
    this.apiService.getCustomDashboard(userId, countryId).subscribe({
      next: (res: any) => {
        if (res.msg === 'success' && res.response?.length > 0) {
          this.dashboardData = res.response;
          this.orderedDashboardData = [
            ...this.dashboardData.filter((x: any) => x.type === 'stock'),
            ...this.dashboardData.filter((x: any) => x.type === 'future')
          ];
          this.requestupdationforcustomdashboard = true;

          this.chartStateMap = {};

          this.orderedDashboardData.forEach((item: any, index: number) => {
            const chartKey = this.getChartKey(item, index);
            const chartId = this.getChartId(item, index);

            this.chartStateMap[chartKey] = 'loading';

            if (item.type === 'stock' && item.stock_tick) {
              const obj = {
                country: this.selectedCountryName,
                tick: item.stock_tick,
                time_frame: '1',
                last_d_time: moment().format('YYYY-MM-DD HH:mm:ss'),
              };

              this.apiService.fetchCandleData(obj).subscribe({
                next: (data: any) => {
                  const candleData = data.response?.daily || [];

                  if (Array.isArray(candleData) && candleData.length > 0) {
                    this.chartStateMap[chartKey] = 'ready';

                    setTimeout(() => {
                      this.LoadChart(candleData, chartId);
                    });
                  } else {
                    this.chartStateMap[chartKey] = 'empty';
                  }
                },
                error: () => {
                  this.chartStateMap[chartKey] = 'empty';
                }
              });

            } else if (item.type === 'future' && item.future_symbol && item.expiry_date) {
              const formattedExpiry = this.datePipe.transform(item.expiry_date, 'dd-MM-yyyy');
              const last_d_time = moment().format('YYYY-MM-DD HH:mm:ss');

              this.apiService.getFutureData(item.future_symbol, formattedExpiry, 1, last_d_time).subscribe({
                next: (response: any) => {
                  const dailyData = response.response?.daily || [];

                  if (Array.isArray(dailyData) && dailyData.length > 0) {
                    this.chartStateMap[chartKey] = 'ready';

                    setTimeout(() => {
                      this.LoadChart(dailyData, chartId);
                    });
                  } else {
                    this.chartStateMap[chartKey] = 'empty';
                  }
                },
                error: () => {
                  this.chartStateMap[chartKey] = 'empty';
                }
              });

            } else {
              this.chartStateMap[chartKey] = 'empty';
            }
          });

          this.CustomLoader = false;
        } else {
          this.CustomLoader = false;
          this.dashboardData = [];
          this.orderedDashboardData = [];
          this.toastr.warning('No dashboard configuration found.');
          this.requestupdationforcustomdashboard = false;
        }
      },
      error: (err) => {
        this.orderedDashboardData = [];
        this.CustomLoader = false;
        console.error('Dashboard fetch failed:', err);
        this.toastr.error('Failed to fetch dashboard.');
        this.requestupdationforcustomdashboard = false;
      }
    });
  }

  LoadChart(data: any, chartId: any) {

    let chart = null;
    // this.cleanupChart()
    const chartProperties = {
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
      },
      crosshair: {
        mode: CrosshairMode.Normal
      },
      /* disable pan + zoom */
      handleScroll: false,
      handleScale: false,
    }

    chart = createChart(document.getElementById(chartId)!, {
      ...chartProperties,
      layout: {
        background: {
          color: '#f0ffff',
        },
      },
    });

    chart.applyOptions({
      // watermark: {
      //   visible: true,
      //   fontSize: 25,
      //   horzAlign: 'right',
      //   vertAlign: 'bottom',
      //   color: 'rgb(128, 128, 128)',
      //   text: 'FIN PRODUCT BY ISPECK ',
      // },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
    });

    this.areaSeries = chart.addAreaSeries({
      lineColor: '#2962FF', topColor: '#2962FF',
      bottomColor: 'rgba(41, 98, 255, 0.28)',
    });

    // NUMBER 1
    this.candlestickSeries = chart.addCandlestickSeries({
      upColor: '#006401', downColor: '#8b0101', borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350', lastValueVisible: false, priceLineVisible: false,
    });
    this.candlestickSeries.setData(data);

    const prebars = [...new Array(100)].map((_, i) => ({
      time: data[0].time - (i + 1) * this.xspan,
    }));

    const postbars = [...new Array(100)].map((_, i) => ({
      time: data[data.length - 1].time + (i + 1) * this.xspan,
    }));

    this.candlestickSeries.setData([...data, ...postbars]);

    chart.timeScale().fitContent();

    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.01,
        bottom: 0.01,
      },
    });

    this.rectangleTool = new RectangleDrawingTool(chart,
      this.candlestickSeries,
      document.querySelector<HTMLDivElement>('#toolbar')!,
      {
        showLabels: false,
      });
    this.chart = chart;
  }

  ChartAnalytics(item: any) {
    const tick = item.stock;
    this.router.navigate(['chart_analytics', tick.toLowerCase()]);
  }

  OpenChart(item: any) {
    console.log("TYPE", item)
    if (item.type == "stock") {
      const tick = item.stock_tick;
      this.router.navigate(['chart_analytics', tick.toLowerCase()]);
    }
    else {
      const tick = item.future_symbol;
      const future_expiry = item.expiry_date
      let obj = {
        symbol: tick,
        expiry_date: future_expiry
      }
      this.scripDataService.setScripsForNSEFO([obj]);
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigate(['/futures']);
      });
    }
  }

  applySortingMostChanges() {
    this.TopNiftyData = this.TopNiftyData
      .map((stock: { day_change_percentage: string; }) => ({
        ...stock,
        _dayChangeNum: this.getDayChangePercent(stock.day_change_percentage)
      }))
      .sort((a: { _dayChangeNum: number; }, b: { _dayChangeNum: number; }) => Math.abs(b._dayChangeNum) - Math.abs(a._dayChangeNum))
      .slice(0, 5);
  }

  getStockDataByIndex() {
    this.webSocketService.disconnectStockByIndex();
    this.webSocketService.StockByIndexParam({
      index_id: this.Index_Id,
      page: 1,
      offset: 50,
      IndexName: "NSE",
      searchKey: "",
      userId: this.UserId
    });

    this.webSocketService.StockByIndexMessageParam().subscribe((data) => {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        this.TopNiftyData = parsedData.stocks || [];
        this.applySortingMostChanges();
      } catch (error) {
        this.TopNiftyData = [];
      }
    });
  }

  trackBySymbol(index: number, item: any): string {
    return item?.stock || item?.symbol || item?.trading_symbol || String(index);
  }

  toNum(v: any): number {
    if (v === null || v === undefined) return 0;

    // If already a number
    if (typeof v === 'number') return isFinite(v) ? v : 0;

    // Convert like "+95.3 Today" / "1,320.10" / "+25.40" / " -7.2%"
    const s = String(v).trim();

    // Keep only first valid numeric token (with optional sign and decimal)
    const match = s.replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
    if (!match) return 0;

    const n = parseFloat(match[0]);
    return isFinite(n) ? n : 0;
  }

  sign(n: number): string {
    return n > 0 ? '+' : '';
  }


}
