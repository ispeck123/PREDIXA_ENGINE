import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { Router, TitleStrategy } from '@angular/router';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { ManualRectangleRecord, Point, RectangleDrawingTool, RectangleStyleOptions } from '../homecandles/rectangle-drawing-tool';
import moment from 'moment';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { debounceTime, filter, forkJoin, fromEvent, map, of, Subscription, timestamp } from 'rxjs';
import { Subject } from 'rxjs';
import { FloatingModalComponent } from '../floating-modal/floating-modal.component';
import { formatDate } from '@angular/common';
import { ChartDrawingLineStyle, ChartDrawingPoint, ChartDrawingRecord, ChartDrawingStylePatch, ChartDrawingTool, ChartDrawingToolType } from '../homecandles/chart-drawing-tool';
import { catchError, finalize, switchMap, tap } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';



type Patch = Partial<{
  optimized_buy_sell_zone: boolean;
  qualified_zones: boolean;
}>;

type MenuRule = {
  base: string;
  htf_zone?: Record<string, Patch>;
};

type HtfMemory = {
  htf: boolean;
  qualified: boolean;
};

// exchange_name -> activeMenu -> rule
const EXCHANGE_HTF_ZONE_RULES: Record<string, Record<string, MenuRule>> = {
  // ======================
  // NSE
  // ======================
  NSE: {
    daily: {
      base: "daily",
      htf_zone: {
        monthly: { qualified_zones: false, optimized_buy_sell_zone: true },
        weekly: { qualified_zones: false, optimized_buy_sell_zone: true },
      }
    },

    sixty: {
      base: "sixty",
      htf_zone: {
        weekly: { optimized_buy_sell_zone: true },
        daily: { optimized_buy_sell_zone: true },
        seventy_five: { optimized_buy_sell_zone: true },
      }
    },

    fifteen: {
      base: "fifteen",
      htf_zone: {
        daily: { optimized_buy_sell_zone: true },
        sixty: { optimized_buy_sell_zone: true },
      }
    },

    one_twenty_five: {
      base: "one_twenty_five",
      htf_zone: {
        weekly: { optimized_buy_sell_zone: true },
        daily: { optimized_buy_sell_zone: true },
      }
    },

    seventy_five: {
      base: "seventy_five",
      htf_zone: {
        weekly: { optimized_buy_sell_zone: true },
        daily: { optimized_buy_sell_zone: true },
      }
    },

    twenty_five: {
      base: "twenty_five",
      htf_zone: {
        daily: { optimized_buy_sell_zone: true },
        one_twenty_five: { optimized_buy_sell_zone: true },
      }
    },
  },

  // ======================
  // NSEFO
  // ======================
  NSEFO: {
    daily: {
      base: "daily",
      htf_zone: {
        monthly: { qualified_zones: false, optimized_buy_sell_zone: true },
        weekly: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },

    seventy_five: {
      base: "seventy_five",
      htf_zone: {
        weekly: { qualified_zones: false, optimized_buy_sell_zone: true },
        daily: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },

    sixty: {
      base: "sixty",
      htf_zone: {
        weekly: { qualified_zones: false, optimized_buy_sell_zone: true },
        daily: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },

    fifteen: {
      base: "fifteen",
      htf_zone: {
        daily: { qualified_zones: false, optimized_buy_sell_zone: true },
        seventy_five: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },
  },

  // ======================
  // MCX
  // ======================
  MCX: {
    daily: {
      base: "daily",
      htf_zone: {
        monthly: { qualified_zones: false, optimized_buy_sell_zone: true },
        weekly: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },

    two_forty: {
      base: "two_forty",
      htf_zone: {
        weekly: { qualified_zones: false, optimized_buy_sell_zone: true },
        daily: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },

    sixty: {
      base: "sixty",
      htf_zone: {
        daily: { qualified_zones: false, optimized_buy_sell_zone: true },
        two_forty: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },

    one_twenty: {
      base: "one_twenty",
      htf_zone: {
        daily: { qualified_zones: false, optimized_buy_sell_zone: true },
        two_forty: { qualified_zones: false, optimized_buy_sell_zone: true },
      },
    },
  },
};



@Component({
  selector: 'app-available-trades',
  templateUrl: './available-trades.component.html',
  styleUrls: ['./available-trades.component.css']
})

export class AvailableTradesComponent implements OnInit {

  //#region Variable Declaration
  private overlapMemory: Record<string, { evaluate: boolean; analyze: boolean; qualified: boolean }> = {};
  private htfZoneMemory: Record<string, HtfMemory> = {};
  @ViewChild('tradeScroll') tradeScroll!: ElementRef<HTMLElement>;
  modalAPos = { top: 0, left: 0 };
  EntryEndTime: any
  LastValidEntryPrice: any;
  LastValidEntryTime: any;
  LastValidEntryEndTime: any;
  TargetStartTime: any;
  TargetEndTime: any;
  LastValidTargetPrice: any;
  LastValidTargetStartTime: any;
  LastValidTargetEndTime: any;
  StopStartTime: any;
  StopEndTime: any;
  LastValidStopPrice: any;
  LastValidStopStartTime: any;
  LastValidStopEndTime: any;
  @ViewChild('modalalert') modalalert!: FloatingModalComponent;
  @ViewChild('chart_container_new') chartContainer!: ElementRef;
  @ViewChild('modalA') modalA!: FloatingModalComponent;
  lastBar: any;
  PreviousHighData: any;
  selectedTradeType: any;
  selectedTradeId: any;
  activeMenu: string = 'daily';
  realTimePrice: any;
  DailyTrades: any;
  SixtyTrades: any;
  FifteenTrades: any;
  TwoFortyTrades: any;
  OneTwentyTrades: any;
  SeventyFiveTrades: any;
  OneTwentyFiveTrades: any;
  TwentyFiveTrades: any;
  candles: { color: string; height: number, wickHeight: number }[] = [];
  colorInterval: any;
  showmsg: any;
  stockData: any;
  selectedStock: any = "All";
  SpinnerCounter: any;
  SelectedStockName: any;
  finData: any;
  time_frame: any = 1;
  FullScreenModeValue: any;
  ModalHeader: any;
  QualifiedData: any;
  BaseCandleData: any;
  BuyZoneData: any;
  SellZoneData: any;
  AllZonesData: any;
  OverLayCandleData: any;
  BuyOverlayData: any;
  SellOverlayData: any;
  AnalyzeOverlayData: any;
  ChartRESPONSE: any;
  lastTime: any;
  status: any;
  purchased_date: any;
  entry_timestamp: any;
  completed_on: any;
  entry_price: any;
  stoploss_price: any;
  target_price: any;
  order_type: any;
  private buylineSeries: any;
  private targetlineSeries: any;
  private stoplosslineSeries: any;
  chart: any;
  timestampInSeconds_completed: any;
  selectedOptions: any = {
    base_candle: false,
    buy_sell_zone: false,
    bad_zone: false,
    setup: false,
    overlap_evaluate: false,
    overlap_analyze: false
  };
  ModelPrediction: any;
  private candlestickSeries: any;
  rectangleTool: any;
  toolTipData: any;
  Open: any;
  High: any;
  Low: any;
  private areaSeries: any;
  Close: any;
  CandleColor: any;
  dropdownShow: any;
  lastRow: any;
  xspan: any;
  BadZoneData: any;
  fincreateform: FormGroup;
  fincreateformForPanel: FormGroup;
  submitted = false;
  SelectedStock: any;
  RRR: any;
  @ViewChild('closemodal') closemodal!: ElementRef;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  SelectedCountryId: any;
  SelectedCountryName: any;
  lastCMPLine: any = null;
  FullChartResponse: any;
  QualifiedZoneFlag: boolean = false;
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  highlightedStockNames: string[] = [];
  highlightedStockNamesSixty: string[] = [];
  highlightedStockNamesFifteen: string[] = [];
  highlightedStockNames240: string[] = [];
  highlightedStockNames120: string[] = [];
  highlightedStockNames75: string[] = [];
  highlightedStockNames125: string[] = [];
  highlightedStockNames25: string[] = [];
  FullScreenMode: boolean = false;
  typedText: string = '';
  private keySub!: Subscription;
  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  totalCount: any;
  currentPage: any;
  exchanges: any;
  selectedExchange: any;
  SelectedStockId: any;
  dailyState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };

  sixtyState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };

  fifteenState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };

  twofortyState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };

  onetwentyState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };


  seventyfiveState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };

  onetwentyfiveState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };
  twentyfiveState = {
    currentPage: 1,
    totalCount: 0,
    searchKey: '',
    trades: [] as any[]
  };

  pageSize = 10;
  searchText: string = '';
  searchSubject: Subject<string> = new Subject<string>();
  selectedDateRange: any;
  SelectedTimeFrame: any;
  getting_Stock_Tick_by_StockName: any;
  PricePercentageData: any;
  PP_Analyze: any;
  PP_Evaluate: any;
  PP_Execute: any;
  PP_Reason: any;
  PP_FinalDecision: any;
  showPopup = false;

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
  pageSizeOptions = [10, 25, 50, 100];
  StartDate: any;
  EndDate: any;
  highlightedStockTick: string = '';
  MatchedCount: number = 0;
  alertForm: FormGroup;
  countryId: any;
  userId: any;
  submitStock = false;
  allSetAlerts: any = [];
  SelectedExchange_Id: any = 8;
  SelectedExchange_Name: any;
  stockId: string;
  showCreateOrderModal = false;
  showCreateOrderModalforButtonClick = false;
  fincreateorderData: any;
  submit: boolean = false;
  updateModelPredictionFlag: boolean = false;
  EntryPrice: any;
  EntryTime: any;
  StoplossPrice: any;
  TargetPrice: any;
  isNotificationVisible: boolean = false;
  SETUPTYPE: any;
  UpdateTradeFlag = false;
  Prediction: any;
  Probability: any;
  SelectedExpiryDate: any;
  OptimizedBuySellZoneData: any;
  isChecked: boolean = true;
  isCheckedForCMP: boolean = false;
  showReasonPanel = false;
  reasons: string[] = [];
  tradeTypeOpen = false;
  isPopupOpen = false;
  selectTradeType: any = "all";
  EXP_NUM: any;
  SelectedTradeId: any;
  isMobile: boolean = false;
  isMobileActionPanelOpen = false;
  isMobileScreen = false;
  showMobileTradeMenu = false;
  isLeftBarOpen = false;
  ScoreData: any;
  isDownloadingTrades: boolean = false;




  // MANUAL DRAWING VARIABLE

  manualRectangleTool: RectangleDrawingTool | null = null;
  manualRectangles: ManualRectangleRecord[] = [];
  activeManualZoneType: 'BUY' | 'SELL' | null = null;
  candleSeries: any = null;
  isRectangleDrawing: boolean = false;

  // TRADE TIGER STYLE DRAWING TOOL
  chartDrawingTool: ChartDrawingTool | null = null;
  chartDrawingItems: ChartDrawingRecord[] = [];
  activeChartDrawingTool: ChartDrawingToolType = 'none';
  showChartDrawingToolMenu: boolean = false;
  chartDrawingToolPopupStyle: any = {};

  // EDIT TOOL

  selectedChartDrawing: ChartDrawingRecord | null = null;

  drawingLineWidths: number[] = [1, 2, 3, 4, 5];

  drawingLineStyles: ChartDrawingLineStyle[] = [
    'solid',
    'dashed',
    'dotted',
  ];

  // CMP HOVER VARIABLE

  cmpHover: any = {
    visible: false,
    loading: false,
    symbol: '',
    exchangeName: '',
    expiryDate: null,
    price: null,
    error: '',
    x: 0,
    y: 0,
    rowKey: ''
  };

  private cmpSocket: WebSocket | null = null;
  private cmpHoverTimer: any = null;
  private cmpCache = new Map<string, { price: number; at: number }>();
  private cmpCacheMs = 5000;

  private readonly wsBase = environment.production
    ? `wss://${window.location.host}${environment.wsPath}`
    : environment.wsBase;

  private nseCmpWsBaseUrl = this.wsBase + '/ws/all_stock_live_prices';
  private nsefoCmpWsBaseUrl = this.wsBase + '/ws/future_live_price';
  private mcxCmpWsBaseUrl = this.wsBase + '/ws/commodity_live_price';

  //#endregion

  constructor(private elementRef: ElementRef, private cdr: ChangeDetectorRef, private formBuilder: FormBuilder, private toastr: ToastrService, private webSocketService: WebSocketService, private router: Router, private spinner: NgxSpinnerService, private apiService: ApiService) {
    this.xspan = 3600;
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent) {
    if (!this.isLeftBarOpen) return;

    const leftBar = document.getElementById('leftBar');
    const target = event.target as HTMLElement;

    if (leftBar && leftBar.contains(target)) return;

    const settingsBtn = target.closest('.trade-header__settings');
    if (settingsBtn) return;

    this.openBar(false);
  }

  @HostListener('document:keydown', ['$event'])
  handleExchangeShortcutKeys(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const tagName = target?.tagName?.toLowerCase();

    // Do not trigger shortcut while typing
    if (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target?.isContentEditable
    ) {
      return;
    }

    // Do not disturb browser/system shortcuts
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    // Prevent continuous toggle when key is held
    if (event.repeat) {
      return;
    }

    const key = event.key.toLowerCase();

    switch (key) {
      case 'q':
        event.preventDefault();
        this.toggleQualifiedZoneShortcutByRule();
        break;

      case 'a':
        event.preventDefault();
        this.checkboxClicked('all_zones');
        break;

      case 'b':
        event.preventDefault();
        this.checkboxClicked('base_candle');
        break;

      case 'z':
        event.preventDefault();
        this.toggleHtfShortcutByExchangeRulex();
        break;
    }
  }

  private toggleQualifiedZoneShortcutByRule(): void {

    const rule = this.getCurrentExchangeRuleForShortcut();

    if (!rule) {
      console.log('Q blocked: No HTF rule found for current exchange/menu.');
      return;
    }

    const currentTf = this.normalizeShortcutTf(this.FullScreenModeValue);
    const baseTf = this.normalizeShortcutTf(rule.base);

    if (currentTf !== baseTf) {
      console.log(
        `Q blocked: qualified_zones allowed only on execution timeframe. Base: ${baseTf}, Current: ${currentTf}`
      );
      return;
    }

    this.checkboxClicked('qualified_zones');
  }

  private toggleHtfShortcutByExchangeRulex(): void {

    const rule = this.getCurrentExchangeRuleForShortcut();

    if (!rule) {
      console.log('Shortcut blocked: No HTF rule found for current exchange/menu.');
      return;
    }

    const currentTf = this.normalizeShortcutTf(this.FullScreenModeValue);

    // Case 1: current timeframe is base
    if (currentTf === rule.base) {
      this.checkboxClicked('htf_zone');
      return;
    }

    // Case 2: current timeframe is valid HTF child
    const patch = rule.htf_zone?.[currentTf];

    if (!patch) {
      console.log(
        `Shortcut blocked: Z not allowed on ${currentTf} for base ${rule.base}`
      );
      return;
    }

    /*
      Apply patch values except optimized_buy_sell_zone,
      because checkboxClicked('optimized_buy_sell_zone')
      will toggle optimized_buy_sell_zone itself.
    */
    Object.keys(patch).forEach((key) => {
      if (key !== 'optimized_buy_sell_zone') {
        this.selectedOptions[key] = patch[key as keyof Patch];
      }
    });

    this.checkboxClicked('optimized_buy_sell_zone');
  }

  private getCurrentExchangeRuleForShortcut(): MenuRule | null {
    const exchangeName = this.getCurrentExchangeNameForHtf();

    if (!exchangeName) {
      return null;
    }

    const rulesForExchange = EXCHANGE_HTF_ZONE_RULES[exchangeName];

    if (!rulesForExchange) {
      return null;
    }

    let rule: MenuRule | undefined = rulesForExchange[this.activeMenu];

    if (!rule) {
      rule = Object.values(rulesForExchange).find(
        r =>
          r.base === this.activeMenu ||
          r.base === this.FullScreenModeValue ||
          !!r.htf_zone?.[this.FullScreenModeValue]
      );
    }

    return rule || null;
  }

  private normalizeShortcutTf(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  toggleMobileTradeMenu(): void {
    this.showMobileTradeMenu = !this.showMobileTradeMenu;
  }

  closeMobileTradeMenu(): void {
    this.showMobileTradeMenu = false;
  }

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

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {

    // Delete selected manual Buy/Sell zone
    if (event.key === 'Delete' && this.manualRectangleTool) {
      const deleted = this.manualRectangleTool.deleteSelectedRectangle();

      if (deleted) {
        event.preventDefault();
        event.stopPropagation();
        this.activeManualZoneType = null;
        this.forceChartRedraw();
        return;
      }
    }

    // ✅ Delete selected Trade Tiger drawing tool item
    if (event.key === 'Delete' && this.chartDrawingTool) {
      const deleted = this.chartDrawingTool.deleteSelected();

      if (deleted) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    // table scroll
    if (this.FullScreenMode == false) {
      const container = this.tradeScroll?.nativeElement;
      if (!container) return;

      // do nothing if table does not overflow
      if (container.scrollWidth <= container.clientWidth) return;

      // do nothing while typing in input/textarea/select
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();

      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }

      const step = 120;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        container.scrollBy({
          left: step,
          behavior: 'smooth'
        });
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        container.scrollBy({
          left: -step,
          behavior: 'smooth'
        });
      }
    }
    // table scroll end
    // ✅ Prevent shortcut logic if focus is in an input or textarea
    const tagName = (event.target as HTMLElement).tagName.toLowerCase();
    const isEditable = (event.target as HTMLElement).isContentEditable;

    if (tagName === 'input' || tagName === 'textarea' || isEditable) {
      return;
    }
    // this.QualifiedZoneFlag = false;
    if (this.FullScreenMode == true) {
      if (event.key == "ArrowLeft") {
        this.shiftChart(-10);
      }
      if (event.key == "ArrowRight") {
        this.shiftChart(10);
      }
    }

    if (event.key == "+" || event.key == "=") {
      this.scaleChart(1 / 8, true);
    }

    if (event.key == "-") {
      this.scaleChart(1 / 8, false);
    }

    let dataPresent = false;
    if (this.selectedExchange.exchange_name == "NSE") {
      if (this.activeMenu == "daily") {
        switch (event.key) {
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('monthly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              this.QualifiedZoneFlag = true;
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.ChangeScreenMode('daily', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "sixty") {
        switch (event.key) {
          case '7':
            dataPresent = !!this.FullChartResponse['seventy_five'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('seventy_five', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case '6':
            dataPresent = !!this.FullChartResponse['sixty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('sixty', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "fifteen") {
        switch (event.key) {
          case '5':
            dataPresent = !!this.FullChartResponse['fifteen'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('fifteen', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          // case '7':
          //   dataPresent = !!this.FullChartResponse['seventy_five'];
          //   if (dataPresent) {
          //     this.selectedOptions = []
          //     this.dropdownShow = false;
          //     this.QualifiedZoneFlag = false;
          //     this.ChangeScreenMode('seventy_five', 'chart-container_new',false);
          //   }
          //   else {
          //     this.toastr.error(`No Data Found !`)
          //   }
          //   break;
          case '6':
            dataPresent = !!this.FullChartResponse['sixty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('sixty', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "seventy_five") {
        switch (event.key) {
          case '7':
            dataPresent = !!this.FullChartResponse['seventy_five'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('seventy_five', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "one_twenty_five") {
        switch (event.key) {
          case '1':
            dataPresent = !!this.FullChartResponse['one_twenty_five'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('one_twenty_five', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('monthly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "twenty_five") {
        switch (event.key) {
          case '2':
            dataPresent = !!this.FullChartResponse['twenty_five'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('twenty_five', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case '1':
            dataPresent = !!this.FullChartResponse['one_twenty_five'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('one_twenty_five', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }
    }

    if (this.selectedExchange.exchange_name == "MCX") {
      if (this.activeMenu == "daily") {
        switch (event.key) {
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('monthly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              this.QualifiedZoneFlag = true;
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.ChangeScreenMode('daily', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "sixty") {
        switch (event.key) {
          case '4':
            dataPresent = !!this.FullChartResponse['two_forty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('two_forty', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case '6':
            dataPresent = !!this.FullChartResponse['sixty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('sixty', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "one_twenty") {
        switch (event.key) {
          case '2':
            dataPresent = !!this.FullChartResponse['one_twenty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('one_twenty', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case '4':
            dataPresent = !!this.FullChartResponse['two_forty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('two_forty', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "two_forty") {
        switch (event.key) {
          case '4':
            dataPresent = !!this.FullChartResponse['two_forty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('two_forty', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }
    }

    if (this.selectedExchange.exchange_name == "NSEFO") {

      if (this.activeMenu == "daily") {
        switch (event.key) {
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('monthly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              this.QualifiedZoneFlag = true;
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.ChangeScreenMode('daily', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "sixty") {
        switch (event.key) {
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case '6':
            dataPresent = !!this.FullChartResponse['sixty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('sixty', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "seventy_five") {
        switch (event.key) {
          case '5':
            dataPresent = !!this.FullChartResponse['seventy_five'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('seventy_five', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.activeMenu == "fifteen") {
        switch (event.key) {
          case '5':
            dataPresent = !!this.FullChartResponse['fifteen'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('fifteen', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case '6':
            dataPresent = !!this.FullChartResponse['sixty'];
            if (dataPresent) {
              // this.selectedOptions = []
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('sixty', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }
    }
  }

  ChangeScreenMode(type: any, chartId: any, setupReq: boolean) {
    const prevFullScreen = this.FullScreenModeValue;
    if (prevFullScreen === type) {
      return;
    }
    this.destroyManualRectangleTool();
    this.disconnectWebSocket()
    const dataPresent: boolean = !!this.FullChartResponse[type];
    if (dataPresent) {
      switch (type) {
        case "monthly":
          this.ModalHeader = type;
          this.FullScreenModeValue = type;
          break;
        case "weekly":
          this.ModalHeader = type;
          this.FullScreenModeValue = type;
          break;
        case "daily":
          this.ModalHeader = type;
          this.FullScreenModeValue = type;
          break;
        case "seventy_five":
          this.ModalHeader = "75 Minute";
          this.FullScreenModeValue = type;
          break;
        case "sixty":
          this.ModalHeader = "60 Minute";
          this.FullScreenModeValue = type;
          break;
        case "fifteen":
          this.ModalHeader = "15 Minute";
          this.FullScreenModeValue = type;
          break;
        case "one_twenty":
          this.ModalHeader = "120 Minute";
          this.FullScreenModeValue = type;
          break;
        case "two_forty":
          this.ModalHeader = "240 Minute";
          this.FullScreenModeValue = type;
          break;
        case "one_twenty_five":
          this.ModalHeader = "125 Minute";
          this.FullScreenModeValue = type;
          break;
        case "twenty_five":
          this.ModalHeader = "25 Minute";
          this.FullScreenModeValue = type;
          break;
      }

      const data = this.FullChartResponse[type];
      this.cleanup();
      this.LoadChart(data, chartId);
      this.initOldZoneRectangleTool(chartId);
      this.initManualRectangleTool(type, data);
      this.initChartDrawingTool(type, data);
      const lastRow = data.slice(-1)[0];
      this.CreateClosingLine(lastRow.close)
      this.addPreviousHighPriceLine(type)
      this.connectWebSocket(type);
      this.handleHtfZoneMemoryAndOptimized(prevFullScreen)
      this.checkboxClicked(this.selectedOptions)
      if (setupReq) {
        this.getsetup(this.purchased_date, this.entry_timestamp, this.entry_price, this.stoploss_price, this.target_price)
      }
    }
    else {
      this.toastr.error(`No Data found !`)
      return;
    }
  }

  private handleHtfZoneMemoryAndOptimized(prevFullScreen: string): void {
    const exchangeName = (
      this.selectedExchange?.exchange_name ||
      this.SelectedExchange_Name ||
      ""
    ).trim().toUpperCase();

    if (!exchangeName) return;

    const rulesForExchange = EXCHANGE_HTF_ZONE_RULES[exchangeName];
    if (!rulesForExchange) return;

    let rule: MenuRule | undefined = rulesForExchange[this.activeMenu];

    if (!rule) {
      rule = Object.values(rulesForExchange).find(
        r => r.base === prevFullScreen || r.base === this.FullScreenModeValue
      );
    }

    if (!rule) return;

    const memKey = `${exchangeName}__${rule.base}`;

    if (!this.htfZoneMemory[memKey]) {
      this.htfZoneMemory[memKey] = {
        htf: false,
        qualified: false
      };
    }

    const mem = this.htfZoneMemory[memKey];

    /**
     * 1. If user is leaving base timeframe,
     * remember HTF Zone and Qualified Zone state.
     */
    if (prevFullScreen === rule.base) {
      mem.htf = !!this.selectedOptions["htf_zone"];
      mem.qualified = !!this.selectedOptions["qualified_zones"];
    }

    /**
     * 2. If user is leaving mapped HTF child timeframe,
     * remember whether optimized zone was active.
     */
    const leavingHtfTarget = !!rule.htf_zone?.[prevFullScreen];

    if (prevFullScreen !== rule.base && leavingHtfTarget) {
      mem.htf = !!this.selectedOptions["optimized_buy_sell_zone"];
    }

    /**
     * 3. Restore HTF Zone only on base timeframe.
     */
    if (this.FullScreenModeValue === rule.base) {
      this.selectedOptions["htf_zone"] = mem.htf;
      this.selectedOptions["qualified_zones"] = mem.qualified;
    } else {
      this.selectedOptions["htf_zone"] = false;
      this.selectedOptions["qualified_zones"] = false;
    }

    /**
     * 4. Clean old overlap buttons permanently.
     */
    this.selectedOptions["overlap_evaluate"] = false;
    this.selectedOptions["overlap_analyze"] = false;

    /**
     * 5. Reset computed child-side option.
     */
    this.selectedOptions["optimized_buy_sell_zone"] = false;

    /**
     * 6. If HTF Zone is active, apply child patch.
     */
    if (mem.htf) {
      const patch = rule.htf_zone?.[this.FullScreenModeValue];

      if (patch) {
        Object.assign(this.selectedOptions, patch);
      }
    }

    /**
     * 7. Optimized zones and setup should not show together.
     */
    if (this.selectedOptions["optimized_buy_sell_zone"]) {
      this.selectedOptions["setup"] = false;
    }

    console.log("exchangeName:", exchangeName);
    console.log("activeMenu:", this.activeMenu);
    console.log("prevFullScreen:", prevFullScreen);
    console.log("FullScreenModeValue:", this.FullScreenModeValue);
    console.log("rule:", rule);
    console.log("memKey:", memKey);
    console.log("mem:", mem);
    console.log("selectedOptions:", this.selectedOptions);
  }

  private getCurrentExchangeNameForHtf(): string {
    return (
      this.selectedExchange?.exchange_name ||
      this.SelectedExchange_Name ||
      ""
    ).trim().toUpperCase();
  }

  private getParentAnalyzeTfKeyForCurrentChartExchange(): string | null {
    const exchangeName = this.getCurrentExchangeNameForHtf();

    if (!exchangeName) {
      return null;
    }

    const rulesForExchange = EXCHANGE_HTF_ZONE_RULES[exchangeName];

    if (!rulesForExchange) {
      return null;
    }

    let rule: MenuRule | undefined = rulesForExchange[this.activeMenu];

    if (!rule) {
      rule = Object.values(rulesForExchange).find(
        r =>
          r.base === this.activeMenu ||
          r.base === this.FullScreenModeValue ||
          !!r.htf_zone?.[this.FullScreenModeValue]
      );
    }

    if (!rule || !rule.htf_zone) {
      return null;
    }

    const htfKeys = Object.keys(rule.htf_zone);

    /*
      Example NSE daily:
      htfKeys = ["monthly", "weekly"]
  
      current chart = weekly
      parent = monthly
  
      Example NSE sixty:
      htfKeys = ["weekly", "daily", "seventy_five"]
  
      current chart = daily
      parent = weekly
  
      current chart = seventy_five
      parent = daily
    */

    const currentIndex = htfKeys.indexOf(this.FullScreenModeValue);

    if (currentIndex <= 0) {
      return null;
    }

    return htfKeys[currentIndex - 1];
  }

  private getAnalyzeOverlayZoneDataExchange(parentTfKey: string): any {
    if (!this.AnalyzeOverlayData) {
      return null;
    }

    // Case 1: timeframe-wise data
    if (this.AnalyzeOverlayData[parentTfKey]) {
      return this.AnalyzeOverlayData[parentTfKey];
    }

    // Case 2: direct Buy/Sell data
    if (this.AnalyzeOverlayData.Buy || this.AnalyzeOverlayData.Sell) {
      return this.AnalyzeOverlayData;
    }

    return null;
  }


  private getHtfLabelExchange(tfKey: string): string {
    const labelMap: Record<string, string> = {
      monthly: "Monthly",
      weekly: "Weekly",
      daily: "Daily",
      two_forty: "240 Min",
      one_twenty: "120 Min",
      one_twenty_five: "125 Min",
      seventy_five: "75 Min",
      sixty: "60 Min",
      fifteen: "15 Min",
      twenty_five: "25 Min",
    };

    return labelMap[tfKey] || tfKey;
  }


  private drawParentAnalyzeZoneOnChildChartExchange(
    buyfillColor: string,
    buyoutlineColor: string,
    buytextColor: string,
    sellfillColor: string,
    selloutlineColor: string,
    selltextColor: string
  ): void {
    const parentTfKey = this.getParentAnalyzeTfKeyForCurrentChartExchange();

    if (!parentTfKey) {
      return;
    }

    const zoneData = this.getAnalyzeOverlayZoneDataExchange(parentTfKey);

    if (!zoneData) {
      console.log("No AnalyzeOverlayData found for:", parentTfKey);
      return;
    }

    const label = this.getHtfLabelExchange(parentTfKey);

    const buyZones = Array.isArray(zoneData.Buy) ? zoneData.Buy : [];
    const sellZones = Array.isArray(zoneData.Sell) ? zoneData.Sell : [];

    for (const item of buyZones) {
      this.rectangleTool.addRectanglesFromData(item, {
        fillColor: buyfillColor,
        outlineColor: buyoutlineColor,
        outlineWidth: 0.5,
        text: label,
        textColor: buytextColor
      });
    }

    for (const item of sellZones) {
      this.rectangleTool.addRectanglesFromData(item, {
        fillColor: sellfillColor,
        outlineColor: selloutlineColor,
        outlineWidth: 0.5,
        text: label,
        textColor: selltextColor
      });
    }
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

  get f() { return this.fincreateformForPanel.controls; }
  get g() { return this.fincreateform.controls; }
  get j() { return this.alertForm.controls; }

  private CreateForm() {
    this.fincreateform = this.formBuilder.group({
      stock_tick: [''],
      order_type: ['', [Validators.required]],
      entry_price: ['', [Validators.required]],
      stoploss_price: ['', [Validators.required]],
      target_price: ['', [Validators.required]],
      stock_quantity: ['', [Validators.required]],
      purchased_cmp_date: [''],
      time_frame: [''],
      stock_id: [""],
      country_id: [''],
      prediction: [''],
      probability: ['']
    });

    this.fincreateformForPanel = this.formBuilder.group({
      stock_tick: [''],
      order_type: ['', [Validators.required]],
      entry_price: ['', [Validators.required]],
      stoploss_price: ['', [Validators.required]],
      target_price: ['', [Validators.required]],
      stock_quantity: ['', [Validators.required]],
      purchased_cmp_date: [''],
      time_frame: [''],
      stock_id: [""],
      country_id: [''],
      prediction: [''],
      probability: ['']
    });
  }

  private buildForm() {
    this.alertForm = this.formBuilder.group({
      user_id: [Number(this.userId)],
      country_id: [Number(this.countryId)],
      stock_symbol: ['', Validators.required],
      exchange: [''],
      alert_type: ['', Validators.required],
      trigger_price: ['', Validators.required],
      price_range_min: ['', Validators.required],
      price_range_max: ['', Validators.required],
      threshold: ['', Validators.required],
      timeframe: [''],
      note: [''],
      target_percentage: [],
      cooldown_minutes: [Number],
      is_active: [true],
      email_notification: [false]
    });
  }

  resetOrderForm() {
    this.fincreateform.reset()
  }

  startResize(event: MouseEvent) {
    const th = (event.target as HTMLElement).parentElement as HTMLElement;
    const startX = event.pageX;
    const startWidth = th.offsetWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth + (e.pageX - startX);
      th.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  ngOnInit(): void {
    const width = window.innerWidth;
    if (width <= 767) {
      this.isMobile = true;
    }
    this.selectedDateRange = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    }
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.SelectedCountryId = localStorage.getItem('selectedCountryId');
    this.SelectedCountryName = localStorage.getItem('selectedCountryName');
    this.Role = localStorage.getItem('role');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.countryId = localStorage.getItem('selectedCountryId');
    this.userId = localStorage.getItem('UserId');
    this.CreateForm();
    this.buildForm();
    this.exchange();
    this.stockDataFunc()
    this.FetchDailyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchSixtyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchFifteenTrades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
    this.PrepDebounce();
    // this.selectedExchange = this.exchanges.find((e: { exchange_id: number; }) => e.exchange_id === 2);
    // console.log("Selected Exchanges",this.selectedExchange)
    this.getAllSetAlerts();
  }

  calculateMinMax() {
    const trigger = this.alertForm.get('trigger_price')?.value;
    const threshold = this.alertForm.get('threshold')?.value;

    if (trigger && threshold) {
      const diff = (trigger * threshold) / 100;
      this.alertForm.get('price_range_min')?.setValue(trigger - diff, { emitEvent: false });
      this.alertForm.get('price_range_max')?.setValue(trigger + diff, { emitEvent: false });
    }
  }

  onExchangeChange() {
    if (this.selectedExchange) {
      this.SelectedExchange_Id = this.selectedExchange.exchange_id;
      this.SelectedExchange_Name = this.selectedExchange.exchange_name;
    }
    this.activeMenu = "daily"
    this.FetchDailyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchSixtyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchFifteenTrades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
  }

  onTradeTypeChange() {
    this.FetchDailyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchSixtyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchFifteenTrades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
  }

  PrepDebounce() {
    this.searchSubject.pipe(
      debounceTime(400)
    ).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.typedText = trimmed;

      if (this.activeMenu === 'daily') {
        this.dailyState.searchKey = trimmed;
        this.FetchDailyTrades("", trimmed, true, this.StartDate, this.EndDate);
      } else if (this.activeMenu === 'sixty') {
        this.sixtyState.searchKey = trimmed;
        this.FetchSixtyTrades("", trimmed, true, this.StartDate, this.EndDate);
      } else if (this.activeMenu === 'fifteen') {
        this.fifteenState.searchKey = trimmed;
        this.FetchFifteenTrades("", trimmed, true, this.StartDate, this.EndDate);
      } else if (this.activeMenu === 'one_twenty') {
        this.onetwentyState.searchKey = trimmed;
        this.Fetch120Trades("", trimmed, true, this.StartDate, this.EndDate);
      } else if (this.activeMenu === 'two_forty') {
        this.twofortyState.searchKey = trimmed;
        this.Fetch240Trades("", trimmed, true, this.StartDate, this.EndDate);
      } else if (this.activeMenu === 'one_twenty_five') {
        this.onetwentyfiveState.searchKey = trimmed;
        this.Fetch125Trades("", trimmed, true, this.StartDate, this.EndDate);
      } else if (this.activeMenu === 'seventy_five') {
        this.seventyfiveState.searchKey = trimmed;
        this.Fetch75Trades("", trimmed, true, this.StartDate, this.EndDate);
      } else if (this.activeMenu === 'twenty_five') {
        this.twentyfiveState.searchKey = trimmed;
        this.Fetch25Trades("", trimmed, true, this.StartDate, this.EndDate);
      }
    });
  }

  onSearchInput(value: string) {
    this.searchSubject.next(value);
  }

  onPageSizeChange() {
    if (this.activeMenu === 'daily') {
      this.FetchDailyTrades(1, this.dailyState.searchKey || '', true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'sixty') {
      this.FetchSixtyTrades(1, this.sixtyState.searchKey || '', true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'fifteen') {
      this.FetchFifteenTrades(1, this.fifteenState.searchKey || '', true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'one_twenty_five') {
      this.Fetch125Trades(1, this.onetwentyfiveState.searchKey || '', true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'two_forty') {
      this.Fetch240Trades(1, this.twofortyState.searchKey || '', true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'one_twenty') {
      this.Fetch120Trades(1, this.onetwentyState.searchKey || '', true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'seventy_five') {
      this.Fetch75Trades(1, this.seventyfiveState.searchKey || '', true, this.StartDate, this.EndDate);
    }
    else if (this.activeMenu === 'twenty_five') {
      this.Fetch25Trades(1, this.twentyfiveState.searchKey || '', true, this.StartDate, this.EndDate);
    }
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['landing']);
  }

  alerts() {
    this.router.navigate(['alerts']);
  }

  orderList() {
    this.router.navigate(['orderlist']);
  }

  autoorders() {
    this.router.navigate(['auto-order-list']);
  }

  stock_screener() {
    this.router.navigate(['home']);
  }

  news() {
    this.router.navigate(['news']);
  }

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  dashboard() {
    this.router.navigate(['dashboard']);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }

  // previousHighService() {
  //   this.apiService.GetprevioushighDataService(this.finData).subscribe(resp => {
  //     this.PreviousHighData = resp.response;
  //     this.addPreviousHighPriceLine(this.FullScreenModeValue);
  //   })
  // }

  switchMenu(menu: string) {
    this.highlightedStockNames = [];
    this.highlightedStockNamesSixty = [];
    this.highlightedStockNamesFifteen = [];
    this.highlightedStockNames240 = [];
    this.highlightedStockNames120 = [];
    this.highlightedStockNames75 = [];
    this.highlightedStockNames125 = [];
    this.highlightedStockNames25 = [];
    this.activeMenu = menu;
    this.searchText = "";
    this.MatchedCount = 0;

    if (menu === 'daily') {
      // this.SelectedTimeFrame = 1;
      this.dailyState.currentPage = 1;
      this.FetchDailyTrades(1, this.dailyState.searchKey, true, this.StartDate, this.EndDate);

    } else if (menu === 'sixty') {
      // this.SelectedTimeFrame = 2;
      this.sixtyState.currentPage = 1;
      this.FetchSixtyTrades(1, this.sixtyState.searchKey, true, this.StartDate, this.EndDate);

    } else if (menu === 'fifteen') {
      // this.SelectedTimeFrame = 3;
      this.fifteenState.currentPage = 1;
      this.FetchFifteenTrades(1, this.fifteenState.searchKey, true, this.StartDate, this.EndDate);

    } else if (menu === 'one_twenty_five') {
      // this.SelectedTimeFrame = 4;
      this.onetwentyfiveState.currentPage = 1;
      this.Fetch125Trades(1, this.onetwentyfiveState.searchKey, true, this.StartDate, this.EndDate);

    } else if (menu === 'two_forty') {
      // this.SelectedTimeFrame = 5;
      this.twofortyState.currentPage = 1;
      this.Fetch240Trades(1, this.twofortyState.searchKey, true, this.StartDate, this.EndDate);

    } else if (menu === 'one_twenty') {
      // this.SelectedTimeFrame = 6;
      this.onetwentyState.currentPage = 1;
      this.Fetch120Trades(1, this.onetwentyState.searchKey, true, this.StartDate, this.EndDate);

    } else if (menu === 'seventy_five') {
      // this.SelectedTimeFrame = 25;
      this.seventyfiveState.currentPage = 1;
      this.Fetch75Trades(1, this.seventyfiveState.searchKey, true, this.StartDate, this.EndDate);
    }
    else if (menu === 'twenty_five') {
      this.twentyfiveState.currentPage = 1;
      this.Fetch25Trades(1, this.twentyfiveState.searchKey, true, this.StartDate, this.EndDate);
    }
  }


  getKeys(item: any): string[] {
    return Object.keys(item).filter(key => key === 'BUY' || key === 'SELL');
  }

  Search() {
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.FetchDailyTrades(1, this.searchText, false, this.StartDate, this.EndDate)
    this.FetchSixtyTrades(1, this.searchText, false, this.StartDate, this.EndDate);
    this.FetchFifteenTrades(1, this.searchText, false, this.StartDate, this.EndDate);
    this.Fetch240Trades(1, this.searchText, false, this.StartDate, this.EndDate)
    this.Fetch125Trades(1, this.searchText, false, this.StartDate, this.EndDate);
    this.Fetch120Trades(1, this.searchText, false, this.StartDate, this.EndDate);
    this.Fetch75Trades(1, this.searchText, false, this.StartDate, this.EndDate);
    this.Fetch25Trades(1, this.searchText, false, this.StartDate, this.EndDate);

  }

  FetchDailyTrades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.getDailyTrades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        const backendTrades = [...resp.response.trades];

        // keep backend date-wise order if no UI sort selected
        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.DailyTrades = finalTrades;
        this.dailyState.trades = finalTrades;
        this.dailyState.totalCount = resp.response.total_count;
        this.dailyState.currentPage = resp.response.page_no;

        this.spinner.hide();

        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNames = names
        );
      } else {
        this.spinner.hide();
        this.DailyTrades = [];
        this.dailyState.trades = [];
        this.dailyState.totalCount = 0;
        this.highlightedStockNames = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  FetchSixtyTrades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.getSixtyTrades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        this.spinner.hide();

        const backendTrades = [...resp.response.trades];

        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.SixtyTrades = finalTrades;
        this.sixtyState.trades = finalTrades;
        this.sixtyState.totalCount = resp.response.total_count;
        this.sixtyState.currentPage = resp.response.page_no;

        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNamesSixty = names
        );
      } else {
        this.spinner.hide();
        this.SixtyTrades = [];
        this.sixtyState.trades = [];
        this.sixtyState.totalCount = 0;
        this.highlightedStockNamesSixty = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  FetchFifteenTrades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.getFifteenTrades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        this.spinner.hide();

        const backendTrades = [...resp.response.trades];

        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.FifteenTrades = finalTrades;
        this.fifteenState.trades = finalTrades;
        this.fifteenState.totalCount = resp.response.total_count;
        this.fifteenState.currentPage = resp.response.page_no;
        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNamesFifteen = names
        );
      } else {
        this.spinner.hide();
        this.FifteenTrades = [];
        this.fifteenState.trades = [];
        this.fifteenState.totalCount = 0;
        this.highlightedStockNamesFifteen = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  Fetch240Trades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.get240Trades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        const backendTrades = [...resp.response.trades];

        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.TwoFortyTrades = finalTrades;
        this.twofortyState.trades = finalTrades;
        this.twofortyState.totalCount = resp.response.total_count;
        this.twofortyState.currentPage = resp.response.page_no;

        this.spinner.hide();
        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNames240 = names
        );
      } else {
        this.spinner.hide();
        this.TwoFortyTrades = [];
        this.twofortyState.trades = [];
        this.twofortyState.totalCount = 0;
        this.highlightedStockNames240 = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  Fetch120Trades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.get120Trades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        const backendTrades = [...resp.response.trades];

        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.OneTwentyTrades = finalTrades;
        this.onetwentyState.trades = finalTrades;
        this.onetwentyState.totalCount = resp.response.total_count;
        this.onetwentyState.currentPage = resp.response.page_no;

        this.spinner.hide();
        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNames120 = names
        );
      } else {
        this.spinner.hide();
        this.OneTwentyTrades = [];
        this.onetwentyState.trades = [];
        this.onetwentyState.totalCount = 0;
        this.highlightedStockNames120 = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  Fetch75Trades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.get75Trades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        const backendTrades = [...resp.response.trades];

        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.SeventyFiveTrades = finalTrades;
        this.seventyfiveState.trades = finalTrades;
        this.seventyfiveState.totalCount = resp.response.total_count;
        this.seventyfiveState.currentPage = resp.response.page_no;

        this.spinner.hide();
        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNames75 = names
        );
      } else {
        this.spinner.hide();
        this.SeventyFiveTrades = [];
        this.seventyfiveState.trades = [];
        this.seventyfiveState.totalCount = 0;
        this.highlightedStockNames75 = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  Fetch125Trades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.get125Trades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        const backendTrades = [...resp.response.trades];

        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.OneTwentyFiveTrades = finalTrades;
        this.onetwentyfiveState.trades = finalTrades;
        this.onetwentyfiveState.totalCount = resp.response.total_count;
        this.onetwentyfiveState.currentPage = resp.response.page_no;

        this.spinner.hide();
        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNames125 = names
        );
      } else {
        this.spinner.hide();
        this.OneTwentyFiveTrades = [];
        this.onetwentyfiveState.trades = [];
        this.onetwentyfiveState.totalCount = 0;
        this.highlightedStockNames125 = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  Fetch25Trades(page: any, searchKey: any, highlight: boolean = false, start: any, end: any) {
    this.spinner.show();

    this.apiService.get25Trades(
      page,
      searchKey,
      this.pageSize,
      start,
      end,
      Number(this.SelectedExchange_Id),
      this.isChecked,
      this.isCheckedForCMP,
      this.selectTradeType
    ).subscribe(resp => {
      if (resp.msg === 'success') {
        const backendTrades = [...resp.response.trades];

        const finalTrades = this.sortColumn
          ? this.applySorting(backendTrades)
          : backendTrades;

        this.TwentyFiveTrades = finalTrades;
        this.twentyfiveState.trades = finalTrades;
        this.twentyfiveState.totalCount = resp.response.total_count;
        this.twentyfiveState.currentPage = resp.response.page_no;

        this.spinner.hide();
        this.handleTradeSearchHighlight(
          finalTrades,
          searchKey,
          highlight,
          names => this.highlightedStockNames25 = names
        );
      } else {
        this.spinner.hide();
        this.TwentyFiveTrades = [];
        this.twentyfiveState.trades = [];
        this.twentyfiveState.totalCount = 0;
        this.highlightedStockNames25 = [];
        this.MatchedCount = 0;
      }

      this.cdr.detectChanges();
    });
  }

  //  Heighlight and Scroll

  private handleTradeSearchHighlight(
    finalTrades: any[],
    searchKey: any,
    highlight: boolean,
    setHighlightedNames: (names: any[]) => void
  ): void {
    if (highlight && searchKey) {
      const lowerSearch = searchKey.trim().toLowerCase();

      const startsWithMatches = finalTrades.filter((item: { STOCK_SYMBOL: string }) =>
        item.STOCK_SYMBOL?.toLowerCase().startsWith(lowerSearch)
      );

      const containsMatches = finalTrades.filter((item: { STOCK_SYMBOL: string }) =>
        item.STOCK_SYMBOL?.toLowerCase().includes(lowerSearch)
      );

      const matches = startsWithMatches.length > 0 ? startsWithMatches : containsMatches;

      this.MatchedCount = matches.length;
      setHighlightedNames(matches.map((item: { STOCK_SYMBOL: any }) => item.STOCK_SYMBOL));

      if (matches.length > 0) {
        const firstMatchName = matches[0].STOCK_SYMBOL;

        this.cdr.detectChanges();

        setTimeout(() => {
          this.scrollToStockRow(firstMatchName);
        }, 150);
      } else {
        setHighlightedNames([]);
      }
    } else {
      setHighlightedNames([]);
      this.MatchedCount = 0;
    }
  }

  private scrollToStockRow(stockSymbol: string, retry: number = 0): void {
    if (!stockSymbol) return;

    this.cdr.detectChanges();

    setTimeout(() => {
      const searchStock = stockSymbol.trim().toLowerCase();

      /*
        Production-safe:
        Do not depend only on @ViewChildren('stockCells'),
        because in production this.stockCells is coming empty.
      */
      const visibleStockElements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-stock]')
      ).filter(el => {
        const stock = el.getAttribute('data-stock');
        const isVisible = !!(
          el.offsetWidth ||
          el.offsetHeight ||
          el.getClientRects().length
        );

        return stock && isVisible;
      });

      const matchedElement = visibleStockElements.find(el =>
        el.getAttribute('data-stock')?.trim().toLowerCase() === searchStock
      );

      if (!matchedElement) {
        if (retry < 25) {
          setTimeout(() => {
            this.scrollToStockRow(stockSymbol, retry + 1);
          }, 120);
        }
        return;
      }

      /*
        If match is found on TD, scroll/highlight TR.
        If match is found on card, use card itself.
      */
      const targetElement =
        matchedElement.closest('tr') as HTMLElement ||
        matchedElement.closest('.trade-card') as HTMLElement ||
        matchedElement;

      const scrollContainer =
        targetElement.closest('.trade-table-scroll') as HTMLElement;

      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();

        const targetTop =
          scrollContainer.scrollTop +
          targetRect.top -
          containerRect.top -
          scrollContainer.clientHeight / 2 +
          targetElement.clientHeight / 2;

        scrollContainer.scrollTo({
          top: Math.max(targetTop, 0),
          behavior: 'smooth'
        });
      } else {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }

      targetElement.classList.add('trade-scroll-focus');

      setTimeout(() => {
        targetElement.classList.remove('trade-scroll-focus');
      }, 1800);
    }, 80);
  }

  goToNextPage() {
    if (this.activeMenu === 'daily') {
      const nextPage = this.dailyState.currentPage + 1;
      const totalPages = Math.ceil(this.dailyState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.FetchDailyTrades(nextPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
      }
    } else if (this.activeMenu === 'sixty') {
      const nextPage = this.sixtyState.currentPage + 1;
      const totalPages = Math.ceil(this.sixtyState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.FetchSixtyTrades(nextPage, this.sixtyState.searchKey, true, this.StartDate, this.EndDate);
      }
    } else if (this.activeMenu === 'fifteen') {
      const nextPage = this.fifteenState.currentPage + 1;
      const totalPages = Math.ceil(this.fifteenState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.FetchFifteenTrades(nextPage, this.fifteenState.searchKey, true, this.StartDate, this.EndDate);
      }
    }
    else if (this.activeMenu === 'one_twenty_five') {
      const nextPage = this.onetwentyfiveState.currentPage + 1;
      const totalPages = Math.ceil(this.onetwentyfiveState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.Fetch125Trades(nextPage, this.onetwentyfiveState.searchKey, true, this.StartDate, this.EndDate);
      }
    }
    else if (this.activeMenu === 'two_forty') {
      const nextPage = this.twofortyState.currentPage + 1;
      const totalPages = Math.ceil(this.twofortyState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.Fetch240Trades(nextPage, this.twofortyState.searchKey, true, this.StartDate, this.EndDate);
      }
    } else if (this.activeMenu === 'one_twenty') {
      const nextPage = this.onetwentyState.currentPage + 1;
      const totalPages = Math.ceil(this.onetwentyState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.Fetch120Trades(nextPage, this.onetwentyState.searchKey, true, this.StartDate, this.EndDate);
      }
    } else if (this.activeMenu === 'seventy_five') {
      const nextPage = this.seventyfiveState.currentPage + 1;
      const totalPages = Math.ceil(this.seventyfiveState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.Fetch75Trades(nextPage, this.seventyfiveState.searchKey, true, this.StartDate, this.EndDate);
      }
    }
    else if (this.activeMenu === 'twenty_five') {
      const nextPage = this.twentyfiveState.currentPage + 1;
      const totalPages = Math.ceil(this.twentyfiveState.totalCount / this.pageSize);
      if (nextPage <= totalPages) {
        this.Fetch25Trades(nextPage, this.twentyfiveState.searchKey, true, this.StartDate, this.EndDate);
      }
    }
  }

  goToPreviousPage() {
    if (this.activeMenu === 'daily' && this.dailyState.currentPage > 1) {
      this.FetchDailyTrades(this.dailyState.currentPage - 1, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'sixty' && this.sixtyState.currentPage > 1) {
      this.FetchSixtyTrades(this.sixtyState.currentPage - 1, this.sixtyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'fifteen' && this.fifteenState.currentPage > 1) {
      this.FetchFifteenTrades(this.fifteenState.currentPage - 1, this.fifteenState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'one_twenty_five' && this.onetwentyfiveState.currentPage > 1) {
      this.Fetch125Trades(this.onetwentyfiveState.currentPage - 1, this.onetwentyfiveState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'two_forty' && this.twofortyState.currentPage > 1) {
      this.Fetch240Trades(this.twofortyState.currentPage - 1, this.twofortyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'one_twenty' && this.onetwentyState.currentPage > 1) {
      this.Fetch120Trades(this.onetwentyState.currentPage - 1, this.onetwentyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'seventy_five' && this.seventyfiveState.currentPage > 1) {
      this.Fetch75Trades(this.seventyfiveState.currentPage - 1, this.seventyfiveState.searchKey, true, this.StartDate, this.EndDate);
    }
    else if (this.activeMenu === 'twenty_five' && this.twentyfiveState.currentPage > 1) {
      this.Fetch25Trades(this.twentyfiveState.currentPage - 1, this.twentyfiveState.searchKey, true, this.StartDate, this.EndDate);
    }
  }

  getTotalPages(): number {
    const state = this.activeMenu === 'daily' ? this.dailyState
      : this.activeMenu === 'sixty' ? this.sixtyState
        : this.activeMenu === 'fifteen' ? this.fifteenState
          : this.activeMenu === 'one_twenty_five' ? this.onetwentyfiveState
            : this.activeMenu === 'two_forty' ? this.twofortyState
              : this.activeMenu === 'one_twenty' ? this.onetwentyState
                : this.activeMenu === 'seventy_five' ? this.seventyfiveState
                  : this.activeMenu === 'twenty_five' ? this.twentyfiveState
                    : this.dailyState;

    return Math.ceil(state.totalCount / this.pageSize);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();

    const state = this.activeMenu === 'daily' ? this.dailyState
      : this.activeMenu === 'sixty' ? this.sixtyState
        : this.activeMenu === 'fifteen' ? this.fifteenState
          : this.activeMenu === 'one_twenty_five' ? this.onetwentyfiveState
            : this.activeMenu === 'two_forty' ? this.twofortyState
              : this.activeMenu === 'one_twenty' ? this.onetwentyState
                : this.activeMenu === 'seventy_five' ? this.seventyfiveState
                  : this.activeMenu === 'twenty_five' ? this.twentyfiveState
                    : this.dailyState; // fallback

    const currentPage = state.currentPage;
    const pageNumbers: number[] = [];

    const maxVisible = 5;
    let startPage = Math.max(currentPage - Math.floor(maxVisible / 2), 1);
    let endPage = Math.min(startPage + maxVisible - 1, totalPages);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(endPage - maxVisible + 1, 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return pageNumbers;
  }

  getCurrentPage(): number {
    return this.activeMenu === 'daily' ? this.dailyState.currentPage
      : this.activeMenu === 'sixty' ? this.sixtyState.currentPage
        : this.activeMenu === 'one_twenty_five' ? this.onetwentyfiveState.currentPage
          : this.activeMenu === 'two_forty' ? this.twofortyState.currentPage
            : this.activeMenu === 'one_twenty' ? this.onetwentyState.currentPage
              : this.activeMenu === 'seventy_five' ? this.seventyfiveState.currentPage
                : this.activeMenu === 'twenty_five' ? this.twentyfiveState.currentPage
                  : this.fifteenState.currentPage;
  }

  goToPage(page: number) {
    if (this.activeMenu === 'daily') {
      this.FetchDailyTrades(page, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'sixty') {
      this.FetchSixtyTrades(page, this.sixtyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'fifteen') {
      this.FetchFifteenTrades(page, this.fifteenState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'one_twenty_five') {
      this.Fetch125Trades(page, this.onetwentyfiveState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'two_forty') {
      this.Fetch240Trades(page, this.twofortyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'one_twenty') {
      this.Fetch120Trades(page, this.onetwentyState.searchKey, true, this.StartDate, this.EndDate);
    } else if (this.activeMenu === 'seventy_five') {
      this.Fetch75Trades(page, this.seventyfiveState.searchKey, true, this.StartDate, this.EndDate);
    }
    else if (this.activeMenu === 'twenty_five') {
      this.Fetch25Trades(page, this.twentyfiveState.searchKey, true, this.StartDate, this.EndDate);
    }
  }

  stockDataFunc() {
    this.apiService.getStockList(this.SelectedCountryName).subscribe(
      (data) => {
        this.stockData = data.response;
      },
    );
  }

  convertToDateTimeLocalFormat(dateTimeString: string): string {
    return dateTimeString.replace(" ", "T").slice(0, 16);
  }

  closeNotification() {
    this.isNotificationVisible = false;
  }

  ngOnDestroy(): void {
    this.disconnectWebSocket();
    this.closeCmpSocket();

    if (this.cmpHoverTimer) {
      clearTimeout(this.cmpHoverTimer);
    }
  }

  disconnectWebSocket(): void {
    this.webSocketService.disconnectStock();
  }

  ViewGraph(stock_name: any, entry_price: any, stoploss_price: any, target_price: any, entry_timestamp: any, extendedtime: any, rrr: any, EXP_NUM: any, tradeId: any, tradeType: any, probability: any, prediction: any, stock_id: any = null, SetupTime: any = null): void {
    let container = document.getElementById('chart-container_new');
    this.showCreateOrderModal = false;
    if (container) {
      container.innerHTML = '';
    }
    this.disconnectWebSocket()
    this.destroyManualRectangleTool();
    this.SelectedStockId = stock_id;
    this.selectedTradeId = tradeId;
    this.selectedTradeType = tradeType;
    this.SelectedExpiryDate = EXP_NUM;
    this.ChartRESPONSE = [];
    this.FullChartResponse = [];
    this.chart = null;
    this.RRR = rrr;
    this.spinner.show();
    this.SpinnerCounter = 0;
    this.SelectedStockName = stock_name;
    const currentDateTime = moment();
    const last_d_time = moment(SetupTime).format('YYYY-MM-DD HH:mm:ss');
    this.SETUPTYPE = tradeType;
    this.FullScreenMode = true;

    if (this.SelectedExchange_Name == "NSE") {

      if (this.activeMenu == "daily") {
        this.finData = {
          country: localStorage.getItem('selectedCountryName'),
          tick: stock_name,
          time_frame: 1,
          last_d_time: last_d_time
        }
      }

      if (this.activeMenu == "sixty") {
        this.finData = {
          country: localStorage.getItem('selectedCountryName'),
          tick: stock_name,
          time_frame: 2,
          last_d_time: last_d_time
        }
      }

      if (this.activeMenu == "fifteen") {
        this.finData = {
          country: localStorage.getItem('selectedCountryName'),
          tick: stock_name,
          time_frame: 3,
          last_d_time: last_d_time
        }
      }

      if (this.activeMenu == "seventy_five") {
        this.finData = {
          country: localStorage.getItem('selectedCountryName'),
          tick: stock_name,
          time_frame: 25,
          last_d_time: last_d_time
        }
      }

      if (this.activeMenu == "one_twenty_five") {
        this.finData = {
          country: localStorage.getItem('selectedCountryName'),
          tick: stock_name,
          time_frame: 5,
          last_d_time: last_d_time
        }
      }

      if (this.activeMenu == "twenty_five") {
        this.finData = {
          country: localStorage.getItem('selectedCountryName'),
          tick: stock_name,
          time_frame: 6,
          last_d_time: last_d_time
        }
      }

      this.FetchCandlesAndZones(entry_price, stoploss_price, target_price, entry_timestamp, extendedtime)
    }

    if (this.SelectedExchange_Name == "MCX") {
      const formattedDate = `${EXP_NUM.slice(0, 2)}-${EXP_NUM.slice(2, 4)}-${EXP_NUM.slice(4)}`;
      if (this.activeMenu == "daily") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 1
        }
      }

      if (this.activeMenu == "sixty") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 4
        }
      }

      if (this.activeMenu == "two_forty") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 2
        }
      }

      if (this.activeMenu == "one_twenty") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 3
        }
      }

      this.FetchCandleAndDataForMCX(entry_price, stoploss_price, target_price, entry_timestamp, extendedtime, EXP_NUM, SetupTime)
    }

    if (this.SelectedExchange_Name == "NSEFO") {
      const formattedDate = `${EXP_NUM.slice(0, 2)}-${EXP_NUM.slice(2, 4)}-${EXP_NUM.slice(4)}`;
      if (this.activeMenu == "daily") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 1
        }
      }

      if (this.activeMenu == "sixty") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 2
        }
      }

      if (this.activeMenu == "seventy_five") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 25
        }
      }

      if (this.activeMenu == "fifteen") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 3
        }
      }
      if (this.activeMenu == "one_twenty_five") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 5
        }
      }
      if (this.activeMenu == "twenty_five") {
        this.finData = {
          st_sym: stock_name,
          exp_dt: formattedDate,
          last_d_time: last_d_time,
          time_frame: 6
        }
      }
      this.FetchCandleAndDataForNSEFO(entry_price, stoploss_price, target_price, entry_timestamp, extendedtime, EXP_NUM, SetupTime)
    }

    const Prob = probability !== null ? (probability * 100).toFixed(2) + '%' : 'NA';
    this.ModelPrediction = "PROBABILITY OF TRADE : " + prediction.toUpperCase() + " = " + Prob;
    this.Prediction = prediction;
    this.Probability = probability
    this.isNotificationVisible = true;
    // this.getStockTickbySymbol();     //nabonita
  }

  connectWebSocket(type: any): void {
    this.webSocketService.connect(this.finData.tick, this.finData.time_frame, this.SelectedStockId, type);
    this.webSocketService.getStockMessage().subscribe((data) => {
      this.realTimePrice = data;
      const parsedData = JSON.parse(data);
      if (this.finData.tick === parsedData.data.stock_tick) {
        this.updateChart(data);
      }
    });
  }

  updateChart(data: any): void {
    const parsedData = JSON.parse(data);

    // Convert all fields to numbers
    const updatedCandle = {
      open: Number(parsedData.data.open),
      high: Number(parsedData.data.high),
      low: Number(parsedData.data.low),
      close: Number(parsedData.data.close),
      time: Number(parsedData.data.time),
    };

    // Get existing chart data
    const existingData = this.candlestickSeries.data();
    if (!existingData || existingData.length === 0) {
      // First candle
      this.candlestickSeries.setData([updatedCandle]);
    } else {
      // Remove last candle and append updated one
      const dataWithoutLast = existingData.slice(0, -1);
      const newSeriesData = [...dataWithoutLast, updatedCandle];

      // ---- Add postbars after last real candle ----
      const lastCandle = newSeriesData[newSeriesData.length - 1];
      const postbars = [...new Array(100)].map((_, i) => ({
        time: lastCandle.time + (i + 1) * this.xspan,
      }));

      // Combine
      // const finalSeries = [...newSeriesData, ...postbars];

      // Set to chart
      this.candlestickSeries.setData([...newSeriesData, ...postbars]);
    }

    // Update lastBar reference
    this.lastBar = updatedCandle;

    // Optional: update closing line
    this.CreateClosingLine(updatedCandle.close);
  }

  //#region NSEFO CANDLES & ZONES
  FetchCandleAndDataForNSEFO(entry_price: any, stoploss_price: any, target_price: any, entry_timestamp: any, extendedtime: any, EXP_NUM: any, SetupTime: any) {
    this.showmsg = "Fetching Data !";
    this.spinner.show();

    const last_d_time = moment().format('YYYY-MM-DD HH:mm:ss');

    this.apiService.getFutureData(this.finData.st_sym, this.finData.exp_dt, this.finData.time_frame, last_d_time)
      .pipe(
        tap(resp => {
          this.FullChartResponse = resp.response;

          const originalDateString = this.finData.last_d_time;
          const originalDate = new Date(originalDateString);

          const year = originalDate.getFullYear();
          const month = ('0' + (originalDate.getMonth() + 1)).slice(-2);
          const day = ('0' + originalDate.getDate()).slice(-2);
          const hours = ('0' + originalDate.getHours()).slice(-2);
          const minutes = ('0' + originalDate.getMinutes()).slice(-2);
          const seconds = ('0' + originalDate.getSeconds()).slice(-2);

          const formattedDateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          this.finData.last_d_time = formattedDateString;

          if (this.activeMenu == "daily") {
            this.QualifiedZoneFlag = true;
            this.ChartRESPONSE = resp.response.daily;
            this.FullScreenModeValue = "daily";
            this.ModalHeader = "daily";
          }

          if (this.activeMenu == "sixty") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "sixty";
            this.ModalHeader = "60 minute";
            this.ChartRESPONSE = resp.response.sixty;
          }

          if (this.activeMenu == "fifteen") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "fifteen";
            this.ModalHeader = "15 minute";
            this.ChartRESPONSE = resp.response.fifteen;
          }

          if (this.activeMenu == "seventy_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "seventy_five";
            this.ModalHeader = "75 minute";
            this.ChartRESPONSE = resp.response.seventy_five;
          }

          if (this.activeMenu == "twenty_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "twenty_five";
            this.ModalHeader = "25 minute";
            this.ChartRESPONSE = resp.response.twenty_five;
          }

          if (this.activeMenu == "one_twenty_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "one_twenty_five";
            this.ModalHeader = "125 minute";
            this.ChartRESPONSE = resp.response.one_twenty_five;
          }

          this.lastRow = this.ChartRESPONSE[this.ChartRESPONSE.length - 1];
          this.lastTime = extendedtime;

          this.LoadChart(this.ChartRESPONSE, "chart-container_new");
          this.initOldZoneRectangleTool("chart-container_new");
          this.initManualRectangleTool(this.FullScreenModeValue, this.ChartRESPONSE);
          this.initChartDrawingTool(this.FullScreenModeValue, this.ChartRESPONSE);

          const dateandtime = moment().subtract(10, 'days').format("YYYY-MM-DD HH:mm:ss");

          this.purchased_date = this.convertToDateTimeLocalFormat(dateandtime);
          this.entry_timestamp = entry_timestamp;
          this.entry_price = entry_price;
          this.stoploss_price = stoploss_price;
          this.target_price = target_price;

          this.getsetup(
            this.purchased_date,
            this.entry_timestamp,
            this.entry_price,
            this.stoploss_price,
            this.target_price
          );
        }),

        switchMap(() => {
          return forkJoin({
            previousHighData: this.apiService.GetprevioushighDataMcxNsefoService(this.finData, "futures").pipe(
              catchError(error => {
                console.error("GetprevioushighDataMcxNsefoService error", error);
                return of({ response: [] });
              })
            ),

            qualifiedZoneData: this.apiService.GetFutureQualifiedZoneCandleData(this.finData).pipe(
              catchError(error => {
                console.error("GetFutureQualifiedZoneCandleData error", error);
                return of({ response: [] });
              })
            ),

            baseCandleData: this.apiService.GetFutureBaseCandleData(this.finData).pipe(
              catchError(error => {
                console.error("GetFutureBaseCandleData error", error);
                return of({ response: [] });
              })
            ),

            overlayData: this.apiService.GetOverLayZoneService(this.finData).pipe(
              catchError(error => {
                console.error("GetOverLayZoneService error", error);
                return of({ response: null });
              })
            ),

            badZoneData: this.apiService.GetFutureBadZoneCandleData(this.finData).pipe(
              catchError(error => {
                console.error("GetFutureBadZoneCandleData error", error);
                return of({ response: [] });
              })
            ),

            optimizedBuySellZoneData: this.apiService.GetOptimizedBuySellZoneNSEFOervice(this.finData).pipe(
              catchError(error => {
                console.error("GetOptimizedBuySellZoneNSEFOervice error", error);
                return of({ response: [] });
              })
            ),

            pricePercentageData: this.apiService.PricePercentageNsefoService({
              country_name: this.SelectedCountryName,
              st_sym: this.finData.st_sym,
              time_frame: this.finData.time_frame,
              exp_dt: this.finData.exp_dt,
              last_d_time: this.finData.last_d_time,
              is_future: true
            }).pipe(
              catchError(error => {
                console.error("PricePercentageNsefoService error", error);
                return of({ response: null });
              })
            )
          });
        }),

        finalize(() => {
          this.spinner.hide();
        })
      )
      .subscribe({
        next: (resp: any) => {
          this.PreviousHighData = resp.previousHighData.response;
          this.addPreviousHighPriceLine(this.FullScreenModeValue);

          this.QualifiedData = resp.qualifiedZoneData.response;
          this.BaseCandleData = resp.baseCandleData.response;

          if (resp.overlayData.response) {
            this.OverLayCandleData = resp.overlayData.response;

            const OverlayFetcher = resp.overlayData.response;

            this.BuyOverlayData = this.OverLayCandleData.Execute.Buy;
            this.SellOverlayData = this.OverLayCandleData.Execute.Sell;
            this.AnalyzeOverlayData = OverlayFetcher.Analyse;
          }

          this.BadZoneData = resp.badZoneData.response;
          this.OptimizedBuySellZoneData = resp.optimizedBuySellZoneData.response;

          if (resp.pricePercentageData.response) {
            this.PricePercentageData = resp.pricePercentageData.response;
          }
        },

        error: (error) => {
          console.error("FetchCandleAndDataForNSEFO error", error);
          this.showmsg = "Some problem occurred while fetching data !";
        }
      });

    this.chartContainer.nativeElement.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      this.showContextMenu(event.clientX, event.clientY);
    });

    document.addEventListener('click', () => this.hideContextMenu());
  }
  //#endregion

  //#region MCX CANDLES & ZONES
  FetchCandleAndDataForMCX(entry_price: any, stoploss_price: any, target_price: any, entry_timestamp: any, extendedtime: any, EXP_NUM: any, SetupTime: any) {
    this.showmsg = "Fetching Data !";
    this.spinner.show();

    const last_d_time = moment().format('YYYY-MM-DD HH:mm:ss');

    this.apiService.getMcxData(this.finData.st_sym, this.finData.exp_dt, this.finData.time_frame, last_d_time)
      .pipe(
        tap(resp => {
          this.FullChartResponse = resp.response;

          const originalDateString = this.finData.last_d_time;
          const originalDate = new Date(originalDateString);

          const year = originalDate.getFullYear();
          const month = ('0' + (originalDate.getMonth() + 1)).slice(-2);
          const day = ('0' + originalDate.getDate()).slice(-2);
          const hours = ('0' + originalDate.getHours()).slice(-2);
          const minutes = ('0' + originalDate.getMinutes()).slice(-2);
          const seconds = ('0' + originalDate.getSeconds()).slice(-2);

          const formattedDateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          this.finData.last_d_time = formattedDateString;

          if (this.activeMenu == "daily") {
            this.QualifiedZoneFlag = true;
            this.ChartRESPONSE = resp.response.daily;
            this.FullScreenModeValue = "daily";
            this.ModalHeader = "daily";
          }

          if (this.activeMenu == "sixty") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "sixty";
            this.ModalHeader = "60 minute";
            this.ChartRESPONSE = resp.response.sixty;
          }

          if (this.activeMenu == "two_forty") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "two_forty";
            this.ModalHeader = "240 minute";
            this.ChartRESPONSE = resp.response.two_forty;
          }

          if (this.activeMenu == "one_twenty") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "one_twenty";
            this.ModalHeader = "120 minute";
            this.ChartRESPONSE = resp.response.one_twenty;
          }

          if (this.activeMenu == "one_twenty_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "one_twenty_five";
            this.ModalHeader = "125 minute";
            this.ChartRESPONSE = resp.response.one_twenty_five;
          }

          if (this.activeMenu == "twenty_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "twenty_five";
            this.ModalHeader = "25 minute";
            this.ChartRESPONSE = resp.response.twenty_five;
          }

          this.lastRow = this.ChartRESPONSE[this.ChartRESPONSE.length - 1];
          this.lastTime = extendedtime;

          this.LoadChart(this.ChartRESPONSE, "chart-container_new");
          this.initOldZoneRectangleTool("chart-container_new");
          this.initManualRectangleTool(this.FullScreenModeValue, this.ChartRESPONSE);
          this.initChartDrawingTool(this.FullScreenModeValue, this.ChartRESPONSE);

          const dateandtime = moment().subtract(10, 'days').format("YYYY-MM-DD HH:mm:ss");

          this.purchased_date = this.convertToDateTimeLocalFormat(dateandtime);
          this.entry_timestamp = entry_timestamp;
          this.entry_price = entry_price;
          this.stoploss_price = stoploss_price;
          this.target_price = target_price;

          this.getsetup(
            this.purchased_date,
            this.entry_timestamp,
            this.entry_price,
            this.stoploss_price,
            this.target_price
          );
        }),

        switchMap(() => {
          return forkJoin({
            pricePercentageData: this.apiService.PricePercentageNsefoService({
              country_name: this.SelectedCountryName,
              st_sym: this.finData.st_sym,
              time_frame: this.finData.time_frame,
              exp_dt: this.finData.exp_dt,
              last_d_time: this.finData.last_d_time,
              is_future: false
            }).pipe(
              catchError(error => {
                console.error("PricePercentageNsefoService MCX error", error);
                return of({ response: null });
              })
            ),

            qualifiedZoneData: this.apiService.GetMcxQualifiedZoneCandleData(this.finData).pipe(
              catchError(error => {
                console.error("GetMcxQualifiedZoneCandleData error", error);
                return of({ response: [] });
              })
            ),

            baseCandleData: this.apiService.GetMcxBaseCandleData(this.finData).pipe(
              catchError(error => {
                console.error("GetMcxBaseCandleData error", error);
                return of({ response: [] });
              })
            ),

            overlayData: this.apiService.GetMcxOverLayZoneService(this.finData).pipe(
              catchError(error => {
                console.error("GetMcxOverLayZoneService error", error);
                return of({ response: null });
              })
            ),

            badZoneData: this.apiService.GetMcxBadZoneCandleData(this.finData).pipe(
              catchError(error => {
                console.error("GetMcxBadZoneCandleData error", error);
                return of({ response: [] });
              })
            ),

            optimizedBuySellZoneData: this.apiService.GetOptimizedBuySellZoneMCXService(this.finData).pipe(
              catchError(error => {
                console.error("GetOptimizedBuySellZoneMCXService error", error);
                return of({ response: [] });
              })
            )
          });
        }),

        finalize(() => {
          this.spinner.hide();
        })
      )
      .subscribe({
        next: (resp: any) => {
          if (resp.pricePercentageData.response) {
            this.PricePercentageData = resp.pricePercentageData.response;
          }

          this.QualifiedData = resp.qualifiedZoneData.response;
          this.BaseCandleData = resp.baseCandleData.response;

          if (resp.overlayData.response) {
            this.OverLayCandleData = resp.overlayData.response;

            const OverlayFetcher = resp.overlayData.response;

            this.BuyOverlayData = this.OverLayCandleData.Execute.Buy;
            this.SellOverlayData = this.OverLayCandleData.Execute.Sell;
            this.AnalyzeOverlayData = OverlayFetcher.Analyse;
          }

          this.BadZoneData = resp.badZoneData.response;
          this.OptimizedBuySellZoneData = resp.optimizedBuySellZoneData.response;
        },

        error: (error) => {
          console.error("FetchCandleAndDataForMCX error", error);
          this.showmsg = "Some problem occurred while fetching MCX data !";
        }
      });

    this.chartContainer.nativeElement.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      this.showContextMenu(event.clientX, event.clientY);
    });

    document.addEventListener('click', () => this.hideContextMenu());
  }
  //#endregion

  //#region NSE CANDLES & ZONES
  FetchCandlesAndZones(entry_price: any, stoploss_price: any, target_price: any, entry_timestamp: any, extendedtime: any) {
    this.showmsg = "Fetching Data !";
    this.spinner.show();

    const last_d_time = moment().format('YYYY-MM-DD HH:mm:ss');

    let candleobject = {
      country: localStorage.getItem('selectedCountryName'),
      tick: this.finData.tick,
      time_frame: this.finData.time_frame,
      last_d_time: last_d_time
    };

    this.apiService.fetchAvailableTradesCandleData(candleobject, this.SelectedExchange_Name)
      .pipe(
        tap(resp => {
          this.FullChartResponse = resp.response;

          const originalDateString = this.finData.last_d_time;
          const originalDate = new Date(originalDateString);

          const year = originalDate.getFullYear();
          const month = ('0' + (originalDate.getMonth() + 1)).slice(-2);
          const day = ('0' + originalDate.getDate()).slice(-2);
          const hours = ('0' + originalDate.getHours()).slice(-2);
          const minutes = ('0' + originalDate.getMinutes()).slice(-2);
          const seconds = ('0' + originalDate.getSeconds()).slice(-2);

          const formattedDateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          this.finData.last_d_time = formattedDateString;

          if (this.activeMenu == "daily") {
            this.QualifiedZoneFlag = true;
            this.ChartRESPONSE = resp.response.daily;
            this.FullScreenModeValue = "daily";
            this.ModalHeader = "daily";
          }

          if (this.activeMenu == "sixty") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "sixty";
            this.ModalHeader = "60 minute";
            this.ChartRESPONSE = resp.response.sixty;
          }

          if (this.activeMenu == "fifteen") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "fifteen";
            this.ModalHeader = "15 minute";
            this.ChartRESPONSE = resp.response.fifteen;
          }

          if (this.activeMenu == "seventy_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "seventy_five";
            this.ModalHeader = "75 minute";
            this.ChartRESPONSE = resp.response.seventy_five;
          }

          if (this.activeMenu == "one_twenty_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "one_twenty_five";
            this.ModalHeader = "125 minute";
            this.ChartRESPONSE = resp.response.one_twenty_five;
          }

          if (this.activeMenu == "twenty_five") {
            this.QualifiedZoneFlag = true;
            this.FullScreenModeValue = "twenty_five";
            this.ModalHeader = "25 minute";
            this.ChartRESPONSE = resp.response.twenty_five;
          }

          this.lastRow = this.ChartRESPONSE[this.ChartRESPONSE.length - 1];
          this.lastTime = extendedtime;

          this.LoadChart(this.ChartRESPONSE, "chart-container_new");
          this.initOldZoneRectangleTool("chart-container_new");
          this.initManualRectangleTool(this.FullScreenModeValue, this.ChartRESPONSE);
          this.initChartDrawingTool(this.FullScreenModeValue, this.ChartRESPONSE);

          const dateandtime = moment().subtract(10, 'days').format("YYYY-MM-DD HH:mm:ss");

          this.purchased_date = this.convertToDateTimeLocalFormat(dateandtime);
          this.entry_timestamp = entry_timestamp;
          this.entry_price = entry_price;
          this.stoploss_price = stoploss_price;
          this.target_price = target_price;

          this.getsetup(
            this.purchased_date,
            this.entry_timestamp,
            this.entry_price,
            this.stoploss_price,
            this.target_price
          );

          this.connectWebSocket(this.activeMenu);
        }),

        switchMap(() => {
          return forkJoin({
            setupData: this.apiService.GetSetupDataService(this.finData).pipe(
              catchError(error => {
                console.error("GetSetupDataService error", error);
                return of({ response: [] });
              })
            ),

            previousHighData: this.apiService.GetprevioushighDataService(this.finData).pipe(
              catchError(error => {
                console.error("GetprevioushighDataService error", error);
                return of({ response: [] });
              })
            ),

            qualifiedZoneData: this.apiService.GetQualifiedZoneService(this.finData).pipe(
              catchError(error => {
                console.error("GetQualifiedZoneService error", error);
                return of({ response: [] });
              })
            ),

            baseCandleData: this.apiService.GetBaseCandleData(this.finData).pipe(
              catchError(error => {
                console.error("GetBaseCandleData error", error);
                return of({ response: [] });
              })
            ),

            buyZoneData: this.apiService.GetBuyZoneDataService(this.finData).pipe(
              catchError(error => {
                console.error("GetBuyZoneDataService error", error);
                return of({ response: [] });
              })
            ),

            sellZoneData: this.apiService.GetSellZoneDataService(this.finData).pipe(
              catchError(error => {
                console.error("GetSellZoneDataService error", error);
                return of({ response: [] });
              })
            ),

            overlayData: this.apiService.fetchingOverlayService(this.finData).pipe(
              catchError(error => {
                console.error("fetchingOverlayService error", error);
                return of({ response: null });
              })
            ),

            allZonesData: this.apiService.GetAllZonesData(this.finData).pipe(
              catchError(error => {
                console.error("GetAllZonesData error", error);
                return of({ response: [] });
              })
            ),

            badZoneData: this.apiService.GetBadZoneDataService(this.finData).pipe(
              catchError(error => {
                console.error("GetBadZoneDataService error", error);
                return of({ response: [] });
              })
            ),

            optimizedBuySellZoneData: this.apiService.GetOptimizedBuySellZoneService(this.finData).pipe(
              catchError(error => {
                console.error("GetOptimizedBuySellZoneService error", error);
                return of({ response: [] });
              })
            ),

            pricePercentageData: this.apiService.PricePercentageService(this.finData).pipe(
              catchError(error => {
                console.error("PricePercentageService error", error);
                return of({ response: null });
              })
            )
          });
        }),

        finalize(() => {
          this.spinner.hide();
        })
      )
      .subscribe({
        next: (resp: any) => {
          this.ScoreData = resp.setupData.response;

          this.PreviousHighData = resp.previousHighData.response;
          this.addPreviousHighPriceLine(this.FullScreenModeValue);

          this.QualifiedData = resp.qualifiedZoneData.response;
          this.BaseCandleData = resp.baseCandleData.response;
          this.BuyZoneData = resp.buyZoneData.response;
          this.SellZoneData = resp.sellZoneData.response;
          this.AllZonesData = resp.allZonesData.response;
          this.BadZoneData = resp.badZoneData.response;
          this.OptimizedBuySellZoneData = resp.optimizedBuySellZoneData.response;

          if (resp.overlayData.response) {
            this.OverLayCandleData = resp.overlayData.response;

            const OverlayFetcher = resp.overlayData.response;

            this.BuyOverlayData = this.OverLayCandleData.Execute.Buy;
            this.SellOverlayData = this.OverLayCandleData.Execute.Sell;
            this.AnalyzeOverlayData = OverlayFetcher.Analyse;
          }

          if (resp.pricePercentageData.response) {
            this.PricePercentageData = resp.pricePercentageData.response;

            this.PP_Analyze = this.PricePercentageData.analyze;
            this.PP_Evaluate = this.PricePercentageData.evaluate;
            this.PP_Execute = this.PricePercentageData.execute;
            this.PP_Reason = this.PricePercentageData.reason;
            this.PP_FinalDecision = this.PricePercentageData.final_decision;
          }
        },

        error: (error) => {
          console.error("FetchCandlesAndZones error", error);
          this.showmsg = "Some problem occurred while fetching data !";
        }
      });

    this.chartContainer.nativeElement.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      this.showContextMenu(event.clientX, event.clientY);
    });

    document.addEventListener('click', () => this.hideContextMenu());
  }
  //#endregion

  getRegimeClass(regime: string | null | undefined): string {
    const r = (regime || '').toUpperCase();

    if (r === 'UP') return 'regime-up';
    if (r === 'SW') return 'regime-sw';
    if (r === 'DOWN') return 'regime-down';
    return 'regime-neutral';
  }

  formatPct(value: number | null | undefined): string {
    if (value === null || value === undefined) return '%';
    return `${value.toFixed(1)}%`;
  }

  getZoneLine(zone: any): string {
    if (!zone) return '-';
    return `Prox ${zone.proximal ?? '-'} / Dist ${zone.distal ?? '-'} | ${zone.state ?? '-'}`;
  }

  getZoneMetaLine(zone: any): string {
    if (!zone) return '';
    return `Retests: ${zone.retest_count ?? 0} | Bars Since: ${zone.age_bars ?? 0} | Violation: ${zone.violation ?? 'NONE'}`;
  }

  closePopup() {
    this.showPopup = false;
  }

  openPopupPP() {
    this.centerModalA(850, 450);
    this.modalA.show();
  }

  private centerModalA(width: number, height: number) {
    // viewport size
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // if you have fixed header/navbar height, add it here (or keep 0)
    const safeTop = 8;     // keeps header always visible
    const safeLeft = 8;
    const safeRight = 8;
    const safeBottom = 8;

    // ideal center
    let left = Math.round((vw - width) / 2);
    let top = Math.round((vh - height) / 2);

    // clamp so it never goes out of screen
    left = Math.min(Math.max(left, safeLeft), vw - width - safeRight);
    top = Math.min(Math.max(top, safeTop), vh - height - safeBottom);

    this.modalAPos = { top, left };
  }

  exchange() {
    this.apiService.getUserExchanges(this.userId, this.countryId).subscribe(
      (res) => {
        if (res && res.response) {

          this.exchanges = res.response;
          if (this.SelectedCountryName == "India") {
            this.selectedExchange = this.exchanges.find((ex: { exchange_name: string; }) => ex.exchange_name === 'NSE');
            const matchedExchange = this.exchanges.find((ex: { exchange_name: string; }) => ex.exchange_name === "NSE");
            if (matchedExchange) {
              this.SelectedExchange_Id = matchedExchange.exchange_id;
              this.SelectedExchange_Name = matchedExchange.exchange_name;
            }
          }
          else {
            this.selectedExchange = this.exchanges.find((ex: { exchange_name: string; }) => ex.exchange_name === 'NASDAQ');
            const matchedExchange = this.exchanges.find((ex: { exchange_name: string; }) => ex.exchange_name === "NASDAQ");
            if (matchedExchange) {
              this.SelectedExchange_Id = matchedExchange.exchange_id;
              this.SelectedExchange_Name = matchedExchange.exchange_name;
            }
          }


          this.onExchangeChange();
        }
      });
  }

  viewReason() {
    this.showReasonPanel = true;
  }

  closePanel() {
    this.showReasonPanel = false;
  }

  getsetup(
    purchased_date: any,
    entry_timestamp: any,
    entry_price: any,
    stoploss_price: any,
    target_price: any
  ) {
    const entryddateObject3 = new Date(purchased_date + 'Z');
    const istOffset3 = 5.5 * 60 * 60 * 1000;
    const istDateObject3 = new Date(entryddateObject3.getTime() + istOffset3);

    const year1 = istDateObject3.getUTCFullYear();
    const month1 = String(istDateObject3.getUTCMonth() + 1).padStart(2, '0');
    const day1 = String(istDateObject3.getUTCDate()).padStart(2, '0');

    const purchaseddateOnly1 = `${year1}-${month1}-${day1}`;
    const PurchaseddateObjectNumber = new Date(purchaseddateOnly1);
    const timestampInMilliseconds = PurchaseddateObjectNumber.getTime();
    const timestampInSeconds_purchased = Math.floor(timestampInMilliseconds / 1000);

    const entryddateObject = new Date(entry_timestamp + 'Z');
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDateObject = new Date(entryddateObject.getTime() + istOffset);

    const year = istDateObject.getUTCFullYear();
    const month = String(istDateObject.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDateObject.getUTCDate()).padStart(2, '0');
    const hours = String(istDateObject.getUTCHours()).padStart(2, '0');
    const minutes = String(istDateObject.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDateObject.getUTCSeconds()).padStart(2, '0');

    const entryddateOnly = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    const entrydateObjectNumber = new Date(entryddateOnly);
    const timestampInMillisecondsss = entrydateObjectNumber.getTime();
    const timestampInSeconds_entry = Math.floor(timestampInMillisecondsss / 1000);

    const entry = Number(entry_price);
    const stoploss = Number(stoploss_price);
    const target = Number(target_price);

    if (
      Number.isNaN(entry) ||
      Number.isNaN(stoploss) ||
      Number.isNaN(target)
    ) {
      alert('Invalid setup price.');
      return;
    }

    let setupType: 'BUY' | 'SELL' | null = null;

    if (stoploss < entry && entry < target) {
      setupType = 'BUY';
    } else if (target < entry && entry < stoploss) {
      setupType = 'SELL';
    }

    if (!setupType) {
      alert(
        'Invalid setup. For BUY: Stoploss < Entry < Target. For SELL: Target < Entry < Stoploss.'
      );
      return;
    }

    this.clearTradeTigerSetupLines();

    const setupDrawn = this.drawBackendSetupUsingTradeTigerTool(
      setupType,
      entry,
      target,
      stoploss,
      entry_timestamp,
      entry_timestamp,
      entry_timestamp
    );

    if (!setupDrawn) {
      return;
    }

    this.EntryPrice = entry;
    this.TargetPrice = target;
    this.StoplossPrice = stoploss;
    this.EntryTime = entry_timestamp;

    if ((this as any).entryPrice !== undefined) {
      (this as any).entryPrice = entry;
    }

    if ((this as any).targetPrice !== undefined) {
      (this as any).targetPrice = target;
    }

    if ((this as any).stoplossPrice !== undefined) {
      (this as any).stoplossPrice = stoploss;
    }

    try {
      const prices = this.chartDrawingTool?.getTradePriceValues?.();

      if (prices) {
        if ((this as any).riskReward !== undefined) {
          (this as any).riskReward = prices.rr;
        }

        if ((this as any).tradeDirection !== undefined) {
          (this as any).tradeDirection = prices.direction;
        }
      }
    } catch { }

    try {
      this.fincreateform?.patchValue({
        order_type: setupType === 'BUY' ? 'Buy' : 'Sell',
        entry_price: entry.toFixed(2),
        stoploss_price: stoploss.toFixed(2),
        target_price: target.toFixed(2),
        purchased_cmp_date: purchaseddateOnly1,
      });
    } catch { }

    console.log('Setup loaded using editable Trade Tiger tool:', {
      setupType,
      entry,
      stoploss,
      target,
      purchased_date,
      entry_timestamp,
      purchaseddateOnly1,
      entryddateOnly,
      timestampInSeconds_purchased,
      timestampInSeconds_entry,
    });
  }

  private drawBackendSetupUsingTradeTigerTool(
    setupType: 'BUY' | 'SELL',
    entryPrice: any,
    targetPrice: any,
    stoplossPrice: any,
    entryTime: any,
    targetTime: any,
    stoplossTime: any
  ): boolean {
    if (!this.chartDrawingTool) {
      alert('Chart drawing tool is not ready yet.');
      return false;
    }

    const entry = Number(entryPrice);
    const target = Number(targetPrice);
    const stoploss = Number(stoplossPrice);

    if (
      Number.isNaN(entry) ||
      Number.isNaN(target) ||
      Number.isNaN(stoploss)
    ) {
      alert('Invalid setup price.');
      return false;
    }

    if (setupType === 'BUY') {
      if (!(stoploss < entry && entry < target)) {
        alert('Invalid BUY setup. Correct structure is Stoploss < Entry < Target.');
        return false;
      }
    }

    if (setupType === 'SELL') {
      if (!(target < entry && entry < stoploss)) {
        alert('Invalid SELL setup. Correct structure is Target < Entry < Stoploss.');
        return false;
      }
    }

    try {
      (this.chartDrawingTool as any).removeDrawingsByType?.('entryPrice');
      (this.chartDrawingTool as any).removeDrawingsByType?.('targetPrice');
      (this.chartDrawingTool as any).removeDrawingsByType?.('stoplossPrice');
    } catch { }

    const makeId = (prefix: string) => {
      try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
        }
      } catch { }

      return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    };

    const entryItem = this.chartDrawingTool.addDrawing({
      id: makeId('entry'),
      type: 'entryPrice',
      p1: {
        time: entryTime,
        price: entry,
      },
      color: '#2563eb',
      lineWidth: 2,
      lineStyle: 'solid',
      selected: false,
    });

    const targetItem = this.chartDrawingTool.addDrawing({
      id: makeId('target'),
      type: 'targetPrice',
      p1: {
        time: targetTime || entryTime,
        price: target,
      },
      color: '#10b981',
      lineWidth: 2,
      lineStyle: 'solid',
      selected: false,
    });

    const stoplossItem = this.chartDrawingTool.addDrawing({
      id: makeId('stoploss'),
      type: 'stoplossPrice',
      p1: {
        time: stoplossTime || entryTime,
        price: stoploss,
      },
      color: '#f43f5e',
      lineWidth: 2,
      lineStyle: 'solid',
      selected: false,
    });

    try {
      (this.chartDrawingTool as any).refreshTradePriceMetrics?.();
    } catch { }

    try {
      this.chartDrawingTool.setActiveTool('select');
    } catch { }

    this.EntryPrice = entry;
    this.TargetPrice = target;
    this.StoplossPrice = stoploss;
    this.EntryTime = entryTime;

    if ((this as any).entryPrice !== undefined) {
      (this as any).entryPrice = entry;
    }

    if ((this as any).targetPrice !== undefined) {
      (this as any).targetPrice = target;
    }

    if ((this as any).stoplossPrice !== undefined) {
      (this as any).stoplossPrice = stoploss;
    }

    try {
      const prices = this.chartDrawingTool.getTradePriceValues();

      if ((this as any).riskReward !== undefined) {
        (this as any).riskReward = prices.rr;
      }

      if ((this as any).tradeDirection !== undefined) {
        (this as any).tradeDirection = prices.direction;
      }
    } catch { }

    if ((this as any).tradeLinePlaced !== undefined) {
      (this as any).tradeLinePlaced = {
        entry: true,
        target: true,
        stoploss: true,
      };
    }

    if (Array.isArray((this as any).chartDrawingItems)) {
      (this as any).chartDrawingItems = (this as any).chartDrawingItems.filter(
        (x: any) =>
          x.type !== 'entryPrice' &&
          x.type !== 'targetPrice' &&
          x.type !== 'stoplossPrice'
      );

      (this as any).chartDrawingItems.push(entryItem, targetItem, stoplossItem);
    }

    return true;
  }

  private clearTradeTigerSetupLines(): void {
    if (this.chartDrawingTool) {
      try {
        (this.chartDrawingTool as any).removeDrawingsByType?.('entryPrice');
        (this.chartDrawingTool as any).removeDrawingsByType?.('targetPrice');
        (this.chartDrawingTool as any).removeDrawingsByType?.('stoplossPrice');
      } catch { }
    }

    if (Array.isArray((this as any).chartDrawingItems)) {
      (this as any).chartDrawingItems = (this as any).chartDrawingItems.filter(
        (x: any) =>
          x.type !== 'entryPrice' &&
          x.type !== 'targetPrice' &&
          x.type !== 'stoplossPrice'
      );
    }

    this.EntryPrice = '';
    this.TargetPrice = '';
    this.StoplossPrice = '';

    if ((this as any).entryPrice !== undefined) {
      (this as any).entryPrice = null;
    }

    if ((this as any).targetPrice !== undefined) {
      (this as any).targetPrice = null;
    }

    if ((this as any).stoplossPrice !== undefined) {
      (this as any).stoplossPrice = null;
    }

    if ((this as any).riskReward !== undefined) {
      (this as any).riskReward = null;
    }

    if ((this as any).tradeDirection !== undefined) {
      (this as any).tradeDirection = null;
    }

    if ((this as any).tradeLinePlaced !== undefined) {
      (this as any).tradeLinePlaced = {
        entry: false,
        target: false,
        stoploss: false,
      };
    }
  }

  private syncCreateOrderPanelFromEditableLines(): void {
    if (!this.chartDrawingTool) return;

    try {
      const prices = this.chartDrawingTool.getTradePriceValues();

      if (
        prices.entry === null ||
        prices.target === null ||
        prices.stoploss === null
      ) {
        return;
      }

      // Skip invalid temporary drag position
      if (prices.direction === 'INVALID') {
        return;
      }

      this.EntryPrice = prices.entry;
      this.TargetPrice = prices.target;
      this.StoplossPrice = prices.stoploss;

      if (this.showCreateOrderModal && this.fincreateformForPanel) {
        this.fincreateformForPanel.patchValue(
          {
            entry_price: Number(prices.entry).toFixed(2),
            target_price: Number(prices.target).toFixed(2),
            stoploss_price: Number(prices.stoploss).toFixed(2),
          },
          { emitEvent: false }
        );

        this.fincreateorderData = this.fincreateformForPanel.value;
      }
    } catch (err) {
      console.error('Failed to sync setup prices from editable lines:', err);
    }
  }

  LoadChart(data: any, chartId: any) {
    //  data = data.slice(0, -1);
    let chart = null;
    const chartProperties = {
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
      },
      crosshair: {
        mode: CrosshairMode.Normal
      },
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
      watermark: {
        visible: true,
        fontSize: 20,
        horzAlign: 'left',
        vertAlign: 'top',
        color: 'rgb(128, 128, 128)',
        text: this.SelectedStockName.toUpperCase() + " | " + this.ModalHeader.toUpperCase() + " | " + this.selectedTradeType.toUpperCase(),
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
    });

    this.areaSeries = chart.addAreaSeries({
      lineColor: '#2962FF', topColor: '#2962FF',
      bottomColor: 'rgba(41, 98, 255, 0.28)',
    });

    this.candlestickSeries = chart.addCandlestickSeries({
      upColor: '#1B880C', downColor: '#D90000', borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });

    const postbars = [...new Array(100)].map((_, i) => ({
      time: data[data.length - 1].time + (i + 1) * this.xspan,
    }));

    // Adjust the price scale to "squeeze" the chart vertically, increasing candle height
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.01, // Reduce the top margin for the price scale
        bottom: 0.01, // Reduce the bottom margin to squeeze candles vertically
      },
      autoScale: true, // Ensure auto-scaling continues to work
    });

    const now = new Date();
    const dayOfWeek = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    // this.candlestickSeries.setData([...data]);
    this.candlestickSeries.setData([...data, ...postbars]);

    chart.timeScale().fitContent();
    this.rectangleTool = new RectangleDrawingTool(chart,
      this.candlestickSeries,
      document.querySelector<HTMLDivElement>('#toolbar')!,
      {
        showLabels: false,
      });
    // EMA
    const maData = this.calculateMovingAverageSeriesData(data, 20);

    const maSeries = chart.addLineSeries({ color: '#2962FF', lineWidth: 1 });
    maSeries.setData(maData);

    // const candlestickSeries = chart.addCandlestickSeries({
    //   upColor: '#1B880C',
    //   downColor: '#D90000',
    //   borderVisible: false,
    //   wickUpColor: '#26a69a',
    //   wickDownColor: '#ef5350',
    // });
    // candlestickSeries.setData(data);
    // EMA END

    // TOOLTIP START
    chart.subscribeCrosshairMove(param => {
      if (param.time) {
        const seriesPrices = param.seriesData.get(this.candlestickSeries);
        if (seriesPrices) {
          this.toolTipData = seriesPrices;
          this.Open = this.toolTipData.open.toFixed(2);
          this.Close = this.toolTipData.close.toFixed(2);
          this.High = this.toolTipData.high.toFixed(2);
          this.Low = this.toolTipData.low.toFixed(2);
          if (this.Close > this.Open) {
            this.CandleColor = "green";
          } else {
            this.CandleColor = "red";
          }
        }
        else {
          this.Open = "";
          this.Close = "";
          this.High = "";
          this.Low = "";
        }
      }
    });
    // TOOLTIP END
    this.chart = chart;
    const lastRow = data.slice(-1)[0];
    this.CreateClosingLine(lastRow.close)
  }

  CreateClosingLine(price: any) {
    if (this.lastCMPLine) {
      this.candlestickSeries.removePriceLine(this.lastCMPLine);
    }
    const ClosingPrice = price;
    const ClosingPriceLine = {
      price: ClosingPrice,
      color: 'green',
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: 'CMP',
    };
    this.lastCMPLine = this.candlestickSeries.createPriceLine(ClosingPriceLine);
  }

  calculateMovingAverageSeriesData(candleData: any, maLength: any) {
    const maData = [];
    for (let i = 0; i < candleData.length; i++) {
      if (i < maLength) {
        maData.push({ time: candleData[i].time });
      } else {
        let sum = 0;
        for (let j = 0; j < maLength; j++) {
          sum += candleData[i - j].close;
        }
        const maValue = sum / maLength;
        maData.push({ time: candleData[i].time, value: maValue });
      }
    }
    return maData;
  }

  openBar(isOpen: boolean): void {
    this.isLeftBarOpen = isOpen;
  }

  toggleLeftBar(): void {
    if (window.innerWidth <= 767.98) {
      this.isLeftBarOpen = !this.isLeftBarOpen;
    } else {
      this.isLeftBarOpen = true;
    }
  }

  handleSettingsEnter(): void {
    if (window.innerWidth > 767.98) {
      this.openBar(true);
    }
  }

  handleLeftBarEnter(): void {
    if (window.innerWidth > 767.98) {
      this.openBar(true);
    }
  }

  handleLeftBarLeave(): void {
    if (window.innerWidth > 767.98) {
      this.openBar(false);
    }
  }

  CloseFullModal() {
    this.UpdateTradeFlag = false;
    this.isNotificationVisible = false;
    this.ModelPrediction = "";
    this.clearManualZoneDrawings();
    this.clearChartDrawingItems();
    this.cleanupChart();
    this.disconnectWebSocket();

    this.dropdownShow = false;

    this.selectedOptions = {
      base_candle: false,
      buy_sell_zone: false,
      bad_zone: false,
      setup: false,
      overlap_evaluate: false,
      overlap_analyze: false,
      qualified_zones: false,
      optimized_buy_sell_zone: false
    };

    const leftBar = document.getElementById('leftBar');
    if (leftBar?.classList.contains('open')) {
      leftBar.classList.remove('open');
    }

    this.FullScreenMode = false;
    this.submitStock = false;

    // reset properly
    this.overlapMemory = {};

    this.modalalert.hide();
  }

  cleanupChart() {
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }

  GetChartData(stock_name: any, time_frame: any) {
    const currentDateTime = moment();
    const last_d_time = currentDateTime.format("YYYY-MM-DD HH:mm:ss");
    let obj = {
      tick: stock_name,
      time_frame: time_frame,
      last_d_time: last_d_time
    }
    this.apiService.fetchCandleData(obj).subscribe(resp => {

    })
  }

  checkOptions(): boolean {
    for (let key in this.selectedOptions) {
      if (this.selectedOptions[key]) {
        return false;
      }
    }
    return true;
  }

  private getZoneBounds(zone: any[]) {
    if (!Array.isArray(zone) || zone.length < 2) {
      return null;
    }

    const p1 = zone[0];
    const p2 = zone[1];

    return {
      startTime: Math.min(p1.time, p2.time),
      endTime: Math.max(p1.time, p2.time),
      bottom: Math.min(p1.price, p2.price),
      top: Math.max(p1.price, p2.price)
    };
  }

  isOverlapping(zone1: any[], zone2: any[]): boolean {
    const z1 = this.getZoneBounds(zone1);
    const z2 = this.getZoneBounds(zone2);

    if (!z1 || !z2) {
      return false;
    }

    const priceOverlap =
      z1.top >= z2.bottom &&
      z2.top >= z1.bottom;

    const timeOverlap =
      z1.startTime <= z2.endTime &&
      z2.startTime <= z1.endTime;

    return priceOverlap && timeOverlap;
  }

  markOverlappingZones(zones: any[]) {
    const overlappingIndexes = new Set<number>();

    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        if (this.isOverlapping(zones[i], zones[j])) {
          overlappingIndexes.add(i);
          overlappingIndexes.add(j);
        }
      }
    }

    return overlappingIndexes;
  }

  checkboxClicked(option: string) {
    const buyfillColor = 'rgba(16, 185, 129, 0.10)';
    const buyoutlineColor = '#059669';
    const buytextColor = '#065f46';
    const sellfillColor = 'rgba(225, 29, 72, 0.10)';
    const selloutlineColor = '#be123c';
    const selltextColor = '#881337';
    this.candlestickSeries.setMarkers([]);
    this.selectedOptions[option] = !this.selectedOptions[option];
    let result = this.checkOptions();
    if (result == false) {
      this.rectangleTool.removeAllRectangles()

      if (this.selectedOptions['score']) {
        const buyfillColor = 'rgba(0, 255, 0, 0)';
        const buytextColor = '#08431d';

        const sellfillColor = 'rgba(255, 51, 51, 0)';
        const selltextColor = '#991b1b';

        const buyZones = this.ScoreData?.ZONES_X?.Buy || [];
        const sellZones = this.ScoreData?.ZONES_X?.Sell || [];

        if (buyZones.length > 0) {
          for (const item of buyZones) {
            this.rectangleTool.addRectanglesFromData(item.range, {
              fillColor: buyfillColor,
              text: `${item.meta?.final_weighted_score ?? ''}`,
              textColor: buytextColor
            });
          }
        }

        if (sellZones.length > 0) {
          for (const item of sellZones) {
            this.rectangleTool.addRectanglesFromData(item.range, {
              fillColor: sellfillColor,
              text: `${item.meta?.final_weighted_score ?? ''}`,
              textColor: selltextColor
            });
          }
        }
      }

      if (this.selectedOptions['qualified_zones']) {
        this.showmsg = "Fetching All Zones Data !";

        const buy_array = Object.values(this.QualifiedData["Buy"] || {});
        const sell_array = Object.values(this.QualifiedData["Sell"] || {});

        const buyOverlap = this.markOverlappingZones(buy_array);
        const sellOverlap = this.markOverlappingZones(sell_array);

        // BUY zones
        buy_array.forEach((item: any, index: number) => {
          const isOverlap = buyOverlap.has(index);

          this.rectangleTool.addRectanglesFromData(item, {
            fillColor: isOverlap
              ? 'rgba(0, 200, 120, 0.35)'   // overlap green shade
              : 'rgba(0,255,0,0.2)',        // normal green
            outlineColor: isOverlap
              ? 'rgba(0, 255, 170, 0.95)'   // bright outline
              : 'rgba(0, 255, 0, 0.45)',
            outlineWidth: isOverlap ? 1 : 0
          });
        });

        // SELL zones
        sell_array.forEach((item: any, index: number) => {
          const isOverlap = sellOverlap.has(index);

          this.rectangleTool.addRectanglesFromData(item, {
            fillColor: isOverlap
              ? 'rgba(220, 38, 38, 0.35)'   // overlap sell
              : 'rgba(255, 51, 51, 0.2)',   // normal sell
            outlineColor: isOverlap
              ? 'rgba(153, 27, 27, 1)'      // dark red outline
              : 'rgba(255, 51, 51, 0.45)',
            outlineWidth: isOverlap ? 1 : 0
          });
        });
      }

      if (this.selectedOptions['all_zones']) {
        this.showmsg = "Fetching All Zones Data !";
        const array = this.AllZonesData[this.FullScreenModeValue];
        const fillColorBuy = 'rgba(50,50,50,0.5)';
        var buy_array = array['Buy'];
        for (let item of Object.values(buy_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(50,50,50,0.5)';
        var sell_array = array['Sell'];
        for (let item of Object.values(sell_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.entry_price, this.stoploss_price, this.target_price)
      }

      if (this.selectedOptions['base_candle']) {
        this.showmsg = "Fetching Base Candle Data !";
        const BaseMarkers = [];
        const fillColor = 'rgba(51,153,255,0.3)';
        const array = this.BaseCandleData[this.FullScreenModeValue];
        for (let item of array) {
          BaseMarkers.push({
            time: item,
            position: 'aboveBar',
            color: 'blue',
            shape: 'arrowDown',
            text: "B",
          });
        }
        this.candlestickSeries.setMarkers(BaseMarkers);
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.entry_price, this.stoploss_price, this.target_price)
      }

      if (this.selectedOptions['buy_sell_zone']) {
        this.showmsg = "Fetching Buy/Sell Zone !";
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        var buy_array = this.BuyZoneData[this.FullScreenModeValue];
        for (let item of Object.values(buy_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(255,51,51,0.2)';
        var sell_array = this.SellZoneData[this.FullScreenModeValue];
        for (let item of Object.values(sell_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.entry_price, this.stoploss_price, this.target_price)
      }

      if (this.selectedOptions['bad_zone']) {
        let array = this.BadZoneData[this.FullScreenModeValue]
        const fillColor = "rgba(41, 3, 3, 0.21)"
        for (let item of Object.values(array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColor });
        }
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.entry_price, this.stoploss_price, this.target_price)
      }

      if (this.selectedOptions['optimized_buy_sell_zone']) {
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        var buy_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
        for (let item of Object.values(buy_array.Buy)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(255,51,51,0.2)';
        var sell_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
        for (let item of Object.values(sell_array.Sell)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }

        this.drawParentAnalyzeZoneOnChildChartExchange(
          buyfillColor,
          buyoutlineColor,
          buytextColor,
          sellfillColor,
          selloutlineColor,
          selltextColor
        );
      }

      if (this.selectedOptions["htf_zone"]) {
        this.drawHtfZonesByExchange(
          buyfillColor,
          buyoutlineColor,
          buytextColor,
          sellfillColor,
          selloutlineColor,
          selltextColor
        );
      }
    }
    else {
      this.dropdownShow = false;
      this.candlestickSeries.setMarkers([]);
      this.rectangleTool.removeAllRectangles()
      // if (this.buylineSeries) {
      //   this.buylineSeries.setMarkers([]);
      //   this.buylineSeries.setData([]);
      // }
      // if (this.targetlineSeries) {
      //   this.targetlineSeries.setMarkers([]);
      //   this.targetlineSeries.setData([]);
      // }
      // if (this.stoplosslineSeries) {
      //   this.stoplosslineSeries.setMarkers([]);
      //   this.stoplosslineSeries.setData([]);
      // }
      // this.getsetup(this.purchased_date, this.entry_timestamp, this.entry_price, this.stoploss_price, this.target_price)
    }
  }

  private getHtfLabel(tfKey: string): string {
    const labelMap: Record<string, string> = {
      monthly: "Monthly",
      weekly: "Weekly",
      daily: "Daily",
      sixty: "60 Min",
      seventy_five: "75 Min",
      one_twenty: "120 Min",
      one_twenty_five: "125 Min",
      two_forty: "240 Min",
      twenty_five: "25 Min",
      fifteen: "15 Min",
    };

    return labelMap[tfKey] || tfKey;
  }

  private getHtfOverlayData(tfKey: string, side: "Buy" | "Sell"): any {
    if (side === "Buy") {
      return this.BuyOverlayData?.[tfKey] || {};
    }
    return this.SellOverlayData?.[tfKey] || {};
  }

  private getCurrentExchangeHtfRule(): MenuRule | undefined {
    const exchangeName = (
      this.selectedExchange?.exchange_name ||
      this.SelectedExchange_Name ||
      ""
    ).trim().toUpperCase();

    if (!exchangeName) return undefined;

    const rulesForExchange = EXCHANGE_HTF_ZONE_RULES[exchangeName];
    if (!rulesForExchange) return undefined;

    return (
      rulesForExchange[this.activeMenu] ||
      rulesForExchange[this.FullScreenModeValue]
    );
  }

  private drawSingleHtfZoneByKey(
    tfKey: string,
    buyfillColor: string,
    buyoutlineColor: string,
    buytextColor: string,
    sellfillColor: string,
    selloutlineColor: string,
    selltextColor: string
  ): void {
    const label = this.getHtfLabel(tfKey);

    const buyArray = this.getHtfOverlayData(tfKey, "Buy");
    const sellArray = this.getHtfOverlayData(tfKey, "Sell");

    for (const item of Object.values(buyArray || {})) {
      this.rectangleTool.addRectanglesFromData(item, {
        fillColor: buyfillColor,
        outlineColor: buyoutlineColor,
        outlineWidth: 0.5,
        text: label,
        textColor: buytextColor
      });
    }

    for (const item of Object.values(sellArray || {})) {
      this.rectangleTool.addRectanglesFromData(item, {
        fillColor: sellfillColor,
        outlineColor: selloutlineColor,
        outlineWidth: 0.5,
        text: label,
        textColor: selltextColor
      });
    }
  }

  private drawHtfZonesByExchange(
    buyfillColor: string,
    buyoutlineColor: string,
    buytextColor: string,
    sellfillColor: string,
    selloutlineColor: string,
    selltextColor: string
  ): void {
    const rule = this.getCurrentExchangeHtfRule();

    if (!rule?.htf_zone) return;

    const htfKeys = Object.keys(rule.htf_zone);

    for (const tfKey of htfKeys) {
      this.drawSingleHtfZoneByKey(
        tfKey,
        buyfillColor,
        buyoutlineColor,
        buytextColor,
        sellfillColor,
        selloutlineColor,
        selltextColor
      );
    }
  }

  slectedStock(item: any, key: any, tradeId: any, probability: any, prediction: any, exp_num: any, trade_id: any) {
    this.EXP_NUM = exp_num;
    this.SelectedStock = item.STOCK_NAME;
    this.Probability = probability;
    this.Prediction = prediction;
    this.selectedTradeId = trade_id;
    const timeFrameMap: any = {
      NSE: {
        daily: 1,
        sixty: 2,
        fifteen: 3,
        seventy_five: 25,
        one_twenty_five: 5,
        twenty_five: 6
      },
      MCX: {
        daily: 1,
        sixty: 4,
        two_forty: 2,
        one_twenty: 3
      },
      NSEFO: {
        daily: 1,
        sixty: 2,
        fifteen: 3,
        seventy_five: 25,
        one_twenty_five: 5,
        twenty_five: 6
      }
    };
    let orderTimeFrame = timeFrameMap[this.SelectedExchange_Name]?.[this.activeMenu] ?? null;
    this.apiService.OnGetStockIdByTradeidService(tradeId).subscribe(resp => {
      this.stockId = resp.response.stock_id;
      this.fincreateform.patchValue({
        stock_tick: item.STOCK_NAME,
        order_type: key,
        entry_price: item[key]?.entry_price.toFixed(2),
        stoploss_price: item[key]?.stop_loss.toFixed(2),
        target_price: item[key]?.target_price.toFixed(2),
        purchased_cmp_date: this.getCurrentDateTime(),
        time_frame: orderTimeFrame,
        country_id: this.countryId,
        stock_id: this.stockId.toString()
      });
    })


  }

  getCurrentDateTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  create(type: any) {
    this.showmsg = "Please Wait !!"
    this.submitted = true;
    this.fincreateform.markAllAsTouched();
    if (this.fincreateform.invalid) {
      return;
    }

    if (this.fincreateform.valid) {
      this.spinner.show();
      this.fincreateform.patchValue({
        prediction: this.Prediction,
        probability: this.Probability
      })
      this.fincreateorderData = this.fincreateform.value
      if (this.SelectedExchange_Name == "NSE") {
        this.fincreateorderData = {
          ...this.fincreateorderData,
          trade_id: this.selectedTradeId
        };
        if (type == "demo") {
          this.apiService.createorder(this.fincreateorderData).subscribe(resp => {
            if (resp.msg == "success") {
              // this.closemodal.nativeElement.click();
              this.spinner.hide();
              this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.toastr.success("Order Created Successfully ", 'ALERT !');
              this.submitted = false;
              this.fincreateform.reset();
              this.showCreateOrderModalforButtonClick = false;
            }
            else {
              this.spinner.hide();
              this.toastr.error(resp.response, 'ALERT !');
            }
          })
        }
        else {
          this.apiService.createBucketOrdersService(this.fincreateorderData).subscribe(resp => {
            if (resp.msg == "success") {
              this.spinner.hide();
              this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.toastr.success("Order Created Successfully ", 'ALERT !');
              this.submitted = false;
              this.fincreateform.reset();
              this.showCreateOrderModalforButtonClick = false;
            }
            else {
              this.spinner.hide();
              this.toastr.error(resp.response, 'ALERT !');
            }
          })
        }

      }

      if (this.SelectedExchange_Name == "MCX") {
        const formattedDate = `${this.EXP_NUM.slice(0, 2)}-${this.EXP_NUM.slice(2, 4)}-${this.EXP_NUM.slice(4)}`;
        this.fincreateorderData = {
          ...this.fincreateorderData,
          exp_date: formattedDate,
          trade_id: this.selectedTradeId
        };

        this.apiService.createorderForMCXservice(this.fincreateorderData).subscribe(resp => {
          if (resp.msg == "success") {
            // this.closemodal.nativeElement.click();
            this.spinner.hide();
            this.toastr.success("Order Created Successfully ", 'ALERT !');
            this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.submitted = false;
            this.fincreateform.reset();
            this.showCreateOrderModalforButtonClick = false;
          }
          else {
            this.spinner.hide();
            this.toastr.error(resp.msg, 'ALERT !');
          }
        })
      }

      if (this.SelectedExchange_Name == "NSEFO") {
        const formattedDate = `${this.EXP_NUM.slice(0, 2)}-${this.EXP_NUM.slice(2, 4)}-${this.EXP_NUM.slice(4)}`;
        this.fincreateorderData = {
          ...this.fincreateorderData,
          exp_date: formattedDate,
          trade_id: this.selectedTradeId
        };
        this.apiService.createorderForNSEFOservice(this.fincreateorderData).subscribe(resp => {
          if (resp.msg == "success") {
            // this.closemodal.nativeElement.click();
            this.spinner.hide();
            this.toastr.success("Order Created Successfully ", 'ALERT !');
            this.submitted = false;
            this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.fincreateform.reset();
            this.showCreateOrderModalforButtonClick = false;
          }
          else {
            this.spinner.hide();
            this.toastr.error(resp.response, 'ALERT !');
          }
        })
      }

    }
  }

  createOrderForPanel(type: any) {
    this.showmsg = "Please Wait !!"
    this.submit = true;
    this.fincreateformForPanel.markAllAsTouched();
    if (this.fincreateformForPanel.invalid) {
      return;
    }

    if (this.fincreateformForPanel.valid) {
      this.spinner.show();
      this.fincreateformForPanel.patchValue({
        prediction: this.Prediction,
        probability: this.Probability
      })
      this.fincreateorderData = this.fincreateformForPanel.value
      if (this.SelectedExchange_Name == "NSE") {
        this.fincreateorderData = {
          ...this.fincreateorderData,
          trade_id: this.selectedTradeId
        };
        if (type == "demo") {
          this.apiService.createorder(this.fincreateorderData).subscribe(resp => {
            if (resp.msg == "success") {
              // this.closemodal.nativeElement.click();
              this.spinner.hide();
              this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.toastr.success("Order Created Successfully ", 'ALERT !');
              this.submit = false;
              this.fincreateformForPanel.reset();
              this.showCreateOrderModal = false;
            }
            else {
              this.spinner.hide();
              this.toastr.error(resp.response, 'ALERT !');
            }
          })
        }
        else {
          this.apiService.createBucketOrdersService(this.fincreateorderData).subscribe(resp => {
            if (resp.msg == "success") {
              this.spinner.hide();
              this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
              this.toastr.success("Order Created Successfully ", 'ALERT !');
              this.submitted = false;
              this.fincreateform.reset();
              this.showCreateOrderModalforButtonClick = false;
            }
            else {
              this.spinner.hide();
              this.toastr.error(resp.response, 'ALERT !');
            }
          })
        }

      }

      if (this.SelectedExchange_Name == "MCX") {
        const formattedDate = `${this.EXP_NUM.slice(0, 2)}-${this.EXP_NUM.slice(2, 4)}-${this.EXP_NUM.slice(4)}`;
        this.fincreateorderData = {
          ...this.fincreateorderData,
          exp_date: formattedDate,
          trade_id: this.selectedTradeId
        };
        this.apiService.createorderForMCXservice(this.fincreateorderData).subscribe(resp => {
          if (resp.msg == "success") {
            // this.closemodal.nativeElement.click();
            this.spinner.hide();
            this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.toastr.success("Order Created Successfully ", 'ALERT !');
            this.submit = false;
            this.fincreateformForPanel.reset();
            this.showCreateOrderModal = false;
          }
          else {
            this.spinner.hide();
            this.toastr.error(resp.msg, 'ALERT !');
          }
        })
      }

      if (this.SelectedExchange_Name == "NSEFO") {
        const formattedDate = `${this.EXP_NUM.slice(0, 2)}-${this.EXP_NUM.slice(2, 4)}-${this.EXP_NUM.slice(4)}`;
        this.fincreateorderData = {
          ...this.fincreateorderData,
          exp_date: formattedDate,
          trade_id: this.selectedTradeId
        };
        this.apiService.createorderForNSEFOservice(this.fincreateorderData).subscribe(resp => {
          if (resp.msg == "success") {
            // this.closemodal.nativeElement.click();
            this.spinner.hide();
            this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
            this.toastr.success("Order Created Successfully ", 'ALERT !');
            this.submit = false;
            this.fincreateformForPanel.reset();
            this.showCreateOrderModal = false;
          }
          else {
            this.spinner.hide();
            this.toastr.error(resp.response, 'ALERT !');
          }
        })
      }

    }
  }

  sortData(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    const tradeList = this.getActiveTradeList();
    const sortedList = this.applySorting(tradeList);
    this.setActiveTradeList(sortedList);
  }

  getActiveTradeList(): any[] {
    switch (this.activeMenu) {
      case 'daily':
        return [...this.DailyTrades];
      case 'sixty':
        return [...this.SixtyTrades];
      case 'fifteen':
        return [...this.FifteenTrades];
      case 'seventy_five':
        return [...this.SeventyFiveTrades];
      case 'two_forty':
        return [...this.TwoFortyTrades];
      case 'one_twenty':
        return [...this.OneTwentyTrades];
      case 'one_twenty_five':
        return [...this.OneTwentyFiveTrades];
      case 'twenty_five':
        return [...this.TwentyFiveTrades];
      default:
        return [];
    }
  }

  setActiveTradeList(tradeList: any[]): void {
    switch (this.activeMenu) {
      case 'daily':
        this.DailyTrades = [...tradeList];
        break;
      case 'sixty':
        this.SixtyTrades = [...tradeList];
        break;
      case 'fifteen':
        this.FifteenTrades = [...tradeList];
        break;
      case 'seventy_five':
        this.SeventyFiveTrades = [...tradeList];
        break;
      case 'two_forty':
        this.TwoFortyTrades = [...tradeList];
        break;
      case 'one_twenty':
        this.OneTwentyTrades = [...tradeList];
        break;
      case 'one_twenty_five':
        this.OneTwentyFiveTrades = [...tradeList];
        break;
      case 'twenty_five':
        this.TwentyFiveTrades = [...tradeList];
        break;
    }
  }

  applySorting(tradeList: any[]): any[] {
    if (!this.sortColumn) {
      return [...tradeList];
    }

    return [...tradeList].sort((a, b) => {
      const aKey = this.getTradeKey(a);
      const bKey = this.getTradeKey(b);

      let valA: any;
      let valB: any;

      if (this.sortColumn === 'TRADE_TYPE') {
        valA = aKey ?? '';
        valB = bKey ?? '';
      } else if (['entry_price', 'target_price', 'stop_loss'].includes(this.sortColumn)) {
        valA = a[aKey]?.[this.sortColumn] ?? 0;
        valB = b[bKey]?.[this.sortColumn] ?? 0;
      } else {
        valA = a[this.sortColumn];
        valB = b[this.sortColumn];
      }

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (typeof valA === 'string' || typeof valB === 'string') {
        return this.sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      }

      return this.sortDirection === 'asc'
        ? (valA ?? 0) - (valB ?? 0)
        : (valB ?? 0) - (valA ?? 0);
    });
  }

  getTradeKey(obj: any): string {
    return obj.BUY ? 'BUY' : obj.SELL ? 'SELL' : '';
  }

  isHighlighted(stockName: string): boolean {
    return this.highlightedStockNames
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlightedsixty(stockName: string): boolean {
    return this.highlightedStockNamesSixty
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlightedfifteen(stockName: string): boolean {
    return this.highlightedStockNamesFifteen
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlightedseventy_five(stockName: string): boolean {
    return this.highlightedStockNames75
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlighted240(stockName: string): boolean {
    return this.highlightedStockNames240
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlighted120(stockName: string): boolean {
    return this.highlightedStockNames120
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlighted125(stockName: string): boolean {
    return this.highlightedStockNames125
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  ishighlighted25(stockName: string): boolean {
    return this.highlightedStockNames25
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  keyboardFunction() {
    let buffer = '';
    let lastKeyTime = Date.now();

    this.keySub = fromEvent<KeyboardEvent>(window, 'keydown').pipe(
      filter(e => e.key.length === 1 || e.key === 'Backspace' || e.key === ' '),
      map(e => {
        const now = Date.now();
        const gap = now - lastKeyTime;
        lastKeyTime = now;

        if (gap > 1500) {
          buffer = '';
        }

        if (e.key === ' ') {
          buffer = '';
          this.highlightedStockNames = [];
          this.highlightedStockNamesSixty = [];
          this.highlightedStockNamesFifteen = []
          this.typedText = '';
          return '';
        }

        if (e.key === 'Backspace') {
          buffer = buffer.slice(0, -1);
        } else {
          buffer += e.key.toLowerCase();
        }
        return buffer;
      }),
      debounceTime(400)
    ).subscribe(value => {
      this.typedText = value;

      if (this.activeMenu === 'daily') {
        this.dailyState.searchKey = value;
        // this.FetchDailyTrades('', value, true);
      } else if (this.activeMenu === 'sixty') {
        this.sixtyState.searchKey = value;
        // this.FetchSixtyTrades('', value, true);
      } else if (this.activeMenu === 'fifteen') {
        this.fifteenState.searchKey = value;
        // this.FetchFifteenTrades('', value, true);
      }
      else if (this.activeMenu === 'seventy_five') {
        this.seventyfiveState.searchKey = value;
        // this.Fetch75Trades('', value, true);
      }
      else if (this.activeMenu === 'two_forty') {
        this.twofortyState.searchKey = value;
        // this.Fetch240Trades('', value, true);
      }
      else if (this.activeMenu === 'one_twenty') {
        this.onetwentyState.searchKey = value;
        // this.Fetch120Trades('', value, true);
      }
      else if (this.activeMenu === 'one_twenty_five') {
        this.onetwentyfiveState.searchKey = value;
        // this.Fetch120Trades('', value, true);
      }
      else if (this.activeMenu === 'twenty_five') {
        this.twentyfiveState.searchKey = value;
        // this.Fetch120Trades('', value, true);
      }
    });
  }

  showContextMenu(x: number, y: number): void {
    const menu = document.getElementById('customContextMenu');
    if (menu) {
      menu.style.display = 'block';
      menu.style.top = `${y}px`;
      menu.style.left = `${x}px`;
    }
  }

  hideContextMenu(): void {
    const menu = document.getElementById('customContextMenu');
    if (menu) {
      menu.style.display = 'none';
    }
  }

  showAlert(): void {

    this.alertForm.get('trigger_price')?.valueChanges.subscribe(() => {
      this.calculateMinMax();
    });

    this.alertForm.get('threshold')?.valueChanges.subscribe(() => {
      this.calculateMinMax();
    });
    this.alertForm.patchValue({
      exchange: this.SelectedExchange_Name,
      stock_symbol: this.SelectedStockName.toUpperCase(),
      timeframe: this.time_frame.toString()

    })

    this.modalalert.show();
    this.hideContextMenu();
  }

  onSubmitSetAlert() {
    this.submitStock = true;
    this.alertForm.markAllAsTouched();
    if (this.alertForm.invalid) {
      this.toastr.error("This fields are required !")
      return;
    }
    else {
      this.spinner.show();
      const setAlertData = this.alertForm.value;
      this.apiService.onSubmitSetAlertService(setAlertData).subscribe(resp => {
        if (resp.msg == "success") {
          this.spinner.hide();
          this.toastr.success(resp.response.message);
          this.submitStock = false;
          this.alertForm.get('trigger_price')?.reset();
          this.alertForm.get('target_percentage')?.reset();
          this.alertForm.get('threshold')?.reset();
          this.alertForm.get('price_range_min')?.reset();
          this.alertForm.get('price_range_max')?.reset();
          this.alertForm.get('cooldown_minutes')?.reset();
          this.alertForm.get('note')?.reset();
          this.alertForm.get('alert_type')?.setValue('');
          this.getAllSetAlerts();
        }
        else {
          this.spinner.hide();
          return;
        }
      });
    };
  }

  getAllSetAlerts() {
    this.apiService.getAllSetAlertsService(this.userId).subscribe(resp => {
      if (resp.msg = "success") {
        this.allSetAlerts = resp.response;
      }
      else {
        console.log(resp);
      }
    });
  }

  deleteAlert(alertid: any) {
    const confirmation = window.confirm("Are you sure , you want to delete?");
    if (confirmation) {
      this.spinner.show();
      this.apiService.deleteAlertService(alertid).subscribe(data => {
        this.showmsg = data.msg;
        if (this.showmsg == "success") {
          this.spinner.hide();
          this.toastr.success('Alert Deleted Successfully');
          this.getAllSetAlerts();
        }
        else {
          this.spinner.hide();
          this.toastr.error('Alert Deletion Failed');
        }
      });
    }
  }

  openCreateOrderPanel() {
    this.showCreateOrderModal = true;

    // First sync latest edited line prices
    this.syncCreateOrderPanelFromEditableLines();

    this.apiService.OnGetStockIdByTradeidService(this.selectedTradeId).subscribe(resp => {
      this.stockId = resp.response.stock_id;

      // Sync again before patching full form
      this.syncCreateOrderPanelFromEditableLines();

      this.fincreateformForPanel.patchValue({
        stock_tick: this.SelectedStockName,
        order_type: this.selectedTradeType,
        entry_price: Number(this.EntryPrice).toFixed(2),
        stoploss_price: Number(this.StoplossPrice).toFixed(2),
        target_price: Number(this.TargetPrice).toFixed(2),
        purchased_cmp_date: this.getCurrentDateTime(),
        time_frame: this.time_frame,
        country_id: this.countryId,
        stock_id: this.stockId.toString()
      });

      this.fincreateorderData = this.fincreateformForPanel.value;
    });
  }

  closeCreateOrderPanel() {
    this.showCreateOrderModal = false;
    this.fincreateformForPanel.reset();
    this.submit = false;
  }

  onSubmitofPanelOrder(type: any) {
    this.createOrderForPanel(type);
  }

  openCreateOrderPanelforButton() {
    this.showCreateOrderModalforButtonClick = true;
  }

  closeCreateOrderPanelforButton() {
    this.showCreateOrderModalforButtonClick = false;
    this.fincreateform.reset();
    this.submitted = false;
  }

  formatExpiry(expNum: string): string {
    if (!expNum || expNum.length !== 8) return expNum;

    const day = expNum.substring(0, 2);
    const month = expNum.substring(2, 4);
    const year = expNum.substring(4, 8);

    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).replace(/ /g, ' ');
  }

  UpdatePrediction() {
    this.spinner.show()
    let data = null;
    if (this.SelectedExchange_Name == "NSE") {
      data = {
        "order_type": this.SETUPTYPE,
        "entry_price": this.EntryPrice,
        "target_price": this.TargetPrice,
        "stoploss_price": this.StoplossPrice,
        "last_d_time": this.finData.last_d_time,
        "time_frame": this.finData.time_frame,
        "tick": this.finData.tick,
        country_id: localStorage.getItem('selectedCountryId')
      }
      this.apiService.getModelPredictionService(data).subscribe(resp => {
        this.ModelPrediction = "PROBABILITY OF TRADE : " + resp.msg.toUpperCase() + " = " + resp.response.probability + " %";
        this.Prediction = resp.msg;
        this.Probability = resp.response.probability;
        this.showMarketAlert(this.ModelPrediction)
        this.UpdateTradeFlag = true;
        this.spinner.hide()
      })
    }
    if (this.SelectedExchange_Name == "MCX") {
      data = {
        "order_type": this.SETUPTYPE,
        "entry_price": this.EntryPrice,
        "target_price": this.TargetPrice,
        "stoploss_price": this.StoplossPrice,
        "last_d_time": this.finData.last_d_time,
        "time_frame": this.finData.time_frame,
        "tick": this.finData.st_sym,
        country_id: localStorage.getItem('selectedCountryId')
      }
      this.apiService.getMCXModelPredictionService(data, this.SelectedExpiryDate, "commodity").subscribe(resp => {
        this.ModelPrediction = "PROBABILITY OF TRADE : " + resp.msg.toUpperCase() + " = " + resp.response.probability + " %";
        this.Prediction = resp.msg;
        this.Probability = resp.response.probability;
        this.showMarketAlert(this.ModelPrediction)
        this.UpdateTradeFlag = true;
        this.spinner.hide();
      })
    }
    if (this.SelectedExchange_Name == "NSEFO") {
      data = {
        "order_type": this.SETUPTYPE,
        "entry_price": this.EntryPrice,
        "target_price": this.TargetPrice,
        "stoploss_price": this.StoplossPrice,
        "last_d_time": this.finData.last_d_time,
        "time_frame": this.finData.time_frame,
        "tick": this.finData.st_sym,
        country_id: localStorage.getItem('selectedCountryId')
      }
      this.apiService.getMCXModelPredictionService(data, this.SelectedExpiryDate, "futures").subscribe(resp => {
        this.ModelPrediction = "PROBABILITY OF TRADE : " + resp.msg.toUpperCase() + " = " + resp.response.probability + " %";
        this.Prediction = resp.msg;
        this.Probability = resp.response.probability;
        this.showMarketAlert(this.ModelPrediction)
        this.UpdateTradeFlag = true;
        this.spinner.hide();
      })
    }
  }

  showMarketAlert(TrandeMessage: any) {
    this.isNotificationVisible = true;
  }

  UpdateAlert() {
    this.spinner.show();
    this.showmsg = "Updating Alerts .....";
    let data = null;
    if (this.SelectedExchange_Name == "NSE") {
      data = {
        "order_type": this.SETUPTYPE,
        "entry_price": this.EntryPrice,
        "target_price": this.TargetPrice,
        "stoploss_price": this.StoplossPrice,
        "last_d_time": this.finData.last_d_time,
        "time_frame": this.finData.time_frame,
        "tick": this.finData.tick,
        "country_id": localStorage.getItem('selectedCountryId')
      }
      this.apiService.getModelPredictionService(data).subscribe(resp => {
        this.Prediction = resp?.msg ? resp.msg : "0";
        this.Probability = resp?.response?.probability != null ? resp.response.probability : 0;
        this.ModelPrediction = "PROBABILITY OF TRADE : " + resp.msg.toUpperCase() + " = " + resp.response.probability + " %";

        this.showMarketAlert(this.ModelPrediction)
        let obj = {
          trade_id: this.selectedTradeId,
          entry: this.EntryPrice,
          stop_loss: this.StoplossPrice,
          target: this.TargetPrice,
          prediction: this.Prediction,
          probability: this.Probability / 100
        }
        this.apiService.upadteAlertService(obj).subscribe(resp => {
          if (resp.msg = "success") {
            this.FetchDailyTrades(this.dailyState.currentPage, null, false, this.StartDate, this.EndDate);
            this.FetchSixtyTrades(this.sixtyState.currentPage, null, false, this.StartDate, this.EndDate);
            this.FetchFifteenTrades(this.fifteenState.currentPage, null, false, this.StartDate, this.EndDate);
            this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
            this.toastr.success("Trade Updated !")
            this.spinner.hide()
          }
          else {
            this.toastr.error("Something Went Wrong !")
            this.spinner.hide()
          }

        })
      })
    }
    else {
      data = {
        "order_type": this.SETUPTYPE,
        "entry_price": this.EntryPrice,
        "target_price": this.TargetPrice,
        "stoploss_price": this.StoplossPrice,
        "last_d_time": this.finData.last_d_time,
        "time_frame": this.finData.time_frame,
        "tick": this.finData.st_sym,
        "country_id": localStorage.getItem('selectedCountryId')
      }
      let segnemt = null;
      if (this.SelectedExchange_Name == "NSEFO") {
        segnemt = "futures"
      }
      if (this.SelectedExchange_Name == "MCX") {
        segnemt = "mcx"
      }

      this.apiService.getMCXModelPredictionService(data, this.finData.exp_dt, segnemt).subscribe(resp => {
        this.Prediction = resp?.msg ? resp.msg : "0";
        this.Probability = resp?.response?.probability != null ? resp.response.probability : 0;
        this.ModelPrediction = "PROBABILITY OF TRADE : " + resp.msg.toUpperCase() + " = " + resp.response.probability + " %";

        this.showMarketAlert(this.ModelPrediction)
        let obj = {
          trade_id: this.selectedTradeId,
          entry: this.EntryPrice,
          stop_loss: this.StoplossPrice,
          target: this.TargetPrice,
          prediction: this.Prediction,
          probability: this.Probability / 100
        }
        this.apiService.upadteAlertService(obj).subscribe(resp => {
          if (resp.msg = "success") {
            this.FetchDailyTrades(this.dailyState.currentPage, null, false, this.StartDate, this.EndDate);
            this.FetchSixtyTrades(this.sixtyState.currentPage, null, false, this.StartDate, this.EndDate);
            this.FetchFifteenTrades(this.fifteenState.currentPage, null, false, this.StartDate, this.EndDate);
            this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);
            this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
            this.toastr.success("Trade Updated !")
            this.spinner.hide()
          }
          else {
            this.toastr.error("Something Went Wrong !")
            this.spinner.hide()
          }

        })
      })
    }


  }

  deleteTrade(TradeId: any) {
    const confirmation = window.confirm("Are you sure , you want to delete?");
    if (confirmation) {
      this.apiService.deleteTRadeService(TradeId).subscribe(data => {
        if (data.msg == "success") {
          this.toastr.success('Trade Deleted Successfully');
          this.FetchDailyTrades(this.dailyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
          this.FetchSixtyTrades(this.sixtyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
          this.FetchFifteenTrades(this.fifteenState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
          this.Fetch75Trades(this.seventyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
          this.Fetch240Trades(this.twofortyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
          this.Fetch120Trades(this.onetwentyState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
          this.Fetch125Trades(this.onetwentyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
          this.Fetch25Trades(this.twentyfiveState.currentPage, this.dailyState.searchKey, true, this.StartDate, this.EndDate);
        }

        else {
          this.toastr.error('Trade Deletion Failed');
        }
      });
    }
  }

  onDateToggle(event: Event) {
    this.isChecked = (event.target as HTMLInputElement).checked;
    if (this.isChecked) {
      this.isCheckedForCMP = false; // turn off CMP toggle
    }
    this.FetchDailyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchSixtyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchFifteenTrades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);
  }

  onCMPtoggle(event: Event) {
    this.isCheckedForCMP = (event.target as HTMLInputElement).checked;
    if (this.isCheckedForCMP) {
      this.isChecked = false; // turn off Date toggle
    }
    this.FetchDailyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchSixtyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchFifteenTrades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);
  }

  closeFilterPopup() {
    this.isPopupOpen = false;
  }

  toggleFilterPopup() {
    this.isPopupOpen = !this.isPopupOpen;
  }

  resetFilter() {
    this.isChecked = false;
    this.isCheckedForCMP = false;
    this.selectTradeType = "all";
    const exchange = this.exchanges.find((ex: { exchange_name: string; }) => ex.exchange_name === 'NSE');
    this.selectedExchange = exchange
    this.SelectedExchange_Id = exchange.exchange_id
    this.selectedDateRange = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.FetchDailyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchSixtyTrades(1, null, false, this.StartDate, this.EndDate);
    this.FetchFifteenTrades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch75Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch240Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch120Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch25Trades(1, null, false, this.StartDate, this.EndDate);
    this.Fetch125Trades(1, null, false, this.StartDate, this.EndDate);

  }

  isTradeSignalHighlighted(item: any): boolean {
    return item.TRADE_SIGNAL_ID != null; // highlight only if not null
  }

  vieworder(trade_id: any) {
    localStorage.removeItem('SelectedTrade');
    this.apiService.getCurrentStatus(trade_id, this.selectedExchange.exchange_name).subscribe(resp => {
      if (resp.msg == "success") {
        let obj = {
          Trade_id: trade_id,
          ExchangeName: this.selectedExchange.exchange_name,
          ActiveMenu: resp.response.order_status
        }
        localStorage.setItem('SelectedTrade', JSON.stringify(obj));
        this.router.navigate(['orderlist'])
      }
      else {
        this.toastr.error("No Order Found")
      }
    });

  }

  addPreviousHighPriceLine(key: any) {
    // Check if data exists for the given key
    if (!this.PreviousHighData || !this.PreviousHighData[key]) {
      return; // key not found, bypass silently
    }

    const previousHigh = this.PreviousHighData[key].previous_high;

    // Extra safeguard if previous_high is missing
    if (!previousHigh || previousHigh.price == null) {
      return;
    }

    const myPriceLine = {
      price: previousHigh.price,
      color: '#f5d131',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Previous High',
    };

    this.candlestickSeries.createPriceLine(myPriceLine);
  }

  handleSettingsLeave(): void {
    // keep empty or remove this if not needed
  }


  // MANUAL DRAWING CODE 

  private destroyManualRectangleTool(): void {
    this.setChartDragEnabled(true);

    // Re-enable Trade Tiger line/text selection when manual zone tool is destroyed
    try {
      this.chartDrawingTool?.setSelectionEnabled(true);
    } catch { }

    if (this.manualRectangleTool) {
      try {
        this.manualRectangleTool.stopDrawing();
      } catch { }

      try {
        this.manualRectangleTool.removeAllRectangles();
      } catch { }

      try {
        this.manualRectangleTool.destroy();
      } catch { }

      this.manualRectangleTool = null;
    }

    this.activeManualZoneType = null;
  }

  private initManualRectangleTool(type: string, data: any[]): void {
    const chartContainer = this.elementRef.nativeElement.querySelector(
      '#chart-container_new'
    ) as HTMLElement;

    if (!chartContainer) {
      console.error('Manual chart container not found');
      return;
    }

    if (!this.chart) {
      console.error('Chart is not ready for manual drawing');
      return;
    }

    if (!this.candlestickSeries) {
      console.error('Candlestick series is not ready for manual drawing');
      return;
    }

    this.destroyManualRectangleTool();

    const hiddenToolbar = document.createElement('div');
    hiddenToolbar.style.display = 'none';

    this.manualRectangleTool = new RectangleDrawingTool(
      this.chart,
      this.candlestickSeries,
      hiddenToolbar,
      {
        fillColor: 'rgba(22, 163, 74, 0.20)',
        previewFillColor: 'rgba(22, 163, 74, 0.12)',
        outlineColor: '#16a34a',
        outlineWidth: 1,
        color: '#16a34a',
        textColor: '#16a34a',
        labelColor: '#16a34a',
        labelTextColor: '#ffffff',
        showLabels: true,
        extendRight: true,
        continuousDrawing: false,

        enableSelection: true,
        enableEditing: true,
        selectedOutlineColor: '#111827',
        selectedOutlineWidth: 2,

        // IMPORTANT
        candleData: data,
        snapToOHLC: true,

        priceLabelFormatter: (price: number) => price.toFixed(2),

        timeLabelFormatter: (time: any) => {
          if (typeof time === 'string') return time;

          if (typeof time === 'number') {
            return new Date(time * 1000).toLocaleDateString();
          }

          if (time?.year && time?.month && time?.day) {
            return `${time.day}-${time.month}-${time.year}`;
          }

          return '';
        },

        onRectangleCreated: (rect: ManualRectangleRecord) => {
          const currentSymbol =
            this.finData?.symbol ||
            this.finData?.Symbol ||
            this.finData?.ticker ||
            this.finData?.Ticker ||
            '';

          this.manualRectangles.push({
            ...rect,
            sourceTimeframe: type,
            symbol: currentSymbol,
            createdAt: Date.now(),
          });

          this.activeManualZoneType = null;
          this.setChartDragEnabled(true);

          // After manual Buy/Sell zone drawing finishes,
          // enable both selection systems again.
          try {
            this.chartDrawingTool?.setSelectionEnabled(true);
            this.chartDrawingTool?.setActiveTool('select');
            this.activeChartDrawingTool = 'select';
          } catch { }

          try {
            this.manualRectangleTool?.setSelectionEnabled(true);
          } catch { }
        },

        onRectangleSelected: (rect: ManualRectangleRecord | null) => {
          // When manual Buy/Sell zone is selected,
          // hide Trade Tiger selected drawing panel.
          if (rect) {
            this.selectedChartDrawing = null;
          }
        },

        onRectangleDeleted: (rect: ManualRectangleRecord) => {
          this.manualRectangles = this.manualRectangles.filter(
            item => item.id !== rect.id
          );

          this.activeManualZoneType = null;

          this.forceChartRedraw();
        },

        onRectangleUpdated: (rect: ManualRectangleRecord) => {
          this.manualRectangles = this.manualRectangles.map(item => {
            if (item.id !== rect.id) {
              return item;
            }

            return {
              ...item,
              p1: rect.p1,
              p2: rect.p2,
              options: rect.options,
              extendRight: rect.extendRight,
            };
          });

          this.forceChartRedraw();
        },
      },
      chartContainer
    );

    this.activeManualZoneType = null;

    this.restoreManualRectangles(type, data);
  }

  private toTimeNumber(time: any): number {
    if (typeof time === 'number') {
      return time;
    }

    if (typeof time === 'string') {
      const parsed = new Date(time).getTime();

      if (!isNaN(parsed)) {
        return Math.floor(parsed / 1000);
      }

      return 0;
    }

    if (time?.year && time?.month && time?.day) {
      return Math.floor(
        new Date(time.year, time.month - 1, time.day).getTime() / 1000
      );
    }

    return 0;
  }

  private mapTimeToCurrentFrame(originalTime: any, currentData: any[]): any {
    if (!currentData || currentData.length === 0) {
      return originalTime;
    }

    const targetTime = this.toTimeNumber(originalTime);

    const sortedData = [...currentData].sort(
      (a, b) => this.toTimeNumber(a.time) - this.toTimeNumber(b.time)
    );

    let selectedTime = sortedData[0].time;

    for (const candle of sortedData) {
      const candleTime = this.toTimeNumber(candle.time);

      if (candleTime <= targetTime) {
        selectedTime = candle.time;
      } else {
        break;
      }
    }

    return selectedTime;
  }

  private getLastCandleTime(data: any[]): any {
    if (!data || data.length === 0) return null;
    return data[data.length - 1].time;
  }

  private restoreManualRectangles(type: string, data: any[]): void {
    if (!this.manualRectangleTool || !data || data.length === 0) {
      return;
    }

    const currentSymbol =
      this.finData?.symbol ||
      this.finData?.Symbol ||
      this.finData?.ticker ||
      this.finData?.Ticker ||
      '';

    const lastCandleTime = this.getLastCandleTime(data);
    if (!lastCandleTime) return;

    this.manualRectangles
      .filter(rect => {
        if (!rect.symbol) return true;
        if (!currentSymbol) return true;
        return rect.symbol === currentSymbol;
      })
      .forEach(rect => {
        const mappedStartTime = this.mapTimeToCurrentFrame(rect.p1.time, data);

        const p1: Point = {
          time: mappedStartTime,
          price: rect.p1.price,
        };

        const p2: Point = {
          time: lastCandleTime,
          price: rect.p2.price,
        };

        const options: RectangleStyleOptions = {
          fillColor: rect.options?.fillColor || 'rgba(37, 99, 235, 0.20)',
          outlineColor: rect.options?.outlineColor || '#2563eb',
          outlineWidth: rect.options?.outlineWidth ?? 1,
          color: rect.options?.color || '#2563eb',
          textColor: rect.options?.textColor || rect.options?.color || '#2563eb',
          text: rect.options?.text || `${rect.sourceTimeframe || 'Manual'} Zone`,
        };

        this.manualRectangleTool?.addRectangle(p1, p2, options, rect.id);
      });
  }

  startBuyZoneDrawing(event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.startManualZoneDrawing('BUY');
  }

  startSellZoneDrawing(event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    this.startManualZoneDrawing('SELL');
  }

  private startManualZoneDrawing(zoneType: 'BUY' | 'SELL'): void {
    if (!this.manualRectangleTool) {
      this.toastr.error('Manual drawing tool is not ready yet.');
      return;
    }

    // If same Buy/Sell drawing button clicked again, cancel manual drawing
    if (
      this.activeManualZoneType === zoneType &&
      this.manualRectangleTool.isDrawing()
    ) {
      this.manualRectangleTool.stopDrawing();
      this.activeManualZoneType = null;
      this.setChartDragEnabled(true);

      // Re-enable Trade Tiger tool selection
      try {
        this.chartDrawingTool?.setSelectionEnabled(true);
        this.chartDrawingTool?.setActiveTool('select');
        this.activeChartDrawingTool = 'select';
      } catch { }

      // Re-enable manual zone selection also
      try {
        this.manualRectangleTool?.setSelectionEnabled(true);
      } catch { }

      return;
    }

    // IMPORTANT:
    // Stop Trade Tiger tool activity before starting manual Buy/Sell zone drawing.
    // Otherwise selected rectangle/free line/long-short can capture the mouse.
    try {
      this.chartDrawingTool?.setActiveTool('select');
      this.chartDrawingTool?.setSelectionEnabled(false);
    } catch { }

    this.selectedChartDrawing = null;
    this.activeChartDrawingTool = 'select';

    // Manual zone selection should stay enabled for its own tool
    try {
      this.manualRectangleTool.setSelectionEnabled(true);
    } catch { }

    if (zoneType === 'BUY') {
      this.manualRectangleTool.setDrawingStyle({
        fillColor: 'rgba(22, 163, 74, 0.20)',
        outlineColor: '#16a34a',
        outlineWidth: 1,
        color: '#16a34a',
        text: 'BUY Zone',
      });
    }

    if (zoneType === 'SELL') {
      this.manualRectangleTool.setDrawingStyle({
        fillColor: 'rgba(220, 38, 38, 0.20)',
        outlineColor: '#dc2626',
        outlineWidth: 1,
        color: '#dc2626',
        text: 'SELL Zone',
      });
    }

    this.activeManualZoneType = zoneType;

    // Chart should not move while drawing manual zone
    this.setChartDragEnabled(false);

    this.manualRectangleTool.startDrawing();
  }

  private setChartDragEnabled(enabled: boolean): void {
    if (!this.chart) return;

    this.chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: enabled,
        horzTouchDrag: enabled,
        vertTouchDrag: enabled,
      },
      handleScale: {
        mouseWheel: true,
        pinch: enabled,
        axisPressedMouseMove: enabled,
      },
    });
  }

  private clearManualZoneDrawings(): void {
    this.setChartDragEnabled(true);

    this.activeManualZoneType = null;

    if (this.manualRectangleTool) {
      try {
        this.manualRectangleTool.stopDrawing();
      } catch { }

      try {
        this.manualRectangleTool.removeAllRectangles();
      } catch { }

      try {
        this.manualRectangleTool.destroy();
      } catch { }

      this.manualRectangleTool = null;
    }

    // clear saved manual zones only on full modal close
    this.manualRectangles = [];
  }

  private initOldZoneRectangleTool(chartId: any): void {
    const chartContainer = document.getElementById(chartId) as HTMLElement;

    if (!chartContainer || !this.chart || !this.candlestickSeries) {
      console.error('Old rectangleTool not ready', {
        chartContainer,
        chart: this.chart,
        candlestickSeries: this.candlestickSeries,
      });
      return;
    }

    const hiddenToolbar = document.createElement('div');
    hiddenToolbar.style.display = 'none';

    this.rectangleTool = new RectangleDrawingTool(
      this.chart,
      this.candlestickSeries,
      hiddenToolbar,
      {
        showLabels: false,
        fillColor: 'rgba(112, 145, 195, 0.2)',
        previewFillColor: 'rgba(200, 50, 100, 0.25)',
        labelColor: 'rgba(200, 50, 100, 1)',
        labelTextColor: 'white',
        extendRight: false,
        continuousDrawing: false,

        priceLabelFormatter: (price: number) => price.toFixed(2),

        timeLabelFormatter: (time: any) => {
          if (typeof time === 'string') return time;

          if (typeof time === 'number') {
            return new Date(time * 1000).toLocaleDateString();
          }

          if (time?.year && time?.month && time?.day) {
            return `${time.day}-${time.month}-${time.year}`;
          }

          return '';
        },
      },
      chartContainer
    );

    console.log('Old rectangleTool initialized:', this.rectangleTool);
  }

  private forceChartRedraw(): void {
    if (!this.chart) return;

    try {
      const logicalRange = this.chart.timeScale().getVisibleLogicalRange();

      if (logicalRange) {
        this.chart.timeScale().setVisibleLogicalRange({
          from: logicalRange.from,
          to: logicalRange.to,
        });
      }
    } catch { }
  }

  // MANULA TOOL BOX CODE

  toggleChartDrawingToolMenu(event?: MouseEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const button = event?.currentTarget as HTMLElement;

    if (!button) {
      this.showChartDrawingToolMenu = !this.showChartDrawingToolMenu;
      return;
    }

    const rect = button.getBoundingClientRect();

    const popupWidth = 190;
    const gap = 6;

    let left = rect.left;

    // prevent popup going outside right side
    if (left + popupWidth > window.innerWidth - 8) {
      left = rect.right - popupWidth;
    }

    // prevent popup going outside left side
    if (left < 8) {
      left = 8;
    }

    this.chartDrawingToolPopupStyle = {
      position: 'fixed',
      top: `${rect.bottom + gap}px`,
      left: `${left}px`,
      width: `${popupWidth}px`,
      zIndex: '2147483647',
    };

    this.showChartDrawingToolMenu = !this.showChartDrawingToolMenu;
  }

  selectChartDrawingTool(tool: any): void {
    this.showChartDrawingToolMenu = false;

    if (!this.chartDrawingTool) {
      this.toastr.error('Chart drawing tool is not ready yet.');
      return;
    }

    // Stop manual Buy/Sell drawing mode when user selects Trade Tiger tool
    try {
      this.manualRectangleTool?.stopDrawing();
    } catch { }

    this.activeManualZoneType = null;
    this.activeChartDrawingTool = tool;

    // SELECT MODE:
    // Both tools should be enabled.
    // chartDrawingTool will ignore manual zones using shouldIgnoreMouseEvent.
    if (tool === 'select') {
      try {
        this.manualRectangleTool?.setSelectionEnabled(true);
      } catch { }

      try {
        this.chartDrawingTool.setSelectionEnabled(true);
        this.chartDrawingTool.setActiveTool('select');
      } catch { }

      return;
    }

    // TRADE TIGER DRAWING MODE:
    // Disable manual zone selection only while drawing Trade Tiger tools.
    try {
      this.manualRectangleTool?.setSelectionEnabled(false);
    } catch { }

    try {
      this.chartDrawingTool.setSelectionEnabled(true);
      this.chartDrawingTool.setActiveTool(tool);
    } catch { }
  }

  private destroyChartDrawingTool(): void {
    if (this.chartDrawingTool) {
      try {
        this.chartDrawingTool.destroy();
      } catch { }

      this.chartDrawingTool = null;
    }
  }

  private initChartDrawingTool(type: string, data: any[]): void {
    const chartContainer = this.elementRef.nativeElement.querySelector(
      '#chart-container_new'
    ) as HTMLElement;

    if (!chartContainer || !this.chart || !this.candlestickSeries) {
      console.error('Chart drawing tool not ready', {
        chartContainer,
        chart: this.chart,
        candlestickSeries: this.candlestickSeries,
      });
      return;
    }

    this.destroyChartDrawingTool();

    this.chartDrawingTool = new ChartDrawingTool(
      this.chart,
      this.candlestickSeries,
      chartContainer,
      {
        color: '#2563eb',
        selectedColor: '#111827',
        lineWidth: 1,

        // ✅ IMPORTANT:
        // This gives priority to manual Buy/Sell zones.
        // When mouse is over manual zone, chartDrawingTool will not select/move
        // TradingView rectangle/line/text/long-short.
        shouldIgnoreMouseEvent: (event: MouseEvent) => {
          try {
            return !!this.manualRectangleTool?.isMouseEventOverRectangle(event);
          } catch (error) {
            console.warn('Manual rectangle hit-test failed:', error);
            return false;
          }
        },

        onCreated: (item: ChartDrawingRecord) => {
          if (
            item?.type === 'entryPrice' ||
            item?.type === 'targetPrice' ||
            item?.type === 'stoplossPrice'
          ) {
            this.syncCreateOrderPanelFromEditableLines();
          }
          const exists = this.chartDrawingItems.some(x => x.id === item.id);

          if (!exists) {
            this.chartDrawingItems.push({
              ...item,
            });
          }
        },

        onUpdated: (item: ChartDrawingRecord) => {
          if (
            item?.type === 'entryPrice' ||
            item?.type === 'targetPrice' ||
            item?.type === 'stoplossPrice'
          ) {
            this.syncCreateOrderPanelFromEditableLines();
          }
          this.chartDrawingItems = this.chartDrawingItems.map(x =>
            x.id === item.id ? { ...item } : x
          );

          this.selectedChartDrawing = item ? { ...item } : null;
        },

        onDeleted: (item: ChartDrawingRecord) => {
          this.chartDrawingItems = this.chartDrawingItems.filter(
            x => x.id !== item.id
          );

          this.selectedChartDrawing = null;
        },

        onToolChanged: (tool: ChartDrawingToolType) => {
          this.activeChartDrawingTool = tool;

          // VERY IMPORTANT:
          // ChartDrawingTool automatically changes to "select"
          // after drawing rectangle / long / short / line / text.
          // When that happens, manual zone selection must be re-enabled.
          if (tool === 'select') {
            try {
              this.manualRectangleTool?.setSelectionEnabled(true);
            } catch { }

            return;
          }

          // If any Trade Tiger drawing tool is active,
          // manual zones should not capture mouse events while drawing.
          try {
            this.manualRectangleTool?.setSelectionEnabled(false);
          } catch { }
        },

        onSelected: (item: ChartDrawingRecord | null) => {
          this.selectedChartDrawing = item ? { ...item } : null;
        },
      }
    );

    // Default should be select mode, otherwise user cannot select drawings easily.
    this.chartDrawingTool.setActiveTool(
      this.activeChartDrawingTool || 'select'
    );

    this.restoreChartDrawingItems(data);
  }

  private restoreChartDrawingItems(data: any[]): void {
    if (!this.chartDrawingTool || !data || data.length === 0) {
      return;
    }

    this.chartDrawingItems.forEach(item => {
      const restoredItem: ChartDrawingRecord = {
        ...item,
        selected: false,
        p1: this.mapChartDrawingPointToCurrentFrame(item.p1, data),
        p2: item.p2
          ? this.mapChartDrawingPointToCurrentFrame(item.p2, data)
          : undefined,
      };

      this.chartDrawingTool?.addDrawing(restoredItem);
    });
  }

  private mapChartDrawingPointToCurrentFrame(
    point: ChartDrawingPoint,
    data: any[]
  ): ChartDrawingPoint {
    return {
      time: this.mapTimeToCurrentFrame(point.time, data),
      price: point.price,
    };
  }

  private clearChartDrawingItems(): void {
    if (this.chartDrawingTool) {
      try {
        this.chartDrawingTool.removeAll();
      } catch { }
    }

    this.chartDrawingItems = [];
    this.activeChartDrawingTool = 'none';
    this.showChartDrawingToolMenu = false;
  }

  // EDIT TOOL CODE

  updateSelectedDrawingStyle(style: ChartDrawingStylePatch): void {
    if (!this.chartDrawingTool) {
      return;
    }

    const updated = this.chartDrawingTool.updateSelectedStyle(style);

    if (updated) {
      this.selectedChartDrawing = { ...updated };
    }
  }

  onSelectedDrawingColorChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.updateSelectedDrawingStyle({
      color: value,
    });
  }

  onSelectedDrawingLineWidthChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);

    this.updateSelectedDrawingStyle({
      lineWidth: value,
    });
  }

  onSelectedDrawingLineStyleChange(event: Event): void {
    const value = (event.target as HTMLSelectElement)
      .value as ChartDrawingLineStyle;

    this.updateSelectedDrawingStyle({
      lineStyle: value,
    });
  }

  onSelectedTextChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.updateSelectedDrawingStyle({
      text: value,
    });
  }

  onSelectedTextFontSizeChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);

    this.updateSelectedDrawingStyle({
      fontSize: value,
    });
  }

  toggleSelectedTextBold(): void {
    if (!this.selectedChartDrawing) return;

    this.updateSelectedDrawingStyle({
      fontWeight:
        this.selectedChartDrawing.fontWeight === 'bold' ? 'normal' : 'bold',
    });
  }

  onSelectedTextBackgroundChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.updateSelectedDrawingStyle({
      backgroundColor: value,
    });
  }

  clearSelectedTextBackground(): void {
    this.updateSelectedDrawingStyle({
      backgroundColor: undefined,
    });
  }

  toggleSelectedDrawingLock(): void {
    if (!this.selectedChartDrawing) return;

    this.updateSelectedDrawingStyle({
      locked: !this.selectedChartDrawing.locked,
    });
  }

  onPositionTargetColorChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.updateSelectedDrawingStyle({
      targetColor: value,
    });
  }

  onPositionStopColorChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.updateSelectedDrawingStyle({
      stopColor: value,
    });
  }

  onPositionEntryColorChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.updateSelectedDrawingStyle({
      entryColor: value,
    });
  }

  onPositionOpacityChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);

    this.updateSelectedDrawingStyle({
      fillOpacity: value,
    });
  }

  togglePositionLabels(): void {
    if (!this.selectedChartDrawing) return;

    this.updateSelectedDrawingStyle({
      showLabels: this.selectedChartDrawing.showLabels === false ? true : false,
    });
  }

  duplicateSelectedChartDrawing(): void {
    if (!this.chartDrawingTool) return;

    const duplicated = this.chartDrawingTool.duplicateSelected();

    if (duplicated) {
      this.toastr?.success?.('Drawing duplicated');
    }
  }

  deleteSelectedChartDrawingFromPanel(): void {
    if (!this.chartDrawingTool) return;

    const deleted = this.chartDrawingTool.deleteSelected();

    if (deleted) {
      this.selectedChartDrawing = null;
      this.toastr?.success?.('Drawing deleted');
    } else {
      this.toastr?.warning?.('Drawing is locked or not selected');
    }
  }

  isSelectedPositionDrawing(): boolean {
    return (
      this.selectedChartDrawing?.type === 'longPosition' ||
      this.selectedChartDrawing?.type === 'shortPosition'
    );
  }

  isSelectedTextDrawing(): boolean {
    return this.selectedChartDrawing?.type === 'text';
  }

  isSelectedLineDrawing(): boolean {
    return (
      this.selectedChartDrawing?.type === 'vertical' ||
      this.selectedChartDrawing?.type === 'horizontal' ||
      this.selectedChartDrawing?.type === 'trendline'
    );
  }

  isSelectedRectangleDrawing(): boolean {
    return this.selectedChartDrawing?.type === 'rectangle';
  }

  deleteActiveDrawingFromLeftToolbar(): void {
    let deleted = false;

    if (this.chartDrawingTool) {
      try {
        deleted = this.chartDrawingTool.deleteSelected();
      } catch {
        deleted = false;
      }
    }

    if (!deleted && this.manualRectangleTool) {
      try {
        deleted = this.manualRectangleTool.deleteSelectedRectangle();
      } catch {
        deleted = false;
      }
    }

    if (deleted) {
      this.selectedChartDrawing = null;
      this.toastr?.success?.('Drawing deleted');
    } else {
      this.toastr?.warning?.('Please select a drawing first');
    }
  }

  // CMP HOVER CODE START

  onSymbolHover(event: MouseEvent, item: any, tradeType?: string): void {
    this.moveCmpPopup(event);

    if (this.cmpHoverTimer) {
      clearTimeout(this.cmpHoverTimer);
    }

    this.cmpHoverTimer = setTimeout(() => {
      this.loadCmpOnHover(item, tradeType);
    }, 250);
  }

  moveCmpPopup(event: MouseEvent): void {
    this.cmpHover.x = event.clientX + 14;
    this.cmpHover.y = event.clientY + 14;
  }

  onSymbolLeave(): void {
    if (this.cmpHoverTimer) {
      clearTimeout(this.cmpHoverTimer);
      this.cmpHoverTimer = null;
    }

    this.closeCmpSocket();

    this.cmpHover = {
      visible: false,
      loading: false,
      symbol: '',
      exchangeName: '',
      expiryDate: null,
      price: null,
      error: '',
      x: this.cmpHover.x,
      y: this.cmpHover.y,
      rowKey: ''
    };
  }

  private getCmpRequestSymbol(exchangeName: string, item: any): string {
    if (exchangeName === 'NSE') {
      return String(item?.STOCK_NAME || '').trim();
    }

    return String(item?.STOCK_SYMBOL || '').trim().toUpperCase();
  }

  private loadCmpOnHover(item: any, tradeType?: string): void {
    const exchangeName = this.getActiveExchangeName();

    const displaySymbol = String(item?.STOCK_SYMBOL || '').trim().toUpperCase();
    const requestSymbol = this.getCmpRequestSymbol(exchangeName, item);

    const expiryDate = this.getExpiryDateForWs(
      item?.EXP_NUM || item?.EXPIRY || item?.expiry_date
    );

    const rowKey = this.getCmpRowKey(item, tradeType);

    this.cmpHover = {
      ...this.cmpHover,
      visible: true,
      loading: true,

      // keep both, so old HTML and new HTML both work
      symbol: displaySymbol,
      displaySymbol: displaySymbol,

      exchangeName,
      expiryDate,
      price: null,
      error: '',
      rowKey
    };

    if (!requestSymbol) {
      this.cmpHover.loading = false;
      this.cmpHover.error =
        exchangeName === 'NSE' ? 'Stock name not found' : 'Symbol not found';
      return;
    }

    // NSE, NSEFO, MCX are now supported
    if (exchangeName !== 'NSE' && exchangeName !== 'NSEFO' && exchangeName !== 'MCX') {
      this.cmpHover.loading = false;
      this.cmpHover.error = `CMP websocket not configured for ${exchangeName || 'selected exchange'}`;
      return;
    }

    // Expiry is required only for NSEFO and MCX
    if ((exchangeName === 'NSEFO' || exchangeName === 'MCX') && !expiryDate) {
      this.cmpHover.loading = false;
      this.cmpHover.error = `Expiry date missing for ${exchangeName} symbol`;
      return;
    }

    const cacheKey = `${exchangeName}|${requestSymbol}|${expiryDate || 'SPOT'}`;
    const cached = this.cmpCache.get(cacheKey);

    if (cached && Date.now() - cached.at <= this.cmpCacheMs) {
      this.cmpHover.loading = false;
      this.cmpHover.price = cached.price;
      return;
    }

    this.closeCmpSocket();

    const wsUrl = this.getCmpWebSocketUrl(exchangeName, requestSymbol, expiryDate);

    if (!wsUrl) {
      this.cmpHover.loading = false;
      this.cmpHover.error = `CMP websocket not configured for ${exchangeName}`;
      return;
    }

    console.log('CMP WS URL:', wsUrl);

    const socket = new WebSocket(wsUrl);
    this.cmpSocket = socket;

    const timeout = setTimeout(() => {
      if (
        this.cmpSocket === socket &&
        this.cmpHover.rowKey === rowKey &&
        this.cmpHover.loading
      ) {
        this.cmpHover.loading = false;
        this.cmpHover.error = 'CMP timeout';
        this.closeCmpSocket();
      }
    }, 7000);

    socket.onmessage = (event: MessageEvent) => {
      if (this.cmpHover.rowKey !== rowKey) return;

      console.log('CMP response:', event.data);

      const cmp = this.extractCmpPrice(event.data);

      this.cmpHover.loading = false;

      if (cmp === null) {
        this.cmpHover.error = 'CMP not found in websocket response';
        return;
      }

      this.cmpHover.price = cmp;
      this.cmpHover.error = '';

      this.cmpCache.set(cacheKey, {
        price: cmp,
        at: Date.now()
      });
    };

    socket.onerror = () => {
      if (this.cmpHover.rowKey !== rowKey) return;

      clearTimeout(timeout);
      this.cmpHover.loading = false;
      this.cmpHover.error = 'CMP websocket connection failed';
    };

    socket.onclose = () => {
      clearTimeout(timeout);
    };
  }

  private closeCmpSocket(): void {
    if (this.cmpSocket) {
      try {
        this.cmpSocket.close();
      } catch { }
    }

    this.cmpSocket = null;
  }

  private getActiveExchangeName(): string {
    const self: any = this;

    return String(
      self.selectedExchange?.exchange_name ||
      self.SelectedExchange_Name ||
      ''
    )
      .trim()
      .toUpperCase();
  }

  private getCmpRowKey(item: any, tradeType?: string): string {
    return `${item?.TRADE_ID || ''}_${item?.STOCK_SYMBOL || ''}_${item?.EXP_NUM || ''}_${tradeType || ''}`;
  }

  private getExpiryDateForWs(value: any): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (value instanceof Date && !isNaN(value.getTime())) {
      return this.toYyyyMmDd(value);
    }

    const raw = String(value).trim();

    // Already correct: 2026-05-26
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    // Format: 26-05-2026 or 26/05/2026
    const ddmmyyyyWithDash = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (ddmmyyyyWithDash) {
      return `${ddmmyyyyWithDash[3]}-${ddmmyyyyWithDash[2]}-${ddmmyyyyWithDash[1]}`;
    }

    // Format: 20260526 = YYYYMMDD
    if (/^\d{8}$/.test(raw) && raw.startsWith('20')) {
      return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
    }

    // Format: 30062026 = DDMMYYYY
    if (/^\d{8}$/.test(raw) && raw.substring(4, 8).startsWith('20')) {
      const day = raw.substring(0, 2);
      const month = raw.substring(2, 4);
      const year = raw.substring(4, 8);

      return `${year}-${month}-${day}`;
    }

    const parsedDate = new Date(raw);
    if (!isNaN(parsedDate.getTime())) {
      return this.toYyyyMmDd(parsedDate);
    }

    return null;
  }

  private toYyyyMmDd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private extractCmpPrice(data: any): number | null {
    let parsed: any = data;

    if (typeof data === 'string') {
      let cleanData = data.trim();

      // Handles response like: CMP {"data":[...]}
      const jsonStartIndex = cleanData.indexOf('{');
      if (jsonStartIndex > 0) {
        cleanData = cleanData.substring(jsonStartIndex);
      }

      try {
        parsed = JSON.parse(cleanData);
      } catch {
        const directNumber = Number(cleanData);
        return Number.isFinite(directNumber) ? directNumber : null;
      }
    }

    // NSEFO / MCX response:
    // { data: [ { price: 159.65 } ] }
    if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
      const price = Number(parsed.data[0]?.price);

      if (Number.isFinite(price)) {
        return price;
      }
    }

    // NSE response:
    // { stocks: [ { price: 1146.6 } ] }
    if (Array.isArray(parsed?.stocks) && parsed.stocks.length > 0) {
      const price = Number(parsed.stocks[0]?.price);

      if (Number.isFinite(price)) {
        return price;
      }
    }

    const possibleValues = [
      parsed?.price,
      parsed?.cmp,
      parsed?.CMP,
      parsed?.ltp,
      parsed?.LTP,
      parsed?.last_price,
      parsed?.lastPrice,

      parsed?.data?.price,
      parsed?.data?.cmp,
      parsed?.data?.CMP,
      parsed?.data?.ltp,
      parsed?.data?.LTP,

      parsed?.stocks?.price,
      parsed?.stocks?.cmp,
      parsed?.stocks?.ltp,

      parsed?.response?.price,
      parsed?.response?.cmp,
      parsed?.response?.ltp
    ];

    for (const value of possibleValues) {
      const numberValue = Number(value);

      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }

    return null;
  }

  private getCmpWebSocketUrl(exchangeName: string, requestSymbol: string, expiryDate: string | null): string | null {
    if (exchangeName === 'NSE') {
      return `${this.nseCmpWsBaseUrl}?symbol=${encodeURIComponent(requestSymbol)}`;
    }

    if (exchangeName === 'NSEFO') {
      if (!expiryDate) return null;

      return `${this.nsefoCmpWsBaseUrl}?symbol=${encodeURIComponent(requestSymbol)}&expiry_date=${encodeURIComponent(expiryDate)}`;
    }

    if (exchangeName === 'MCX') {
      if (!expiryDate) return null;

      return `${this.mcxCmpWsBaseUrl}?symbol=${encodeURIComponent(requestSymbol)}&expiry_date=${encodeURIComponent(expiryDate)}`;
    }

    return null;
  }

  // CMP HOVER CODE END


  // EXCEL DOWNLOAD CODE
// =========================
// EXCEL DOWNLOAD CODE
// =========================

async downloadActiveTabExcel(): Promise<void> {
  if (this.isDownloadingTrades) {
    return;
  }

  this.isDownloadingTrades = true;

  try {
    const activeMenu = this.activeMenu;
    const exportPageSize = 100; // Downloads 100 records per API request
    const searchKey = this.getActiveTabSearchKey();

    const allTrades: any[] = [];
    let pageNo = 1;
    let totalCount = 0;

    while (true) {
      const response: any = await firstValueFrom(
  this.getTradeRequestByActiveMenu(
    activeMenu,
    pageNo,
    searchKey,
    exportPageSize
  )
);

      if (response?.msg !== 'success') {
        throw new Error(
          response?.response ||
          response?.msg ||
          'Unable to retrieve trade data.'
        );
      }

      const pageTrades = Array.isArray(response?.response?.trades)
        ? response.response.trades
        : [];

      totalCount = Number(response?.response?.total_count || 0);

      if (pageTrades.length === 0) {
        break;
      }

      allTrades.push(...pageTrades);

      // Stops after all backend records are received.
      if (totalCount > 0 && allTrades.length >= totalCount) {
        break;
      }

      // Stops when final API page contains fewer than requested records.
      if (pageTrades.length < exportPageSize) {
        break;
      }

      pageNo++;

      // Extra safety against infinite API pagination.
      if (pageNo > 10000) {
        throw new Error('Too many pages returned while preparing Excel.');
      }
    }

    if (allTrades.length === 0) {
      this.toastr.warning('No trades available for download.');
      return;
    }

    /*
      Your UI sorts visible records using applySorting().
      Apply the same UI sort on all downloaded records.
    */
    const finalTrades = this.sortColumn
      ? this.applySorting([...allTrades])
      : allTrades;

    /*
      One API trade can contain BUY, SELL, or both.
      The HTML also loops through BUY/SELL, so Excel is flattened
      in exactly the same format as the table.
    */
    const excelRows = this.prepareExcelRows(finalTrades);

    if (excelRows.length === 0) {
      this.toastr.warning('No valid BUY or SELL trades found for export.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    const totalColumns = Object.keys(excelRows[0]).length;
    const lastColumn = XLSX.utils.encode_col(totalColumns - 1);

    worksheet['!autofilter'] = {
      ref: `A1:${lastColumn}${excelRows.length + 1}`
    };

    worksheet['!cols'] = this.getExcelColumnWidths();

    const workbook = XLSX.utils.book_new();

    const sheetName = this.getActiveTabLabel();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sheetName.substring(0, 31)
    );

    const exchangeName =
      this.SelectedExchange_Name ||
      this.selectedExchange?.exchange_name ||
      'Exchange';

    const fileName =
      `Trades_${exchangeName}_${sheetName.replace(/\s+/g, '_')}_` +
      `${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`;

    XLSX.writeFile(workbook, fileName);

    this.toastr.success(
      `${excelRows.length} ${sheetName} trade rows downloaded successfully.`
    );
  } catch (error: any) {
    console.error('Excel download failed:', error);

    this.toastr.error(
      error?.message || 'Unable to prepare Excel file.'
    );
  } finally {
    this.isDownloadingTrades = false;
  }
}


/*
  Calls only the existing API for the currently selected tab.
  No new backend API is required.
*/
private getTradeRequestByActiveMenu(
  menu: string,
  pageNo: number,
  searchKey: string,
  pageSize: number
): any {
  const exchangeId = Number(this.SelectedExchange_Id);

  switch (menu) {
    case 'daily':
      return this.apiService.getDailyTrades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    case 'sixty':
      return this.apiService.getSixtyTrades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    case 'fifteen':
      return this.apiService.getFifteenTrades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    case 'seventy_five':
      return this.apiService.get75Trades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    case 'one_twenty_five':
      return this.apiService.get125Trades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    case 'twenty_five':
      return this.apiService.get25Trades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    case 'two_forty':
      return this.apiService.get240Trades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    case 'one_twenty':
      return this.apiService.get120Trades(
        pageNo,
        searchKey,
        pageSize,
        this.StartDate,
        this.EndDate,
        exchangeId,
        this.isChecked,
        this.isCheckedForCMP,
        this.selectTradeType
      );

    default:
      throw new Error(`Excel download is not configured for tab: ${menu}`);
  }
}


/*
  Gets the currently applied search text for the active tab.
*/
private getActiveTabSearchKey(): string {
  let tabSearchKey = '';

  switch (this.activeMenu) {
    case 'daily':
      tabSearchKey = this.dailyState?.searchKey || '';
      break;

    case 'sixty':
      tabSearchKey = this.sixtyState?.searchKey || '';
      break;

    case 'fifteen':
      tabSearchKey = this.fifteenState?.searchKey || '';
      break;

    case 'seventy_five':
      tabSearchKey = this.seventyfiveState?.searchKey || '';
      break;

    case 'one_twenty_five':
      tabSearchKey = this.onetwentyfiveState?.searchKey || '';
      break;

    case 'twenty_five':
      tabSearchKey = this.twentyfiveState?.searchKey || '';
      break;

    case 'two_forty':
      tabSearchKey = this.twofortyState?.searchKey || '';
      break;

    case 'one_twenty':
      tabSearchKey = this.onetwentyState?.searchKey || '';
      break;
  }

  return String(tabSearchKey || this.searchText || '').trim();
}


/*
  Converts your backend object into Excel rows.
  BUY and SELL are converted into separate rows, same as your HTML table.
*/
private prepareExcelRows(trades: any[]): any[] {
  const rows: any[] = [];

  const currency = this.SelectedCountryName === 'US' ? 'USD' : 'INR';

  const showExpiry =
    this.SelectedExchange_Name === 'MCX' ||
    this.SelectedExchange_Name === 'NSEFO';

  for (const item of trades) {
    const tradeTypes = this.getKeys(item);

    for (const tradeType of tradeTypes) {
      const tradeData = item?.[tradeType] || {};

      const probabilityValue = Number(item?.PROBABILITY);

      const probabilityText =
        item?.PROBABILITY !== null &&
        item?.PROBABILITY !== undefined &&
        Number.isFinite(probabilityValue)
          ? `${(probabilityValue * 100).toFixed(2)}%`
          : 'NA';

      const predictionText = item?.PREDICTION
        ? String(item.PREDICTION).toUpperCase()
        : '';

      const row: any = {
        'Trade Id': item?.TRADE_ID || '',
        'Stock Symbol': item?.STOCK_SYMBOL || '',
        'Trade Type': tradeType
      };

      if (showExpiry) {
        row['Expiry'] = this.formatExpiry(item?.EXP_NUM || '');
      }

      row[`Entry Price (${currency})`] = this.getExcelNumber(
        tradeData?.entry_price
      );

      row[`Target Price (${currency})`] = this.getExcelNumber(
        tradeData?.target_price
      );

      row[`StopLoss (${currency})`] = this.getExcelNumber(
        tradeData?.stop_loss
      );

      row['RR'] = this.getExcelNumber(
        tradeType === 'BUY'
          ? item?.BUY_RRR
          : item?.SELL_RRR
      );

      row['Date'] = this.getExcelDate(item?.TIMESTAMP);

      row['Prediction'] =
        `${probabilityText}${predictionText ? ' ' + predictionText : ''}`;

      rows.push(row);
    }
  }

  return rows;
}


private getExcelNumber(value: any): number | string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numberValue = Number(String(value).replace(/,/g, ''));

  return Number.isFinite(numberValue) ? numberValue : '';
}


private getExcelDate(value: any): string {
  if (!value) {
    return '';
  }

  const date = moment(value);

  return date.isValid()
    ? date.format('DD-MMM-YYYY hh:mm A')
    : String(value);
}


private getActiveTabLabel(): string {
  const tabNames: Record<string, string> = {
    daily: 'Daily',
    fifteen: '15 Min',
    twenty_five: '25 Min',
    sixty: '60 Min',
    seventy_five: '75 Min',
    one_twenty_five: '125 Min',
    one_twenty: '120 Min',
    two_forty: '240 Min'
  };

  return tabNames[this.activeMenu] || 'Trades';
}


private getExcelColumnWidths(): any[] {
  const isExpiryVisible =
    this.SelectedExchange_Name === 'MCX' ||
    this.SelectedExchange_Name === 'NSEFO';

  const widths = [
    { wch: 14 }, // Trade Id
    { wch: 20 }, // Stock Symbol
    { wch: 14 }  // Trade Type
  ];

  if (isExpiryVisible) {
    widths.push({ wch: 16 }); // Expiry
  }

  widths.push(
    { wch: 18 }, // Entry
    { wch: 18 }, // Target
    { wch: 18 }, // StopLoss
    { wch: 10 }, // RR
    { wch: 24 }, // Date
    { wch: 20 }  // Prediction
  );

  return widths;
}
  

}


