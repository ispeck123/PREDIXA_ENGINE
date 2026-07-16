import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  QueryList,
  Renderer2,
  TemplateRef,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgxSpinnerService } from 'ngx-spinner';
import { ApiService } from 'src/app/services/api.service';
import {
  ISeriesApi,
  createChart,
  LineStyle,
  CrosshairMode,
  BarData,
  PriceLineOptions,
  IPriceLine,
  Time,
} from 'lightweight-charts';
import { ActivatedRoute, Router, TitleStrategy } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { WebSocketService } from 'src/app/services/web-socket.service';
import moment from 'moment';
import { FloatingModalComponent } from '../floating-modal/floating-modal.component';
import { ChartDrawingLineStyle, ChartDrawingPoint, ChartDrawingRecord, ChartDrawingStylePatch, ChartDrawingTool, ChartDrawingToolType } from '../homecandles/chart-drawing-tool';
import { ManualRectangleRecord, Point, RectangleDrawingTool, RectangleStyleOptions } from '../homecandles/rectangle-drawing-tool';

interface Patch {
  qualified_zones?: boolean;
  optimized_buy_sell_zone?: boolean;
}

interface MenuRule {
  base: string;
  htf_zone?: Record<string, Patch>;
}

const STANDARD_HTF_ZONE_RULES: Record<string, MenuRule> = {
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
      monthly: { optimized_buy_sell_zone: true },
      weekly: { optimized_buy_sell_zone: true },
    }
  },

  twenty_five: {
    base: "twenty_five",
    htf_zone: {
      daily: { optimized_buy_sell_zone: true },
      one_twenty_five: { optimized_buy_sell_zone: true },
    }
  },

  seventy_five: {
    base: "seventy_five",
    htf_zone: {
      weekly: { optimized_buy_sell_zone: true },
      daily: { optimized_buy_sell_zone: true },
    }
  }
};

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartPoint {
  time: number;
  price: number;
}

interface ChartPath {
  points: ChartPoint[];
}

interface ChartText {
  time: number;
  price: number;
  text: string;
}

interface ZoneItem {
  time: number; // or 'string' if you're using businessDay
  price: number;
  // ... any other properties your rectangles use
}

@Component({
  selector: 'app-chart-analytics',
  templateUrl: './chart-analytics.component.html',
  styleUrls: ['./chart-analytics.component.css'],
})
export class ChartAnalyticsComponent implements OnInit {
  viewGraphOverlapMemory: Record<string, { htf: boolean; qualified: boolean; }> = {};
  placementMode: 'none' | 'entry' | 'target' | 'stoploss' = 'none';
  previewLine: any = null;
  horizontalLines: any[] = [];
  boundShowPreviewLine: ((param: any) => void) | null = null;
  boundFixLineAtPrice: ((param: any) => void) | null = null;
  selectedLine: any = null;
  RiskToReward: any;
  fincreateformForMannualSetup: FormGroup;
  submittedForMannual: boolean = false;
  showCreateOrderModalForMAnnual = false;
  createBtnFlgForMannualSetup: boolean = false;
  @ViewChild('modalA') modalA!: FloatingModalComponent;
  // keep one-time listener flag
  lastBar: any;
  private _dragListenersAttached = false;

  // your desired default margins – set this to whatever you configure at chart init
  private readonly DEFAULT_SCALE_MARGINS = { top: 0.0, bottom: 0.0 };

  // “infinite” right extension (~100 years)
  private readonly FUTURE_SECONDS = 60 * 60 * 24 * 365 * 1;

  // clamp to avoid negative prices while placing/dragging
  private readonly MIN_PRICE = 0; // adjust if your instrument can go below 0
  private _previewInvalid = false;
  private _previewMsg = '';

  trackByTick = (_: number, item: any) => item?.stock_tick;
  @ViewChild('closeButton') closeButton: ElementRef;
  @ViewChild('closeButtonHide') closeButtonHide: ElementRef;
  @ViewChild('closemodal') closemodal!: ElementRef;
  @ViewChild('AddStockcloseButton') AddStockcloseButton!: ElementRef;
  @ViewChild('drawingCanvas') drawingCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('modalalert') modalalert!: FloatingModalComponent;
  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  BuyZoneDataItem: any;
  finform: FormGroup;
  AddStockForm: FormGroup;
  selectedStockId: any;
  submitted: boolean = false;
  submittedforAddStock: boolean = false;
  stockData: any[] = [];
  filter: any;
  selectedDate: any;
  showmsg: any;
  ChartRESPONSE: any;
  BitmapPositionLength: any;
  Daily: any;
  Weekly: any;
  Monthly: any;
  layoutFlagfirst: boolean;
  OptimizedBuySellZoneData75: any;
  layoutFlagsecond: boolean;
  layoutFlagthird: boolean;
  finData: any;
  ModalHeader: any;
  MonthlyLabel: any;
  WeeklyLabel: any;
  DailyLabel: any;
  Seventy_FiveLabel: any;
  SixtyLabel: any;
  Fifteen_MinuteLabel: any;
  checkbox1: boolean = false;
  checkbox2: boolean = false;
  checkbox3: boolean = false;
  BaseCandleData: any;
  AllZonesData: any;
  FullScreenModeValue: any;
  selectedOption: any;
  BuyZoneData: any;
  SellZoneData: any;
  toolTipData: any;
  Open: any;
  High: any;
  Low: any;
  Close: any;
  CandleColor: any;
  suggestion: any;
  setupData: any;
  key: any;
  BuySetupData: any;
  SellSetupData: any;
  BuyTimestampData: any;
  SellTimestampData: any;
  GapData: any;
  BadZoneData: any;
  dropdownShow: any;
  SelectedStockName: any;
  token: any;
  state: any;
  fincreateform: FormGroup;
  SellMessage: any;
  BuyMessage: any;
  createorderResp: any;
  timer: any;
  TimeFrame: any;
  setupdataStatus: any;
  ModelPrediction: any;
  OverLayCandleData: any;
  BuyOverlayData: any;
  SellOverlayData: any;
  QualifiedData: any;
  selectedOptions: any = {
    base_candle: false,
    buy_sell_zone: false,
    bad_zone: false,
    setup: false,
    overlap_evaluate: false,
    overlap_analyze: false,
  };
  isPanelOpen = false;
  draggedStock: any;
  Isdragged = false;
  isNotificationVisible = false;
  PreviousHighData: any;
  filteredCompanies: any = [];
  highlightedIndex: number = -1;
  setupDataonseventyfive: any;
  QualifiedDataonSeventyfive: any;
  OverLayCandleDataonSevetyFive: any;
  BuyOverlayDataonSeventyFive: any;
  SellOverlayDataonSeventyFive: any;
  lastTouchEnd = 0;
  candles: { color: string; height: number; wickHeight: number }[] = [];
  colorInterval: any;
  realTimePrice: any;
  cmpLine: any;
  lastCMPLine: any = null;
  selectedType: any;
  FULLSCREENCHARTDATA: any;
  LINEDATA: any;
  EntryPrice: any;
  TargetPrice: any;
  StoplossPrice: any;
  EntryTime: any;
  SETUPTYPE: any;
  searchSubject: Subject<string> = new Subject<string>();
  @ViewChild('chart_container_new') chartContainer!: ElementRef;
  isDragging = false;
  TrackFullScreenMode: boolean = false;
  updateModelPredictionFlag = false;
  Counter: any = 0;
  MasterTimeFrameToHideSpinner: any = 0;
  OptimizedBuySellZoneData: any;
  TrendAnalyzer: any;
  GapUpDownData: any;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  OriginalFinData: any;
  lastReplayTime: any;
  showOrderPanel = false;
  SelectedPrediction: any;
  SelectedProbability: any;
  currentCandle: any = null;
  layoutFlagfourth: boolean;
  layoutFlagfifth: boolean;
  layoutFlagsixth: boolean;
  layoutFlagseventh: boolean;
  One_Twenty_FiveLabel: any;
  Twenty_FiveLabel: any;
  // CHART ELEMENT
  private chart: any;
  private areaSeries: any;
  private candlestickSeries: any;
  private buylineSeries: any;
  private targetlineSeries: any;
  private stoplosslineSeries: any;
  candleData: any;
  p1: any;
  p2: any;
  x1: any;
  x2: any;
  rectangleTool: any;
  dataPoints: any;
  xspan: any;
  lineSeries: any;
  buyZoneMarkers: any;
  UpdateCnadleStockId: any;
  countries: any;
  selectedCountry: any;
  replayVisibleData: any[] = [];
  replayFutureData: any[] = [];
  replayInterval: any;
  allData: any[] = [];
  currentPostIndex = 0;
  isReplayMode: boolean = false;
  recalculateTimeFormat: any;
  isReplayPlaying: boolean = false;
  allSetAlerts: any = [];
  showCreateOrderModal = false;
  ViewSetUpAnywayFlag: boolean = false;
  PricePercentageData: any;
  PP_Analyze: any;
  PP_Evaluate: any;
  PP_Execute: any;
  PP_Reason: any;
  PP_FinalDecision: any;
  showPopup = false;
  timeFrameByParam: any;
  ScoreData: any;

  //#endregion VARIABLES

  private startPoint: { x: number; y: number } | null = null;
  @ViewChild('textLayer') textLayer!: ElementRef<HTMLDivElement>;
  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  selectedPathIndex: number = -1;
  activeTool: 'none' | 'pencil' | 'line' | 'text' = 'none';
  textBoxes: ChartText[] = [];
  paths: ChartPath[] = [];
  currentPath: ChartPath | null = null;
  selectedTextBoxIndex: number = -1;
  isChartInverted: boolean = false;
  replayMode = false;
  CancelReplayClicked: boolean = false;
  selectedstockintID: any;
  TradeSetupReason: any;
  alertForm: FormGroup;
  submitStock = false;
  countryId: any;
  userId: any;
  CreateButtonFlag = false;
  selectedTab: 'add' | 'list' = 'add'; // Default tab
  currentPage: any = 1;
  itemsPerPage: number = 10; // default
  totalCount: any;
  searchText: string = '';
  highlightedStockName: string = '';
  pageSize = 10;
  pageSizeOptions = [2, 10, 25, 50, 100];
  highlightedStockNames: string[] = [];
  TotalCount: any = 0;
  selectedDateRange: any;
  highlightedStockTick: string = '';
  MatchedCount: number = 0;
  StartDate: any;
  EndDate: any;
  activeTab: string = 'tab2';
  ListOfStockData: any;
  TotalStock: any;
  StockFullData: any;
  selectedFilterId: string = '1'; // default selected = D
  searchstockText: string = '';
  highlightedStockId: number | null = null;
  AnalyzeOverlayData: any;

  ranges: any = {
    All: [moment('2019-01-01'), moment()],
    Today: [moment(), moment()],
    'Last 7 Days': [moment().subtract(6, 'days'), moment()],
    'Last 15 Days': [moment().subtract(14, 'days'), moment()],
    'This Month': [moment().startOf('month'), moment().endOf('month')],
    'Last 3 Months': [
      moment().subtract(3, 'months').startOf('month'),
      moment().subtract(1, 'month').endOf('month'),
    ], // Last 3 months excluding current month
    'Last 6 Months': [
      moment().subtract(6, 'months').startOf('month'),
      moment().subtract(1, 'month').endOf('month'),
    ],
  };
  private ws!: WebSocket;
  invalidDates: moment.Moment[] = [
    moment().add(2, 'days'),
    moment().add(3, 'days'),
    moment().add(5, 'days'),
  ];
  isInvalidDate = (m: moment.Moment) => {
    return this.invalidDates.some((d) => d.isSame(m, 'day'));
  };

  SearchDebounceFlag: boolean = false;
  currentGroupId: any;
  entryEnabled = true;
  targetEnabled = true;
  stoplossEnabled = true;
  isDisabled = false;
  StockTickByParam: any;
  stock_id: any;
  isLeftBarOpen = false;
  showMobileTradeMenu = false;

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


  // SETUP PRICE LINE

  tradeLinePlaced = {
    entry: false,
    target: false,
    stoploss: false,
  };

  entryPrice: number | null = null;
  targetPrice: number | null = null;
  stoplossPrice: number | null = null;
  riskReward: number | null = null;
  tradeDirection: 'BUY' | 'SELL' | 'INVALID' | null = null;

  constructor(
    private webSocketService: WebSocketService,
    private route: ActivatedRoute,
    private cdRef: ChangeDetectorRef,
    private renderer: Renderer2,
    private router: Router,
    private toastr: ToastrService,
    private formBuilder: FormBuilder,
    private apiService: ApiService,
    private spinner: NgxSpinnerService,
    private elementRef: ElementRef
  ) {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((searchTerm) => {
        this.search(searchTerm);
      });
    this.xspan = 3600;
    this.selectedOption = '';
  }

  searchStocks = (term: string, item: any) => {
    if (!term) return true;
    term = term.toLowerCase().trim();
    const tick = (item?.stock_tick ?? '').toLowerCase();
    const name = (item?.name ?? '').toLowerCase();
    return tick.includes(term) || name.includes(term);
  };

  selectFilter(item: any): void {
    this.selectedFilterId = item.id;
    this.finform.patchValue({
      time_frame: item.id
    });
  }

  selectFilterFromChart(item: any) {
    this.selectedFilterId = item.id;
    this.finform.patchValue({
      time_frame: item.id
    });
    this.submit()
  }

  openDatePicker(input: HTMLInputElement): void {
    input.showPicker?.();
    input.click();
  }

  updateSelectedDate(event: any): void {
    const value = event.target.value;
    this.finform.patchValue({
      last_d_time: value
    });
    this.selectedDate = value;

    console.log('Selected datetime:', value);
  }

  updateSelectedDateOnChart(event: any): void {
    const value = event.target.value;
    this.finform.patchValue({
      last_d_time: value
    });
    this.selectedDate = value;

    this.submit()
  }

