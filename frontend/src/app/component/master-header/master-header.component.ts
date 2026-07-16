import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnInit,
  Output,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NavigationStart, Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { FloatingModalComponent } from '../floating-modal/floating-modal.component';
import {
  ISeriesApi,
  createChart,
  LineStyle,
  CrosshairMode,
  BarData,
  PriceLineOptions,
  IPriceLine,
  IChartApi,
} from 'lightweight-charts';
import { RectangleDrawingTool } from './rectangle-drawing-tool';
import { cloneUniformsGroups } from 'three/src/renderers/shaders/UniformsUtils';
import { ScripDataServiceService } from 'src/app/services/scrip-data-service.service';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { IdleTimeoutService } from 'src/app/services/idle-timeout.service';
import { CountryService } from 'src/app/services/CountryService';
import moment from 'moment';
import { FirebaseMessagingService } from 'src/app/services/firebase-messaging.service.service';
import { NotificationPopupComponent } from '../notification-popup/notification-popup.component';
import { NotificationCenterService, NotificationState, StockNotificationState } from 'src/app/services/notification-center.service';
import { LayoutToggleService } from 'src/app/services/layout-toggle.service';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';


interface McxFuture {
  symbol: string;
  near: string | null;
  next: string | null;
  far: string | null;
  id: any;
}

@Component({
  selector: 'app-master-header',
  templateUrl: './master-header.component.html',
  styleUrls: ['./master-header.component.css'],
})

export class MasterHeaderComponent implements OnInit {
  popups: { id: number, message: string, stock_tick: string }[] = [];
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  futureExpirySub: any;
  shownPopupIds = new Set<number>();
  @ViewChild(NotificationPopupComponent)
  notificationPopup!: NotificationPopupComponent;
  trackByTick = (_: number, item: any) => item?.stock_tick;
  activeTab: 'alert' | 'stock' = 'alert';
  candles: Array<{ color: string; height: number; wickHeight: number } | { open: number; high: number; low: number; close: number; volume: number; time: number }> = [];
  marketStatus: any;
  isMarketOpen: boolean = false;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  StockExchanges: any;
  UserId: any;
  indexes: { [exchangeId: string]: any[] } = {}; // Level 2
  stocks: { [indexId: string]: any[] } = {}; // Level 3
  McxData: any;
  ScripData: any;
  FutureListOption: any;
  selectedScrip: any = '';
  countries: any;
  notificationCount: number = 0; // Your API count here
  StocknotificationCount: number = 0;
  showPanelForNotification = false;
  activeMenu = true;
  activeSubmenu: string | null = null;
  activeExchange: string | null = null;
  activeIndex: string | null = null;
  selectedCountry: any;
  selectedCountryFlag: any;
  private routerSub!: Subscription;
  @ViewChild('liquidPanel') liquidPanel!: ElementRef;
  @ViewChild('modalA') modalA!: FloatingModalComponent;
  @ViewChild('modalB') modalB!: FloatingModalComponent;
  @ViewChild('modalC') modalC!: FloatingModalComponent;
  @ViewChild('modalD') modalD!: FloatingModalComponent;
  @ViewChild('modalE') modalE!: FloatingModalComponent;
  @ViewChild('CustomScreener') CustomScreener!: FloatingModalComponent;
  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  @ViewChild('searchInput') searchInputRef!: ElementRef;
  selectedScrips: any[] = [];
  notifications: any[] = [];
  Stocknotifications: any[] = [];
  Futurechart1: any;
  Futurechart2: any;
  Futurechart3: any;
  chart: any;
  areaSeries: any;
  private candlestickSeries: any;
  xspan: any;
  rectangleTool: any;
  toolTipData: any;
  CandleColor: any;
  chartInstances: { [key: string]: any } = {};
  openB = '';
  highB = '';
  lowB = '';
  closeB = '';

  openC = '';
  highC = '';
  lowC = '';
  closeC = '';

  openD = '';
  highD = '';
  lowD = '';
  closeD = '';
  mcxFuturesMap: { [symbol: string]: string[] } = {};
  mcxFuturesList: McxFuture[] = [];
  activeMenu1: string | null = null;
  menuWidth: number = 0;
  selectedFutureOption: any = null;
  currentPage: any = 1;
  totalCount: any;
  pageSize = 10;
  searchSubject = new Subject<string>();
  searchText: string = '';
  highlightedStockNames: string[] = [];
  filteredListData: any = [];
  selected_stock_exchang = 'NSE';
  IsLoadingVisible = false;
  pageSizeOptions = [10, 25, 50, 100];
  MatchedCount: any = 0;
  isScripInvalidFlag = false;
  showPanelForLiquidStock = false;
  liquidStockList: any;
  sortDirection_LQD: 'asc' | 'desc' = 'asc';
  isLoading = false;
  SelectedCountryID: any;
  PriceAlertForm: FormGroup;
  stockData: any[] = [];
  submitted: boolean = false;
  selectedDateRangeforCustom: any;
  customAlertData: any = [];
  colorInterval: any;
  showmsg: any;
  HistoryAlertData: any;
  private sub!: Subscription;
  isMobile = false;
  isMobileView = false;
  expiryDateList: any[] = [];
  mcxExpiryDateList: any[] = [];
  filteredStockData: any[] = [];  // list shown in dropdown
  filteredScripData: any[] = [];


  // FUTURE VARIABLES
  futureContractList: any[] = [];
  allFutureContractList: any[] = [];
  stockSearchText: string = '';
  highlightedStock: string | null = null;
  isOhlcPanelOpen = false;
  filter: any;
  OhlcData: any;
  @ViewChildren('stockRow') stockRows!: QueryList<ElementRef>;


  activeOhlcTab: 'NSE' | 'MCX' | 'NSEFO' = 'NSE';
  nseForm!: FormGroup;
  mcxForm!: FormGroup;
  nsefoForm!: FormGroup;

  submittedNSE = false;
  submittedMCX = false;
  submittedNSEFO = false;

  selectedFutureDate: any;

  showTradeScope = false;
isTradeScopeLoading = false;
tradeScopeError = '';

tradeScopeData: Array<{
  market: string;
  actions: string[];
}> = [];

  private readonly TF_MAP: Record<string, Record<number, string>> = {
    NSE: {
      1: 'daily',
      2: 'sixty',
      3: 'fifteen',
      5: 'one_twenty_five',
      6: 'twenty_five',
      25: 'seventy_five',
    },
    FUTURE: {
      1: 'daily',
      25: 'seventy_five',
      2: 'sixty',
      3: 'fifteen',
    },
    COMMODITY: {
      1: 'daily',
      2: 'two_forty',
      3: 'one_twenty',
      4: 'sixty',
    },
  };