  selectStock(item: any): void {
    console.log("ite,m", item)
    this.finform.patchValue({
      tick: item.stock?.toLowerCase(),
      stock_id: item.stock_id
    });
    this.submit()
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

  toggleMobileTradeMenu(): void {
    this.showMobileTradeMenu = !this.showMobileTradeMenu;
  }

  closeMobileTradeMenu(): void {
    this.showMobileTradeMenu = false;
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

  handleSettingsLeave(): void {
    // keep empty or remove this if not needed
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


  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const target2 = event.target as HTMLElement;
    // ✅ Early return if user is typing in an input, textarea, or contentEditable element
    if (
      target2.tagName === 'INPUT' ||
      target2.tagName === 'TEXTAREA' ||
      target2.getAttribute('contenteditable') === 'true' ||
      (target2 as HTMLInputElement).isContentEditable
    ) {
      return; // Don't handle global keys when
    }

    if (event.key === 'Delete' && this.selectedLine) {
      if (this.selectedLine.type === 'entry') {
        for (let line of this.horizontalLines) {
          try {
            this.chart.removeSeries(line.series);
            if (line.type === 'entry') this.entryEnabled = true;
            if (line.type === 'target') this.targetEnabled = true;
            if (line.type === 'stoploss') this.stoplossEnabled = true;
          } catch { }
        }

        this.fincreateformForMannualSetup.patchValue({ entry: null });
        this.fincreateformForMannualSetup.patchValue({ stoploss: null });
        this.fincreateformForMannualSetup.patchValue({ target: null });
        this.horizontalLines = [];
        this.EntryPrice = null;
        this.TargetPrice = null;
        this.StoplossPrice = null;
      } else {
        // remove only the selected line
        try {
          this.chart.removeSeries(this.selectedLine.series);
        } catch { }
        this.horizontalLines = this.horizontalLines.filter(
          (l) => l !== this.selectedLine
        );

        // clear form value for this line
        if (this.selectedLine.type === 'stoploss') {
          this.StoplossPrice = null;
          this.fincreateformForMannualSetup.patchValue({ stoploss: null });
        }
        if (this.selectedLine.type === 'target') {
          this.TargetPrice = null;
          this.fincreateformForMannualSetup.patchValue({ target1: null });
        }
        if (this.selectedLine.type === 'entry') this.entryEnabled = true;
        if (this.selectedLine.type === 'target') this.targetEnabled = true;
        if (this.selectedLine.type === 'stoploss') this.stoplossEnabled = true;
      }

      this.selectedLine = null;
    }

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


    // Check if the target element is an input, textarea, or content-editable element
    const target = event.target as HTMLElement;
    const isInputField =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (isInputField) {
      // Allow default behavior for input fields
      return;
    }

    // if (event.ctrlKey && event.key === 'o') {
    //   if (this.TrackFullScreenMode) {
    //     event.preventDefault();
    //     this.togglePanel();
    //   }
    // }
    let dataPresent = false;
    switch (event.key) {
      case 'm':
      case 'M':
        dataPresent = !!this.ChartRESPONSE['monthly'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('monthly', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on Monthly !`);
        }
        break;
      case 'w':
      case 'W':
        dataPresent = !!this.ChartRESPONSE['weekly'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('weekly', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on Weekly !`);
        }
        break;
      case 'd':
      case 'D':
        dataPresent = !!this.ChartRESPONSE['daily'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('daily', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on Daily !`);
        }
        break;
      case '7':
        dataPresent = !!this.ChartRESPONSE['seventy_five'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('seventy_five', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on 75 Minutes !`);
        }
        break;
      case '6':
        dataPresent = !!this.ChartRESPONSE['sixty'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('sixty', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on 60 Minutes !`);
        }
        break;
      case '5':
        dataPresent = !!this.ChartRESPONSE['fifteen'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('fifteen', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on 15 Minutes !`);
        }
        break;
      case '2':
        dataPresent = !!this.ChartRESPONSE['twenty_five'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('twenty_five', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on 25 Minutes !`);
        }
        break;
      case '1':
        dataPresent = !!this.ChartRESPONSE['one_twenty_five'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('one_twenty_five', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on 125 Minutes !`);
        }
        break;
      case 'ArrowLeft':
        this.shiftChart(-10);
        break;
      case 'ArrowRight':
        this.shiftChart(10);
        break;
      case '+':
      case '=':
        this.scaleChart(1 / 8, true);
        break;
      case '-':
        this.scaleChart(1 / 8, false);
        break;
      case 'Escape':
        this.renderer.selectRootElement(this.closeButton.nativeElement).click();
        this.cleanupChart();
        this.selectedOption = '';
        this.dropdownShow = false;
        break;
      // case 'l':
      // case 'L':
      //   if (this.TrackFullScreenMode) {
      //     this.drawLineSeries();
      //   }
      //   break;
      // case 'C':
      // case 'c':
      //   if (this.TrackFullScreenMode) {
      //     this.drawCandleSeries();
      //   }
      //   break;
    }
  }

  // ZONE SHORTCUT CODE
  @HostListener('document:keydown', ['$event'])
  handleChartShortcutKeys(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const tagName = target?.tagName?.toLowerCase();

    // Do not trigger shortcuts while typing
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

    // Prevent repeated toggle when key is held down
    if (event.repeat) {
      return;
    }

    const key = event.key.toLowerCase();

    switch (key) {
      case 'q':
        event.preventDefault();
        this.toggleBaseOnlyShortcut('qualified_zones');
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
        this.toggleHtfShortcutByRule();
        break;
    }
  }

  private toggleBaseOnlyShortcut(option: string): void {

    if (!this.isCurrentTimeframeBase()) {
      console.log(
        `Shortcut blocked: ${option} is allowed only on base timeframe. Current: ${this.FullScreenModeValue}`
      );
      return;
    }

    this.checkboxClicked(option);
  }

  private toggleHtfShortcutByRule(): void {
    const rule = this.getCurrentStandardHtfRule();

    if (!rule) {
      console.log('Shortcut blocked: No HTF rule found.');
      return;
    }

    const currentTf = this.FullScreenModeValue;

    /*
     * Base-like chart:
     *
     * Execution 60:
     *   sixty and seventy_five both toggle htf_zone.
     *
     * Execution 15:
     *   fifteen and seventy_five both toggle htf_zone.
     */
    if (this.isExecutionBaseLikeChart(currentTf)) {
      this.checkboxClicked('htf_zone');
      return;
    }

    /*
     * Actual HTF child chart:
     *
     * Execution 60:
     *   weekly and daily toggle optimized_buy_sell_zone.
     *
     * Execution 15:
     *   daily and sixty toggle optimized_buy_sell_zone.
     */
    const childPatch = rule.htf_zone?.[currentTf];

    if (childPatch?.optimized_buy_sell_zone === true) {
      this.checkboxClicked('optimized_buy_sell_zone');
      return;
    }

    console.log(
      `Shortcut blocked: Z is not allowed on ${currentTf} for execution base ${rule.base}`
    );
  }

  private isCurrentTimeframeBase(): boolean {
    return this.isExecutionBaseLikeChart(this.FullScreenModeValue);
  }

  private getCurrentStandardHtfRule(): MenuRule | null {
    const baseTf = this.getBaseTimeframeByExecutionTimeframe();

    if (!baseTf) {
      return null;
    }

    return STANDARD_HTF_ZONE_RULES[baseTf] || null;
  }

  private getBaseTimeframeByExecutionTimeframe(): string | null {
    const tf = Number(this.finData?.time_frame);

    switch (tf) {
      case 1:
        return 'daily';

      case 2:
        return 'sixty';

      case 3:
        return 'fifteen';

      case 4:
      case 5:
        return 'one_twenty_five';

      case 6:
        return 'twenty_five';

      case 25:
        return 'seventy_five';

      default:
        return null;
    }
  }
  private isExecutionBaseLikeChart(chartKey: string): boolean {
    const executionTf = Number(this.finData?.time_frame);

    /*
     * New 75 execution:
     * seventy_five is the actual base chart.
     */
    if (executionTf === 25) {
      return chartKey === 'seventy_five';
    }

    /*
     * Existing 60 execution:
     * sixty and seventy_five behave as base-like charts.
     */
    if (executionTf === 2) {
      return chartKey === 'sixty' || chartKey === 'seventy_five';
    }

    /*
     * Existing 15 execution:
     * fifteen and seventy_five behave as base-like charts.
     */
    if (executionTf === 3) {
      return chartKey === 'fifteen' || chartKey === 'seventy_five';
    }

    const baseTf = this.getBaseTimeframeByExecutionTimeframe();

    return !!baseTf && chartKey === baseTf;
  }

  toggleHtfAndOptimizedZoneByKey(): void {
    /*
      Z key should control both:
      1. htf_zone
      2. optimized_buy_sell_zone
  
      If both are already ON -> turn both OFF
      Otherwise -> turn both ON
    */
    const shouldTurnOn = !(
      this.selectedOptions['htf_zone'] === true &&
      this.selectedOptions['optimized_buy_sell_zone'] === true
    );

    /*
      We want only ONE redraw.
  
      checkboxClicked('htf_zone') itself toggles htf_zone.
      So before calling it, set htf_zone opposite of final state.
    */
    this.selectedOptions['htf_zone'] = !shouldTurnOn;
    this.selectedOptions['optimized_buy_sell_zone'] = shouldTurnOn;

    this.checkboxClicked('htf_zone');
  }

  // ZONE SHORTCUT CODE

  getLineColor(type: string) {
    if (type === 'entry') return 'blue';
    if (type === 'target') return 'green';
    if (type === 'stoploss') return 'red';
    return 'gray';
  }

  shiftChart(diff: any) {
    const currentPos = this.chart.timeScale().scrollPosition();
    this.chart.timeScale().scrollToPosition(currentPos + diff, false);
  }

  scaleChart(pct: number, zoomIn: boolean): void {
    const timeScale = this.chart.timeScale();
    const priceScale = this.chart.priceScale('right'); // Use the default 'right' price scale
    const direction = zoomIn ? -1 : 1;

    // Handle horizontal scaling (time scale)
    const currentTimeRange = timeScale.getVisibleLogicalRange();
    if (currentTimeRange) {
      const bars = currentTimeRange.to - currentTimeRange.from;
      const newRangeBars = bars * pct * direction + bars;
      timeScale.setVisibleLogicalRange({
        to: currentTimeRange.to,
        from: currentTimeRange.to - newRangeBars,
      });
    }

    this.candlestickSeries.applyOptions({
      priceScale: {
        scaleMargins: {
          top: Math.max(0.1, 0.2 + (zoomIn ? -0.05 : 0.05)),
          bottom: Math.max(0.1, 0.2 + (zoomIn ? -0.05 : 0.05)),
        },
      },
    });
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

  orders() {
    this.router.navigate(['orderlist']);
  }

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  autoorders() {
    this.router.navigate(['auto-order-list']);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }

  news() {
    this.router.navigate(['news']);
  }

  private buildForm() {
    const countryId = localStorage.getItem('selectedCountryId');
    this.finform = this.formBuilder.group({
      country: [localStorage.getItem('selectedCountryName')],
      tick: ['', [Validators.required]],
      time_frame: ['', [Validators.required]],
      last_d_time: [''],
      stock_id: ['']
    });

    this.alertForm = this.formBuilder.group({
      user_id: [Number(this.userId)],
      country_id: [Number(this.countryId)],
      stock_symbol: ['', Validators.required],
      exchange: ['NSE'],
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
      email_notification: [false],
    });

    this.fincreateformForMannualSetup = this.formBuilder.group({
      stock_tick: [''],
      stock_id: [''],
      prediction: [''],
      probability: [''],

      country_id: [countryId ? Number(countryId) : null],
      order_type: ['', [Validators.required]],
      entry_price: ['', [Validators.required]],
      stoploss_price: ['', [Validators.required]],
      target_price: ['', [Validators.required]],
      stock_quantity: ['', [Validators.required]],
      purchased_cmp_date: [''],
      time_frame: [''],
    });
  }

  private CreateForm() {
    this.fincreateform = this.formBuilder.group({
      stock_tick: [''],
      stock_id: [''],
      prediction: [''],
      probability: [''],
      country_id: this.countryId,
      order_type: ['', [Validators.required]],
      entry_price: ['', [Validators.required]],
      stoploss_price: ['', [Validators.required]],
      target_price: ['', [Validators.required]],
      stock_quantity: ['', [Validators.required]],
      purchased_cmp_date: [''],
      time_frame: [''],
    });
  }

  private buildAddStockForm() {
    this.AddStockForm = this.formBuilder.group({
      stock_name: ['', [Validators.required]],
      y_stock_name: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.connectStockData();
    this.filter = [
      { id: '1', name: 'D' },
      { id: '2', name: '60' },
      { id: '3', name: '15' },
      { id: '4', name: 'M - W - 125' },
      { id: '5', name: 'W - D - 125' },
      { id: '6', name: '25' },
      { id: '25', name: 'W - D - 75' },
    ];
    this.onCountryChange(localStorage.getItem('selectedCountryName'));
    this.route.paramMap.subscribe(params => {
      this.StockTickByParam = params.get('stock_tick');
      this.timeFrameByParam = params.get('time_frame') ?? '1';
    });
    this.Role = localStorage.getItem('role');
    if (this.Role == 'admin') {
      this.isAdmin = true;
    } else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.userId = localStorage.getItem('UserId');
    this.selectedDateRange = {
      startDate: moment().startOf('year'), // January 1st, current year
      endDate: moment().endOf('year'), // December 31st, current year
    };
    this.countryId = localStorage.getItem('selectedCountryId');
    this.webSocketService.disconnectStock();
    this.buildForm();
    this.CreateForm();
    this.buildAddStockForm();

    this.getAllSetAlerts(true);
    this.PrepDebounce();
    // this.finform.patchValue({
    //   time_frame: "1"
    // });

    this.finform.patchValue({
      tick: this.StockTickByParam,
      time_frame: '1',
      last_d_time: moment().format('YYYY-MM-DD HH:mm:ss'),
    });
    this.submit();
    // this.apiService.getStockdataBYTick(this.StockTickByParam, localStorage.getItem('selectedCountryName')).subscribe((resp) => {
    //     const data = resp.response;
    //     this.stock_id = resp.response.id;
    //     const interval = setInterval(() => {
    //       const matchingStock = this.stockData.find(
    //         (stock) => stock.stock_tick === data.stock_tick
    //       );
    //       if (matchingStock) {
    //         clearInterval(interval);
    //         this.finform.patchValue({
    //           tick: matchingStock,
    //           time_frame: '1',
    //           last_d_time: moment().format('YYYY-MM-DD HH:mm:ss'),
    //         });
    //         this.submit();
    //       }
    //     }, 100);
    //   });

    // Assuming your form is called `form`
    this.alertForm.get('trigger_price')?.valueChanges.subscribe(() => {
      this.calculateMinMax();
    });

    this.alertForm.get('threshold')?.valueChanges.subscribe(() => {
      this.calculateMinMax();
    });
  }

  connectStockData(): void {
    this.webSocketService.ConnectStockList();
    this.webSocketService.getFullStockListData().subscribe((data) => {
      this.ListOfStockData = data;
      this.ListOfStockData = JSON.parse(data);
      this.StockFullData = this.ListOfStockData.stocks;
      this.TotalStock = this.ListOfStockData.total_stocks;
    });
  }

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

  calculateMinMax() {
    const trigger = this.alertForm.get('trigger_price')?.value;
    const threshold = this.alertForm.get('threshold')?.value;

    if (trigger && threshold) {
      const diff = (trigger * threshold) / 100;
      this.alertForm
        .get('price_range_min')
        ?.setValue(trigger - diff, { emitEvent: false });
      this.alertForm
        .get('price_range_max')
        ?.setValue(trigger + diff, { emitEvent: false });
    }
  }

  get g() {
    return this.fincreateform.controls;
  }
  get f() {
    return this.finform.controls;
  }
  get h() {
    return this.AddStockForm.controls;
  }
  get j() {
    return this.alertForm.controls;
  }
  get k() {
    return this.fincreateformForMannualSetup.controls;
  }

  connectWebSocket(type: any): void {
    this.webSocketService.connect(
      this.finData.tick,
      this.finData.time_frame,
      this.UpdateCnadleStockId,
      type
    );
    this.webSocketService.getStockMessage().subscribe((data) => {
      this.realTimePrice = data;
      console.log('UPDATED DATA', data);
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

  ngOnDestroy(): void {
    this.disconnectWebSocket();
  }

  disconnectWebSocket(): void {
    this.webSocketService.disconnectStock();
  }

  ngAfterViewInit() {
    // this.chartContainer.nativeElement.addEventListener(
    //   'contextmenu',
    //   (event: MouseEvent) => {
    //     event.preventDefault();
    //     this.showContextMenu(event.clientX, event.clientY);
    //   }
    // );

    for (var key in this.ChartRESPONSE) {
      if (this.ChartRESPONSE.hasOwnProperty(key)) {
        var array = this.ChartRESPONSE[key];
        switch (key) {
          case 'monthly':
            this.MonthlyLabel = key;
            break;
          case 'weekly':
            this.WeeklyLabel = key;
            break;
          case 'daily':
            this.DailyLabel = key;
            break;
          case 'seventy_five':
            this.Seventy_FiveLabel = '75 Minute';
            break;
          case 'sixty':
            this.SixtyLabel = '60 Minute';
            break;
          case 'fifteen':
            this.Fifteen_MinuteLabel = '15 Minute';
            break;
          case 'one_twenty_five':
            this.One_Twenty_FiveLabel = '125 Minute';
            break;
          case 'twenty_five':
            this.Twenty_FiveLabel = '25 Minute';
            break;
        }
        this.LoadChart(array, key);
        this.spinner.hide()
        this.addPreviousHighPriceLine(key);

      }
    }
  }

  openCreateOrderPanel() {
    this.showCreateOrderModal = true;
    this.onOrderTypeChange();
    if (this.SelectedStockName) {
      this.fincreateform.patchValue({
        stock_tick: this.SelectedStockName,
        stock_id: this.stock_id.toString(),
      });
    } else {
      console.warn('SelectedStockName is undefined');
    }
  }

  closeCreateOrderPanel() {
    this.showCreateOrderModal = false;
    this.fincreateform.reset();
    this.submitted = false;
  }

  AddStock() {
    this.submittedforAddStock = true;
    this.AddStockForm.markAllAsTouched();
    if (this.AddStockForm.invalid) {
      return;
    }
    if (this.AddStockForm.valid) {
      this.spinner.show();
      this.showmsg = 'Adding Stock. PLease Wait !!';
      const trimmedValues = {
        stock_name: this.AddStockForm.value.stock_name.trim(),
        y_stock_name: this.AddStockForm.value.y_stock_name.trim(),
      };
      this.apiService.addstockservice(trimmedValues).subscribe((resp) => {
        if (resp.msg == 'success') {
          this.spinner.hide();
          this.toastr.success('New Stock Added Successfully !');
          this.NewStockPrecessing(resp.response.stock_id);
        } else {
          this.spinner.hide();
          this.toastr.error('Stock Is Already Exists !');
        }
      });
    }
  }

  NewStockPrecessing(stock_id: any) {
    this.spinner.show();
    this.showmsg = 'Data Processing Started . Please Wait !!';
    this.apiService.addstockProcessingservice(stock_id).subscribe((resp) => {
      if (resp.msg == 'success') {
        this.spinner.hide();
        this.toastr.success('New Stock Processed Successfully !');
        this.AddStockcloseButton.nativeElement.click();
      } else {
        this.spinner.hide();
        this.toastr.error('Failed to Process Stock !');
      }
    });
  }

  resetOrderForm() {
    this.fincreateform.reset();
  }

  onOrderTypeChange() {
    let type = '';
    if (this.SETUPTYPE === 'BUY') {
      type = 'Buy';
    } else {
      type = 'Sell';
    }
    const order_type = type;
    this.fincreateform.patchValue({
      entry_price: '',
      stoploss_price: '',
      target_price: '',
    });
    if (this.FullScreenModeValue == 'seventy_five') {
      if (this.updateModelPredictionFlag) {
        this.fincreateform.patchValue({
          order_type: type,
          entry_price: this.EntryPrice.toFixed(2),
          stoploss_price: this.StoplossPrice.toFixed(2),
          target_price: this.TargetPrice.toFixed(2),
        });
      } else {
        const setup = this.setupDataonseventyfive[order_type.toUpperCase()];
        this.EntryPrice = setup.entry_price;
        this.StoplossPrice = setup.stop_loss;
        this.TargetPrice = setup.target_price;
        this.fincreateform.patchValue({
          order_type: type,
          entry_price: this.EntryPrice.toFixed(2),
          stoploss_price: this.StoplossPrice.toFixed(2),
          target_price: this.TargetPrice.toFixed(2),
        });
      }
    } else {
      if (this.updateModelPredictionFlag) {
        this.fincreateform.patchValue({
          order_type: type,
          entry_price: this.EntryPrice.toFixed(2),
          stoploss_price: this.StoplossPrice.toFixed(2),
          target_price: this.TargetPrice.toFixed(2),
        });
      } else {
        const setup = this.setupData[order_type.toUpperCase()];
        this.EntryPrice = setup.entry_price;
        this.StoplossPrice = setup.stop_loss;
        this.TargetPrice = setup.target_price;
        this.fincreateform.patchValue({
          order_type: type,
          entry_price: this.EntryPrice.toFixed(2),
          stoploss_price: this.StoplossPrice.toFixed(2),
          target_price: this.TargetPrice.toFixed(2),
        });
      }
    }
  }

  createOrder() {
    this.selectedDate = this.getCurrentDateTime();
    const leftBar = document.getElementById('leftBar');
    if (leftBar!.classList.contains('open')) {
      leftBar!.classList.remove('open');
    }
    const leftPanel = document.getElementById('leftPanel');
    if (leftPanel) {
      leftPanel.classList.remove('open');
    }
    this.isNotificationVisible = false;
    this.updateModelPredictionFlag = false;
    this.TrackFullScreenMode = false;
    this.ModelPrediction = '';
    this.submitted = false;
    this.cleanupChart();
    this.selectedOption = '';
    this.dropdownShow = false;
    this.selectedOptions = {
      base_candle: false,
      buy_sell_zone: false,
      bad_zone: false,
      setup: false,
    };
  }

  getCurrentDateTime(): string {
    const finDataStock = this.finform.value;                //nabonita
    // const finDataStock = this.finData;
    const selectedDatetimeStr = finDataStock.last_d_time;

    // Convert the string to a Date object
    const selectedDatetime = new Date(selectedDatetimeStr.replace(' ', 'T'));

    const year = selectedDatetime.getFullYear();
    const month = String(selectedDatetime.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDatetime.getDate()).padStart(2, '0');
    const hours = String(selectedDatetime.getHours()).padStart(2, '0');
    const minutes = String(selectedDatetime.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  create() {
    this.showmsg = 'Please Wait !!';
    this.submitted = true;
    this.fincreateform.markAllAsTouched();
    if (this.fincreateform.invalid) {
      return;
    }
    if (this.fincreateform.valid) {
      this.spinner.show();
      const finDataStock = this.finform.value;
      this.fincreateform.patchValue({
        prediction: this.SelectedPrediction,
        probability: this.SelectedProbability / 100,
        country_id: this.countryId,
        stock_tick: this.selectedStockId,
        purchased_cmp_date: this.getCurrentDateTime(),
        time_frame: finDataStock.time_frame,
      });
      const fincreateorderData = this.fincreateform.value;
      this.apiService.createorder(fincreateorderData).subscribe((resp) => {
        this.createorderResp = resp;
        if (resp.msg == 'success') {
          // this.closemodal.nativeElement.click();
          this.spinner.hide();
          this.toastr.success('Order Create Success ', 'ALERT !');
          this.closeCreateOrderPanel();
          this.stopTimer();
          // this.router.navigate(['orderlist']);
        } else {
          this.spinner.hide();
          this.toastr.error(resp.response, 'ALERT !');
        }
      });
    }
  }

  stopTimer() {
    clearInterval(this.timer);
  }

  onStockChange(event: any) {
    const selectedValue = (event.target as HTMLSelectElement).value;
    this.selectedStockId = selectedValue;
  }

  // updateSelectedDate(event: any) {
  //   const selectedValue = (event.target as HTMLSelectElement).value;
  //   this.selectedDate = selectedValue;
  // }

  onCountryChange(countryName: any) {
    this.apiService.getStockDataByCountry(countryName).subscribe((resp) => {
      this.stockData = resp.response;
    });
  }

  download() {
    this.showmsg = 'Please Wait !!';
    this.spinner.show();
    this.apiService.accessTokenValidationService().subscribe((resp) => {
      if (resp.msg == 'success') {
        this.callDownloadDataService();
      } else {
        alert(
          'Failed to validate access token. Please select a valid request token!'
        );
        this.spinner.hide();
      }
    });
  }

  callDownloadDataService() {
    let retryCount = 0;
    const downloadData = () => {
      this.apiService.downloadLatestDataService().subscribe((downloadResp) => {
        if (downloadResp.msg == 'success') {
          this.apiService.parseLatestDataCsvService().subscribe((resp) => {
            if (resp.msg == 'success') {
              this.apiService.processStockItemsService().subscribe((resp) => {
                this.spinner.hide();
              });
            }
          });
        } else {
          retryCount++;
          if (retryCount < 10) {
            downloadData();
          } else {
            alert('Unable to process. Please retry later.');
          }
        }
      });
    };

    downloadData();
  }

  ViewOrderList() {
    this.router.navigate(['orderlist']);
  }

  autoorderlist() {
    this.router.navigate(['auto-order-list']);
  }

  validateToken() {
    if (this.token == undefined || this.token == '') {
      alert('Empty Token !');
    } else {
      this.state = '1006';
      const token = encodeURIComponent(this.token);
      this.apiService.tokenService(token, this.state).subscribe((resp) => {
        if (resp.response.status == 200) {
          this.toastr.success('Token Validation Successfull !');
        } else {
          alert(
            'Failed to generate access token. Please select a valid request token!'
          );
        }
      });
    }
  }


  togglePanel() {
    const leftBar = document.getElementById('leftBar');
    if (leftBar!.classList.contains('open')) {
      leftBar!.classList.remove('open');
    }
    const leftPanel = document.getElementById('leftPanel');
    if (leftPanel) {
      const windowHeight: number = window.innerHeight;
      const targetHeight: number = 150;
      leftPanel.style.top = `${targetHeight}px`;
      leftPanel.style.height = `${windowHeight - targetHeight}px`;
      if (leftPanel.classList.contains('open')) {
        leftPanel.classList.remove('open');
      } else {
        leftPanel.classList.add('open');
      }
    }
  }

  submit() {
    this.GapUpDownData = [];
    this.QualifiedData = null;
    this.PreviousHighData = null;
    this.BuySetupData = null;
    this.SellSetupData = null;
    this.BuyZoneData = null;
    this.OptimizedBuySellZoneData = null;
    this.SellZoneData = null;
    this.BaseCandleData = null;
    this.QualifiedDataonSeventyfive = null;
    this.BadZoneData = null;
    this.GapData = null;
    this.OverLayCandleData = null;
    this.BuyOverlayDataonSeventyFive = null;
    this.AllZonesData = null;
    this.setupData = null;
    this.TrendAnalyzer = '';
    this.Counter = 0;
    this.activeTab = "tab2";

    this.finform.markAllAsTouched();
    if (this.finform.invalid) {
      return;
    }
    if (this.finform.valid) {

      this.showmsg = 'Analyzing Data and Generating Your Graph... Please Wait.';
      this.clearChartDiv();
      this.spinner.show();
      this.OriginalFinData = JSON.parse(JSON.stringify(this.finform.value)); // 🔥 deep copy
      this.finData = { ...this.OriginalFinData }; // Shallow copy of top-level properties
      if (!this.finData.last_d_time) {
        const currentDateTime = moment();
        this.finData.last_d_time = currentDateTime.format(
          'YYYY-MM-DD HH:mm:ss'
        );
        // this.finData.last_d_time = currentDateTime.format("DD-MM-YYYY HH:mm:ss");
      } else {
        this.TimeFrame = this.finData.time_frame;
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
      }
      this.finData.tick = this.OriginalFinData.tick;
      this.selectedStockId = this.OriginalFinData.tick;
      this.UpdateCnadleStockId = this.OriginalFinData.stock_id;
      this.TimeFrame = this.finData.time_frame;
      this.previousHighService();
      // Prepare promises for initial API calls
      const promises = [
        this.getGapupDownData(),
        this.GetBaseCandleData(),
        this.GetBuyZoneData(),
        this.GetSellZoneData(),
        this.OverLayFetching(),
        this.GetAllZones(),
        this.GetQualifiedZones(),
        this.GetSetUpData(),
        this.OptimizedBuySellZoneFunc(),
        this.trendAnalyzerFunction(),
        this.PricePercentage()
      ];

      // Add additional API calls based on time_frame
      this.MasterTimeFrameToHideSpinner = this.finData.time_frame;
      if (this.finData.time_frame === '1') {
        this.layoutFlagfirst = true;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = false;
        this.layoutFlagfourth = false;
        this.layoutFlagfifth = false;
        this.layoutFlagsixth = false;
        this.layoutFlagseventh = false;
      } else if (this.finData.time_frame === '2') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = true;
        this.layoutFlagthird = false;
        this.layoutFlagfourth = false;
        this.layoutFlagfifth = false;
        this.layoutFlagsixth = false;
        this.layoutFlagseventh = false;
      } else if (this.finData.time_frame === '3') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = true;
        this.layoutFlagfourth = false;
        this.layoutFlagfifth = false;
        this.layoutFlagsixth = false;
        this.layoutFlagseventh = false;
      } else if (this.finData.time_frame === '4') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = false;
        this.layoutFlagfourth = true;
        this.layoutFlagfifth = false;
        this.layoutFlagsixth = false;
        this.layoutFlagseventh = false;
      } else if (this.finData.time_frame === '5') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = false;
        this.layoutFlagfourth = false;
        this.layoutFlagfifth = true;
        this.layoutFlagsixth = false;
        this.layoutFlagseventh = false;
      } else if (this.finData.time_frame === '6') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = false;
        this.layoutFlagfourth = false;
        this.layoutFlagfifth = false;
        this.layoutFlagsixth = true;
        this.layoutFlagseventh = false;
      } else if (this.finData.time_frame === '25') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = false;
        this.layoutFlagfourth = false;
        this.layoutFlagfifth = false;
        this.layoutFlagsixth = false;
        this.layoutFlagseventh = true;
      }

      // Execute all promises and fetch candle data after they are complete
      Promise.all(promises)
        .then(() => {
          return this.apiService.fetchCandleData(this.finData).toPromise();
        })
        .then((resp) => {
          this.ChartRESPONSE = resp.response;
          this.SelectedStockName = this.finData.tick;
          this.cdRef.detectChanges();
          this.ngAfterViewInit();
        })
        .catch((error) => {
          console.error('Error occurred during API calls', error);
          this.spinner.hide()
        })
        .finally(() => {
          // this.spinner.hide()
        });
    }
  }

  OptimizedBuySellZoneFunc(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetOptimizedBuySellZoneService(this.finData).subscribe({
        next: (resp) => {
          this.OptimizedBuySellZoneData = resp.response;
          resolve();
        },
        error: (err) => {
          console.error('Error in OptimizedBuySellZoneFunc', err);
          reject(err);
        }
      });
    });
  }

  ViewSetupAnyway() {
    this.isDisabled = true; // disable the button

    // Clear old line-series setup
    try {
      this.removeAllEntry();
    } catch { }

    // Clear new Trade Tiger Entry / Target / Stoploss setup lines
    try {
      this.clearTradeTigerSetupLines();
    } catch { }

    if (this.SETUPTYPE == 'BUY') {
      if (!this.BuySetupData || !this.BuyTimestampData) {
        this.ModelPrediction = 'BUY setup data not available!';
        this.showMarketAlert(this.ModelPrediction);
        this.CreateButtonFlag = false;
        this.isDisabled = false;
        return;
      }

      const setupDrawn = this.drawBackendSetupUsingTradeTigerTool(
        'BUY',
        this.BuySetupData.entry_price,
        this.BuySetupData.target_price,
        this.BuySetupData.stop_loss,
        this.BuyTimestampData.entry_price_timestamp,
        this.BuyTimestampData.target_price_timestamp,
        this.BuyTimestampData.entry_price_timestamp
      );

      if (!setupDrawn) {
        this.CreateButtonFlag = false;
        this.isDisabled = false;
        return;
      }

      this.SETUPTYPE = 'BUY';
      this.ViewSetUpAnywayFlag = false;
      this.CreateButtonFlag = true;
      this.createBtnFlgForMannualSetup = false;

      return;
    }

    if (this.SETUPTYPE == 'SELL') {
      if (!this.SellSetupData || !this.SellTimestampData) {
        this.ModelPrediction = 'SELL setup data not available!';
        this.showMarketAlert(this.ModelPrediction);
        this.CreateButtonFlag = false;
        this.isDisabled = false;
        return;
      }

      const setupDrawn = this.drawBackendSetupUsingTradeTigerTool(
        'SELL',
        this.SellSetupData.entry_price,
        this.SellSetupData.target_price,
        this.SellSetupData.stop_loss,
        this.SellTimestampData.entry_price_timestamp,
        this.SellTimestampData.target_price_timestamp,
        this.SellTimestampData.entry_price_timestamp
      );

      if (!setupDrawn) {
        this.CreateButtonFlag = false;
        this.isDisabled = false;
        return;
      }

      this.SETUPTYPE = 'SELL';
      this.ViewSetUpAnywayFlag = false;
      this.CreateButtonFlag = true;
      this.createBtnFlgForMannualSetup = false;

      return;
    }
  }

  GetQualifiedZones(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetQualifiedZoneService(this.finData).subscribe({
        next: (resp) => {
          this.QualifiedData = resp.response;

          if (this.CancelReplayClicked) {
            this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
          }

          resolve();
        },
        error: (err) => {
          console.error('Error in GetQualifiedZones', err);
          reject(err);
        }
      });
    });
  }


  OverLayFetching(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.fetchingOverlayService(this.finData).subscribe({
        next: (resp: any) => {
          this.OverLayCandleData = resp.response;
          this.BuyOverlayData = this.OverLayCandleData.Execute.Buy;
          this.SellOverlayData = this.OverLayCandleData.Execute.Sell;
          this.AnalyzeOverlayData = this.OverLayCandleData.Analyse;
          if (this.CancelReplayClicked) {
            this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
          }

          resolve();
        },
        error: (err) => {
          console.error('Error in OverLayFetching', err);
          reject(err);
        }
      });
    });
  }


  GetSetUpData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setupData = [];

      this.apiService.GetSetupDataService(this.finData).subscribe({
        next: (resp) => {
          if (resp.msg === 'failed') {
            this.setupdataStatus = resp.msg;
          } else {
            console.log('SETUP RESPONSE FULL', resp);
            this.setupdataStatus = resp.status;
            this.ScoreData = resp.response
            this.setupData = resp.response;
            this.TradeSetupReason = resp.response.reason;

            if (this.CancelReplayClicked) {
              this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
            }

            // console.log(`RESPONSE 8 (SETUP DATA FOR LAST TIMEFRAME)`, this.setupData);
          }
          resolve();
        },
        error: (err) => {
          console.error('Error in GetSetUpData', err);
          reject(err);
        }
      });
    });
  }

  trendAnalyzerFunction() {
    this.apiService.TrendAnalyzerService(this.finData).subscribe((resp) => {
      this.TrendAnalyzer = resp.response;
    });
  }

  GetgapZone() {
    // this.setupData = []
    this.showmsg = 'Fetching Data !';
    this.apiService.GetGapDataService(this.finData).subscribe((resp) => {
      this.GapData = resp.response;
    });
  }

  GetBuyZoneData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetBuyZoneDataService(this.finData).subscribe({
        next: (resp) => {
          this.BuyZoneData = resp.response;
          if (this.CancelReplayClicked) {
            this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
          }
          // console.log(`RESPONSE 2 (BUY ZONE) :`, this.BuyZoneData);
          resolve();
        },
        error: (err) => {
          console.error('Error in GetBuyZoneData', err);
          reject(err);
        }
      });
    });
  }

  GetSellZoneData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetSellZoneDataService(this.finData).subscribe({
        next: (resp) => {
          this.SellZoneData = resp.response;

          if (this.CancelReplayClicked) {
            this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
          }

          resolve();
        },
        error: (err) => {
          console.error('Error in GetSellZoneData', err);
          reject(err);
        }
      });
    });
  }

  GetBaseCandleData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetBaseCandleData(this.finData).subscribe({
        next: (resp) => {
          this.BaseCandleData = resp.response;
          if (this.CancelReplayClicked) {
            this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
          }
          resolve();
        },
        error: (err) => {
          console.error('Error in GetBaseCandleData', err);
          reject(err);
        }
      });
    });
  }

  GetAllZones(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetAllZonesData(this.finData).subscribe({
        next: (resp) => {
          this.AllZonesData = resp.response;

          if (this.CancelReplayClicked) {
            this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
          }

          // console.log(`RESPONSE 5 (ALL ZONE) :`, this.AllZonesData);
          resolve();
        },
        error: (err) => {
          console.error('Error in GetAllZones', err);
          reject(err);
        }
      });
    });
  }

  clearChartDiv() {
    const monthlyDiv = this.elementRef.nativeElement.querySelector('#monthly');
    const weeklyDiv = this.elementRef.nativeElement.querySelector('#weekly');
    const dailyDiv = this.elementRef.nativeElement.querySelector('#daily');
    const seventy_five_minute_Div =
      this.elementRef.nativeElement.querySelector('#seventy_five');
    const sixty_minute_Div =
      this.elementRef.nativeElement.querySelector('#sixty');
    const fifteen_minute_Div =
      this.elementRef.nativeElement.querySelector('#fifteen');

    if (monthlyDiv) {
      monthlyDiv.innerHTML = '';
    }
    if (weeklyDiv) {
      weeklyDiv.innerHTML = '';
    }
    if (dailyDiv) {
      dailyDiv.innerHTML = '';
    }
    if (seventy_five_minute_Div) {
      seventy_five_minute_Div.innerHTML = '';
    }
    if (sixty_minute_Div) {
      sixty_minute_Div.innerHTML = '';
    }
    if (fifteen_minute_Div) {
      fifteen_minute_Div.innerHTML = '';
    }
  }

  getGapupDownData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetGapUpDownDataService(this.finData).subscribe({
        next: (resp) => {
          this.GapUpDownData = resp.response;
          resolve();
        },
        error: (err) => {
          console.error('Error in getGapupDownData', err);
          reject(err);
        }
      });
    });
  }

  LoadChart(data: any, chartId: any, isFullScreen: boolean = false) {
    this.FULLSCREENCHARTDATA = data;
    this.lastBar = data ? data.at(-1) : null;

    const chartProperties = {
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    };

    const chart = createChart(document.getElementById(chartId)!, {
      ...chartProperties,
      layout: {
        background: {
          color: '#f0ffff',
        },
      },
    });

    // ✅ Assign chart before external functions use it.
    this.chart = chart;

    if (isFullScreen === true) {
      chart.applyOptions({
        watermark: {
          visible: true,
          fontSize: 20,
          horzAlign: 'left',
          vertAlign: 'top',
          color: 'rgb(128, 128, 128)',
          text:
            this.SelectedStockName.toUpperCase() +
            ' | ' +
            this.ModalHeader.toUpperCase(),
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
      });
    }

    this.areaSeries = chart.addAreaSeries({
      lineColor: '#2962FF',
      topColor: '#2962FF',
      bottomColor: 'rgba(41, 98, 255, 0.28)',
    });

    // ✅ IMPORTANT:
    // Keep this as the main candlestick series.
    // RectangleDrawingTool will attach primitives to this series.
    this.candlestickSeries = chart.addCandlestickSeries({
      upColor: '#006401',
      downColor: '#8b0101',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const postbars = [...new Array(100)].map((_, i) => ({
      time: data[data.length - 1].time + (i + 1) * this.xspan,
    }));

    // ✅ Set data only once.
    // Do not create another candlestick series below.
    this.candlestickSeries.setData([...data, ...postbars]);

    chart.timeScale().fitContent();

    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.0,
        bottom: 0.0,
      },
    });

    const maData = this.calculateMovingAverageSeriesData(data, 20);

    const maSeries = chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 1,
      title: 'EMA',
    });

    maSeries.setData(maData);

    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const seriesPrices = param.seriesData.get(this.candlestickSeries);

        if (seriesPrices) {
          this.toolTipData = seriesPrices;

          this.Open = this.toolTipData.open.toFixed(2);
          this.Close = this.toolTipData.close.toFixed(2);
          this.High = this.toolTipData.high.toFixed(2);
          this.Low = this.toolTipData.low.toFixed(2);

          if (this.Close > this.Open) {
            this.CandleColor = 'green';
          } else {
            this.CandleColor = 'red';
          }
        } else {
          this.Open = '';
          this.Close = '';
          this.High = '';
          this.Low = '';
        }
      }
    });



    this.chart.subscribeClick(this.onChartClick.bind(this));

  }

  connectCMPWebsocket(CandleData: any) {
    this.webSocketService.connect(
      this.finData.tick,
      this.finData.time_frame,
      this.UpdateCnadleStockId,
      this.FullScreenModeValue
    );
    this.webSocketService.getStockMessage().subscribe((data) => {
      this.realTimePrice = data;
      const parsedData = JSON.parse(data);
      const updatedCandle = {
        open: Number(parsedData.data.open),
        high: Number(parsedData.data.high),
        low: Number(parsedData.data.low),
        close: Number(parsedData.data.close),
        time: Number(parsedData.data.time),
      };

      const newSeriesData = [...CandleData, updatedCandle];

      const postbars = [...new Array(100)].map((_, i) => ({
        time:
          newSeriesData[newSeriesData.length - 1].time + (i + 1) * this.xspan,
      }));

      this.candlestickSeries.setData([...newSeriesData, ...postbars]);

      this.candlestickSeries.setData([...data]);
      if (this.finData.tick === parsedData.data.stock_tick) {
        // this.updateChart(data);
      }
    });
  }

  drawLineSeries() {
    this.candlestickSeries.applyOptions({ visible: false });
    this.lineSeries.setData(this.LINEDATA);
    this.lineSeries.applyOptions({ visible: true });
  }

  drawCandleSeries() {
    this.lineSeries.applyOptions({ visible: false });
    this.candlestickSeries.applyOptions({ visible: true });
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

  FullScreenMode(type: any, chartId: any) {
    this.destroyManualRectangleTool();
    this.disconnectWebSocket();
    const chart_container_new = this.elementRef.nativeElement.querySelector(
      '#chart-container_new'
    );
    if (chart_container_new) {
      chart_container_new.innerHTML = '';
    }
    this.TrackFullScreenMode = true;
    this.dropdownShow = false;
    switch (type) {
      case 'monthly':
        this.FullScreenModeValue = type;
        this.ModalHeader = type;
        this.suggestion = false;
        break;
      case 'weekly':
        this.FullScreenModeValue = type;
        this.ModalHeader = type;
        this.suggestion = false;
        break;
      case 'daily':
        this.FullScreenModeValue = type;
        this.ModalHeader = type;
        if (this.TimeFrame == 1) {
          this.suggestion = true;
        } else {
          this.suggestion = false;
        }
        break;
      case 'seventy_five':
        this.FullScreenModeValue = type;
        this.ModalHeader = '75 Minute';
        this.suggestion = true;
        break;
      case 'sixty':
        this.FullScreenModeValue = type;
        this.ModalHeader = '60 Minute';
        if (this.TimeFrame == 2) {
          this.suggestion = true;
        } else {
          this.suggestion = false;
        }
        break;
      case 'fifteen':
        this.FullScreenModeValue = type;
        this.ModalHeader = '15 Minute';
        if (this.TimeFrame == 3) {
          this.suggestion = true;
        } else {
          this.suggestion = false;
        }
        break;
      case 'one_twenty_five':
        this.FullScreenModeValue = type;
        this.ModalHeader = '125 Minute';
        if (this.TimeFrame == 4 || this.TimeFrame == 5) {
          this.suggestion = true;
        }
        break;
      case 'twenty_five':
        this.FullScreenModeValue = type;
        this.ModalHeader = '25 Minute';
        if (this.TimeFrame == 6) {
          this.suggestion = true;
        } else {
          this.suggestion = false;
        }
        break;
    }
    const data = this.ChartRESPONSE[type];
    const toolbarDiv = this.elementRef.nativeElement.querySelector('#toolbar');
    if (toolbarDiv) {
      toolbarDiv.innerHTML = '';
    }
    // const newDataArray = data.slice(0, -1)
    this.LoadChart(data, chartId, true);
    this.initOldZoneRectangleTool(chartId);
    this.initManualRectangleTool(type, data);
    this.initChartDrawingTool(type, data);
    this.addPreviousHighPriceLine(type);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const lastRow = data.slice(-1)[0];
    this.CreateClosingLine(lastRow.close);
    this.connectWebSocket(type);

    // if (dayOfWeek >= 1 && dayOfWeek <= 5 && (hours > 9 || (hours === 9 && minutes >= 15)) && (hours < 15 || (hours === 15 && minutes <= 30))) {
    //   this.connectWebSocket();
    // } else {
    // }
  }

  previousHighService(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetprevioushighDataService(this.finData).subscribe({
        next: (resp) => {
          this.PreviousHighData = resp.response;

          if (this.CancelReplayClicked) {
            this.FullScreenMode(this.FullScreenModeValue, 'chart-container_new');
          }
          resolve();
        },
        error: (err) => {
          console.error('Error in previousHighService', err);
          reject(err);
        }
      });
    });
  }

  clearDrawing() {
    const toolbarDiv = this.elementRef.nativeElement.querySelector('#toolbar');
    if (toolbarDiv) {
      toolbarDiv.innerHTML = '';
    }
  }

  ChangeScreenMode(type: any, chartId: any) {
    const prevFullScreen = this.FullScreenModeValue;
    if (prevFullScreen === type) {
      return;
    }
    this.destroyManualRectangleTool();
    this.disconnectWebSocket();
    this.updateModelPredictionFlag = false;
    if (this.horizontalLines && this.horizontalLines.length > 0) {
      this.horizontalLines.forEach((line) => {
        this.chart.removeSeries(line.series);
      });
      this.horizontalLines = [];
    }
    this.entryEnabled = true;
    this.targetEnabled = true;
    this.stoplossEnabled = true;
    this.EntryPrice = null;
    this.TargetPrice = null;
    this.StoplossPrice = null;
    this.isNotificationVisible = false;
    const dataPresent: boolean = !!this.ChartRESPONSE[type];
    if (dataPresent) {
      this.suggestion = false;
      switch (type) {
        case 'monthly':
          this.ModalHeader = type;
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          break;
        case 'weekly':
          this.ModalHeader = type;
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          break;
        case 'daily':
          this.ModalHeader = type;
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          if (this.TimeFrame == 1) {
            this.suggestion = true;
          } else {
            this.suggestion = false;
          }
          break;
        case 'seventy_five':
          this.ModalHeader = '75 Minute';
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          this.suggestion = true;
          break;
        case 'sixty':
          this.ModalHeader = '60 Minute';
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          if (this.TimeFrame == 2) {
            this.suggestion = true;
          } else {
            this.suggestion = false;
          }
          break;
        case 'fifteen':
          this.ModalHeader = '15 Minute';
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          if (this.TimeFrame == 3) {
            this.suggestion = true;
          } else {
            this.suggestion = false;
          }
          break;
        case 'one_twenty_five':
          this.ModalHeader = '125 Minute';
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          if (this.TimeFrame == 4 || this.TimeFrame == 5) {
            this.suggestion = true;
          } else {
            this.suggestion = false;
          }
          break;
        case 'twenty_five':
          this.ModalHeader = '25 Minute';
          this.FullScreenModeValue = type;
          this.selectedOption = '';
          if (this.TimeFrame == 6) {
            this.suggestion = true;
          } else {
            this.suggestion = false;
          }
          break;
      }
      const data = this.ChartRESPONSE[type];
      this.cleanup();
      this.LoadChart(data, chartId, true);
      this.initOldZoneRectangleTool(chartId);
      this.initManualRectangleTool(type, data);
      this.initChartDrawingTool(type, data);
      this.addPreviousHighPriceLine(type);
      const now = new Date();
      const dayOfWeek = now.getDay(); // getDay() returns a value between 0 (Sunday) and 6 (Saturday)
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const lastRow = data.slice(-1)[0];
      this.CreateClosingLine(lastRow.close);
      this.connectWebSocket(type);
      this.applyViewGraphOverlapLogic(prevFullScreen); // ✅ NEW

      this.checkboxClicked(this.selectedOptions)    //Selected Zone Enabled
      // if (dayOfWeek >= 1 && dayOfWeek <= 5 && (hours > 9 || (hours === 9 && minutes >= 15)) && (hours < 15 || (hours === 15 && minutes <= 30))) {
      //   this.connectWebSocket(type);
      // } else {
      //   console.log("WebSocket connection can only be made between Monday to Friday, 9:15 AM to 3:30 PM.");
      // }
    } else {
      this.toastr.error(`No Data found !`);
      return;
    }
  }

  private applyViewGraphOverlapLogic(prevFullScreen: string): void {
    const tf = Number(this.finData?.time_frame);

    const timeFrameMap: Record<number, string> = {
      1: 'daily',
      2: 'sixty',
      3: 'fifteen',
      4: 'one_twenty_five',
      5: 'one_twenty_five',
      6: 'twenty_five',
      25: 'seventy_five',
    };

    const activeMenu = timeFrameMap[tf];

    if (!activeMenu) {
      return;
    }

    const rule: MenuRule | undefined =
      STANDARD_HTF_ZONE_RULES[activeMenu];

    if (!rule) {
      return;
    }

    const memKey = rule.base;

    if (!this.viewGraphOverlapMemory[memKey]) {
      this.viewGraphOverlapMemory[memKey] = {
        htf: false,
        qualified: false,
      };
    }

    const mem = this.viewGraphOverlapMemory[memKey];

    const previousWasBaseLike =
      this.isExecutionBaseLikeChart(prevFullScreen);

    const currentIsBaseLike =
      this.isExecutionBaseLikeChart(this.FullScreenModeValue);

    /*
     * 1. Leaving a base-like chart.
     *
     * For execution 60, both sixty and seventy_five enter here.
     * Therefore HTF enabled on 75 Minute is saved exactly like 60 Minute.
     */
    if (previousWasBaseLike) {
      mem.htf = !!this.selectedOptions['htf_zone'];
      mem.qualified = !!this.selectedOptions['qualified_zones'];
    }

    /*
     * 2. Leaving a real HTF child.
     *
     * Examples:
     * 60 execution -> Weekly or Daily
     * 15 execution -> Daily or Sixty
     */
    const previousWasHtfChild =
      !previousWasBaseLike &&
      !!rule.htf_zone?.[prevFullScreen];

    if (previousWasHtfChild) {
      mem.htf =
        !!this.selectedOptions['optimized_buy_sell_zone'];
    }

    /*
     * 3. Restore base controls on all base-like charts.
     *
     * Execution 60:
     * sixty and seventy_five restore the same HTF state.
     */
    if (currentIsBaseLike) {
      this.selectedOptions['htf_zone'] = mem.htf;
      this.selectedOptions['qualified_zones'] = mem.qualified;
    } else {
      this.selectedOptions['htf_zone'] = false;
      this.selectedOptions['qualified_zones'] = false;
    }

    /*
     * 4. Disable old overlap controls.
     */
    this.selectedOptions['overlap_evaluate'] = false;
    this.selectedOptions['overlap_analyze'] = false;

    /*
     * 5. Clear child-computed state before applying the new screen.
     */
    this.selectedOptions['optimized_buy_sell_zone'] = false;

    /*
     * 6. Apply optimized zones only on actual HTF children.
     *
     * seventy_five is intentionally excluded because it is base-like.
     */
    if (mem.htf && !currentIsBaseLike) {
      const patch =
        rule.htf_zone?.[this.FullScreenModeValue];

      if (patch) {
        Object.assign(this.selectedOptions, patch);
      }
    }

    /*
     * 7. Setup and optimized zones should not display together.
     */
    if (this.selectedOptions['optimized_buy_sell_zone']) {
      this.selectedOptions['setup'] = false;
    }

    console.log('Execution timeframe:', tf);
    console.log('Active menu:', activeMenu);
    console.log('Previous chart:', prevFullScreen);
    console.log('Current chart:', this.FullScreenModeValue);
    console.log('Previous was base-like:', previousWasBaseLike);
    console.log('Current is base-like:', currentIsBaseLike);
    console.log('HTF memory:', mem);
    console.log('Selected options:', this.selectedOptions);
  }

  private getHtfZoneKeysByExecutionTimeframe(): string[] {
    const tf = Number(this.finData.time_frame);

    const map: Record<number, string[]> = {
      1: ["monthly", "weekly"],              // Daily execution -> Monthly + Weekly HTF
      2: ["weekly", "daily"],                // 60 Min execution -> Weekly + Daily HTF
      3: ["daily", "sixty"],                 // 15 Min execution -> Daily + 60 Min HTF
      4: ["monthly", "weekly"],              // 125 Min execution -> Monthly + Weekly HTF
      5: ["weekly", "daily"],                // 75/125 related flow -> Weekly + Daily HTF
      6: ["daily", "one_twenty_five"],       // 25 Min execution -> Daily + 125 Min HTF
      25: ["weekly", "daily"],              // 75 Min execution -> Weekly + Daily HTF
    };

    return map[tf] || [];
  }

  private getHtfLabel(tfKey: string): string {
    const labelMap: Record<string, string> = {
      monthly: "Monthly",
      weekly: "Weekly",
      daily: "Daily",
      seventy_five: "75 Min",
      sixty: "60 Min",
      one_twenty_five: "125 Min",
      twenty_five: "25 Min",
      fifteen: "15 Min",
    };

    return labelMap[tfKey] || tfKey;
  }

  private getHtfOverlayData(tfKey: string, side: "Buy" | "Sell"): any {
    const isSeventyFive = this.FullScreenModeValue === "seventy_five";

    if (side === "Buy") {
      if (isSeventyFive && this.BuyOverlayDataonSeventyFive?.[tfKey]) {
        return this.BuyOverlayDataonSeventyFive[tfKey];
      }

      return this.BuyOverlayData?.[tfKey] || {};
    }

    if (isSeventyFive && this.SellOverlayDataonSeventyFive?.[tfKey]) {
      return this.SellOverlayDataonSeventyFive[tfKey];
    }

    return this.SellOverlayData?.[tfKey] || {};
  }

  private drawSingleHtfZone(
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

    for (let item of Object.values(buyArray || {})) {
      this.rectangleTool.addRectanglesFromData(item, {
        fillColor: buyfillColor,
        outlineColor: buyoutlineColor,
        outlineWidth: 0.5,
        text: label,
        textColor: buytextColor
      });
    }

    for (let item of Object.values(sellArray || {})) {
      this.rectangleTool.addRectanglesFromData(item, {
        fillColor: sellfillColor,
        outlineColor: selloutlineColor,
        outlineWidth: 0.5,
        text: label,
        textColor: selltextColor
      });
    }
  }

  private drawHtfZones(
    buyfillColor: string,
    buyoutlineColor: string,
    buytextColor: string,
    sellfillColor: string,
    selloutlineColor: string,
    selltextColor: string
  ): void {
    const htfKeys = this.getHtfZoneKeysByExecutionTimeframe();

    for (const tfKey of htfKeys) {
      this.drawSingleHtfZone(
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

  private getParentAnalyzeTfKeyForCurrentChart(): string | null {
    const tf = Number(this.finData?.time_frame);

    const timeFrameMap: Record<number, string> = {
      1: 'daily',
      2: 'sixty',
      3: 'fifteen',
      4: 'one_twenty_five',
      5: 'one_twenty_five',
      6: 'twenty_five',
      25: 'seventy_five',
    };

    const activeMenu = timeFrameMap[tf];

    if (!activeMenu) {
      return null;
    }

    const rule = STANDARD_HTF_ZONE_RULES[activeMenu];

    if (!rule?.htf_zone) {
      return null;
    }

    /*
     * seventy_five is base-like, not an optimized child.
     * Therefore it should not have a parent Analyze zone here.
     */
    if (
      this.isExecutionBaseLikeChart(
        this.FullScreenModeValue
      )
    ) {
      return null;
    }

    const htfKeys = Object.keys(rule.htf_zone);
    const currentIndex =
      htfKeys.indexOf(this.FullScreenModeValue);

    if (currentIndex <= 0) {
      return null;
    }

    return htfKeys[currentIndex - 1];
  }

  private drawParentAnalyzeZoneOnChildChart(
    buyfillColor: string,
    buyoutlineColor: string,
    buytextColor: string,
    sellfillColor: string,
    selloutlineColor: string,
    selltextColor: string
  ): void {

    const parentTfKey = this.getParentAnalyzeTfKeyForCurrentChart();

    if (!parentTfKey) {
      return;
    }

    const zoneData = this.AnalyzeOverlayData;

    if (!zoneData) {
      console.log("No AnalyzeOverlayData found for:", parentTfKey);
      return;
    }

    const label = this.getHtfLabel(parentTfKey);

    const buyZones = zoneData?.Buy || [];
    const sellZones = zoneData?.Sell || [];

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


  CloseFullModal() {
    this.EntryPrice = null;
    this.TargetPrice = null;
    this.StoplossPrice = null;
    this.clearManualZoneDrawings();
    this.clearChartDrawingItems();
    this.fincreateformForMannualSetup.reset();
    this.submittedForMannual = false;
    this.syncTradeSetupValuesFromTradeTigerTool(false);
    // ✅ Remove all placed horizontal lines from the chart
    if (this.horizontalLines && this.horizontalLines.length > 0) {
      this.horizontalLines.forEach((line) => {
        this.chart.removeSeries(line.series);
      });
      this.horizontalLines = [];
    }

    this.entryEnabled = true;
    this.targetEnabled = true;
    this.stoplossEnabled = true;

    // ✅ Remove preview line if any
    if (this.previewLine) {
      this.chart.removeSeries(this.previewLine);
      this.previewLine = null;
    }

    // ✅ Unsubscribe event listeners if still active
    if (this.boundShowPreviewLine) {
      this.chart.unsubscribeCrosshairMove(this.boundShowPreviewLine);
      this.boundShowPreviewLine = null;
    }
    if (this.boundFixLineAtPrice) {
      this.chart.unsubscribeClick(this.boundFixLineAtPrice);
      this.boundFixLineAtPrice = null;
    }

    // ✅ Reset placement mode
    this.placementMode = 'none';

    // ✅ Clear selected line (if any was selected for delete or drag)
    this.selectedLine = null;

    // ✅ Enable chart interactions again (if disabled during drag)
    this.chart.applyOptions({ handleScroll: true, handleScale: true });
    if (this.isReplayPlaying) {
      alert('Please Close Bar Replay !');
      return;
    }
    // this.paths = [];
    // this.currentPath = null;
    // const canvas = this.drawingCanvas.nativeElement;
    // const ctx = canvas.getContext('2d');
    // this.redrawCanvas();
    // ctx?.clearRect(0, 0, canvas.width, canvas.height);
    this.disconnectWebSocket();
    this.isNotificationVisible = false;
    this.updateModelPredictionFlag = false;
    this.TrackFullScreenMode = false;
    this.ModelPrediction = '';
    this.CreateButtonFlag = false;
    this.cleanupChart();
    this.selectedOption = '';
    this.dropdownShow = false;
    this.selectedOptions = {
      base_candle: false,
      buy_sell_zone: false,
      bad_zone: false,
      setup: false,
    };
    const leftBar = document.getElementById('leftBar');
    if (leftBar!.classList.contains('open')) {
      leftBar!.classList.remove('open');
    }
    const leftPanel = document.getElementById('leftPanel');
    if (leftPanel) {
      leftPanel.classList.remove('open');
    }
    this.isReplayMode = false;
    this.CancelReplayClicked = true;
    this.replayMode = false;
    this.replayVisibleData = [];
    this.replayFutureData = [];
    this.closeButtonHide.nativeElement.click();
    this.modalalert.hide();
    this.submitStock = false;
  }

  cleanupChart() {
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }

  cleanup(): void {
    if (this.chart) {
      this.chart.remove();
    }
  }


  checkboxClicked(option: string) {
    const buyfillColor = 'rgba(16, 185, 129, 0.10)';
    const buyoutlineColor = '#059669';
    const buytextColor = '#065f46';
    const sellfillColor = 'rgba(225, 29, 72, 0.10)';
    const selloutlineColor = '#be123c';
    const selltextColor = '#881337';
    this.buyZoneMarkers = [];
    this.candlestickSeries.setMarkers([]);
    this.selectedOptions[option] = !this.selectedOptions[option];
    let result = this.checkOptions();
    if (result == false) {
      if (this.rectangleTool) {
        this.rectangleTool.removeAllRectangles();
      }
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
        let buy_array: any[] = [];
        let sell_array: any[] = [];

        buy_array = Object.values(this.QualifiedData?.['Buy'] || {});
        sell_array = Object.values(this.QualifiedData?.['Sell'] || {});

        const buyOverlap = this.markOverlappingZones(buy_array);
        const sellOverlap = this.markOverlappingZones(sell_array);

        if (buy_array.length > 0) {
          buy_array.forEach((item: any, index: number) => {
            const isOverlap = buyOverlap.has(index);

            this.rectangleTool.addRectanglesFromData(item, {
              fillColor: isOverlap
                ? 'rgba(46, 204, 113, 0.38)'
                : 'rgba(0,255,0,0.2)',
              outlineColor: isOverlap
                ? 'rgba(22, 160, 133, 1)'
                : 'rgba(0, 255, 0, 0.4)',
              outlineWidth: isOverlap ? 1 : 0
            });
          });
        }

        if (sell_array.length > 0) {
          sell_array.forEach((item: any, index: number) => {
            const isOverlap = sellOverlap.has(index);

            this.rectangleTool.addRectanglesFromData(item, {
              fillColor: isOverlap
                ? 'rgba(239, 68, 68, 0.35)'
                : 'rgba(255,51,51,0.2)',
              outlineColor: isOverlap
                ? 'rgba(185, 28, 28, 1)'
                : 'rgba(255, 51, 51, 0.45)',
              outlineWidth: isOverlap ? 1 : 0
            });
          });
        }
      }

      if (this.selectedOptions['all_zones']) {
        const array = this.AllZonesData[this.FullScreenModeValue];

        const fillColorBuy = 'rgba(50,50,50,0.5)';
        const fillColorSell = 'rgba(50,50,50,0.5)';

        const buy_array = array['Buy'];
        const sell_array = array['Sell'];

        const zoneMarkers: any[] = [];

        for (let item of Object.values(buy_array)) {
          const rect = item as { time: number; price: number }[];
          this.rectangleTool.addRectanglesFromData(rect, { fillColor: fillColorBuy });

          const midTime = Math.floor(
            (rect[0].time + rect[rect.length - 1].time) / 2
          );

          zoneMarkers.push({
            time: midTime,
            position: 'belowBar',
            color: 'green',
            shape: 'arrowUp',
            text: 'Buy',
          });
        }

        for (let item of Object.values(sell_array)) {
          const rect = item as { time: number; price: number }[];
          this.rectangleTool.addRectanglesFromData(rect, { fillColor: fillColorSell });

          const midTime = Math.floor(
            (rect[0].time + rect[rect.length - 1].time) / 2
          );

          zoneMarkers.push({
            time: midTime,
            position: 'aboveBar',
            color: 'red',
            shape: 'arrowDown',
            text: 'Sell',
          });
        }

        zoneMarkers.sort((a, b) => a.time - b.time);
        this.candlestickSeries.setMarkers(zoneMarkers);
      }

      if (this.selectedOptions['base_candle']) {
        this.showmsg = 'Fetching Base Candle Data !';
        // const buyZoneMarkers = [];
        this.buyZoneMarkers = [];
        const fillColor = 'rgba(51,153,255,0.3)';
        const array = this.BaseCandleData[this.FullScreenModeValue];
        for (let item of array) {
          this.buyZoneMarkers.push({
            time: item,
            position: 'aboveBar',
            color: 'blue',
            shape: 'arrowDown',
            text: 'B',
          });
        }
        this.candlestickSeries.setMarkers(this.buyZoneMarkers);
      }

      if (this.selectedOptions['buy_sell_zone']) {
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        var buy_array = this.BuyZoneData[this.FullScreenModeValue];
        console.log(buy_array);
        for (let item of Object.values(buy_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(255,51,51,0.2)';
        var sell_array = this.SellZoneData[this.FullScreenModeValue];
        console.log(sell_array);
        for (let item of Object.values(sell_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }
      }

      if (this.selectedOptions['bad_zone']) {
        this.BadZoneData = [];
        this.apiService
          .GetBadZoneDataService(this.finData)
          .subscribe((resp) => {
            this.BadZoneData = resp.response;
            let array = this.BadZoneData[this.FullScreenModeValue];
            const fillColor = 'rgba(41, 3, 3, 0.21)';
            for (let item of Object.values(array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColor });
            }
          });
      }

      if (this.selectedOptions['htf_zone']) {
        this.drawHtfZones(
          buyfillColor,
          buyoutlineColor,
          buytextColor,
          sellfillColor,
          selloutlineColor,
          selltextColor
        );
      }

      if (this.selectedOptions['optimized_buy_sell_zone']) {
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        let buy_array = null;
        buy_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
        for (let item of Object.values(buy_array.Buy)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(255,51,51,0.2)';
        let sell_array = null;
        sell_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
        for (let item of Object.values(sell_array.Sell)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }

        this.drawParentAnalyzeZoneOnChildChart(
          buyfillColor,
          buyoutlineColor,
          buytextColor,
          sellfillColor,
          selloutlineColor,
          selltextColor
        );
      }

      if (this.selectedOptions['gap_up_down']) {
        const fillColor = 'rgba(183,199,21, 1)'; // Green for Gap Up
        const fillColor2 = 'rgba(189, 70, 25, 1)'; // Red for Gap Down

        const gapData = this.GapUpDownData[this.FullScreenModeValue];

        // Initialize marker arrays if needed
        const gapMarkers: any[] = [];

        // Gap Up
        for (let item of Object.values(gapData.gap_ups)) {
          const rect = item as { time: number; price: number }[];
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColor });

          // Add Up Arrow Marker
          gapMarkers.push({
            time: rect[0].time, // assuming 'time' exists in item
            position: 'belowBar',
            color: 'green',
            shape: 'arrowUp',
            text: 'Gap Up',
          });
        }

        // Gap Down
        for (let item of Object.values(gapData.gap_downs)) {
          const rect = item as { time: number; price: number }[];
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColor2 });

          // Add Down Arrow Marker
          gapMarkers.push({
            time: rect[0].time,
            position: 'aboveBar',
            color: 'red',
            shape: 'arrowDown',
            text: 'Gap Down',
          });
        }
        gapMarkers.sort((a, b) => a.time - b.time);
        // Finally, set the markers on your series
        const allMarkers = [...gapMarkers, ...this.buyZoneMarkers];
        allMarkers.sort((a, b) => a.time - b.time);
        this.candlestickSeries.setMarkers(allMarkers);
      }

      if (this.selectedOptions['setup']) {
        this.dropdownShow = true;
      } else {
        this.dropdownShow = false;
        if (this.buylineSeries) {
          this.buylineSeries.setMarkers([]);
          this.buylineSeries.setData([]);
        }
        if (this.targetlineSeries) {
          this.targetlineSeries.setMarkers([]);
          this.targetlineSeries.setData([]);
        }
        if (this.stoplosslineSeries) {
          this.stoplosslineSeries.setMarkers([]);
          this.stoplosslineSeries.setData([]);
        }
      }
    } else {
      this.dropdownShow = false;
      this.candlestickSeries.setMarkers([]);
      this.rectangleTool.removeAllRectangles();
      if (this.buylineSeries) {
        this.buylineSeries.setMarkers([]);
        this.buylineSeries.setData([]);
      }
      if (this.targetlineSeries) {
        this.targetlineSeries.setMarkers([]);
        this.targetlineSeries.setData([]);
      }
      if (this.stoplosslineSeries) {
        this.stoplosslineSeries.setMarkers([]);
        this.stoplosslineSeries.setData([]);
      }
    }
  }

  markOverlappingZones(zones: any[]) {
    const overlappingIndexes = new Set<number>();

    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        if (this.isOverlapping(zones[i], zones[j])) {
          overlappingIndexes.add(i);
          overlappingIndexes.add(j);

          console.log('Overlap found:', i, j);
          console.log('Zone 1:', this.getZoneBounds(zones[i]));
          console.log('Zone 2:', this.getZoneBounds(zones[j]));
        }
      }
    }

    return overlappingIndexes;
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


  checkOptions(): boolean {
    for (let key in this.selectedOptions) {
      if (this.selectedOptions[key]) {
        return false;
      }
    }
    return true;
  }

  radioClicked(key: any) {
    if (this.selectedOption === key) {
      this.candlestickSeries.setMarkers([]);
      this.rectangleTool.removeAllRectangles();
      this.selectedOption = null;
      return;
    } else {
      this.selectedOption = key;
    }
    this.key = key;
    if (this.buylineSeries) {
      this.buylineSeries.setMarkers([]);
      this.buylineSeries.setData([]);
    }

    if (this.targetlineSeries) {
      this.targetlineSeries.setMarkers([]);
      this.targetlineSeries.setData([]);
    }
    if (this.stoplosslineSeries) {
      this.stoplosslineSeries.setMarkers([]);
      this.stoplosslineSeries.setData([]);
    }
    this.candlestickSeries.setMarkers([]);
    this.rectangleTool.removeAllRectangles();

    if (key == 'base_candle') {
      this.ModelPrediction = '';
      this.dropdownShow = false;
      const fillColor = 'rgba(51,153,255,0.3)';
      var array = this.BaseCandleData[this.FullScreenModeValue];
      for (let item of Object.values(array)) {
        this.rectangleTool.addRectanglesFromData(item, fillColor);
      }
    }

    if (key == 'buy_sell_zone') {
      this.ModelPrediction = '';
      this.dropdownShow = false;
      const fillColorBuy = 'rgba(0,255,0,0.3)';
      var buy_array = this.BuyZoneData[this.FullScreenModeValue];
      for (let item of Object.values(buy_array)) {
        this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
      }
      const fillColorSell = 'rgba(255,51,51,0.3)';
      var sell_array = this.SellZoneData[this.FullScreenModeValue];
      for (let item of Object.values(sell_array)) {
        this.rectangleTool.addRectanglesFromData(item, fillColorSell);
      }
      var gapData = this.GapData[this.FullScreenModeValue];
      // Gap Up
      // const gapupcolour = 'rgba(0, 0, 0, 0.5)'
      // for (let item of Object.values(gapData.GAP_UP)) {
      //   this.rectangleTool.addRectanglesFromData(item, gapupcolour);
      // }
      // // Gap Down
      // for (let item of Object.values(gapData.GAP_DOWN)) {
      //   this.rectangleTool.addRectanglesFromData(item, gapupcolour);
      // }
    }

    if (key == 'price_marker') {
      this.ModelPrediction = '';
      this.dropdownShow = false;
      const buyZoneMarkers = [];
      const buyZoneData = this.BuyZoneData[this.FullScreenModeValue];
      const sellZoneData = this.SellZoneData[this.FullScreenModeValue];
      for (const item of buyZoneData) {
        if (
          item[0] &&
          item[1] &&
          item[0].price !== undefined &&
          item[1].price !== undefined
        ) {
          buyZoneMarkers.push(
            {
              time: item[1].act,
              position: 'aboveBar',
              color: 'green',
              text: `H: ${item[1].price.toFixed(2)}`,
            },
            {
              time: item[0].act,
              position: 'belowBar',
              color: 'green',
              text: `L: ${item[0].price.toFixed(2)}`,
            }
          );
        } else {
          console.warn('Encountered an item with undefined price:', item);
        }
      }
      for (const item of sellZoneData) {
        if (
          item[0] &&
          item[1] &&
          item[0].price !== undefined &&
          item[1].price !== undefined
        ) {
          buyZoneMarkers.push(
            {
              time: item[1].act,
              position: 'aboveBar',
              color: 'green',
              text: `H: ${item[1].price.toFixed(2)}`,
            },
            {
              time: item[0].act,
              position: 'belowBar',
              color: 'green',
              text: `L: ${item[0].price.toFixed(2)}`,
            }
          );
        } else {
          console.warn('Encountered an item with undefined price:', item);
        }
      }
      buyZoneMarkers.sort((a, b) => a.time - b.time);
      this.buy_sell_zone();
      this.candlestickSeries.setMarkers(buyZoneMarkers);
    }

    if (key == 'bad_zone') {
      this.ModelPrediction = '';
      this.dropdownShow = false;
      this.BadZoneData = [];
      this.showmsg = 'Fetching Bad Zone Data !';
      this.spinner.show();
      this.apiService.GetBadZoneDataService(this.finData).subscribe((resp) => {
        this.BadZoneData = resp.response;
        let array = this.BadZoneData[this.FullScreenModeValue];
        const fillColor = 'rgba(249, 3, 3, 0.21)';
        for (let item of Object.values(array)) {
          this.rectangleTool.addRectanglesFromData(item, fillColor);
        }
        this.spinner.hide();
      });
    }

    if (key == 'setup') {
      this.dropdownShow = true;
    }
  }

  addEntryPriceLine(price: number, time: any, extendedtime: any) {
    let RRR = null;
    if (this.SETUPTYPE == 'BUY') {
      RRR = this.setupData['BUY_RRR'];
    } else {
      RRR = this.setupData['SELL_RRR'];
    }

    this.buylineSeries = this.chart.addLineSeries({
      color: 'blue',
      lineWidth: 2,
      priceLineVisible: false,
      priceLineColor: 'blue',
      priceLineWidth: 2,
    });

    // Initial line setup
    const lineData = [
      { time: time, value: price },
      { time: time + extendedtime, value: price },
    ];

    this.buylineSeries.setData(lineData);
    this.buylineSeries.setMarkers([
      {
        time: time,
        position: 'aboveBar',
        color: 'blue',
        text: `R-R : ${RRR}`,
      },
      {
        time: time,
        position: 'aboveBar',
        color: 'blue',
        text: `Entry : ${price.toFixed(2)}`,
      },
    ]);

    // Enable dragging functionality
    this.EntryPrice = price;
    this.EntryTime = time;
    this.makeLineDraggable(price, time, extendedtime);
  }

  makeLineDraggable(
    initialPrice: number,
    initialStartTime: any,
    initialEndTime: any
  ) {
    let isDragging = false;
    let currentPrice = initialPrice;
    let currentStartTime = initialStartTime;
    let currentEndTime = initialEndTime;
    let clickOffsetPrice = 0;
    let clickOffsetTime = 0;
    const pixelThreshold = 6;
    const chartElement = document.getElementById('chart-container_new');

    const disableChartInteractions = () => {
      this.chart.applyOptions({ handleScroll: false, handleScale: false });
    };

    const enableChartInteractions = () => {
      this.chart.applyOptions({ handleScroll: true, handleScale: true });
    };

    chartElement?.addEventListener('mousedown', (event) => {
      const chartRect = chartElement.getBoundingClientRect();
      const yCoordinate = event.clientY - chartRect.top;
      const xCoordinate = event.clientX - chartRect.left;

      const mousePrice = this.buylineSeries.coordinateToPrice(yCoordinate);
      const mouseTime = this.chart.timeScale().coordinateToTime(xCoordinate);
      const lineY = this.buylineSeries.priceToCoordinate(currentPrice);

      if (
        Math.abs(yCoordinate - lineY) < pixelThreshold &&
        mouseTime >= currentStartTime &&
        mouseTime <= currentEndTime
      ) {
        isDragging = true;
        clickOffsetPrice = currentPrice - mousePrice;
        clickOffsetTime = currentStartTime - mouseTime;
        disableChartInteractions();
      }
    });

    chartElement?.addEventListener('mousemove', (event) => {
      if (!isDragging) return;

      const chartRect = chartElement.getBoundingClientRect();
      const yCoordinate = event.clientY - chartRect.top;
      const xCoordinate = event.clientX - chartRect.left;

      let newPrice =
        this.buylineSeries.coordinateToPrice(yCoordinate) + clickOffsetPrice;
      let newTime =
        this.chart.timeScale().coordinateToTime(xCoordinate) + clickOffsetTime;

      this.buylineSeries.setData([
        { time: currentStartTime, value: newPrice },
        { time: currentEndTime, value: newPrice },
      ]);

      this.buylineSeries.setMarkers([
        {
          time: newTime,
          position: 'aboveBar',
          color: 'green',
          text: `Entry: ${newPrice.toFixed(2)}`,
        },
      ]);

      this.updateModelPredictionFlag = true;
      currentPrice = newPrice;
      currentStartTime = newTime;
      this.EntryPrice = newPrice;
      this.EntryTime = newTime;
      let type = '';
      if (this.SETUPTYPE === 'BUY') {
        type = 'Buy';
      } else {
        type = 'Sell';
      }

      this.fincreateform.patchValue({
        order_type: type,
        entry_price: this.EntryPrice.toFixed(2),
        stoploss_price: this.StoplossPrice.toFixed(2),
        target_price: this.TargetPrice.toFixed(2),
      });

      const RRR = this.calculateRRR();
      this.updateMarkers(this.EntryPrice, RRR, this.EntryTime);
    });

    chartElement?.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        enableChartInteractions();
      }
    });

    chartElement?.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        enableChartInteractions();
      }
    });
  }

  disableChartInteractions() {
    this.chart.applyOptions({
      handleScroll: false,
      handleScale: false,
      priceScale: {
        autoScale: false, // Lock auto-scaling
        lockScale: true, // Prevent scaling adjustments
      },
      crosshair: {
        mode: 0,
      },
    });
  }

  addTargetPriceLine(price: number, time: any, extendedtime: any) {
    this.targetlineSeries = this.chart.addLineSeries({
      color: 'green',
      lineWidth: 2,
      priceLineVisible: false,
      priceLineColor: 'green',
      priceLineWidth: 2,
    });

    this.targetlineSeries.setData([
      { time: time, value: price },
      { time: time + extendedtime, value: price },
    ]);

    this.targetlineSeries.setMarkers([
      {
        time: time,
        position: 'aboveBar',
        color: 'green',
        text: `Target : ${price.toFixed(2)}`,
      },
    ]);
    this.TargetPrice = price;
    // Make the target price line draggable
    this.makeTargetLineDraggable(price, time, extendedtime);
  }

  makeTargetLineDraggable(
    initialPrice: number,
    initialStartTime: any,
    initialEndTime: any
  ) {
    let isDragging = false;
    let currentPrice = initialPrice;
    let currentStartTime = initialStartTime;
    let currentEndTime = initialEndTime;
    let clickOffsetPrice = 0;
    let clickOffsetTime = 0;
    const pixelThreshold = 6; // Replacing price-based threshold with pixel-based
    const chartElement = document.getElementById('chart-container_new');

    const disableChartInteractions = () => {
      this.chart.applyOptions({
        handleScroll: false,
        handleScale: false,
        priceScale: {
          autoScale: false,
          mode: 1,
          lockScale: true,
        },
      });
    };

    const enableChartInteractions = () => {
      this.chart.applyOptions({
        handleScroll: true,
        handleScale: true,
        priceScale: {
          autoScale: true,
        },
      });
    };

    chartElement?.addEventListener('mousedown', (event) => {
      const chartRect = chartElement.getBoundingClientRect();
      const yCoordinate = event.clientY - chartRect.top;
      const xCoordinate = event.clientX - chartRect.left;

      const mousePrice = this.targetlineSeries.coordinateToPrice(yCoordinate);
      const mouseTime = this.chart.timeScale().coordinateToTime(xCoordinate);
      const lineY = this.targetlineSeries.priceToCoordinate(currentPrice);

      if (
        Math.abs(yCoordinate - lineY) < pixelThreshold &&
        mouseTime >= currentStartTime &&
        mouseTime <= currentEndTime
      ) {
        isDragging = true;
        clickOffsetPrice = currentPrice - mousePrice;
        clickOffsetTime = currentStartTime - mouseTime;
        disableChartInteractions();
      }
    });

    chartElement?.addEventListener('mousemove', (event) => {
      if (!isDragging) return;

      const chartRect = chartElement.getBoundingClientRect();
      const yCoordinate = event.clientY - chartRect.top;
      const xCoordinate = event.clientX - chartRect.left;

      const newPrice =
        this.targetlineSeries.coordinateToPrice(yCoordinate) + clickOffsetPrice;
      const newTime =
        this.chart.timeScale().coordinateToTime(xCoordinate) + clickOffsetTime;

      this.targetlineSeries.setData([
        { time: currentStartTime, value: newPrice },
        { time: currentEndTime, value: newPrice },
      ]);

      this.targetlineSeries.setMarkers([
        {
          time: newTime,
          position: 'aboveBar',
          color: 'green',
          text: `Target: ${newPrice.toFixed(2)}`,
        },
      ]);

      this.updateModelPredictionFlag = true;
      currentPrice = newPrice;
      currentStartTime = newTime;
      this.TargetPrice = newPrice;
      let type = '';
      if (this.SETUPTYPE === 'BUY') {
        type = 'Buy';
      } else {
        type = 'Sell';
      }

      this.fincreateform.patchValue({
        order_type: type,
        entry_price: this.EntryPrice.toFixed(2),
        stoploss_price: this.StoplossPrice.toFixed(2),
        target_price: this.TargetPrice.toFixed(2),
      });

      const RRR = this.calculateRRR();
      this.updateMarkers(this.EntryPrice, RRR, this.EntryTime);
    });

    chartElement?.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        enableChartInteractions();
      }
    });

    chartElement?.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        enableChartInteractions();
      }
    });
  }

  addStoplossPriceLine(price: number, time: any, extendedtime: any) {
    this.stoplosslineSeries = this.chart.addLineSeries({
      color: 'red',
      lineWidth: 2,
      priceLineVisible: false,
      priceLineColor: 'red',
      priceLineWidth: 2,
    });

    this.stoplosslineSeries.setData([
      { time: time, value: price },
      { time: time + extendedtime, value: price },
    ]);

    this.stoplosslineSeries.setMarkers([
      {
        time: time,
        position: 'belowBar',
        color: 'red',
        text: `Stoploss : ${price.toFixed(2)}`,
      },
    ]);
    this.StoplossPrice = price;
    this.makeStoplossLineDraggable(price, time, extendedtime);
  }

  makeStoplossLineDraggable(
    initialPrice: number,
    initialStartTime: any,
    initialEndTime: any
  ) {
    let isDragging = false;
    let currentPrice = initialPrice;
    let currentStartTime = initialStartTime;
    let currentEndTime = initialEndTime;
    let clickOffsetPrice = 0;
    let clickOffsetTime = 0;
    const pixelThreshold = 6; // Pixel proximity
    const chartElement = document.getElementById('chart-container_new');

    // Disable chart panning, scrolling, and auto-scaling
    const disableChartInteractions = () => {
      this.chart.applyOptions({
        handleScroll: false,
        handleScale: false,
        priceScale: {
          autoScale: false,
          mode: 1,
          lockScale: true,
        },
      });
    };

    // Enable chart panning, scrolling, and auto-scaling
    const enableChartInteractions = () => {
      this.chart.applyOptions({
        handleScroll: true,
        handleScale: true,
        priceScale: {
          autoScale: true,
        },
      });
    };

    chartElement?.addEventListener('mousedown', (event) => {
      const chartRect = chartElement.getBoundingClientRect();
      const yCoordinate = event.clientY - chartRect.top;
      const xCoordinate = event.clientX - chartRect.left;

      const mousePrice = this.stoplosslineSeries.coordinateToPrice(yCoordinate);
      const mouseTime = this.chart.timeScale().coordinateToTime(xCoordinate);
      const lineY = this.stoplosslineSeries.priceToCoordinate(currentPrice);

      if (
        Math.abs(yCoordinate - lineY) < pixelThreshold &&
        mouseTime >= currentStartTime &&
        mouseTime <= currentEndTime
      ) {
        isDragging = true;
        clickOffsetPrice = currentPrice - mousePrice;
        clickOffsetTime = currentStartTime - mouseTime;
        disableChartInteractions();
      }
    });

    chartElement?.addEventListener('mousemove', (event) => {
      if (!isDragging) return;

      const chartRect = chartElement.getBoundingClientRect();
      const yCoordinate = event.clientY - chartRect.top;
      const xCoordinate = event.clientX - chartRect.left;

      const newPrice =
        this.stoplosslineSeries.coordinateToPrice(yCoordinate) +
        clickOffsetPrice;
      const newTime =
        this.chart.timeScale().coordinateToTime(xCoordinate) + clickOffsetTime;

      this.stoplosslineSeries.setData([
        { time: currentStartTime, value: newPrice },
        { time: currentEndTime, value: newPrice },
      ]);

      this.stoplosslineSeries.setMarkers([
        {
          time: newTime,
          position: 'belowBar',
          color: 'red',
          text: `Stoploss: ${newPrice.toFixed(2)}`,
        },
      ]);

      this.updateModelPredictionFlag = true;
      currentPrice = newPrice;
      currentStartTime = newTime;
      this.StoplossPrice = newPrice;
      let type = '';
      if (this.SETUPTYPE === 'BUY') {
        type = 'Buy';
      } else {
        type = 'Sell';
      }

      this.fincreateform.patchValue({
        order_type: type,
        entry_price: this.EntryPrice.toFixed(2),
        stoploss_price: this.StoplossPrice.toFixed(2),
        target_price: this.TargetPrice.toFixed(2),
      });

      const RRR = this.calculateRRR();
      this.updateMarkers(this.EntryPrice, RRR, this.EntryTime);
    });

    chartElement?.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        enableChartInteractions();
      }
    });

    chartElement?.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        enableChartInteractions();
      }
    });
  }

  addPreviousHighPriceLine(key: any) {
    const previousHigh = this.PreviousHighData?.[key]?.previous_high;

    if (!previousHigh || previousHigh.price == null || isNaN(previousHigh.price)) {
      return; // bypass if not found / invalid
    }

    const myPriceLine = {
      price: previousHigh.price,
      color: '#f5d131',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Previous High',
    };

    this.candlestickSeries?.createPriceLine(myPriceLine);
  }

  calculateRRR(): number {
    // Calculate risk and reward using absolute values
    const risk = Math.abs(this.EntryPrice - this.StoplossPrice); // Calculate risk
    const reward = Math.abs(this.TargetPrice - this.EntryPrice); // Calculate reward

    // Check to avoid division by zero
    if (risk === 0) {
      return Infinity; // or return null or handle as needed
    }

    const riskToRewardRatio = reward / risk; // Calculate the risk-to-reward ratio
    return riskToRewardRatio; // Return the risk-to-reward ratio
  }

  updateMarkers(price: number, RRR: number, time: any) {
    this.buylineSeries.setMarkers([
      {
        time: time,
        position: 'aboveBar',
        color: 'blue',
        text: `R-R :  ${RRR.toFixed(2)}`,
      },
      {
        time: time,
        position: 'aboveBar',
        color: 'blue',
        text: `Entry : ${price.toFixed(2)}`,
      },
    ]);
  }

  buy_sell_zone() {
    const fillColorBuy = 'rgba(0, 96, 15, 0.8)';
    var buy_array = this.BuyZoneData[this.FullScreenModeValue];
    for (let item of Object.values(buy_array)) {
      this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
    }
    const fillColorSell = 'rgba(255,51,51,0.3)';
    var sell_array = this.SellZoneData[this.FullScreenModeValue];
    for (let item of Object.values(sell_array)) {
      this.rectangleTool.addRectanglesFromData(item, fillColorSell);
    }
  }


  setupType(setupType: any) {
    this.entryEnabled = true;
    this.targetEnabled = true;
    this.isDisabled = false;
    this.stoplossEnabled = true;
    this.ViewSetUpAnywayFlag = false;
    this.isDisabled = false;
    this.TradeSetupReason = '';
    this.ModelPrediction = '';
    let RRR = null;

    this.removeAllEntry();
    this.clearTradeTigerSetupLines();
    this.CreateButtonFlag = true;
    this.createBtnFlgForMannualSetup = false;
    this.closeCreateOrderPanel();

    this.EntryPrice = '';
    this.StoplossPrice = '';
    this.TargetPrice = '';

    this.SETUPTYPE = setupType;
    this.updateModelPredictionFlag = false;

    if (setupType == 'BUY') {
      if (this.buylineSeries && !this.buylineSeries.isDisposed) {
        this.buylineSeries.setMarkers([]);
        this.buylineSeries.setData([]);
      }

      if (this.targetlineSeries) {
        this.targetlineSeries.setMarkers([]);
        this.targetlineSeries.setData([]);
      }

      if (this.stoplosslineSeries) {
        this.stoplosslineSeries.setMarkers([]);
        this.stoplosslineSeries.setData([]);
      }

      if (this.setupdataStatus == 'failed') {
        this.ModelPrediction = 'No Prediction Found !';
        this.showMarketAlert(this.ModelPrediction);
        this.CreateButtonFlag = false;
      } else {
        this.BuySetupData = this.setupData[setupType];
        console.log('BUY SETUP BUTTON ON OTHERS', this.BuySetupData);
        if (this.BuySetupData == undefined) {
          this.ModelPrediction = 'NOT A GOOD CONDITION TO TRADE !';
          this.showMarketAlert(this.ModelPrediction);
          this.CreateButtonFlag = false;
        } else {
          this.BuyTimestampData = this.setupData['BUY_TIMESTAMPS'];
          RRR = this.setupData['BUY_RRR'];

          if (RRR < 2.1) {
            this.ViewSetUpAnywayFlag = true;
            const Prediction = 'Not a good condition to trade.';
            const Message = 'RISK TO REWARD not satisfied!';
            this.showMarketAlert2(Prediction, Message);
          } else {
            this.ViewSetUpAnywayFlag = false;

            // NEW: Draw backend BUY setup using Trade Tiger drawing tool
            const setupDrawn = this.drawBackendSetupUsingTradeTigerTool(
              'BUY',
              this.BuySetupData.entry_price,
              this.BuySetupData.target_price,
              this.BuySetupData.stop_loss,
              this.BuyTimestampData.entry_price_timestamp,
              this.BuyTimestampData.target_price_timestamp,
              this.BuyTimestampData.entry_price_timestamp
            );

            if (!setupDrawn) {
              this.CreateButtonFlag = false;
              return;
            }

            const data = {
              order_type: 'Buy',
              entry_price: this.BuySetupData.entry_price,
              target_price: this.BuySetupData.target_price,
              stoploss_price: this.BuySetupData.stop_loss,
              last_d_time: this.finData.last_d_time,
              time_frame: this.finData.time_frame,
              tick: this.finData.tick,
              country_id: localStorage.getItem('selectedCountryId'),
            };

            this.apiService
              .getModelPredictionService(data)
              .subscribe((resp) => {
                console.log('Model Prediction', resp);

                this.ModelPrediction =
                  'PROBABILITY OF TRADE : ' +
                  resp.msg.toUpperCase() +
                  ' = ' +
                  resp.response.probability +
                  ' %';

                this.SelectedPrediction = resp.msg;
                this.SelectedProbability = resp.response.probability;

                this.showMarketAlert(this.ModelPrediction);
              });
          }
        }
      }
    }

    if (setupType == 'SELL') {
      if (this.buylineSeries) {
        this.buylineSeries.setMarkers([]);
        this.buylineSeries.setData([]);
      }

      if (this.targetlineSeries) {
        this.targetlineSeries.setMarkers([]);
        this.targetlineSeries.setData([]);
      }

      if (this.stoplosslineSeries) {
        this.stoplosslineSeries.setMarkers([]);
        this.stoplosslineSeries.setData([]);
      }

      if (this.setupdataStatus == 'failed') {
        this.ModelPrediction = 'No Prediction Found !';
        this.showMarketAlert(this.ModelPrediction);
        this.CreateButtonFlag = false;
      } else {
        this.SellSetupData = this.setupData[setupType];
        console.log('SELL SETUP BUTTON ON OTHERS', this.SellSetupData);

        if (this.SellSetupData == undefined) {
          this.ModelPrediction = 'NOT A GOOD CONDITION TO TRADE !';
          this.showMarketAlert(this.ModelPrediction);
          this.CreateButtonFlag = false;
        } else {
          this.SellTimestampData = this.setupData['SELL_TIMESTAMPS'];
          RRR = this.setupData['SELL_RRR'];

          if (RRR < 1.6) {
            this.ViewSetUpAnywayFlag = true;
            const Prediction = 'Not a good condition to trade.';
            const Message = 'RISK TO REWARD not satisfied!';
            this.showMarketAlert2(Prediction, Message);
          } else {
            this.ViewSetUpAnywayFlag = false;

            // NEW: Draw backend SELL setup using Trade Tiger drawing tool
            const setupDrawn = this.drawBackendSetupUsingTradeTigerTool(
              'SELL',
              this.SellSetupData.entry_price,
              this.SellSetupData.target_price,
              this.SellSetupData.stop_loss,
              this.SellTimestampData.entry_price_timestamp,
              this.SellTimestampData.target_price_timestamp,
              this.SellTimestampData.entry_price_timestamp
            );

            if (!setupDrawn) {
              this.CreateButtonFlag = false;
              return;
            }

            const parsedTimeFrame = parseInt(this.finData.time_frame, 10);

            const data = {
              order_type: 'Buy',
              entry_price: this.SellSetupData.entry_price,
              target_price: this.SellSetupData.target_price,
              stoploss_price: this.SellSetupData.stop_loss,
              last_d_time: this.finData.last_d_time,
              time_frame: this.finData.time_frame,
              tick: this.finData.tick,
              country_id: localStorage.getItem('selectedCountryId'),
            };

            this.spinner.show();

            this.apiService
              .getModelPredictionService(data)
              .subscribe((resp) => {
                this.ModelPrediction =
                  'PROBABILITY OF TRADE : ' +
                  resp.msg.toUpperCase() +
                  ' = ' +
                  resp.response.probability +
                  ' %';

                this.SelectedPrediction = resp.msg;
                this.SelectedProbability = resp.response.probability;

                this.spinner.hide();
                this.showMarketAlert(this.ModelPrediction);
              });
          }
        }
      }
    }
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
      this.toastr?.error?.('Chart drawing tool is not ready yet.');
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
      this.showMarketAlert('Invalid setup price from backend.');
      return false;
    }

    // Same validation rule as your Trade Tiger tool
    if (setupType === 'BUY') {
      if (!(stoploss < entry && entry < target)) {
        this.showMarketAlert(
          'Invalid BUY setup. Correct structure is Stoploss < Entry < Target.'
        );
        return false;
      }
    }

    if (setupType === 'SELL') {
      if (!(target < entry && entry < stoploss)) {
        this.showMarketAlert(
          'Invalid SELL setup. Correct structure is Target < Entry < Stoploss.'
        );
        return false;
      }
    }

    // Remove previous Entry / Target / Stoploss drawing lines from chartDrawingTool.
    // removeDrawingsByType is inside your chartDrawingTool, so using "any" to reuse it.
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

    // Refresh RR text inside chart drawing tool
    try {
      (this.chartDrawingTool as any).refreshTradePriceMetrics?.();
    } catch { }

    try {
      this.chartDrawingTool.setActiveTool('select');
    } catch { }

    // Keep your existing variables updated
    this.EntryPrice = entry;
    this.TargetPrice = target;
    this.StoplossPrice = stoploss;
    this.EntryTime = entryTime;

    this.entryPrice = entry;
    this.targetPrice = target;
    this.stoplossPrice = stoploss;

    const prices = this.chartDrawingTool.getTradePriceValues();

    this.riskReward = prices.rr;
    this.tradeDirection = prices.direction;

    this.tradeLinePlaced = {
      entry: true,
      target: true,
      stoploss: true,
    };

    // Keep saved drawing list updated if you are using chartDrawingItems
    if (Array.isArray(this.chartDrawingItems)) {
      this.chartDrawingItems = this.chartDrawingItems.filter(
        (x: any) =>
          x.type !== 'entryPrice' &&
          x.type !== 'targetPrice' &&
          x.type !== 'stoplossPrice'
      );

      this.chartDrawingItems.push(entryItem, targetItem, stoplossItem);
    }

    const orderType = setupType === 'BUY' ? 'Buy' : 'Sell';

    try {
      this.fincreateform.patchValue({
        order_type: orderType,
        entry_price: entry.toFixed(2),
        stoploss_price: stoploss.toFixed(2),
        target_price: target.toFixed(2),
      });
    } catch { }

    try {
      this.syncTradeLineButtonState();
    } catch { }

    return true;
  }

  private syncTradeSetupValuesFromTradeTigerTool(isUserModified: boolean = true): void {
    if (!this.chartDrawingTool) return;

    const prices = this.chartDrawingTool.getTradePriceLineData();

    if (prices.entry !== null) {
      this.EntryPrice = prices.entry;
      this.entryPrice = prices.entry;
    }

    if (prices.target !== null) {
      this.TargetPrice = prices.target;
      this.targetPrice = prices.target;
    }

    if (prices.stoploss !== null) {
      this.StoplossPrice = prices.stoploss;
      this.stoplossPrice = prices.stoploss;
    }

    if (prices.entryTime !== null) {
      this.EntryTime = prices.entryTime;
    }

    this.riskReward = prices.rr;
    this.tradeDirection = prices.direction;

    this.tradeLinePlaced = {
      entry: prices.entry !== null,
      target: prices.target !== null,
      stoploss: prices.stoploss !== null,
    };

    let type = '';

    if (this.SETUPTYPE === 'BUY') {
      type = 'Buy';
    } else {
      type = 'Sell';
    }

    if (
      prices.entry !== null &&
      prices.target !== null &&
      prices.stoploss !== null
    ) {
      this.fincreateform.patchValue({
        order_type: type,
        entry_price: prices.entry.toFixed(2),
        stoploss_price: prices.stoploss.toFixed(2),
        target_price: prices.target.toFixed(2),
      });
    }

    if (isUserModified) {
      this.updateModelPredictionFlag = true;
    }

    console.log('Backend setup synced from Trade Tiger tool:', prices);
  }

  private clearTradeTigerSetupLines(): void {
    // Clear Trade Tiger drawing tool Entry / Target / Stoploss lines
    if (this.chartDrawingTool) {
      try {
        (this.chartDrawingTool as any).removeDrawingsByType?.('entryPrice');
        (this.chartDrawingTool as any).removeDrawingsByType?.('targetPrice');
        (this.chartDrawingTool as any).removeDrawingsByType?.('stoplossPrice');
      } catch { }
    }

    // Clear saved drawing list also
    if (Array.isArray(this.chartDrawingItems)) {
      this.chartDrawingItems = this.chartDrawingItems.filter(
        (x: any) =>
          x.type !== 'entryPrice' &&
          x.type !== 'targetPrice' &&
          x.type !== 'stoplossPrice'
      );
    }

    // Reset stored values
    this.EntryPrice = '';
    this.TargetPrice = '';
    this.StoplossPrice = '';

    this.entryPrice = null;
    this.targetPrice = null;
    this.stoplossPrice = null;

    this.riskReward = null;
    this.tradeDirection = null;

    this.tradeLinePlaced = {
      entry: false,
      target: false,
      stoploss: false,
    };

    try {
      this.syncTradeLineButtonState();
    } catch { }
  }

  showMarketAlert2(Prediction: any, TrandeMessage: any) {
    this.TradeSetupReason = TrandeMessage;
    this.ModelPrediction = Prediction;
    this.isNotificationVisible = true;
  }

  showMarketAlert(TrandeMessage: any) {
    // this.TradeSetupReason=TrandeMessage;
    this.isNotificationVisible = true;
  }

  closeNotification() {
    this.isNotificationVisible = false;
  }

  UpdatePrediction() {
    this.spinner.show();
    const data = {
      order_type: this.SETUPTYPE,
      entry_price: this.EntryPrice,
      target_price: this.TargetPrice,
      stoploss_price: this.StoplossPrice,
      last_d_time: this.finData.last_d_time,
      time_frame: this.finData.time_frame,
      mod_frame: 'daily',
      tick: this.finData.tick,
      country_id: localStorage.getItem('selectedCountryId'),
    };
    this.apiService.getModelPredictionService(data).subscribe((resp) => {
      this.ModelPrediction =
        'PROBABILITY OF TRADE : ' +
        resp.msg.toUpperCase() +
        ' = ' +
        resp.response.probability +
        ' %';
      this.SelectedPrediction = resp.msg;
      this.SelectedProbability = resp.response.probability;
      this.showMarketAlert(this.ModelPrediction);
      this.spinner.hide();
    });
  }

  enablePriceLine(type: string) {
    this.selectedType = type;
  }

  addPriceLine(type: string, price: number) {
    const priceLineOptions = {
      price: price,
      color: type === 'entry' ? 'blue' : type === 'target' ? 'green' : 'red',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: type.charAt(0).toUpperCase() + type.slice(1),
    };

    this.candlestickSeries.createPriceLine(priceLineOptions);
  }

  onSearchInputChange(value: string): void {
    this.searchSubject.next(value);
  }

  search(value: string) {
    if (value.trim() !== '') {
      this.apiService.SearchStockonKey(value).subscribe((resp) => {
        this.filteredCompanies = resp.response || [];
        this.highlightedIndex = -1; // Reset highlight when list changes
      });
    } else {
      this.filteredCompanies = [];
    }
  }

  onSelectCompany(company: any) {
    this.handleDroppedStock(company);
    this.filteredCompanies = [];
  }

  onKeyDown(event: KeyboardEvent) {
    if (this.filteredCompanies.length > 0) {
      if (event.key === 'ArrowDown') {
        // Navigate down the list
        this.highlightedIndex =
          (this.highlightedIndex + 1) % this.filteredCompanies.length;
        event.preventDefault(); // Prevent default scrolling
      } else if (event.key === 'ArrowUp') {
        // Navigate up the list
        this.highlightedIndex =
          (this.highlightedIndex - 1 + this.filteredCompanies.length) %
          this.filteredCompanies.length;
        event.preventDefault(); // Prevent default scrolling
      } else if (event.key === 'Enter') {
        // Select the highlighted company
        if (this.highlightedIndex >= 0) {
          this.onSelectCompany(this.filteredCompanies[this.highlightedIndex]);
        }
      }
    }
  }

  onDragStart(event: DragEvent, stockId: any) {
    this.draggedStock = stockId;
    event.dataTransfer?.setData('text', stockId.toString());
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const droppedStock = event.dataTransfer?.getData('text');
    this.handleDroppedStock(droppedStock);
  }

  handleDroppedStock(stock: any) {
    this.finform.patchValue({
      tick: stock,
    });
    this.finData.tick = stock;
    this.GetDraggedData();
  }

  GetDraggedData() {
    this.Counter = 0;
    // this.disconnectWebSocket()
    this.CloseFullModal();
    this.TrackFullScreenMode = true;
    this.showmsg = 'Analyzing Data and Generating Your Graph... Please Wait.';
    this.submitted = true;
    this.finform.markAllAsTouched();
    if (this.finform.invalid) {
      return;
    }
    if (this.finform.valid) {
      this.clearChartDiv();
      this.spinner.show();
      const promises = [
        this.previousHighService(),
        this.GetBaseCandleData(),
        this.GetBuyZoneData(),
        this.GetSellZoneData(),
        this.OverLayFetching(),
        this.GetAllZones(),
        this.GetQualifiedZones(),
        this.GetSetUpData(),
      ];
      if (this.finData.time_frame === '1') {
        this.layoutFlagfirst = true;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = false;
      } else if (this.finData.time_frame === '2') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = true;
        this.layoutFlagthird = false;
      } else if (this.finData.time_frame === '3') {
        this.layoutFlagfirst = false;
        this.layoutFlagsecond = false;
        this.layoutFlagthird = true;
      }
      // Execute all promises and fetch candle data after they are complete
      Promise.all(promises)
        .then(() => {
          return this.apiService.fetchCandleData(this.finData).toPromise();
        })
        .then((resp) => {
          this.ChartRESPONSE = resp.response;
          this.SelectedStockName = this.finData.tick;
          this.cdRef.detectChanges();
          this.ngAfterViewInit();
          const data = this.ChartRESPONSE[this.FullScreenModeValue];
          this.LoadChart(data, 'chart-container_new');
        })
        .catch((error) => {
          console.error('Error occurred during API calls', error);
        })
        .finally(() => {
          // this.ngAfterViewInit();
          // this.spinner.hide();
        });
      // Promise.all(promises).then(() => {
      //   this.apiService.fetchCandleData(this.finData).subscribe(resp => {
      //     this.ChartRESPONSE = resp.response;
      //     this.SelectedStockName = this.finData.tick;
      //     this.cdRef.detectChanges();
      //     this.ngAfterViewInit()
      //     const data = this.ChartRESPONSE[this.FullScreenModeValue];
      //     this.LoadChart(data,"chart-container_new")
      //     this.spinner.hide();
      //   });

      // }).catch((error) => {
      //   console.error("Error occurred during API calls", error);
      //   this.spinner.hide();
      // });
    }
  }

  gotoStockMgmt() {
    this.router.navigate(['/stock-management']);
  }

  // updateCandleData() {
  //   this.spinner.show();
  //   this.apiService
  //     .updateCandleDataService(this.UpdateCnadleStockId)
  //     .subscribe((resp) => {
  //       if (resp.msg == 'success') {
  //         this.toastr.success('Candle Data Updated !');
  //         this.spinner.hide();
  //       } else {
  //         this.toastr.error('Updateion Failed !');
  //         this.spinner.hide();
  //       }
  //     });
  // }

  updateCandleData() {            //latest added 
    this.spinner.show();
    this.apiService
      .updateCandleDataService(this.UpdateCnadleStockId)
      .subscribe((resp) => {
        if (resp.msg == 'success') {
          this.spinner.hide();
          this.toastr.success('Candle Data Updated !');
          this.CancelReplayClicked = true;
          this.submit();
        } else {
          this.toastr.error('Updateion Failed !');
          this.spinner.hide();
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
    if (this.finData?.tick) {
      const SymbolData = this.finform.value;
      const tickUpper = SymbolData.tick.kite_symbol; //nabonita
      this.alertForm.get('stock_symbol')?.patchValue(tickUpper);
    }

    this.alertForm.get('timeframe')?.patchValue(this.TimeFrame); //nabonita

    this.modalalert.show();
    this.hideContextMenu();
  }

  onSubmitSetAlert() {
    this.submitStock = true;
    this.alertForm.markAllAsTouched();
    if (this.alertForm.invalid) {
      this.toastr.error('This fields are required !');
      return;
    } else {
      this.spinner.show();
      const setAlertData = this.alertForm.value;
      this.apiService
        .onSubmitSetAlertService(setAlertData)
        .subscribe((resp) => {
          if (resp.msg == 'success') {
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
          } else {
            this.spinner.hide();
            return;
          }
        });
    }
  }

  getAllSetAlerts(highlight: boolean = false) {
    // this.spinner.show();

    const payload = {
      country_id: localStorage.getItem('selectedCountryId'),
      user_id: this.userId,
      page_no:
        this.currentPage != null ? this.currentPage.toString() : undefined,
      limit: this.pageSize,
      stock_tick: this.searchText,
      start_date: this.StartDate,
      end_date: this.EndDate,
    };
    console.log('alert payload', payload);
    this.apiService.getViewAlertListService(payload).subscribe((resp) => {
      console.log('alert resp', resp);
      // this.spinner.hide();
      if (resp.msg === 'success') {
        const parsedData = typeof resp === 'string' ? JSON.parse(resp) : resp;
        this.allSetAlerts = resp.response.alerts || [];
        this.TotalCount = resp.response.total_count;
        console.log('alertssss', this.allSetAlerts);

        // Highlight if search matches
        if (highlight && this.searchText) {
          const lowerSearch = this.searchText.trim().toLowerCase();

          const matches = this.allSetAlerts.filter(
            (item: { stock_symbol: string }) =>
              item.stock_symbol?.toLowerCase().includes(lowerSearch)
          );

          this.MatchedCount = matches.length;
          this.highlightedStockNames = matches.map(
            (item: { stock_symbol: any }) => item.stock_symbol
          );

          if (matches.length > 0) {
            const firstMatchName = matches[0].stock_symbol;
            this.currentPage = resp.response.page_no;
            setTimeout(() => {
              const target = this.stockCells.find(
                (cell: {
                  nativeElement: { getAttribute: (arg0: string) => string };
                }) =>
                  cell.nativeElement
                    .getAttribute('data-stock')
                    ?.toLowerCase() === firstMatchName.toLowerCase()
              );

              if (target) {
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
      } else {
        this.toastr.error('Failed to fetch alerts');
        this.MatchedCount = 0;
        this.TotalCount = 0;
      }
    });
  }
  deleteAlert(alertid: any) {
    const confirmation = window.confirm('Are you sure , you want to delete?');
    if (confirmation) {
      this.spinner.show();
      this.apiService.deleteAlertService(alertid).subscribe((data) => {
        this.showmsg = data.msg;
        if (this.showmsg == 'success') {
          this.spinner.hide();
          this.toastr.success('Alert Deleted Successfully');
          this.getAllSetAlerts();
        } else {
          this.spinner.hide();
          this.toastr.error('Alert Deletion Failed');
        }
      });
    }
  }

  PrepDebounce() {
    this.searchSubject.pipe(debounceTime(400)).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchText = trimmed;
      this.currentPage = null;
      this.getAllSetAlerts(true);
    });
  }

  Search() {
    this.currentPage = 1; // Reset to first page on new search
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.getAllSetAlerts(true);
  }

  goToNextPage() {
    const totalPages = this.getTotalPages();
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.getAllSetAlerts(true);
    }
  }

  goToPreviousPage() {
    this.currentPage--;
    this.getAllSetAlerts(true);
  }

  isHighlighted(stockName: string): boolean {
    return this.highlightedStockNames.some(
      (name) => name.toLowerCase() === stockName.toLowerCase()
    );
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

  onSearchInput(value: string) {
    this.searchSubject.next(value);
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.getAllSetAlerts(true);
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.getAllSetAlerts(true);
  }

  getTotalPages(): number {
    return Math.ceil(this.TotalCount / this.pageSize);
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  enableLinePlacement(mode: 'entry' | 'target' | 'stoploss') {
    // Block placing target/stoploss before entry exists
    if ((mode === 'target' || mode === 'stoploss') && !this.entryLine) {
      // use your global swal if you like
      alert('Place Entry first');
      return; // do not enter placement mode
    }
    this.checkboxClicked('setup');
    this.chart.priceScale('right').applyOptions({
      autoScale: false,
      scaleMargins: this.DEFAULT_SCALE_MARGINS, // keep your margins
    });

    // Cleanup old listeners
    if (this.boundShowPreviewLine) {
      this.chart.unsubscribeCrosshairMove(this.boundShowPreviewLine);
    }
    if (this.boundFixLineAtPrice) {
      this.chart.unsubscribeClick(this.boundFixLineAtPrice);
    }

    // Remove old preview
    if (this.previewLine) {
      this.chart.removeSeries(this.previewLine);
      this.previewLine = null;
    }

    this.placementMode = mode;

    // New preview line
    this.previewLine = this.chart.addLineSeries({
      color: this.getColorForMode(mode),
      lineWidth: 1,
      priceLineVisible: false,
      crossHairMarkerVisible: false,
    });

    // Bind handlers once per placement
    this.boundShowPreviewLine = this.showPreviewLine.bind(this);
    this.boundFixLineAtPrice = this.fixLineAtPrice.bind(this);

    // Subscribe
    this.chart.subscribeCrosshairMove(this.boundShowPreviewLine);
    this.chart.subscribeClick(this.boundFixLineAtPrice);
  }

  showPreviewLine(param: any) {
    if (!param?.point || !this.previewLine || this.placementMode === 'none')
      return;

    // get a safe time; prefer param.time (bar time); fallback to x->time
    let timeStart: any =
      param.time ?? this.chart.timeScale().coordinateToTime(param.point.x);
    if (!timeStart) return;

    // keep using your existing future time logic (same type as timeStart)
    const futureTime: any =
      typeof timeStart === 'number'
        ? Math.floor(Date.now() / 1000) + this.FUTURE_SECONDS
        : (() => {
          const d = new Date(
            Date.UTC(timeStart.year, timeStart.month - 1, timeStart.day)
          );
          d.setUTCDate(d.getUTCDate() + 7);
          return {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            day: d.getUTCDate(),
          };
        })();

    let price = this.candlestickSeries.coordinateToPrice(param.point.y);
    if (price === undefined) return;
    price = Math.max(this.MIN_PRICE, price);

    // 1) update preview line FIRST
    this.previewLine.setData([{ time: timeStart, value: price }]);
    const { ok, msg } = this.validatePlacement(
      this.placementMode as any,
      price
    );
    if (!ok && msg) {
      this.previewLine.setMarkers([
        {
          time: timeStart,
          position: 'aboveBar',
          color: 'white',
          shape: 'arrowUp',
          text: msg,
        },
      ]);
      this.previewLine.applyOptions({ color: 'white' });
    } else {
      this.previewLine.setMarkers([]);
      this.previewLine.applyOptions({
        color: this.getColorForMode(this.placementMode as any),
      });
    }
  }

  capitalize(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  getColorForMode(mode: 'entry' | 'target' | 'stoploss' | 'none') {
    switch (mode) {
      case 'entry':
        return 'blue';
      case 'target':
        return 'green';
      case 'stoploss':
        return 'red';
      default:
        return 'gray'; // fallback color for 'none'
    }
  }

  onChartClick(param: any) {
    if (!param?.point) return;

    const clickedY = param.point.y;
    const pixelThreshold = 6;

    let closestLine: any = null;
    let minPixelDiff = Number.MAX_VALUE;

    for (const line of this.horizontalLines) {
      const lineY = this.candlestickSeries.priceToCoordinate(line.price);
      if (lineY === null) continue;

      const pixelDiff = Math.abs(lineY - clickedY);
      if (pixelDiff < minPixelDiff && pixelDiff <= pixelThreshold) {
        closestLine = line;
        minPixelDiff = pixelDiff;
      }
    }

    // Deselect previous
    this.horizontalLines.forEach((line) => {
      if (line === this.selectedLine) {
        line.series.applyOptions({ lineWidth: 2, lineStyle: 0 });
        line.selected = false;
      }
    });

    if (closestLine) {
      this.selectedLine = closestLine;
      closestLine.series.applyOptions({
        lineWidth: 3,
        lineStyle: 1,
      });
      closestLine.selected = true;
    } else {
      this.selectedLine = null;
    }
  }

  fixLineAtPrice(param: any) {
    this.createBtnFlgForMannualSetup = true;
    this.CreateButtonFlag = false;
    if (!param.point || !param.time || this.placementMode === 'none') return;

    let price = this.candlestickSeries.coordinateToPrice(param.point.y);
    if (price === undefined) return;

    // clamp to avoid negatives at placement
    price = Math.max(this.MIN_PRICE, price);

    // final validation BEFORE commit
    const validation = this.validatePlacement(this.placementMode as any, price);
    if (!validation.ok) {
      // keep preview mode active and show message above line
      this.previewMessage(
        validation.msg || 'Invalid placement',
        param.time,
        'aboveBar'
      );
      // optional toast:
      alert(validation.msg || 'Invalid placement');
      return; // DO NOT place the line
    }

    const color = this.getColorForMode(this.placementMode);
    const currentMode = this.placementMode;

    // Unsubscribe preview listeners
    if (this.boundShowPreviewLine)
      this.chart.unsubscribeCrosshairMove(this.boundShowPreviewLine);
    if (this.boundFixLineAtPrice)
      this.chart.unsubscribeClick(this.boundFixLineAtPrice);

    // Remove preview
    if (this.previewLine) {
      this.chart.removeSeries(this.previewLine);
      this.previewLine = null;
    }
    // Reset placement mode AFTER capturing values
    this.placementMode = 'none';
    const timeStart = param.time;

    // ---------- NEW: prevent viewport shift ----------
    const ts = this.chart.timeScale();
    const prevRange = ts.getVisibleRange(); // save current viewport
    const FIVE_YEARS = 5 * 365 * 24 * 60 * 60;

    const futureTime = Math.floor(Date.now() / 1000) + FIVE_YEARS;
    // -------------------------------------------------

    const fixedLine = this.chart.addLineSeries({
      color,
      lineWidth: 2,
      priceLineVisible: false,
      crossHairMarkerVisible: false,
    });

    const prev = ts.getVisibleLogicalRange?.() ?? ts.getVisibleRange?.();

    // your original setData (can still use futureTime)
    fixedLine.setData([
      { time: timeStart, value: price },
      { time: futureTime, value: price },
    ]);

    // restore viewport so the chart doesn't shift
    if (prev?.from !== undefined) {
      // prefer logical range if available
      if (
        ts.setVisibleLogicalRange &&
        prev.from !== undefined &&
        prev.to !== undefined
      ) {
        ts.setVisibleLogicalRange(prev as any);
      } else if (ts.setVisibleRange) {
        ts.setVisibleRange(prev as any);
      }
    }

    fixedLine.setMarkers([
      {
        time: timeStart,
        position: currentMode === 'stoploss' ? 'belowBar' : 'aboveBar',
        color,
        shape: 'arrowUp',
        text: `${this.capitalize(currentMode)} : ${price.toFixed(2)}`,
      },
    ]);

    const lineObj: any = {
      type: currentMode,
      price,
      series: fixedLine,
      startTime: timeStart,
      endTime: futureTime,
    };
    this.horizontalLines.push(lineObj);

    // disable the respective button
    if (currentMode === 'entry') this.entryEnabled = false;
    if (currentMode === 'target') this.targetEnabled = false;
    if (currentMode === 'stoploss') this.stoplossEnabled = false;
    // Enable dragging for this line
    this.makeManualLineDraggable(lineObj, timeStart, futureTime);

    // Update form (safe formatting)
    const fmt = (v: number) => (typeof v === 'number' ? v.toFixed(2) : '');
    switch (currentMode) {
      case 'entry':
        this.EntryPrice = price;
        break;
      case 'stoploss':
        this.StoplossPrice = price;
        break;
      case 'target':
        this.TargetPrice = price;
        break;
    }
    this.fincreateformForMannualSetup.patchValue({
      entry_price: fmt(this.EntryPrice),
      stoploss_price: fmt(this.StoplossPrice),
      target_price: fmt(this.TargetPrice),
    });

    this.updateEntryLineMarker();

    // ✅ Re-apply your desired margins and restore interactions
    this.chart.priceScale('right').applyOptions({
      autoScale: true,
      scaleMargins: this.DEFAULT_SCALE_MARGINS,
    });
    this.chart.applyOptions({ handleScroll: true, handleScale: true });
  }

  makeManualLineDraggable(
    lineObj: any,
    initialStartTime: any,
    initialEndTime: any
  ) {
    const el = document.getElementById('chart-container_new');
    if (!el) return;

    // ---- time helpers (unix vs BusinessDay) ----
    const isBusiness = (t: any) => typeof t === 'object' && t && 'year' in t;
    const toUnix = (t: any) =>
      typeof t === 'number' ? t : Date.UTC(t.year, t.month - 1, t.day) / 1000;
    const toBusiness = (sec: number) => {
      const d = new Date(sec * 1000);
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      };
    };
    const asLike = (sec: number, like: any) =>
      isBusiness(like) ? toBusiness(sec) : sec;
    const rightEdgeLike = (like: any): any => {
      const vr = this.chart.timeScale().getVisibleRange?.();
      if (!vr?.to) return like;
      return isBusiness(like)
        ? isBusiness(vr.to)
          ? vr.to
          : toBusiness(toUnix(vr.to))
        : typeof vr.to === 'number'
          ? vr.to
          : toUnix(vr.to);
    };

    // set initial times on the object
    lineObj.startTime = initialStartTime;
    lineObj.endTime = initialEndTime;

    if (!this._dragListenersAttached) {
      let isDragging = false;
      let dragLine: any = null;

      // offsets so the line doesn't snap on grab
      let offsetPrice = 0;
      let offsetTimeSec = 0;

      // snapshot to REVERT TO (state before drag)
      let orig = { price: 0, startTime: null as any, endTime: null as any };

      const pixelThreshold = 8;

      const disableChart = () => {
        this.chart.applyOptions({ handleScroll: false, handleScale: false });
        this.chart.priceScale('right').applyOptions({
          autoScale: false,
          scaleMargins: this.DEFAULT_SCALE_MARGINS,
        });
      };
      const enableChart = () => {
        this.chart.applyOptions({ handleScroll: true, handleScale: true });
        this.chart.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: this.DEFAULT_SCALE_MARGINS,
        });
      };

      el.addEventListener('mousedown', (ev: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const y = ev.clientY - r.top;
        const x = ev.clientX - r.left;

        // find the grabbed line by y-distance
        for (const line of this.horizontalLines) {
          const ly = this.candlestickSeries.priceToCoordinate(line.price);
          if (ly == null) continue;
          if (Math.abs(y - ly) <= pixelThreshold) {
            isDragging = true;
            dragLine = line;

            // snapshot ORIGINAL state to revert to
            orig = {
              price: line.price,
              startTime: line.startTime,
              endTime: line.endTime,
            };

            // offsets
            const priceAtCursor = this.candlestickSeries.coordinateToPrice(y);
            offsetPrice = line.price - (priceAtCursor ?? line.price);

            let tRaw: any = this.chart.timeScale().coordinateToTime(x);
            if (!tRaw) {
              const vr = this.chart.timeScale().getVisibleRange?.();
              if (!vr?.to) return;
              tRaw = vr.to;
            }
            const tUnix = toUnix(tRaw);
            offsetTimeSec = toUnix(line.startTime) - tUnix;

            disableChart();
            break;
          }
        }
      });

      el.addEventListener('mousemove', (ev: MouseEvent) => {
        if (!isDragging || !dragLine) return;

        const r = el.getBoundingClientRect();
        const y = ev.clientY - r.top;
        const x = ev.clientX - r.left;

        // proposed price
        let p = this.candlestickSeries.coordinateToPrice(y);
        if (p === undefined) return;
        const proposedPrice = Math.max(this.MIN_PRICE, p + offsetPrice);

        // proposed start time
        let tRaw: any = this.chart.timeScale().coordinateToTime(x);
        if (!tRaw) {
          const vr = this.chart.timeScale().getVisibleRange?.();
          if (!vr?.to) return;
          tRaw = vr.to;
        }
        const newStartUnix = toUnix(tRaw) + offsetTimeSec;
        const newStartTime = asLike(newStartUnix, dragLine.startTime);
        const newEndTime = rightEdgeLike(newStartTime);

        // draw VISUALLY only (no state commit here)
        dragLine.series.setData([
          { time: newStartTime, value: proposedPrice },
          { time: newEndTime, value: proposedPrice },
        ]);

        // optional visual validation (uses your own validatePlacement)
        const { ok, msg } = this.validatePlacement(
          dragLine.type as any,
          proposedPrice
        );
        if (!ok) {
          dragLine.series.applyOptions({ color: 'gray', lineWidth: 1 });
          dragLine.series.setMarkers([
            {
              time: newStartTime,
              position: dragLine.type === 'stoploss' ? 'belowBar' : 'aboveBar',
              color: 'gray',
              shape: 'arrowUp',
              text: msg || 'Invalid',
            },
          ]);
        } else {
          dragLine.series.applyOptions({
            color: this.getColorForMode(dragLine.type),
            lineWidth: 2,
          });
          dragLine.series.setMarkers([
            {
              time: newStartTime,
              position: dragLine.type === 'stoploss' ? 'belowBar' : 'aboveBar',
              color: this.getColorForMode(dragLine.type),
              shape: 'arrowUp',
              text: `${this.capitalize(dragLine.type)}: ${proposedPrice.toFixed(
                2
              )}`,
            },
          ]);

          // ✅ VALID WHILE DRAGGING: commit to state + sync form + RR
          dragLine.price = proposedPrice;
          dragLine.startTime = newStartTime;
          dragLine.endTime = newEndTime;

          if (dragLine.type === 'entry') this.EntryPrice = proposedPrice;
          if (dragLine.type === 'stoploss') this.StoplossPrice = proposedPrice;
          if (dragLine.type === 'target') this.TargetPrice = proposedPrice;

          this.fincreateformForMannualSetup.patchValue({
            entry_price:
              typeof this.EntryPrice === 'number'
                ? this.EntryPrice.toFixed(2)
                : '',
            stoploss_price:
              typeof this.StoplossPrice === 'number'
                ? this.StoplossPrice.toFixed(2)
                : '',
            target_price:
              typeof this.TargetPrice === 'number'
                ? this.TargetPrice.toFixed(2)
                : '',
          });

          this.updateEntryLineMarker?.();
        }
      });

      const stopDrag = (ev?: MouseEvent) => {
        if (!isDragging || !dragLine) return;

        const r = el.getBoundingClientRect();
        const x = ev ? ev.clientX - r.left : 0;
        const y = ev ? ev.clientY - r.top : 0;

        // compute final proposed position
        let p = this.candlestickSeries.coordinateToPrice(y);
        if (p === undefined) p = dragLine.price; // fallback if outside
        const finalPrice = Math.max(this.MIN_PRICE, p + offsetPrice);

        let tRaw: any = this.chart.timeScale().coordinateToTime(x);
        if (!tRaw) {
          const vr = this.chart.timeScale().getVisibleRange?.();
          tRaw = vr?.to ?? dragLine.startTime;
        }
        const newStartUnix = toUnix(tRaw) + offsetTimeSec;
        const newStartTime = asLike(newStartUnix, dragLine.startTime);
        const newEndTime = rightEdgeLike(newStartTime);

        // validate with YOUR function
        const { ok, msg } = this.validatePlacement(
          dragLine.type as any,
          finalPrice
        );

        if (!ok) {
          // ❌ INVALID → revert to ORIGINAL snapshot
          const revertedEndTime = rightEdgeLike(orig.startTime); // keep right edge glued to viewport
          dragLine.series.setData([
            { time: orig.startTime, value: orig.price },
            { time: revertedEndTime, value: orig.price },
          ]);
          dragLine.series.setMarkers([
            {
              time: orig.startTime,
              position: dragLine.type === 'stoploss' ? 'belowBar' : 'aboveBar',
              color: this.getColorForMode(dragLine.type),
              shape: 'arrowUp',
              text: `${this.capitalize(dragLine.type)}: ${orig.price.toFixed(
                2
              )}`,
            },
          ]);
          dragLine.series.applyOptions({
            color: this.getColorForMode(dragLine.type),
            lineWidth: 2,
          });

          // restore state to orig (align end to current right edge)
          dragLine.price = orig.price;
          dragLine.startTime = orig.startTime;
          dragLine.endTime = revertedEndTime;

          // 🔁 SYNC FORM to reverted values (derive from current lines)
          const entry = this.horizontalLines.find((l) => l.type === 'entry');
          const sl = this.horizontalLines.find((l) => l.type === 'stoploss');
          const target = this.horizontalLines.find((l) => l.type === 'target');

          this.EntryPrice = entry?.price;
          this.StoplossPrice = sl?.price;
          this.TargetPrice = target?.price;

          this.fincreateformForMannualSetup.patchValue({
            entry_price:
              typeof this.EntryPrice === 'number'
                ? this.EntryPrice.toFixed(2)
                : '',
            stoploss_price:
              typeof this.StoplossPrice === 'number'
                ? this.StoplossPrice.toFixed(2)
                : '',
            target_price:
              typeof this.TargetPrice === 'number'
                ? this.TargetPrice.toFixed(2)
                : '',
          });

          this.updateEntryLineMarker?.();
        } else {
          // ✅ VALID → commit new state and sync form
          dragLine.series.setData([
            { time: newStartTime, value: finalPrice },
            { time: newEndTime, value: finalPrice },
          ]);
          dragLine.series.setMarkers([
            {
              time: newStartTime,
              position: dragLine.type === 'stoploss' ? 'belowBar' : 'aboveBar',
              color: this.getColorForMode(dragLine.type),
              shape: 'arrowUp',
              text: `${this.capitalize(dragLine.type)}: ${finalPrice.toFixed(
                2
              )}`,
            },
          ]);
          dragLine.price = finalPrice;
          dragLine.startTime = newStartTime;
          dragLine.endTime = newEndTime;

          // form sync on commit
          if (dragLine.type === 'entry') this.EntryPrice = finalPrice;
          if (dragLine.type === 'stoploss') this.StoplossPrice = finalPrice;
          if (dragLine.type === 'target') this.TargetPrice = finalPrice;

          this.fincreateformForMannualSetup.patchValue({
            entry_price:
              typeof this.EntryPrice === 'number'
                ? this.EntryPrice.toFixed(2)
                : '',
            stoploss_price:
              typeof this.StoplossPrice === 'number'
                ? this.StoplossPrice.toFixed(2)
                : '',
            target_price:
              typeof this.TargetPrice === 'number'
                ? this.TargetPrice.toFixed(2)
                : '',
          });

          this.updateEntryLineMarker?.();
        }

        isDragging = false;
        dragLine = null;
        enableChart();
      };

      el.addEventListener('mouseup', stopDrag);
      el.addEventListener('mouseleave', stopDrag);

      this._dragListenersAttached = true;
    }
  }

  getCustomMOdelPrediction() {
    this.spinner.show();
    const data = {
      order_type: 'Buy',
      entry_price: this.EntryPrice,
      target_price: this.TargetPrice,
      stoploss_price: this.StoplossPrice,
      last_d_time: this.finData.last_d_time,
      time_frame: this.finData.time_frame,
      tick: this.finData.tick,
      country_id: localStorage.getItem('selectedCountryId'),
    };
    console.log('getCustomMOdelPrediction DATA', data);
    this.apiService.getModelPredictionService(data).subscribe({
      next: (resp: any) => {
        this.ModelPrediction =
          'PROBABILITY OF TRADE : ' +
          resp.msg.toUpperCase() +
          ' = ' +
          resp.response.probability +
          ' %';
        this.SelectedPrediction = resp.msg;
        this.SelectedProbability = resp.response.probability;
        this.ViewSetUpAnywayFlag = false;
        this.showMarketAlert(this.ModelPrediction);
        this.spinner.hide(); // always runs, success or error
      },
      error: (err) => {
        this.spinner.hide(); // always runs, success or error
        console.error('Model Prediction error:', err);
        this.ModelPrediction = 'PROBABILITY OF TRADE : FAILED';
        this.SelectedPrediction = 'FAILED';
        this.SelectedProbability = 0;
        this.ViewSetUpAnywayFlag = true;
        this.showMarketAlert('Model Prediction failed. Please try again.');
      },
      complete: () => {
        this.spinner.hide(); // always runs, success or error
      },
    });
  }

  updateEntryLineMarker() {
    if (!this.EntryPrice || !this.StoplossPrice || !this.TargetPrice) return;

    const rr = this.calculateRiskToReward();
    if (rr === null) return;

    this.RiskToReward = rr.toFixed(2);
    this.fincreateform.patchValue({ risk_to_reward: this.RiskToReward });

    const entryLine = this.horizontalLines.find(
      (line) => line.type === 'entry'
    );
    if (!entryLine) return;

    entryLine.series.setMarkers([
      {
        time:
          entryLine.series.options().data?.[0]?.time ||
          entryLine.series.options().lastValueVisible,
        position: 'aboveBar',
        color: this.getColorForMode('entry'),
        shape: 'arrowUp',
        text: `Entry: ${this.EntryPrice.toFixed(2)} | RR: ${this.RiskToReward}`,
      },
    ]);
  }

  calculateRiskToReward(): number | null {
    if (this.EntryPrice && this.StoplossPrice && this.TargetPrice) {
      const risk = Math.abs(this.EntryPrice - this.StoplossPrice);
      const reward = Math.abs(this.TargetPrice - this.EntryPrice);
      if (risk === 0) return null;
      return reward / risk;
    }
    return null;
  }

  closeCreateOrderPanelforMannual() {
    this.showCreateOrderModalForMAnnual = false;
    this.fincreateformForMannualSetup.reset();
    this.submittedForMannual = false;
  }

  createForMannualSetup() {
    this.showmsg = 'Please Wait !!';
    this.submittedForMannual = true;
    this.fincreateformForMannualSetup.markAllAsTouched();
    if (this.fincreateformForMannualSetup.invalid) {
      return;
    }
    if (this.fincreateformForMannualSetup.valid) {
      this.spinner.show();
      const finDataStock = this.finform.value;
      console.log('FINDATASTOCK createForMannualSetup', finDataStock);
      this.fincreateformForMannualSetup.patchValue({
        prediction: this.SelectedPrediction,
        probability: this.SelectedProbability / 100,
        country_id: this.countryId,
        stock_tick: this.selectedStockId,
        purchased_cmp_date: this.getCurrentDateTime(),
        time_frame: finDataStock.time_frame,
        stock_id: String(this.UpdateCnadleStockId),
      });
      const fincreateorderData = this.fincreateformForMannualSetup.value;
      console.log('Homecandle formss', fincreateorderData);
      this.apiService.createorder(fincreateorderData).subscribe((resp) => {
        console.log('create response', resp);
        this.createorderResp = resp;
        if (resp.msg == 'success') {
          // this.closemodal.nativeElement.click();
          this.spinner.hide();
          this.toastr.success('Order Create Success ', 'ALERT !');
          this.closeCreateOrderPanelforMannual();
          this.stopTimer();
        } else {
          this.spinner.hide();
          this.toastr.error(resp.response, 'ALERT !');
        }
      });
    }
  }

  openCreateOrderPanelforMannual() {
    this.showCreateOrderModalForMAnnual = true;
  }

  getLineByType(type: 'entry' | 'target' | 'stoploss') {
    return this.horizontalLines.find((l) => l.type === type) || null;
  }

  get entryLine() {
    return this.getLineByType('entry');
  }
  get targetLine() {
    return this.getLineByType('target');
  }
  get stoplossLine() {
    return this.getLineByType('stoploss');
  }

  private previewMessage(
    text: string,
    atTime: number,
    position: 'aboveBar' | 'belowBar' = 'aboveBar'
  ) {
    if (!this.previewLine) return;
    this.previewLine.setMarkers([
      {
        time: atTime,
        position,
        color: 'gray',
        shape: 'arrowUp',
        text,
      },
    ]);
  }

  private clearPreviewMessage() {
    if (!this.previewLine) return;
    this.previewLine.setMarkers([]);
  }

  private validatePlacement(
    mode: 'entry' | 'target' | 'stoploss',
    price: number
  ): { ok: boolean; msg?: string } {
    if ((mode === 'target' || mode === 'stoploss') && !this.entryLine) {
      return { ok: false, msg: 'Place Entry first' };
    }

    // NEW: If placing/moving Entry and both SL & Target exist, Entry must be between them
    if (mode === 'entry') {
      if (this.stoplossLine && this.targetLine) {
        const sl = this.stoplossLine.price;
        const tg = this.targetLine.price;
        const lo = Math.min(sl, tg);
        const hi = Math.max(sl, tg);

        if (price <= lo || price >= hi) {
          return {
            ok: false,
            msg: 'Entry must be between Stoploss and Target',
          };
        }
        if (price === sl || price === tg) {
          return { ok: false, msg: 'Entry cannot equal Stoploss or Target' };
        }
      }
      return { ok: true };
    }

    const entryPrice = this.entryLine?.price ?? 0;
    const isAbove = price > entryPrice;
    const isBelow = price < entryPrice;

    if (price === entryPrice) {
      return { ok: false, msg: 'Move off the Entry price' };
    }

    if (mode === 'stoploss') {
      if (this.targetLine) {
        const targetAbove = this.targetLine.price > entryPrice;
        if (targetAbove && !isBelow)
          return {
            ok: false,
            msg: 'Stoploss must be BELOW Entry (Target is above)',
          };
        if (!targetAbove && !isAbove)
          return {
            ok: false,
            msg: 'Stoploss must be ABOVE Entry (Target is below)',
          };
      }
    }

    if (mode === 'target') {
      if (this.stoplossLine) {
        const slAbove = this.stoplossLine.price > entryPrice;
        if (slAbove && !isBelow)
          return {
            ok: false,
            msg: 'Target must be BELOW Entry (Stoploss is above)',
          };
        if (!slAbove && !isAbove)
          return {
            ok: false,
            msg: 'Target must be ABOVE Entry (Stoploss is below)',
          };
      }
    }

    if (
      (mode === 'target' && this.stoplossLine) ||
      (mode === 'stoploss' && this.targetLine)
    ) {
      const sl = mode === 'stoploss' ? price : this.stoplossLine!.price;
      const tg = mode === 'target' ? price : this.targetLine!.price;
      const lo = Math.min(sl, tg);
      const hi = Math.max(sl, tg);
      if (!(entryPrice > lo && entryPrice < hi)) {
        return {
          ok: false,
          msg: 'Entry must remain between Stoploss and Target',
        };
      }
    }

    return { ok: true };
  }

  removeAllEntry() {
    ['entry', 'stoploss', 'target'].forEach((type) => {
      const line = this.horizontalLines.find((l) => l.type === type);
      if (line && line.series) {
        try {
          this.chart.removeSeries(line.series);
        } catch (e) {
          console.warn(`Series for ${type} already removed`, e);
        }
      }
    });
    this.horizontalLines = this.horizontalLines.filter(
      (l) => !['entry', 'stoploss', 'target'].includes(l.type)
    );
    this.selectedLine = null;
  }
  openPopup() {
    this.modalA.show();
  }

  PricePercentage() {
    this.apiService.PricePercentageService(this.finData).subscribe(resp => {
      this.PricePercentageData = resp.response;
      this.PP_Analyze = this.PricePercentageData.analyze;
      this.PP_Evaluate = this.PricePercentageData.evaluate;
      this.PP_Execute = this.PricePercentageData.execute;
      this.PP_Reason = this.PricePercentageData.reason;
      this.PP_FinalDecision = this.PricePercentageData.final_decision
    });
  }

  // NEW STOCK LIST CODE
  normalizeText(value: string): string {
    return (value || '')
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  onSearchChange(): void {
    const keyword = this.normalizeText(this.searchstockText);

    if (!keyword) {
      this.highlightedStockId = null;
      return;
    }

    // 1. Priority match: starts from first letter
    let matchedIndex = this.StockFullData.findIndex((item: any) =>
      this.normalizeText(item.stock).startsWith(keyword)
    );

    // 2. Fallback match: search anywhere
    if (matchedIndex === -1) {
      matchedIndex = this.StockFullData.findIndex((item: any) =>
        this.normalizeText(item.stock).includes(keyword)
      );
    }

    if (matchedIndex !== -1) {
      const matchedItem = this.StockFullData[matchedIndex];
      this.highlightedStockId = matchedItem.stock_id;

      setTimeout(() => {
        const row = document.getElementById('stock-row-' + matchedIndex);
        if (row) {
          row.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }, 100);
    } else {
      this.highlightedStockId = null;
    }
  }

  clearSearch(): void {
    this.searchstockText = '';
    this.highlightedStockId = null;
  }

  getInitials(name: string): string {
    if (!name) return '';
    const words = name.replace(/_/g, ' ').split(' ').filter(Boolean);
    return words.slice(0, 2).map((word: string) => word[0]).join('').toUpperCase();
  }

  isHighlightedStockList(item: any): boolean {
    return this.highlightedStockId === item.stock_id;
  }

  formatStockName(name: string): string {
    return (name || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  isPositive(value: string): boolean {
    return value?.trim().startsWith('+');
  }

  isNegative(value: string): boolean {
    return value?.trim().startsWith('-');
  }




  // MANUAL DRAWING CODE 
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

    // ADDED: prevent selecting already placed Entry / Target / Stoploss
    if (tool === 'entryPrice' && this.tradeLinePlaced.entry) {
      this.toastr?.warning?.('Entry line is already placed. Delete it first to place again.');
      return;
    }

    if (tool === 'targetPrice' && this.tradeLinePlaced.target) {
      this.toastr?.warning?.('Target line is already placed. Delete it first to place again.');
      return;
    }

    if (tool === 'stoplossPrice' && this.tradeLinePlaced.stoploss) {
      this.toastr?.warning?.('Stoploss line is already placed. Delete it first to place again.');
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

        shouldIgnoreMouseEvent: (event: MouseEvent) => {
          try {
            return !!this.manualRectangleTool?.isMouseEventOverRectangle(event);
          } catch (error) {
            console.warn('Manual rectangle hit-test failed:', error);
            return false;
          }
        },

        onCreated: (item: ChartDrawingRecord) => {
          this.syncTradeLineButtonState();
          if (
            item?.type === 'entryPrice' ||
            item?.type === 'targetPrice' ||
            item?.type === 'stoplossPrice'
          ) {
            this.syncTradeSetupValuesFromTradeTigerTool(false);
          }
          const exists = this.chartDrawingItems.some(x => x.id === item.id);

          if (!exists) {
            this.chartDrawingItems.push({
              ...item,
            });
          }
        },

        onUpdated: (item: ChartDrawingRecord) => {
          this.syncTradeLineButtonState();
          if (
            item?.type === 'entryPrice' ||
            item?.type === 'targetPrice' ||
            item?.type === 'stoplossPrice'
          ) {
            this.syncTradeSetupValuesFromTradeTigerTool(true);
          }
          this.chartDrawingItems = this.chartDrawingItems.map(x =>
            x.id === item.id ? { ...item } : x
          );

          this.selectedChartDrawing = item ? { ...item } : null;
        },

        onDeleted: (item: ChartDrawingRecord) => {
          // Clear button state immediately based on deleted drawing type
          if (item?.type === 'entryPrice') {
            this.tradeLinePlaced.entry = false;
            this.tradeLinePlaced.target = false;
            this.tradeLinePlaced.stoploss = false;

            this.entryPrice = null;
            this.targetPrice = null;
            this.stoplossPrice = null;
            this.riskReward = null;
            this.tradeDirection = null;

            // If Entry is deleted, remove Target and Stoploss also from saved drawing list
            this.chartDrawingItems = this.chartDrawingItems.filter(
              x =>
                x.type !== 'entryPrice' &&
                x.type !== 'targetPrice' &&
                x.type !== 'stoplossPrice'
            );
          } else if (item?.type === 'targetPrice') {
            this.tradeLinePlaced.target = false;
            this.targetPrice = null;
            this.riskReward = null;

            this.chartDrawingItems = this.chartDrawingItems.filter(
              x => x.id !== item.id
            );
          } else if (item?.type === 'stoplossPrice') {
            this.tradeLinePlaced.stoploss = false;
            this.stoplossPrice = null;
            this.riskReward = null;

            this.chartDrawingItems = this.chartDrawingItems.filter(
              x => x.id !== item.id
            );
          } else {
            // Existing logic for other drawings
            this.chartDrawingItems = this.chartDrawingItems.filter(
              x => x.id !== item.id
            );
          }

          this.selectedChartDrawing = null;

          // Sync again after chartDrawingTool internal delete is completed
          setTimeout(() => {
            this.syncTradeLineButtonState();
          }, 0);

          if (
            item?.type === 'entryPrice' ||
            item?.type === 'targetPrice' ||
            item?.type === 'stoplossPrice'
          ) {
            this.syncTradeSetupValuesFromTradeTigerTool(true);
          }
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
    let selectedBeforeDelete: any = null;

    // Get selected drawing before deleting
    if (this.chartDrawingTool) {
      try {
        selectedBeforeDelete = this.chartDrawingTool.getSelectedDrawing();
      } catch {
        selectedBeforeDelete = null;
      }
    }

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

      // IMPORTANT: manually enable buttons based on deleted line type
      if (selectedBeforeDelete?.type === 'entryPrice') {
        this.tradeLinePlaced.entry = false;
        this.tradeLinePlaced.target = false;
        this.tradeLinePlaced.stoploss = false;

        this.entryPrice = null;
        this.targetPrice = null;
        this.stoplossPrice = null;
        this.riskReward = null;
        this.tradeDirection = null;
      }

      if (selectedBeforeDelete?.type === 'targetPrice') {
        this.tradeLinePlaced.target = false;
        this.targetPrice = null;
        this.riskReward = null;
      }

      if (selectedBeforeDelete?.type === 'stoplossPrice') {
        this.tradeLinePlaced.stoploss = false;
        this.stoplossPrice = null;
        this.riskReward = null;
      }

      // Re-sync once after chartDrawingTool internal delete is completed
      setTimeout(() => {
        this.syncTradeLineButtonState();
      }, 0);

      this.toastr?.success?.('Drawing deleted');
    } else {
      this.toastr?.warning?.('Please select a drawing first');
    }
  }


  // SETUP PLICE LINE CODE

  private syncTradeLineButtonState(): void {
    if (!this.chartDrawingTool) return;

    const prices = this.chartDrawingTool.getTradePriceValues();

    this.entryPrice = prices.entry;
    this.targetPrice = prices.target;
    this.stoplossPrice = prices.stoploss;
    this.riskReward = prices.rr;
    this.tradeDirection = prices.direction;

    this.tradeLinePlaced = {
      entry: prices.entry !== null,
      target: prices.target !== null,
      stoploss: prices.stoploss !== null,
    };

    console.log('Trade Line State:', this.tradeLinePlaced);
    console.log('Trade Prices:', prices);
  }

  toggleChartInversion() {
    this.isChartInverted = !this.isChartInverted;

    if (this.chart) {
      this.chart.priceScale('right').applyOptions({
        invertScale: this.isChartInverted,
      });
    }
  }
}