  constructor(
    public layout: LayoutToggleService,
    public idleTimeout: IdleTimeoutService,
    private scripDataService: ScripDataServiceService,
    private webSocketService: WebSocketService,
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef,
    private toastr: ToastrService,
    private router: Router,
    private fb: FormBuilder,
    private spinner: NgxSpinnerService,
    private apiService: ApiService,
    private formBuilder: FormBuilder,
    private countryService: CountryService,
    private fcmService: FirebaseMessagingService,
    private notificationCenter: NotificationCenterService,
    private zone: NgZone,
  ) {
    this.xspan = 3600;
    this.checkScreen();
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreen();
  }

  @HostListener('document:click')
  closeMobilePopup() {
    if (this.isMobile) {
      this.activeExchange = null;
    }
  }

  toggleSidenav() {
    this.layout.toggle();
  }

  private checkScreen() {
    this.isMobile = window.innerWidth <= 992;
  }

  @HostListener('document:click')
  closePopupOutside() {
    if (this.isMobile) {
      this.activeExchange = null;
    }
  }

  onExchangeEnter(exch: any) {
    if (this.isMobile) return;
    this.activeExchange = exch.exchange_id;

    if (exch.exchange_name !== 'MCX' && exch.exchange_name !== 'NSEFO') {
      this.fetchIndexes(exch.exchange_id);
    }
  }

  onExchangeLeave() {
    if (this.isMobile) return;
    this.activeExchange = null;
  }

  mobileOpenExchange(exch: any, event: Event) {
    if (!this.isMobile) return;

    event.stopPropagation();

    this.activeExchange =
      this.activeExchange === exch.exchange_id ? null : exch.exchange_id;

    if (
      this.activeExchange === exch.exchange_id &&
      exch.exchange_name !== 'MCX' &&
      exch.exchange_name !== 'NSEFO'
    ) {
      this.fetchIndexes(exch.exchange_id);
    }
  }
  getTimeframeLabel(n: any) {
    const ex = n.exchange;
    const code = Number(n?.timeframe);                       // 1,2,3...
    if (!ex || Number.isNaN(code)) return '';

    return this.TF_MAP?.[ex]?.[code] ?? '';  // fallback blank if not found
  }

  get activeList() {
    return this.activeTab === 'alert' ? this.notifications : this.Stocknotifications;
  }

  onNotificationClick(n: any) {

    if (n.read) return;

    this.markAsRead(n.id, n.notification_type);

    this.notificationCenter.refreshStockHistory()
  }

  markAsRead(id: any, notification_type: any) {
    console.log(id)
    this.apiService.seenStockNotification(id, notification_type).subscribe((res: any) => {
      if (res.msg == "success") {
        this.notificationCenter.refreshStockHistory();
      }
      else {
        this.toastr.error("Failed !")
      }

    });
  }


  setTab(tab: 'alert' | 'stock') {
    this.activeTab = tab;
  }

  trackByNotif(index: number, item: { id: any }) {
    return item.id ?? index;
  }

  onSubItemClick(sub: any) { }

  getCountryFlagEmoji(code: string): string {
    const flagMap: any = {
      IN: '🇮🇳',
      US: '🇺🇸',
      DE: '🇩🇪',
      FR: '🇫🇷',
      // Add more as needed
    };

    return flagMap[code.toUpperCase()] || '';
  }

  toggleSubmenu(submenu: string) {
    this.activeSubmenu = this.activeSubmenu === submenu ? null : submenu;
    this.activeExchange = null;
    this.activeIndex = null;
  }

  toggleExchange(exchangeId: string) {
    this.activeExchange =
      this.activeExchange === exchangeId ? null : exchangeId;
    this.activeIndex = null;
  }

  toggleIndex(indexId: string) {
    this.activeIndex = this.activeIndex === indexId ? null : indexId;
  }

  // @HostListener('document:click', ['$event.target'])
  // onClickOutside(target: HTMLElement) {
  //   const inside = target.closest('.menu-item') || target.closest('.dropdown') || target.closest('.submenu');
  //   if (!inside) {
  //     this.activeMenu = null;
  //     this.activeSubmenu = null;
  //     this.activeExchange = null;
  //     this.activeIndex = null;
  //   }
  // }
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.isMobileView) {
      this.activeExchange = null;
    }
    
  }

  private buildForm() {
    this.PriceAlertForm = this.formBuilder.group({
      user_id: [Number(this.UserId)],
      country_id: [Number(this.SelectedCountryID)],
      stock_symbol: ['', [Validators.required]],
      exchange_id: [],
      threshold: [, [Validators.required]],
      condition: ['', [Validators.required]],
      message: ['']
    });
  }

  private initOhlcForms(): void {
    this.nseForm = this.fb.group({
      tick: ['', Validators.required],
      time_frame: [''],
      single_time_frame: [''],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required]
    });

    this.mcxForm = this.fb.group({
      tick: ['', Validators.required],
      expiry_date: ['', Validators.required],
      time_frame: [''],
      single_time_frame: [''],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required]
    });

    this.nsefoForm = this.fb.group({
      tick: ['', Validators.required],
      expiry_date: ['', Validators.required],
      time_frame: [''],
      single_time_frame: [''],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required]
    });
  }

  //   @HostListener('document:click', ['$event'])
  // onDocumentClick(event: MouseEvent): void {
  //   if (!this.showPanelForLiquidStock || !this.liquidPanel) return;

  //   const clickedInside = this.liquidPanel.nativeElement.contains(event.target);
  //   if (!clickedInside) {
  //     this.closePanel();
  //   }
  // }

  ngOnInit(): void {
    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart && this.showPanelForLiquidStock) {
        this.closePanel();
      }
    });
    this.initOhlcForms();
    this.filter = [
      { id: 'monthly', name: 'Monthly' },
      { id: 'weekly', name: 'Weekly' },
      { id: 'daily', name: 'Daily' },
      { id: 'one_twenty_five', name: '125 min' },
      { id: 'seventy_five', name: '75 min' },
      { id: 'sixty', name: '60 min' },
      { id: 'fifteen', name: '15 min' },
      { id: 'five', name: '5 min' }
    ];
    this.buildForm();
    this.initializeTimeframeMutualReset();
    this.openB = '100';
    this.highB = '110';
    this.lowB = '95';
    this.closeB = '105';
    this.Role = localStorage.getItem('role');
    this.UserId = localStorage.getItem('UserId');
    this.SelectedCountryID = localStorage.getItem('selectedCountryId');
    if (this.Role == 'admin') {
      this.isAdmin = true;
    } else {
      this.isAdmin = false;
    }
    this.sub = this.notificationCenter.state$.subscribe((state: NotificationState) => {
      this.zone.run(() => {
        this.notifications = state.notifications;
        this.notificationCount = state.unreadCount;

        // ✅ Merge new popups, don’t overwrite (prevents flash)
        const existingIds = new Set(this.popups.map(p => p.id));
        const newPopups = (state.popups || []).filter(p => !existingIds.has(p.id));
        this.popups = [...this.popups, ...newPopups];

        this.cdr.detectChanges();
      });
    });


    this.sub = this.notificationCenter.stateStock$.subscribe((state: StockNotificationState) => {
      this.zone.run(() => {
        this.Stocknotifications = state.notifications;
        this.StocknotificationCount = state.unreadCount;
        this.cdr.detectChanges();
      });
    });


    this.notificationCenter.refreshHistory();
    this.notificationCenter.refreshStockHistory();
    this.listenFCM();
    this.getCountry();
    this.UserName = localStorage.getItem('UserName');

    this.checkMarketStatus();
    this.getStockExchanges();
    this.getMcxData();
    this.getScriprData();
    this.PrepDebounce();
    this.getcustomStockData();
    this.future_liquidity_by_volume();
    this.stockDataFunc();
    this.loadTradeScope();
    this.selectedDateRangeforCustom = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.getAllCustomAlerts();
  }

  get totalNotificationCount(): number {
    return (this.notificationCount || 0) + (this.StocknotificationCount || 0);
  }


  ngOnDestroy(): void {
    this.disconnectFutureExpiryWebSocket();
    this.sub?.unsubscribe();
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
  }



  listenFCM() {
    this.fcmService.listenForMessages((payload) => {
      console.log("FCM PAYLOAD", payload)
      this.notificationCenter.refreshHistory();
      this.notificationCenter.refreshStockHistory();

    });
  }

  closePopup(id: number) {
    this.popups = this.popups.filter(p => p.id !== id);
  }

  get f() {
    return this.PriceAlertForm.controls;
  }

  searchStocks = (term: string, item: any) => {
    if (!term) return true;
    term = term.toLowerCase().trim();
    const tick = (item?.stock_tick ?? '').toLowerCase();
    const name = (item?.name ?? '').toLowerCase();
    return tick.includes(term) || name.includes(term);
  };


  onStockSearch(term: string) {
    const search = (term || '').toLowerCase().trim();

    // when input is empty, show full list again
    if (!search) {
      this.filteredStockData = [...this.stockData];
      return;
    }

    const startsWithMatches = this.stockData.filter(item => {
      const tick = (item?.stock_tick ?? '').toLowerCase();
      const name = (item?.name ?? '').toLowerCase();
      return tick.startsWith(search) || name.startsWith(search);
    });

    const containsMatches = this.stockData.filter(item => {
      const tick = (item?.stock_tick ?? '').toLowerCase();
      const name = (item?.name ?? '').toLowerCase();

      const isStartsWith = tick.startsWith(search) || name.startsWith(search);
      const isContains = tick.includes(search) || name.includes(search);

      return !isStartsWith && isContains;
    });

    this.filteredStockData = [...startsWithMatches, ...containsMatches];
  }

  onScripSearch(term: string) {
    const search = (term || '').toLowerCase().trim();

    if (!search) {
      this.filteredScripData = [...this.ScripData];
      return;
    }

    const startsWithMatches = this.ScripData.filter((item: any) => {
      const value = (item || '').toString().toLowerCase();
      return value.startsWith(search);
    });

    const containsMatches = this.ScripData.filter((item: any) => {
      const value = (item || '').toString().toLowerCase();
      return !value.startsWith(search) && value.includes(search);
    });

    this.filteredScripData = [...startsWithMatches, ...containsMatches];
  }

  PrepDebounce() {
    this.searchSubject.pipe(debounceTime(400)).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchText = trimmed;
      this.currentPage = null;
      this.getcustomStockData(true);
    });
  }

  getcustomStockData(highlight: boolean = false) {
    // this.filteredListData = [];
    this.webSocketService.disconnectCustomListParam();
    this.IsLoadingVisible = true;
    this.webSocketService.listCustomindexParam({
      exchange: this.selected_stock_exchang,
      page: this.currentPage,
      offset: this.pageSize,
      search_key: this.searchText,
    });

    this.webSocketService.getCustomListMessageParam().subscribe((data) => {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

        this.filteredListData = parsedData.stocks || [];
        this.totalCount = parsedData.total_stocks || 0;
        this.applySorting();
        this.IsLoadingVisible = false;

        if (highlight && this.searchText) {
          const lowerSearch = this.searchText.trim().toLowerCase();

          const matches = this.filteredListData.filter(
            (item: { stock: string }) =>
              item.stock?.toLowerCase().includes(lowerSearch)
          );

          this.MatchedCount = matches.length;
          this.highlightedStockNames = matches.map(
            (item: { stock: any }) => item.stock
          );

          if (matches.length > 0) {
            const firstMatchName = matches[0].stock;

            setTimeout(() => {
              const target = this.stockCells.find(
                (cell) =>
                  cell.nativeElement
                    .getAttribute('data-stock')
                    ?.toLowerCase() === firstMatchName.toLowerCase()
              );

              if (target) {
                this.currentPage = parsedData.page_no;
                target.nativeElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
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
        console.error('Error parsing WebSocket data:', error);
        this.filteredListData = [];
        this.IsLoadingVisible = false;
      }
    });
  }

  getTextColor(value: any): string {
    if (!value) return ''; // Handle null or undefined cases

    let cleanedValue = value.toString().match(/-?\d+(\.\d+)?/); // Extract only the number (including decimals)
    let numericValue = cleanedValue ? Number(cleanedValue[0]) : NaN;
    return isNaN(numericValue)
      ? ''
      : numericValue < 0
        ? 'text-red'
        : 'text-green';
  }

  getCountry() {
    this.UserId = localStorage.getItem('UserId');
    this.apiService.getCountryAccessService(this.UserId).subscribe((data) => {
      this.countries = data.response;
      const savedCountryName = localStorage.getItem('selectedCountryName');
      if (savedCountryName) {
        // 🔄 Restore previously selected country from localStorage
        this.selectedCountry = this.countries.find(
          (c: { country_name: string }) => c.country_name === savedCountryName
        );
        this.selectedCountryFlag = this.selectedCountry.flag;
      }

      if (!this.selectedCountry) {
        // 🌍 Fallback: default to India if nothing stored
        this.selectedCountry = this.countries[0];
        this.selectedCountryFlag = this.selectedCountry.flag;
      }

      // ✅ Sync to localStorage
      if (this.selectedCountry) {
        this.onCountryChangeOnInit(this.selectedCountry);
      }
    });
  }

  onCountryChange(country: any): void {
    if (country) {
      localStorage.setItem('selectedCountryId', country.country_id);
      localStorage.setItem('selectedCountryName', country.country_name);
      localStorage.setItem('selectedCountryFlag', country.flag);
      this.selectedCountryFlag = country.flag;
      window.location.reload();
    }
  }

  onCountryChangeOnInit(country: any): void {
    if (country) {
      localStorage.setItem('selectedCountryId', country.country_id);
      localStorage.setItem('selectedCountryName', country.country_name);
      this.getStockExchanges();
    }
  }

  getStockExchanges() {
    this.apiService.getStockExchanges(this.UserId).subscribe((res: any) => {
      if (res.msg == 'success') {
        this.StockExchanges = res.response;
      } else {
        this.StockExchanges = [];
      }
    });
  }

  getMcxData() {
    this.apiService.getFuturesDatesBySymbol().subscribe((res: any) => {
      const rows = (res?.response ?? []) as {
        symbol: string;
        expiry: string[];
        id: any;
      }[];
      console.log("this.mcxFuturesList", res)
      this.mcxFuturesList = rows.map((r) => {
        const expiries = (r.expiry ?? []).slice(0, 3); // take only 3
        return {
          symbol: r.symbol,
          near: expiries[0] ?? null,
          next: expiries[1] ?? null,
          far: expiries[2] ?? null,
          id: r.id,
        };
      });
    });
  }

  trackBySymbol = (_: number, item: { symbol: string }) => item.symbol;

  dmYToKey(s: string): number {
    // "DD-MM-YYYY" -> number YYYYMMDD for reliable sort
    const [dd, mm, yyyy] = s.split('-').map(Number);
    return yyyy * 10000 + mm * 100 + dd;
  }

  onFutureDateClick(fullName: string, date: string, id: any) {
    let obj = {
      symbol: fullName,
      expiry_date: date,
      id: id,
    };
    this.scripDataService.setScrips([obj]);
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/mcx']);
    });
  }

  checkMarketStatus() {
    let selectedCountry = (
      localStorage.getItem('selectedCountryName') || 'india'
    ).toLowerCase(); // Default to 'india'
    const now = new Date();

    let currentHour = now.getUTCHours();
    let currentMinutes = now.getUTCMinutes();

    if (selectedCountry === 'india') {
      // Convert UTC to IST (UTC+5:30)
      currentHour = (currentHour + 5) % 24;
      currentMinutes = (currentMinutes + 30) % 60;
      if (currentMinutes < 30) {
        currentHour = (currentHour + 1) % 24; // Handle minute overflow
      }
      // Market open time: 9:15 AM IST, close time: 3:30 PM IST
      this.isMarketOpen =
        (currentHour > 9 || (currentHour === 9 && currentMinutes >= 15)) &&
        (currentHour < 15 || (currentHour === 15 && currentMinutes < 30));
    } else if (selectedCountry === 'us') {
      // Convert UTC to Eastern Time (New York)
      const isDST = this.isDST(now); // Check if daylight saving time is active
      const offset = isDST ? -4 : -5;
      currentHour = (currentHour + offset + 24) % 24;

      // Market open time: 9:30 AM ET, close time: 4:00 PM ET
      this.isMarketOpen =
        (currentHour > 9 || (currentHour === 9 && currentMinutes >= 30)) &&
        currentHour < 16;
    } else {
      this.isMarketOpen = false; // Unknown country
    }

    this.marketStatus = this.isMarketOpen ? 'Open' : 'Closed';
  }

  isDST(date: Date): boolean {
    const january = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
    const july = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
    return Math.min(january, july) !== date.getTimezoneOffset();
  }

  Watchlist() {
    this.router.navigate(['watchlist']);
  }

  UserPlans() {
    this.router.navigate(['user-plans']);
  }

  fetchIndexes(exchangeId: string) {
    if (!this.indexes[exchangeId]) {
      this.apiService.getIndexesByExchange(exchangeId).subscribe((res) => {
        this.indexes[exchangeId] = res.response;
        this.cdr.detectChanges(); // Force Angular to update the view
      });
    }
  }

  fetchStocks(indexId: string) {
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['indexlistStock', indexId]);
    });
  }

  isScripInvalid(): boolean {
    return (
      this.selectedScrip === null ||
      this.selectedScrip === '' ||
      this.selectedScrip === undefined
    );
  }

  OnChangeScrip() {
    if (this.isScripInvalid()) {
      this.isScripInvalidFlag = true;
      return;
    } else {
      this.isScripInvalidFlag = false;
      return;
    }
  }

  // getScriprData() {
  //   this.apiService.getScripData().subscribe((res: any) => {
  //     console.log("getScriprData", res)
  //     if (res.msg == 'success') {
  //       this.ScripData = res.response;
  //       console.log("this.ScripData", this.ScripData)
  //     } else if (res.msg == 'failed') {
  //       this.toastr.error('Failed to fetch stock exchanges');
  //     }
  //   });
  // }

  getScriprData() {
    this.apiService.getScripData().subscribe((res: any) => {
      console.log("getScriprData", res);

      if (res.msg == 'success') {
        this.ScripData = (res.response || []).sort((a: any, b: any) =>
          (a || '').toString().toLowerCase().localeCompare((b || '').toString().toLowerCase())
        );

        this.filteredScripData = [...this.ScripData];

        console.log("this.ScripData", this.ScripData);
      } else if (res.msg == 'failed') {
        this.toastr.error('Failed to fetch stock exchanges');
        this.ScripData = [];
        this.filteredScripData = [];
      }
    });
  }

  ShowFuturesData() {
    if (this.isScripInvalid()) {
      this.isScripInvalidFlag = true;
      return;
    }
    this.isScripInvalidFlag = false;
    this.apiService
      .getFuturesListService(this.selectedScrip)
      .subscribe((res: any) => {
        console.log("this.FutureListOption", res)
        if (res.msg == 'success') {
          this.selectedScrips = [];
          this.FutureListOption = res.response;
          this.assignExpiryTiers(); // ⬅️ add this
        } else {
          this.toastr.error('Failed to fetch data');
        }
      });
  }

  private assignExpiryTiers(): void {
    // group by exchange+symbol so NEAR/NEXT/FAR are per instrument
    const groups = new Map<string, any[]>();

    for (const item of this.FutureListOption) {
      const key = `${item.exchange}:${item.symbol}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    for (const items of groups.values()) {
      items.sort(
        (a, b) =>
          new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
      );
      if (items[0]) items[0].expiryTier = 'NEAR';
      if (items[1]) items[1].expiryTier = 'NEXT';
      for (let i = 2; i < items.length; i++) items[i].expiryTier = 'FAR';
    }
  }

  openModalA() {
    this.modalA.show();
  }

  openModalE() {
    this.modalE.show();
  }

  closePriceAlert() {
    this.modalE.hide();
    this.submitted = false;
    this.PriceAlertForm.get('stock_symbol')?.reset();
    this.PriceAlertForm.get('threshold')?.reset();
    this.PriceAlertForm.get('condition')?.reset();
    this.PriceAlertForm.get('message')?.reset();
  }


  CustomScreenerChart() {
    this.CustomScreener.show();
    setTimeout(() => {
      this.searchInputRef.nativeElement.focus();
    }, 0);
  }

  Jobs() {
    this.router.navigate(['manage-jobs']);
  }

  openModalB() {
    this.modalB.show();
  }

  // 🧠 Global key listener
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'o') {
      event.preventDefault(); // prevent default browser zoom
      this.openModalA();
    }
    if (event.ctrlKey && event.key === 'l') {
      event.preventDefault(); // prevent default browser zoom
      this.openModalE();
      this.getAllCustomAlerts();
    }
    // if (event.ctrlKey && event.key === 'c') {
    //   event.preventDefault();  // prevent default browser zoom
    //   this.CustomScreenerChart();

    // }
  }

  onCheckboxChange(list: any) {
    const expiryDateObj = new Date(list.expiry_date);
    const year = expiryDateObj.getFullYear();
    const month = (expiryDateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = expiryDateObj.getDate().toString().padStart(2, '0');

    const formattedExpiry = `${day}-${month}-${year}`; // yyyy-MM-dd format

    const scripObject = {
      symbol: list.symbol,
      expiry_date: formattedExpiry,
    };

    if (list.selected) {
      this.selectedScrips.push(scripObject);
    } else {
      const index = this.selectedScrips.findIndex(
        (item: any) =>
          item.symbol === scripObject.symbol &&
          item.expiry_date === scripObject.expiry_date
      );
      if (index > -1) {
        this.selectedScrips.splice(index, 1);
      }
    }
  }

  toggleSelectAll(event: any) {
    const isChecked = event.target.checked;
    this.selectedScrips = [];

    this.FutureListOption.forEach(
      (list: {
        selected: any;
        expiry_date: string | number | Date;
        symbol: any;
      }) => {
        list.selected = isChecked;
        if (isChecked) {
          const expiryDateObj = new Date(list.expiry_date);
          const year = expiryDateObj.getFullYear();
          const month = (expiryDateObj.getMonth() + 1)
            .toString()
            .padStart(2, '0'); // Months are 0-based
          const day = expiryDateObj.getDate().toString().padStart(2, '0');

          const formattedExpiry = `${day}-${month}-${year}`;

          const scripObject = {
            symbol: list.symbol,
            expiry_date: formattedExpiry,
          };

          this.selectedScrips.push(scripObject);
        }
      }
    );
  }

  onRadioChange(list: any) {
  }

  ShowCharts() {
    console.log(this.selectedFutureOption)
    this.scripDataService.setScripsForNSEFO([this.selectedFutureOption]);
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/futures']);
    });
  }

  onRowClick(item: any): void {
    // this.scripDataService.setScripsForNSEFO([item]);
    this.scripDataService.setScripsForNSEFO([
      {
        ...item,
        last_d_time: this.selectedFutureDate
      }
    ]);
    this.modalA.hide()
    this.selectedFutureDate = null;
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/futures']);
    });
  }

  selectFutureOption(list: any) {
    if (!this.isExpiryNear(list.expiry_date)) {
      this.selectedFutureOption = list;
      this.onRadioChange(list);
    }
  }

  showChart(symbol: any, date: any) {
    let obj = {
      expiry_date: date,
      symbol: symbol,
    };
    this.scripDataService.setScripsForNSEFO([obj]);
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/futures']);
    });
  }

  goToNextPage() {
    const totalPages = this.getTotalPages();
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.getcustomStockData(true);
    }
  }

  goToPreviousPage() {
    this.currentPage--;
    this.getcustomStockData(true);
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
    this.getcustomStockData(true);
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.getcustomStockData(true);
  }

  onSearchInput(value: string) {
    this.searchSubject.next(value);
  }

  isHighlighted(stockName: string): boolean {
    return this.highlightedStockNames.some(
      (name) => name.toLowerCase() === stockName.toLowerCase()
    );
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
    this.filteredListData.sort(
      (a: { [x: string]: any }, b: { [x: string]: any }) => {
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
      }
    );
  }

  executeTimeFrame(stock: any, time_frame: any, stock_id: any) {
    const obj = {
      tick: stock,
      time_frame: time_frame,
      stock_id: stock_id,
    };
    this.scripDataService.setCustomeObject([obj]);

    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/custom_screen']);
    });
  }

  /** Parse DD-MM-YYYY string into Date */
  private parseDDMMYYYY(dateStr: string): Date | null {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // months are 0-based
    const year = parseInt(parts[2], 10);

    return new Date(year, month, day);
  }

  /** Utility: strip hours/min/sec */
  private stripTime(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Disable if expiry is within N days from today (inclusive) */
  isExpiryWithinDays(dateStr: string, days = 5): boolean {
    const expiry = this.parseDDMMYYYY(dateStr);
    if (!expiry) return false;

    const today = this.stripTime(new Date());
    const expiryDate = this.stripTime(expiry);

    const diffMs = expiryDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // disable if expiry falls within [today, today + N days]
    return diffDays >= 0 && diffDays <= days;
  }

  isExpiryNear(expiryDate: string | Date): boolean {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 5; // mark as near-expiry or expired
  }

  viewLiquidStockPanel() {
    // this.showPanelForLiquidStock = true;
    this.showPanelForLiquidStock = !this.showPanelForLiquidStock;
    this.showPanelForNotification=false;
  }

  closePanel() {
    this.showPanelForLiquidStock = false;
  }

  closeNotificationPanel() {
    this.showPanelForNotification = false;
  }

  viewNotificationPanel() {
    event?.stopPropagation();          // ✅ prevents document click from firing
    this.showPanelForNotification = !this.showPanelForNotification;
  }

  future_liquidity_by_volume() {
    this.isLoading = true;
    this.apiService.future_liquidity_by_volume_Service().subscribe({
      next: (res: any) => {
        if (res.msg === 'success') {
          this.liquidStockList = res.response.slice(0, 30);
        } else {
          this.toastr.error('Failed to fetch data');
        }
        this.isLoading = false;
      },
      error: () => {
        this.toastr.error('API error');
        this.isLoading = false;
      },
    });
  }

  sortByVolume() {
    if (!this.liquidStockList) return;

    this.liquidStockList.sort((a: { avg_qty: any }, b: { avg_qty: any }) => {
      const volA = Number(a.avg_qty);
      const volB = Number(b.avg_qty);

      return this.sortDirection_LQD === 'asc' ? volA - volB : volB - volA;
    });

    // Toggle direction
    this.sortDirection_LQD = this.sortDirection_LQD === 'asc' ? 'desc' : 'asc';
  }

  stockDataFunc() {
    this.apiService
      .getStockList(localStorage.getItem('SelectedCountryName'))
      .subscribe((data) => {
        const apiResponse = data.response || [];

        this.stockData = apiResponse.sort((a: any, b: any) =>
          (a.stock_tick || '').localeCompare((b.stock_tick || ''))
        );

        this.filteredStockData = [...this.stockData];
      });
  }

  ViewAnalytics(stock_tick: any) {

    const currentRoute = this.router.url.split('/')[1];

    if (currentRoute === 'chart_analytics') {

      // Force Angular to reload the same route
      this.router.routeReuseStrategy.shouldReuseRoute = () => false;

      // Close modal
      this.modalE.hide();

      // Navigate to same route again (Angular will now reload it)
      this.router.onSameUrlNavigation = 'reload';
      this.router.navigate(
        ['chart_analytics', stock_tick.toLowerCase()]
      );

      return;
    }

    // Normal navigation
    this.router.navigate(['chart_analytics', stock_tick.toLowerCase()]);
  }

  generateCustomAlerts() {
    this.showmsg = "Please wait..";
    this.spinner.show();
    var data = this.PriceAlertForm.value;
    console.log("ALERT", data)
    this.submitted = true;
    this.PriceAlertForm.markAllAsTouched();
    if (this.PriceAlertForm.invalid) {
      this.spinner.hide();
      this.toastr.error("Please fill all the required fields !");
      return;
    }
    else {
      this.apiService.generateCustomAlertsService(data).subscribe((resp: any) => {
        if (resp.msg == "success") {
          this.spinner.hide();
          this.toastr.success("Alert set successfully !");
          this.PriceAlertForm.get('stock_symbol')?.reset();
          this.PriceAlertForm.get('threshold')?.reset();
          this.PriceAlertForm.get('condition')?.reset();
          this.PriceAlertForm.get('message')?.reset();
          this.submitted = false;
          this.getAllCustomAlerts();
          this.notificationCenter.refreshHistory();
        }
        else {
          this.spinner.hide();
          this.toastr.error(resp.msg);
        }
      })
    }
  }

  getAllCustomAlerts() {
    let obj = {
      country_id: this.SelectedCountryID ?? 1,
      user_id: this.UserId,
      // stock_symbol: this.searchTextcustom,
      start_date: this.selectedDateRangeforCustom.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRangeforCustom.endDate.format('YYYY-MM-DD'),
      // page_no: this.currentPage != null ? this.currentPage.toString() : undefined,
      // limit: this.pageSizeforCustomAlrt
    }
    this.apiService.getAllCustomAlertsService(obj).subscribe(data => {
      this.spinner.hide()
      if (data.msg == "success") {
        this.spinner.hide();
        this.customAlertData = data.response.alerts.slice(0, 5);
      }
      else {
        this.spinner.hide();
      }
    });
  }

  resetAlert() {
    this.PriceAlertForm.get('stock_symbol')?.reset();
    this.PriceAlertForm.get('threshold')?.reset();
    this.PriceAlertForm.get('condition')?.reset();
    this.PriceAlertForm.get('message')?.reset();
    this.submitted = false;
  }

  onViewClick(n: any) {
    console.log("DATA", n)
    localStorage.removeItem('SelectedTrade');
    this.showPanelForNotification=false;
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

  ReadAll() {
    this.apiService.readAllService().subscribe((resp: any) => {

    })
  }

  openFuturesType(type: 'near' | 'next' | 'far'): void {
    this.disconnectFutureExpiryWebSocket()
    console.log('Selected futures type:', type);
    this.connectFutureExpiryData(type);
    this.openModalA();


    // or if needed, store selected type
    // this.selectedFuturesType = type;
    // this.openModalA();
  }

onSearchStock(): void {
  const searchValue = (this.stockSearchText || '').trim().toLowerCase();

  if (!searchValue) {
    this.highlightedStock = null;
    return;
  }

  // 1. First priority: match from starting letter
  let matchedItem = this.futureContractList.find((item: any) =>
    (item?.symbol || '').toLowerCase().startsWith(searchValue)
  );

  // 2. Second priority: match from anywhere
  if (!matchedItem) {
    matchedItem = this.futureContractList.find((item: any) =>
      (item?.symbol || '').toLowerCase().includes(searchValue)
    );
  }

  if (!matchedItem) {
    this.highlightedStock = null;
    return;
  }

  this.highlightedStock = matchedItem.symbol;

  setTimeout(() => {
    const matchedIndex = this.futureContractList.findIndex(
      (item: any) => item?.symbol === matchedItem.symbol
    );

    const rowArray = this.stockRows.toArray();
    const rowElement = rowArray[matchedIndex];

    if (rowElement?.nativeElement) {
      rowElement.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

      rowElement.nativeElement.classList.add('fc-row--flash');

      setTimeout(() => {
        rowElement.nativeElement.classList.remove('fc-row--flash');
      }, 2200);
    }
  }, 100);
}

  clearSearch(): void {
    this.stockSearchText = '';
    this.highlightedStock = null;
    this.applyFiltersAndSort();
  }

  getInitials(stock: string): string {
    if (!stock) return '-';

    const cleaned = stock.replace(/[^a-zA-Z0-9]/g, ' ').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    return cleaned.substring(0, 2).toUpperCase();
  }

  isPositiveChange(value: string): boolean {
    return (value || '').trim().startsWith('+');
  }

  trackByStock(index: number, item: any): any {
    return item?.stock_id || index;
  }

  connectFutureExpiryData(expiry: any): void {
    this.allFutureContractList = [];
    this.futureContractList = [];
    this.webSocketService.ConnectFutureExpiryList(expiry);

    this.futureExpirySub = this.webSocketService.getFutureExpiryList().subscribe((data) => {
      const parsedData = JSON.parse(data);

      this.allFutureContractList = parsedData.stocks || [];
      this.applyFiltersAndSort();

      console.log("this.futureContractList", this.futureContractList);
    });
  }

  disconnectFutureExpiryWebSocket(): void {
    if (this.futureExpirySub) {
      this.futureExpirySub.unsubscribe();
    }

    this.webSocketService.disconnectFutureExpiryList();
  }

  openOhlcPanel(): void {
    this.isOhlcPanelOpen = true;
    document.body.style.overflow = 'hidden';
  }

  closeOhlcPanel(): void {
    this.isOhlcPanelOpen = false;
    this.submittedNSE = false;
    this.submittedMCX = false;
    this.submittedNSEFO = false;
    document.body.style.overflow = '';
    this.nseForm.reset();
    this.mcxForm.reset();
    this.nsefoForm.reset();
  }


  formatErrorMessage(message: string): string {
    if (!message) return 'Something went wrong';

    let formatted = message.replace(/_/g, ' ');
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

    return formatted;
  }

  formatDate(date: any): string {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  }


  setOhlcTab(tab: 'NSE' | 'MCX' | 'NSEFO'): void {
    this.activeOhlcTab = tab;
  }

  get nseH() {
    return this.nseForm.controls;
  }

  get mcxH() {
    return this.mcxForm.controls;
  }

  get nsefoH() {
    return this.nsefoForm.controls;
  }

  getOHLCdataNSE(): void {
    this.submittedNSE = true;

    if (this.nseForm.invalid) {
      this.nseForm.markAllAsTouched();
      return;
    }

    this.spinner.show();

    const category = 'NSE';
    const tick = this.nseForm.value.tick?.stock_tick || this.nseForm.value.tick;
    const timeframe = this.nseForm.value.time_frame;
    const single_timeframe = this.nseForm.value.single_time_frame;
    const start_date = this.formatDate(this.nseForm.value.start_date);
    const end_date = this.formatDate(this.nseForm.value.end_date);
    const expiry_date = this.nseForm.value.expiry_date
      ? this.formatDate(this.nseForm.value.expiry_date)
      : '';

    console.log('NSE payload', {
      category,
      tick,
      timeframe,
      single_timeframe,
      start_date,
      end_date,
      expiry_date
    });

    this.apiService.getOHLCdataService(
      tick,
      category,
      timeframe,
      single_timeframe,
      start_date,
      end_date,
      expiry_date
    ).subscribe({
      next: (res: any) => {
        this.spinner.hide();

        const blob = res.body;
        const url = window.URL.createObjectURL(blob);

        let fileName = 'downloaded_file';
        const contentDisposition = res.headers.get('content-disposition');

        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) {
            fileName = match[1];
          }
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();

        window.URL.revokeObjectURL(url);
      },
      error: async (err) => {
        this.spinner.hide();
        console.error('File download failed', err);

        if (err.error instanceof Blob) {
          try {
            const errorText = await err.error.text();
            const errorJson = JSON.parse(errorText);

            if (errorJson?.response) {
              this.toastr.error(this.formatErrorMessage(errorJson.response));
            } else if (errorJson?.msg) {
              this.toastr.error(this.formatErrorMessage(errorJson.msg));
            } else {
              this.toastr.error('Something went wrong');
            }
          } catch (e) {
            console.error('Error parsing blob error response', e);
            this.toastr.error('Something went wrong');
          }
        } else {
          this.toastr.error('File download failed');
        }
      }
    });
  }

  getOHLCdataMCX(): void {
    this.submittedMCX = true;

    if (this.mcxForm.invalid) {
      this.mcxForm.markAllAsTouched();
      return;
    }

    this.spinner.show();

    const category = 'MCX';
    const tick = this.mcxForm.value.tick;
    const timeframe = this.mcxForm.value.time_frame;
    const single_timeframe = this.mcxForm.value.single_time_frame;
    const start_date = this.formatDate(this.mcxForm.value.start_date);
    const end_date = this.formatDate(this.mcxForm.value.end_date);
    const expiry_date = this.formatDatemcx(this.mcxForm.value.expiry_date);

    console.log('MCX payload', {
      category,
      tick,
      timeframe,
      single_timeframe,
      start_date,
      end_date,
      expiry_date
    });

    this.apiService.getOHLCdataService(
      tick,
      category,
      timeframe,
      single_timeframe,
      start_date,
      end_date,
      expiry_date
    ).subscribe({
      next: (res: any) => {
        this.spinner.hide();

        const blob = res.body;
        const url = window.URL.createObjectURL(blob);

        let fileName = 'downloaded_file';
        const contentDisposition = res.headers.get('content-disposition');

        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) {
            fileName = match[1];
          }
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();

        window.URL.revokeObjectURL(url);
      },
      error: async (err) => {
        this.spinner.hide();
        console.error('File download failed', err);

        if (err.error instanceof Blob) {
          try {
            const errorText = await err.error.text();
            const errorJson = JSON.parse(errorText);

            if (errorJson?.response) {
              this.toastr.error(this.formatErrorMessage(errorJson.response));
            } else if (errorJson?.msg) {
              this.toastr.error(this.formatErrorMessage(errorJson.msg));
            } else {
              this.toastr.error('Something went wrong');
            }
          } catch (e) {
            console.error('Error parsing blob error response', e);
            this.toastr.error('Something went wrong');
          }
        } else {
          this.toastr.error('File download failed');
        }
      }
    });
  }

  formatDatemcx(date: any): string {
  if (!date) return '';

  if (typeof date === 'string') {
    // dd-mm-yyyy
    const parts = date.split('-');
    if (parts.length === 3 && parts[0].length === 2) {
      const [day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }

    // yyyy-mm-dd
    if (parts.length === 3 && parts[0].length === 4) {
      return date;
    }
  }

  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${year}-${month}-${day}`;
}

  getOHLCdataNSEFO(): void {
    this.submittedNSEFO = true;

    if (this.nsefoForm.invalid) {
      this.nsefoForm.markAllAsTouched();
      return;
    }

    this.spinner.show();

    const category = 'NSEFO';
    const tick = this.nsefoForm.value.tick;
    const timeframe = this.nsefoForm.value.time_frame;
    const single_timeframe = this.nsefoForm.value.single_time_frame;
    const start_date = this.formatDate(this.nsefoForm.value.start_date);
    const end_date = this.formatDate(this.nsefoForm.value.end_date);
    const expiry_date = this.formatDate(this.nsefoForm.value.expiry_date);

    const payload = {
      exchange: category,
      tick,
      time_frame: timeframe,
      single_timeframe,
      start_date,
      end_date,
      expiry_date
    };

    console.log('NSEFO payload', payload);

    this.apiService.getOHLCdataService(tick, category, timeframe, single_timeframe, start_date, end_date, expiry_date).subscribe({
      next: (res: any) => {
        this.spinner.hide();

        const blob = res.body;
        const url = window.URL.createObjectURL(blob);

        let fileName = 'downloaded_file';
        const contentDisposition = res.headers.get('content-disposition');

        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) {
            fileName = match[1];
          }
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();

        window.URL.revokeObjectURL(url);
      },
      error: async (err) => {
        this.spinner.hide();
        console.error('File download failed', err);

        if (err.error instanceof Blob) {
          try {
            const errorText = await err.error.text();
            const errorJson = JSON.parse(errorText);

            if (errorJson?.response) {
              this.toastr.error(this.formatErrorMessage(errorJson.response));
            } else if (errorJson?.msg) {
              this.toastr.error(this.formatErrorMessage(errorJson.msg));
            } else {
              this.toastr.error('Something went wrong');
            }
          } catch (e) {
            console.error('Error parsing blob error response', e);
            this.toastr.error('Something went wrong');
          }
        } else {
          this.toastr.error('File download failed');
        }
      }
    });
  }

  onNsefoSymbolChange(symbol: any) {
    console.log('selected symbol', symbol);

    this.nsefoForm.patchValue({
      expiry_date: ''
    });

    this.expiryDateList = [];

    if (!symbol) {
      return;
    }

    this.getExpiryDatesBySymbol(symbol);
  }

  getExpiryDatesBySymbol(symbol: string) {
    this.apiService.getFuturesListService(symbol).subscribe((res: any) => {
      console.log('expiry api response', res);

      if (res.msg === 'success') {
        const rawData = res.response || [];

        this.expiryDateList = rawData.map((item: any, index: number) => ({
          ...item,
          expiry_label:
            index === 0 ? 'Near' :
              index === 1 ? 'Next' :
                index === 2 ? 'Far' : `Tier ${index + 1}`
        }));

        console.log('expiryDateList', this.expiryDateList);
      } else {
        this.expiryDateList = [];
        this.toastr.error('Failed to fetch expiry dates');
      }
    });
  }

  onMcxSymbolChange(event: any) {
    const selectedSymbol = event?.target?.value || event;

    console.log('selectedSymbol', selectedSymbol);

    this.mcxForm.patchValue({
      expiry_date: null
    });

    this.mcxExpiryDateList = [];

    if (!selectedSymbol) {
      return;
    }

    const selectedRow = this.mcxFuturesList.find(
      (x: any) => (x.symbol || '').trim() === (selectedSymbol || '').trim()
    );

    console.log('selectedRow', selectedRow);

    if (!selectedRow) {
      return;
    }

    this.mcxExpiryDateList = [
      selectedRow.near
        ? {
          expiry_label: 'Near',
          expiry_date: selectedRow.near
        }
        : null,
      selectedRow.next
        ? {
          expiry_label: 'Next',
          expiry_date: selectedRow.next
        }
        : null,
      selectedRow.far
        ? {
          expiry_label: 'Far',
          expiry_date: selectedRow.far
        }
        : null
    ].filter(Boolean);

    console.log('mcxExpiryDateList', this.mcxExpiryDateList);
  }

  sortBy(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.applyFiltersAndSort();
  }

  applyFiltersAndSort(): void {
  let data = [...this.allFutureContractList];

  if (this.sortColumn) {
    data.sort((a: any, b: any) => {
      let valueA = a?.[this.sortColumn];
      let valueB = b?.[this.sortColumn];

      if (valueA == null) valueA = '';
      if (valueB == null) valueB = '';

      if (this.sortColumn === 'expiry_date') {
        valueA = new Date(valueA).getTime() || 0;
        valueB = new Date(valueB).getTime() || 0;
      }

      if (['price', 'prev_close', 'day_change', 'day_change_percentage'].includes(this.sortColumn)) {
        valueA = parseFloat(valueA) || 0;
        valueB = parseFloat(valueB) || 0;
      }

      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();

      if (valueA < valueB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  this.futureContractList = data;
}

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return 'fa-sort';
    return this.sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  updateSelectedDate(event: any): void {
    const value = event.target.value;
    this.selectedFutureDate = value;
  }


  handleTimeframeMutualReset(form: FormGroup): void {
    const multiCtrl = form.get('time_frame');
    const singleCtrl = form.get('single_time_frame');

    multiCtrl?.valueChanges.subscribe((value) => {
      const singleValue = singleCtrl?.value;

      if (value !== '' && value !== null && value !== undefined) {
        if (singleValue !== '' && singleValue !== null && singleValue !== undefined) {
          this.toastr.warning('Only one timeframe can be selected at a time.');
          singleCtrl?.setValue('', { emitEvent: false });
        }
      }
    });

    singleCtrl?.valueChanges.subscribe((value) => {
      const multiValue = multiCtrl?.value;

      if (value !== '' && value !== null && value !== undefined) {
        if (multiValue !== '' && multiValue !== null && multiValue !== undefined) {
          this.toastr.warning('Only one timeframe can be selected at a time.');
          multiCtrl?.setValue('', { emitEvent: false });
        }
      }
    });
  }

  initializeTimeframeMutualReset(): void {
    [this.nseForm, this.mcxForm, this.nsefoForm].forEach((form) => {
      this.handleTimeframeMutualReset(form);
    });
  }

  openDatePicker(input: HTMLInputElement): void {
    const dateInput = input as HTMLInputElement & { showPicker?: () => void };

    if (dateInput.showPicker) {
      dateInput.showPicker();
    } else {
      dateInput.focus();
    }
  }

  downloadExcel(): void {
    if (!this.liquidStockList || this.liquidStockList.length === 0) {
      return;
    }

    const excelData = this.liquidStockList.map((item: any) => {
      const expiryDates = item.expiry_dates || [];

      return {
        Symbol: item.symbol || '',
        'Avg Volume (Month)': item.avg_qty || '',
        'Near Expiry': expiryDates[0] || '',
        'Next Expiry': expiryDates[1] || '',
        'Far Expiry': expiryDates[2] || ''
      };
    });

    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(excelData);
    const workbook: XLSX.WorkBook = {
      Sheets: { 'Most Liquid Stock': worksheet },
      SheetNames: ['Most Liquid Stock']
    };

    const excelBuffer: any = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array'
    });

    const blob: Blob = new Blob(
      [excelBuffer],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' }
    );

    saveAs(blob, `Most_Liquid_Stock_${new Date().getTime()}.xlsx`);
  }

  toggleTradeScope(): void {
  this.showTradeScope = !this.showTradeScope;

  // Fetch data only when popup is opened
  if (this.showTradeScope) {
    this.loadTradeScope();
  }
}

loadTradeScope(): void {
  this.isTradeScopeLoading = true;
  this.tradeScopeError = '';
  this.tradeScopeData = [];

  this.apiService.getTradeScope().subscribe({
    next: (res: any) => {
      console.log('getTradeScope response', res);

      if (res?.msg === 'success' && res?.response) {
        this.tradeScopeData = Object.keys(res.response).map((market: string) => ({
          market: market,
          actions: Array.isArray(res.response[market])
            ? res.response[market]
            : []
        }));
      } else {
        this.tradeScopeError = res?.response || 'Unable to load trading scope.';
      }

      this.isTradeScopeLoading = false;
    },

    error: (error: any) => {
      console.error('getTradeScope error:', error);

      this.isTradeScopeLoading = false;
      this.tradeScopeData = [];
      this.tradeScopeError = 'Unable to load trading scope.';
    }
  });
}

@HostListener('document:click')
closeTradeScope(): void {
  this.showTradeScope = false;
}

@HostListener('document:keydown.escape')
closeTradeScopeOnEscape(): void {
  this.showTradeScope = false;
}

}
