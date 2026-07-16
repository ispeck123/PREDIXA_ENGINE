import { ChangeDetectorRef, Component, ElementRef, HostListener, QueryList, ViewChildren } from '@angular/core';
import { Router, TitleStrategy } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { ManualRectangleRecord, Point, RectangleDrawingTool, RectangleStyleOptions } from '../homecandles/rectangle-drawing-tool';
import { ChartDrawingLineStyle, ChartDrawingPoint, ChartDrawingRecord, ChartDrawingStylePatch, ChartDrawingTool, ChartDrawingToolType } from '../homecandles/chart-drawing-tool';
import moment from 'moment';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { debounceTime, Subject, Subscription } from 'rxjs';
import * as XLSX from 'xlsx';
import { WebSocketService } from 'src/app/services/web-socket.service';

type Patch = Partial<{
  optimized_buy_sell_zone: boolean;
  qualified_zones: boolean;
}>;

const MENU_RULES: Record<string, {
  base: string; // where overlap checkboxes are valid (same as activeMenu)
  overlap_evaluate?: Record<string, Patch>;
  overlap_analyze?: Record<string, Patch>;
}> = {
  daily: {
    base: "daily",
    overlap_evaluate: {
      monthly: { qualified_zones: false, optimized_buy_sell_zone: true },
    },
    overlap_analyze: {
      weekly: { qualified_zones: false, optimized_buy_sell_zone: true },
    }
  },

  sixty: {
    base: "sixty",
    overlap_evaluate: {
      weekly: { optimized_buy_sell_zone: true },
      seventy_five: { optimized_buy_sell_zone: true },
    },
    overlap_analyze: {
      daily: { optimized_buy_sell_zone: true },
      seventy_five: { optimized_buy_sell_zone: true },
    }
  },

  fifteen: {
    base: "fifteen",
    overlap_evaluate: {
      daily: { optimized_buy_sell_zone: true },
    },
    overlap_analyze: {
      sixty: { optimized_buy_sell_zone: true },
    }
  },

  one_twenty_five: {
    base: "one_twenty_five",
    overlap_evaluate: {
      weekly: { optimized_buy_sell_zone: true },
    },
    overlap_analyze: {
      daily: { optimized_buy_sell_zone: true },
    }
  },

  seventy_five: {
    base: "seventy_five",
    overlap_evaluate: {
      weekly: { optimized_buy_sell_zone: true },
    },
    overlap_analyze: {
      daily: { optimized_buy_sell_zone: true },
    }
  },

  twenty_five: {
    base: "twenty_five",
    overlap_evaluate: {
      daily: { optimized_buy_sell_zone: true },
    },
    overlap_analyze: {
      one_twenty_five: { optimized_buy_sell_zone: true },
    }
  },
};

@Component({
  selector: 'app-orderlist',
  templateUrl: './orderlist.component.html',
  styleUrls: ['./orderlist.component.css']
})
export class OrderlistComponent {
  private viewGraphOverlapMemory: Record<number, { evaluate: boolean; analyze: boolean ;qualified:boolean }> = {};
  predictionFilter :any= null;
  filteredOrders: any[] = [];
  highlightedTradeId: any=null;
   lastBar: any;
  UpdateCnadleStockId:any;
  orders: any;
  realTimePrice:any;
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
    qualified_zones: false,
    all_zones: false,
    base_candle: false,
    buy_sell_zone: false,
    bad_zone: false,
    setup: false,
    overlap_evaluate: false,
    overlap_analyze: false,
    optimized_buy_sell_zone: false
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
  SpinnerCounter: any;
  pendingOrders: any;
  successOrders: any;
  failedOrders: any;
  progressOrders: any;
  pendingOrdersCommodity: any;
  successOrdersCommodity: any;
  failedOrdersCommodity: any;
  progressOrdersCommodity: any;
  pendingOrdersFuture: any;
  successOrdersFuture: any;
  failedOrdersFuture: any;
  progressOrdersFuture: any;
  showReasonPanel = false;
  reasons: string[] = [];

  SearchFlag: boolean = false;
  activeMenu: string = 'Success';
  activeMenuCommodity: string = 'Success';
  activeMenuFuture: string = 'Success';
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
  SuccessCount: number = 0;
  FailedCount: number = 0;
  PendingCount: number = 0;
  ProgressCount: number = 0;
  SuccessCountCommodity: number = 0;
  ProgressCountCommodity: number = 0;
  FailedCountCommodity: number = 0;
  PendingCountCommodity: number = 0;
  SuccessCountFuture: number = 0;
  FailedCountFuture: number = 0;
  PendingCountFuture: number = 0;
  ProgressCountFuture: number = 0;
  searchText: string = '';
  preBars: any;
  postBars: any;
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
  lastCMPLine: any = null;
  SelectedCountryId: any;
  SelectedCountryName: any;
  searchSubject: Subject<string> = new Subject<string>();
  currentPage = 1;
  pageSize = 10;
  pageSizeCommodity = 10;
  pageSizeFuture = 10;
  selectedDateRange: any;
  StartDate: any;
  EndDate: any
  pendingPage: number = 1;
  successPage: number = 1;
  failedPage: number = 1;
  progressPage: number = 1;
  pendingPagecommodity: number = 1;
  successPagecommodity: number = 1;
  failedPagecommodity: number = 1;
  progressPageCommodity: number = 1;
  pendingPageFuture: number = 1;
  successPageFuture: number = 1;
  failedPageFuture: number = 1;
  progressPageFuture: number = 1;
  highlightedStockTick: string = '';
  MatchedCount: number = 0;
  SearchDebounceFlag: boolean = false;
  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  pageSizeOptions = [10, 25, 50, 100, 500];
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  activeTab: string = 'Stocks'; // Default tab
  timeframe_forOrderList: any = null;
  private searchSubscription: Subscription;
  ViewGraphTimeFrame: any;
  FullChartResponse: any;
  QualifiedZoneFlag = false;
  isChecked: boolean = true;
  SETUPREQ = true;
  OptimizedBuySellZoneData: any;
  PreviousHighData: any;
  isPopupOpen = false;
  selectTradeType: any = "all";
  selectedTrade: any;
  SelectedExpiry:any;
  RRR:any;


  // TradingView fullscreen state
  isChartModalOpen = false;
  isLeftBarOpen = false;
  private chartResizeObserver: ResizeObserver | null = null;

  // Manual Buy/Sell rectangle drawings
  manualRectangleTool: RectangleDrawingTool | null = null;
  manualRectangles: ManualRectangleRecord[] = [];
  activeManualZoneType: 'BUY' | 'SELL' | null = null;

  // TradingView-style drawing tools
  chartDrawingTool: ChartDrawingTool | null = null;
  chartDrawingItems: ChartDrawingRecord[] = [];
  activeChartDrawingTool: ChartDrawingToolType = 'select';
  selectedChartDrawing: ChartDrawingRecord | null = null;
  drawingLineWidths: number[] = [1, 2, 3, 4, 5];
  drawingLineStyles: ChartDrawingLineStyle[] = ['solid', 'dashed', 'dotted'];


 private readonly FUTURE_SECONDS = 60 * 60 * 24 * 365 * 1;

  constructor(private elementRef: ElementRef, private webSocketService: WebSocketService, private cdRef: ChangeDetectorRef, private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService) { }


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
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();

    if (!this.isChartModalOpen) {
      return;
    }

    if (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target?.isContentEditable ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      return;
    }

    // Allow key-repeat only for continuous chart navigation.
    // Holding +, -, ArrowLeft, or ArrowRight should keep zooming/panning.
    // Zone toggles, timeframe switches, Delete, and Escape should run once.
    const isContinuousChartKey =
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === '+' ||
      event.key === '=' ||
      event.key === '-' ||
      event.code === 'NumpadAdd' ||
      event.code === 'NumpadSubtract';

    if (event.repeat && !isContinuousChartKey) {
      return;
    }

    if (event.key === 'Delete') {
      if (this.deleteSelectedDrawingByKeyboard()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    if (this.handleZoneShortcut(event)) {
      return;
    }
    switch (event.key) {
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
        this.closeChartModalFromKeyboard();
        break;
    }
    let dataPresent = false;

    if (this.activeTab === 'Stocks') {
      if (this.ViewGraphTimeFrame == 1) {
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
              this.toastr.error(`No Data Found !`);
            }
            break;
        }
      }

      if (this.ViewGraphTimeFrame == 2) {

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

      if (this.ViewGraphTimeFrame == 3) {
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

      if (this.ViewGraphTimeFrame == 25) {
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
              this.toastr.error(`No Data Found !`);
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
        }
      }

      if (this.ViewGraphTimeFrame == 5) {
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
              this.toastr.error(`No Data Found !`);
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

      if (this.ViewGraphTimeFrame == 6) {
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
              this.toastr.error(`No Data Found !`);
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

    else if (this.activeTab === 'Commodity') {
       if (this.ViewGraphTimeFrame == 1) {
        switch (event.key) {
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`);
            }
            break;
        }
      }

      if (this.ViewGraphTimeFrame == 2) {

        switch (event.key) {
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('two_forty', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.ViewGraphTimeFrame == 3) {
        switch (event.key) {
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('two_forty', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
            case '2':
            dataPresent = !!this.FullChartResponse['one_twenty'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('one_twenty', 'chart-container_new', true);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
        }
      }

      if (this.ViewGraphTimeFrame == 4) {
        switch (event.key) {
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('two_forty', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
            case '6':
            dataPresent = !!this.FullChartResponse['sixty'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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

    }

    else if (this.activeTab === 'Future') {
      if (this.ViewGraphTimeFrame == 1) {
        switch (event.key) {
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
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
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`);
            }
            break;
        }
      }

       if (this.ViewGraphTimeFrame == 2) {
        switch (event.key) {
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
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

      if (this.ViewGraphTimeFrame == 3) {
        switch (event.key) {
          case '5':
            dataPresent = !!this.FullChartResponse['fifteen'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
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
              // Preserve active zone selections while switching chart timeframe.
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

      if (this.ViewGraphTimeFrame == 25) {
        switch (event.key) {
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('weekly', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`);
            }
            break;
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = false;
              this.ChangeScreenMode('daily', 'chart-container_new', false);
            }
            else {
              this.toastr.error(`No Data Found !`)
            }
            break;
          case '7':
            dataPresent = !!this.FullChartResponse['seventy_five'];
            if (dataPresent) {
              // Preserve active zone selections while switching chart timeframe.
              this.dropdownShow = false;
              this.QualifiedZoneFlag = true;
              this.ChangeScreenMode('seventy_five', 'chart-container_new', true);
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
      this.disconnectWebSocket();
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
          case "two_forty":
            this.ModalHeader = "240 Minute";
            this.FullScreenModeValue = type;
            break;
          case "one_twenty":
            this.ModalHeader = "120 Minute";
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
        const PREPOSTDATA = this.FullChartResponse[type];
        const CHARTDATA = [...PREPOSTDATA.PRE, ...PREPOSTDATA.POST]
        this.preBars = PREPOSTDATA.PRE;
        this.postBars = PREPOSTDATA.POST;
        this.cleanup();
        this.LoadChart(CHARTDATA, chartId);
        this.applyViewGraphOverlapLogic(prevFullScreen); // ✅ NEW
        this.redrawSelectedZones()
        this.addPreviousHighPriceLine(type);
        const lastRow = CHARTDATA.slice(-1)[0];
        this.CreateClosingLine(lastRow.close)
        this.connectWebSocket(type)
  
        if (setupReq) {
          this.SETUPREQ = true;
          this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
        }
        else {
  
          this.SETUPREQ = false;
        }
      }
      else {
        this.toastr.error(`No Data found !`)
        return;
      }
  }
  
  private applyViewGraphOverlapLogic(prevFullScreen: string) {
    const tf = this.ViewGraphTimeFrame as number;

    // Map ViewGraphTimeFrame -> base fullscreen timeframe where overlaps are allowed
    // (Adjust if your mapping differs)
    const baseMap: Record<number, string> = {
      1: "daily",          // you said 1 is daily
      2: "sixty",
      3: "fifteen",
      5: "one_twenty_five",          // from your logic (targets monthly/weekly), base seems daily
      25: "seventy_five",
      6: "twenty_five",
    };

    const base = baseMap[tf];
    if (!base) return;

    // init memory
    if (!this.viewGraphOverlapMemory[tf]) {
      this.viewGraphOverlapMemory[tf] = { evaluate: false, analyze: false ,qualified:false};
    }

    // 1) If leaving base -> remember BOTH selections
    if (prevFullScreen === base) {
      this.viewGraphOverlapMemory[tf] = {
        evaluate: !!this.selectedOptions["overlap_evaluate"],
        analyze: !!this.selectedOptions["overlap_analyze"],
        qualified: !!this.selectedOptions["qualified_zones"]
      };
    }

    const mem = this.viewGraphOverlapMemory[tf];

    // 2) If returned to base -> restore BOTH, else clear UI flags (memory stays)
    if (this.FullScreenModeValue === base) {
      this.selectedOptions["overlap_evaluate"] = mem.evaluate;
      this.selectedOptions["overlap_analyze"]  = mem.analyze;
      this.selectedOptions["qualified_zones"]  = mem.qualified;
    } else {
      this.selectedOptions["overlap_evaluate"] = false;
      this.selectedOptions["overlap_analyze"]  = false;
      this.selectedOptions["qualified_zones"]  = false;
    }

    // 3) Calculate optimized dynamically (OR logic, both can trigger)
    this.selectedOptions.optimized_buy_sell_zone = false;

    // ---- ViewGraphTimeFrame == 2 ----

    if (tf === 1) {
      if (mem.evaluate && this.FullScreenModeValue === "monthly") this.selectedOptions.optimized_buy_sell_zone = true;
      if (mem.analyze && this.FullScreenModeValue === "weekly")  this.selectedOptions.optimized_buy_sell_zone = true;
    }

    if (tf === 2) {
      if (mem.evaluate && this.FullScreenModeValue === "weekly") this.selectedOptions.optimized_buy_sell_zone = true;
      if (mem.analyze && this.FullScreenModeValue === "daily")  this.selectedOptions.optimized_buy_sell_zone = true;
    }

    // ---- ViewGraphTimeFrame == 3 ----
    if (tf === 3) {
      if (mem.evaluate && this.FullScreenModeValue === "daily") this.selectedOptions.optimized_buy_sell_zone = true;
      if (mem.analyze && this.FullScreenModeValue === "sixty") this.selectedOptions.optimized_buy_sell_zone = true;
    }

    // ---- ViewGraphTimeFrame == 4 ----
    if (tf === 5) {
      if (mem.evaluate && this.FullScreenModeValue === "weekly") this.selectedOptions.optimized_buy_sell_zone = true;
      if (mem.analyze && this.FullScreenModeValue === "daily")   this.selectedOptions.optimized_buy_sell_zone = true;
    }

    // ---- ViewGraphTimeFrame == 5 ----
    if (tf === 25) {
      if (mem.evaluate && this.FullScreenModeValue === "weekly") this.selectedOptions.optimized_buy_sell_zone = true;
      if (mem.analyze && this.FullScreenModeValue === "daily")  this.selectedOptions.optimized_buy_sell_zone = true;
    }

    // ---- ViewGraphTimeFrame == 6 ----
    if (tf === 6) {
      if (mem.evaluate && this.FullScreenModeValue === "daily")          this.selectedOptions.optimized_buy_sell_zone = true;
      if (mem.analyze && this.FullScreenModeValue === "one_twenty_five") this.selectedOptions.optimized_buy_sell_zone = true;
    }
  }

  cleanup(): void {
    this.destroyInteractiveDrawingTools();
    this.disconnectChartResizeObserver();

    if (this.chart) {
      try { this.chart.remove(); } catch { }
      this.chart = null;
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
      // this.filteredOrders = [...this.successOrders];
    this.timeframe_forOrderList = null;
    this.SelectedCountryId = localStorage.getItem('selectedCountryId')
    this.SelectedCountryName = localStorage.getItem('selectedCountryName')
    this.Role = localStorage.getItem('role');
    this.selectedDateRange = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.xspan = 3600;
    this.stockDataFunc();
    this.buildForm();
    // this.GetOrderList();
    this.getorderscount();
    this.getCommodityorderscount();
    this.getFuturesorderscount();

    this.PrepDebounce();
    const storedData = localStorage.getItem('SelectedTrade');
    if (storedData) {
      this.selectedTrade = JSON.parse(storedData);
      if (this.selectedTrade.ExchangeName == "NSE") {
        this.activeMenu = this.selectedTrade.ActiveMenu
        this.activeTab = "Stocks";
        if (this.selectedTrade.ActiveMenu == "Success") {
          this.getSuccessOrders(false, this.selectedTrade.Trade_id);
          this.getFailedOrders();
          this.getPendingOrders();
          this.getProgressOrders();
        }
        if (this.selectedTrade.ActiveMenu == "Pending") {
          this.getSuccessOrders();
          this.getFailedOrders();
          this.getPendingOrders(false, this.selectedTrade.Trade_id);
          this.getProgressOrders();
        }
        if (this.selectedTrade.ActiveMenu == "Failed") {
          this.getSuccessOrders();
          this.getFailedOrders(false, this.selectedTrade.Trade_id);
          this.getPendingOrders();
          this.getProgressOrders();
        }
        if (this.selectedTrade.ActiveMenu == "Progress") {
          this.getSuccessOrders();
          this.getFailedOrders();
          this.getPendingOrders();
          this.getProgressOrders(false, this.selectedTrade.Trade_id);
        }
      }
      if (this.selectedTrade.ExchangeName == "MCX") {
        this.activeTab = "Commodity";
        this.activeMenuCommodity = this.selectedTrade.ActiveMenu
        if (this.selectedTrade.ActiveMenu == "Success") {
          this.getSuccessOrdersCommodity(false, this.selectedTrade.Trade_id);
          this.getFailedOrdersCommodity();
          this.getPendingOrdersCommodity();
          this.getProgressOrdersCommodity();
        }
        if (this.selectedTrade.ActiveMenu == "Pending") {
          this.getSuccessOrdersCommodity();
          this.getFailedOrdersCommodity();
          this.getPendingOrdersCommodity(false, this.selectedTrade.Trade_id);
          this.getProgressOrdersCommodity();
        }
        if (this.selectedTrade.ActiveMenu == "Failed") {
          this.getSuccessOrdersCommodity();
          this.getFailedOrdersCommodity(false, this.selectedTrade.Trade_id);
          this.getPendingOrdersCommodity();
          this.getProgressOrdersCommodity();
        }
        if (this.selectedTrade.ActiveMenu == "Progress") {
          this.getSuccessOrdersCommodity();
          this.getFailedOrdersCommodity();
          this.getPendingOrdersCommodity();
          this.getProgressOrdersCommodity(false, this.selectedTrade.Trade_id);
        }
      }
      if (this.selectedTrade.ExchangeName == "NSEFO") {
        this.activeTab = "Future";
        this.activeMenuFuture = this.selectedTrade.ActiveMenu
        if (this.selectedTrade.ActiveMenu == "Success") {
          this.getSuccessOrdersFuture(false, this.selectedTrade.Trade_id);
          this.getFailedOrdersFuture();
          this.getPendingOrdersFuture();
          this.getProgressOrdersFuture();
        }
        if (this.selectedTrade.ActiveMenu == "Pending") {
          this.getSuccessOrdersFuture();
          this.getFailedOrdersFuture();
          this.getPendingOrdersFuture(false, this.selectedTrade.Trade_id);
          this.getProgressOrdersFuture();
        }
        if (this.selectedTrade.ActiveMenu == "Failed") {
          this.getSuccessOrdersFuture();
          this.getFailedOrdersFuture(false, this.selectedTrade.Trade_id);
          this.getPendingOrdersFuture();
          this.getProgressOrdersFuture();
        }
        if (this.selectedTrade.ActiveMenu == "Progress") {
          this.getSuccessOrdersFuture();
          this.getFailedOrdersFuture();
          this.getPendingOrdersFuture();
          this.getProgressOrdersFuture(false, this.selectedTrade.Trade_id);
        }
      }
      localStorage.removeItem('SelectedTrade');
    } else {
      this.getSuccessOrders();
      this.getFailedOrders();
      this.getPendingOrders();
      this.getProgressOrders();

      this.getSuccessOrdersCommodity();
      this.getFailedOrdersCommodity();
      this.getPendingOrdersCommodity();
      this.getProgressOrdersCommodity();

      this.getSuccessOrdersFuture();
      this.getFailedOrdersFuture();
      this.getPendingOrdersFuture();
      this.getProgressOrdersFuture();
    }


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
        if (this.activeMenu === 'Success') {
          this.getSuccessOrders(true);
        } else if (this.activeMenu === 'Failed') {
          this.getFailedOrders(true);
        } else if (this.activeMenu === 'Pending') {
          this.getPendingOrders(true);
        } else if (this.activeMenu === 'Progress') {
          this.getProgressOrders(true);
        }
      }

      else if (this.activeTab === "Commodity") {
        if (this.activeMenuCommodity === 'Success') {
          this.getSuccessOrdersCommodity(true);
        } else if (this.activeMenuCommodity === 'Failed') {
          this.getFailedOrdersCommodity(true);
        } else if (this.activeMenuCommodity === 'Pending') {
          this.getPendingOrdersCommodity(true);
        } else {
          this.getProgressOrdersCommodity(true);
        }
      }

      else if (this.activeTab === "Future") {
        if (this.activeMenuFuture === 'Success') {
          this.getSuccessOrdersFuture(true);
        } else if (this.activeMenuFuture === 'Failed') {
          this.getFailedOrdersFuture(true);
        } else if (this.activeMenuFuture === 'Pending') {
          this.getPendingOrdersFuture(true);
        } else {
          this.getProgressOrdersFuture(true);
        }
      }
    });
  }

  getorderscount() {
    const requestPayload = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      time_frame: this.timeframe_forOrderList,
      order_type: this.selectTradeType,
      prediction_type:this.predictionFilter
    };
    this.apiService.getOrdersCountService(requestPayload).subscribe({
      next: (resp) => {
        this.SuccessCount = resp.response?.success;
        this.PendingCount = resp.response?.pending;
        this.FailedCount = resp.response?.failed;
        this.ProgressCount = resp.response?.in_progress;
      },
      error: (err) => {
        this.SuccessCount = this.PendingCount = this.FailedCount = 0;
      }
    });
  }

  getCommodityorderscount() {
    const requestPayload = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      order_type: this.selectTradeType,
      prediction_type:this.predictionFilter
    };
    this.apiService.getCommodityOrdersCountService(requestPayload).subscribe({
      next: (resp) => {
        this.SuccessCountCommodity = resp.response?.success;
        this.PendingCountCommodity = resp.response?.pending;
        this.FailedCountCommodity = resp.response?.failed;
        this.ProgressCountCommodity = resp.response?.in_progress
      },
      error: (err) => {
        this.SuccessCountCommodity = this.PendingCountCommodity = this.FailedCountCommodity = 0;
      }
    });
  }

  getFuturesorderscount() {
    const requestPayload = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      order_type: this.selectTradeType,
      prediction_type:this.predictionFilter
    };
    this.apiService.getFutureOrdersCountService(requestPayload).subscribe({
      next: (resp) => {
        this.SuccessCountFuture = resp.response?.success;
        this.PendingCountFuture = resp.response?.pending;
        this.FailedCountFuture = resp.response?.failed;
        this.ProgressCountFuture = resp.response?.in_progress;
      },
      error: (err) => {
        this.SuccessCountFuture = this.PendingCountFuture = this.FailedCountFuture = this.ProgressCountFuture = 0;
      }
    });
  }

  stock_screener() {
    this.router.navigate(['home']);
  }

  dashboard() {
    this.router.navigate(['dashboard']);
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['landing']);
  }

  autoorders() {
    this.router.navigate(['auto-order-list']);
  }

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  alerts() {
    this.router.navigate(['alerts']);
  }

  news() {
    this.router.navigate(['news']);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }

  getTimeFrameLabel(time_frame: number) {
    if(this.activeTab == "Stocks"){
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
    else if(this.activeTab== "Commodity"){
        switch (time_frame) {
      case 1: return "Daily";
      case 2: return "240 Minute";
      case 3: return "120 Minute";
      case 4: return "60 Minute";
      default: return "Unknown";
    }
    }
    else if(this.activeTab == "Future"){
        switch (time_frame) {
      case 1: return "Daily";
      case 2: return "60 Minute";
      case 3: return "15 Minute";
      case 25: return "75 Minute";
      default: return "Unknown";
    }
    }
    else{
      return null;
    }
  
  }

  stockDataFunc() {
    this.apiService.getStockList(localStorage.getItem('selectedCountryName')).subscribe(
      (data) => {
        this.stockData = data.response;
      },

    );
  }

  switchMenu(menu: string) {
    this.activeMenu = menu;
    this.searchText = '';
    this.pageSize = 10;
    if (menu === 'success') {
      this.successPage = 1;
      // this.FetchSuccessOrders(1);
    } else if (menu === 'failed') {
      this.failedPage = 1;
      // this.FetchFailedOrders(1);
    } else if (menu === 'pending') {
      this.pendingPage = 1;
      // this.FetchPendingOrders(1);
    }
  }

  switchMenuCommodity(menu: string) {
    this.activeMenuCommodity = menu;
    this.pageSizeCommodity = 10;
    this.searchText = '';
    if (menu === 'success') {
      this.successPagecommodity = 1;
      // this.FetchSuccessOrders(1);
    } else if (menu === 'failed') {
      this.failedPagecommodity = 1;
      // this.FetchFailedOrders(1);
    } else if (menu === 'pending') {
      this.pendingPagecommodity = 1;
      // this.FetchPendingOrders(1);
    }
    else {
      this.progressPageCommodity = 1;
    }
  }

  switchMenuFuture(menu: string) {
    this.activeMenuFuture = menu;
    this.pageSizeFuture = 10;
    this.searchText = '';
    if (menu === 'success') {
      this.successPageFuture = 1;
      // this.FetchSuccessOrders(1);
    } else if (menu === 'failed') {
      this.failedPageFuture = 1;
      // this.FetchFailedOrders(1);
    } else if (menu === 'pending') {
      this.pendingPageFuture = 1;
      // this.FetchPendingOrders(1);
    }
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
      this.activeMenu = "Success"
      this.successPage = 1;
      this.getSuccessOrders()
    } else if (menu === 'Commodity') {
      this.activeMenuCommodity = "Success";
      this.successPagecommodity = 1;
      this.getSuccessOrdersCommodity()
    } else if (menu === 'Future') {
      this.activeMenuFuture = "Success";
      this.successPageFuture = 1;
      this.getSuccessOrdersFuture()

    }
  }

  onTimeframeChangeForSuccess() {
    if (this.activeTab == 'Stocks') {
      this.getSuccessOrders();
      this.getFailedOrders();
      this.getPendingOrders();
      this.getProgressOrders();
      this.getorderscount();
    }
    else if (this.activeTab == 'Commodity') {
      this.getSuccessOrdersCommodity();
      this.getFailedOrdersCommodity();
      this.getPendingOrdersCommodity();
      this.getProgressOrdersCommodity();
      this.getCommodityorderscount();
    }
    else {
      this.getSuccessOrdersFuture();
      this.getFailedOrdersFuture();
      this.getPendingOrdersFuture();
      this.getProgressOrdersFuture();
      this.getFuturesorderscount();
    }
  }

  onOrderTypeChangeFilter() {
    if (this.activeTab == 'Stocks') {
      this.getSuccessOrders();
      this.getFailedOrders();
      this.getPendingOrders();
      this.getProgressOrders();
      this.getorderscount();
    }
    else if (this.activeTab == 'Commodity') {
      this.getSuccessOrdersCommodity();
      this.getFailedOrdersCommodity();
      this.getPendingOrdersCommodity();
      this.getProgressOrdersCommodity();
      this.getorderscount();
      this.getCommodityorderscount();
    }
    else {
      this.getSuccessOrdersFuture();
      this.getFailedOrdersFuture();
      this.getPendingOrdersFuture();
      this.getProgressOrdersFuture();
      this.getorderscount();
      this.getFuturesorderscount();
    }
  }

  getSuccessOrders(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSize,
      page_no: this.SearchDebounceFlag ? null : String(this.successPage),
      status: "success",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    this.apiService.getViewOrderListService(obj).subscribe(resp => {
      this.SearchDebounceFlag = false;
      this.successOrders = [];
      this.successOrders = resp.response.orders;
      
      if (highlight && this.searchText) {

        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.successOrders.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.successPage = resp.response.page_no;
            }
          });
        }
        else if (trade_id) {
          this.highlightByTradeId(trade_id, resp);
        }
        else {
          this.highlightedStockTick = '';
        }
      } 
      else if (trade_id) {
        this.highlightByTradeId(trade_id, resp);
      }
      else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getFailedOrders(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
  
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSize,
      page_no: this.SearchDebounceFlag ? null : String(this.failedPage),
      status: "failed",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    this.apiService.getViewOrderListService(obj).subscribe(resp => {
      console.log("Failed Response", resp);
      this.failedOrders = [];
      this.SearchDebounceFlag = false;
      this.failedOrders = resp.response.orders;
      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.failedOrders.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.failedPage = resp.response.page_no;
              console.log('Scrolled to:', this.highlightedStockTick);
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      }
      else if (trade_id) {
        this.highlightByTradeId(trade_id, resp);
      }
      else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getPendingOrders(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSize,
      page_no: this.SearchDebounceFlag ? null : String(this.pendingPage),
      status: "pending",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    console.log("Pending Object", obj);
    this.apiService.getViewOrderListService(obj).subscribe(resp => {
      console.log("Pending Response", resp);
      this.pendingOrders = [];
      this.SearchDebounceFlag = false;
      this.pendingOrders = resp.response.orders;

      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.pendingOrders.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.pendingPage = resp.response.page_no;
              console.log('Scrolled to:', this.highlightedStockTick);
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      }
      else if (trade_id) {
        this.highlightByTradeId(trade_id, resp);
      }
      else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getProgressOrders(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSize,
      page_no: this.SearchDebounceFlag ? null : String(this.progressPage),
      status: "progress",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    console.log("Progress Object", obj);
    this.apiService.getViewOrderListService(obj).subscribe(resp => {
      console.log("Progress Response", resp);
      this.progressOrders = [];
      this.SearchDebounceFlag = false;
      this.progressOrders = resp.response.orders;

      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.progressOrders.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.progressPage = resp.response.page_no;
              console.log('Scrolled to:', this.highlightedStockTick);
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      } 
      else if (trade_id) {
        this.highlightByTradeId(trade_id, resp);
      }
      else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  highlightByTradeId(tradeId: any, resp: any) {
    console.log("=== highlightByTradeId CALLED ===");
    console.log("Incoming tradeId:", tradeId);
    console.log("Response object:", resp);
    console.log("Active Menu:", this.selectedTrade.ActiveMenu);

    let match: any = null;


    if (this.selectedTrade.ExchangeName == "NSE") {
      this.activeTab = "Stocks";
      if (this.selectedTrade.ActiveMenu == "Pending") {
        console.log("Searching in pendingOrders...");
        match = this.pendingOrders.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.pendingPage = resp.response.page_no;
        console.log("Set pendingPage:", this.pendingPage);
      }

      if (this.selectedTrade.ActiveMenu == "Success") {
        console.log("Searching in successOrders...");
        match = this.successOrders.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.successPage = resp.response.page_no;
        console.log("Set successPage:", this.successPage);
      }

      if (this.selectedTrade.ActiveMenu == "Progress") {
        console.log("Searching in progressOrders...");
        match = this.progressOrders.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.progressPage = resp.response.page_no;
        console.log("Set progressPage:", this.progressPage);
      }

      if (this.selectedTrade.ActiveMenu == "Failed") {
        console.log("Searching in failedOrders...");
        match = this.failedOrders.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.failedPage = resp.response.page_no;
        console.log("Set failedPage:", this.failedPage);
      }
    }

    if (this.selectedTrade.ExchangeName == "MCX") {
      this.activeTab = "Commodity";
      if (this.selectedTrade.ActiveMenu == "Pending") {
        console.log("Searching in pendingOrders...");
        match = this.pendingOrdersCommodity.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.pendingPagecommodity = resp.response.page_no;
        console.log("Set pendingPage:", this.pendingPage);
      }

      if (this.selectedTrade.ActiveMenu == "Success") {
        console.log("Searching in successOrders...");
        match = this.successOrdersCommodity.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.successPagecommodity = resp.response.page_no;
        console.log("Set successPage:", this.successPage);
      }

      if (this.selectedTrade.ActiveMenu == "Progress") {
        console.log("Searching in progressOrders...");
        match = this.progressOrdersCommodity.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.progressPageCommodity = resp.response.page_no;
        console.log("Set progressPage:", this.progressPage);
      }

      if (this.selectedTrade.ActiveMenu == "Failed") {
        console.log("Searching in failedOrders...");
        match = this.failedOrdersCommodity.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.failedPagecommodity = resp.response.page_no;
        console.log("Set failedPage:", this.failedPage);
      }
    }

    if (this.selectedTrade.ExchangeName == "NSEFO") {
      this.activeTab = "Future";
      if (this.selectedTrade.ActiveMenu == "Pending") {
        console.log("Searching in pendingOrders...");
        match = this.pendingOrdersFuture.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.pendingPageFuture = resp.response.page_no;
        console.log("Set pendingPage:", this.pendingPage);
      }

      if (this.selectedTrade.ActiveMenu == "Success") {
        console.log("Searching in successOrders...");
        match = this.successOrdersFuture.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.successPageFuture = resp.response.page_no;
        console.log("Set successPage:", this.successPage);
      }

      if (this.selectedTrade.ActiveMenu == "Progress") {
        console.log("Searching in progressOrders...");
        match = this.progressOrdersFuture.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.progressPageFuture = resp.response.page_no;
        console.log("Set progressPage:", this.progressPage);
      }

      if (this.selectedTrade.ActiveMenu == "Failed") {
        console.log("Searching in failedOrders...");
        match = this.failedOrdersFuture.find(
          (order: { trade_signal_id: any }) => order.trade_signal_id == tradeId
        );
        this.failedPageFuture = resp.response.page_no;
        console.log("Set failedPage:", this.failedPage);
      }
    }


    console.log("Match found:", match);

    if (match) {
      this.highlightedTradeId = tradeId;
      this.highlightedStockTick = match.stock_tick;
      console.log("✅ Highlight set:", {
        highlightedTradeId: this.highlightedTradeId,
        highlightedStockTick: this.highlightedStockTick,
      });

      setTimeout(() => {
        console.log("⏳ setTimeout triggered after 3s");
        console.log("Finding target element for stock:", this.highlightedStockTick);

        const target = this.stockCells.find(cell => {
          const stockAttr = cell.nativeElement.getAttribute("data-stock");
          const isMatch =
            stockAttr?.toLowerCase() === this.highlightedStockTick.toLowerCase() &&
            match.trade_signal_id == this.highlightedTradeId;

          console.log("Checking cell:", {
            stockAttr,
            highlightedStockTick: this.highlightedStockTick,
            highlightedTradeId: this.highlightedTradeId,
            isMatch,
          });

          return isMatch;
        });

        console.log("Target found:", target);

        if (target) {
          console.log("✅ Scrolling to target...");
          target.nativeElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          // if (this.selectedTrade.ActiveMenu == "Pending") {
          //   this.pendingPage = resp.response.page_no;
          //   console.log("Set pendingPage:", this.pendingPage);
          // }
          // if (this.selectedTrade.ActiveMenu == "Success") {
          //   this.successPage = resp.response.page_no;
          //   console.log("Set successPage:", this.successPage);
          // }
          // if (this.selectedTrade.ActiveMenu == "Progress") {
          //   this.progressPage = resp.response.page_no;
          //   console.log("Set progressPage:", this.progressPage);
          // }
          // if (this.selectedTrade.ActiveMenu == "Failed") {
          //   this.failedPage = resp.response.page_no;
          //   console.log("Set failedPage:", this.failedPage);
          // }
        } else {
          console.log("❌ No target cell found for highlighting!");
        }
      });
    } else {
      console.log("❌ No match found, resetting highlight...");
      this.highlightedTradeId = null;
      this.highlightedStockTick = "";
    }

    console.log("=== highlightByTradeId END ===");
  }

  parseOrderStatus(data: any): any {
    try {
      if (typeof data === 'string') {
        // Replace single quotes with double quotes to make it valid JSON
        const validJson = data.replace(/'/g, '"');
        return JSON.parse(validJson);
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  goBack() {
    this.router.navigate(['home'])
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

  update() {
    this.spinner.show();
    this.apiService.updateOrderEntryStats().subscribe(resp => {
      this.apiService.updateOrderStatusService().subscribe(resp => {
        this.spinner.hide();
        window.location.reload();
      });
    })
  }

  calculateRR(entry_price: number, stoploss_price: number, target_price: number) {
  const risk = Math.abs(entry_price - stoploss_price);
  const reward = Math.abs(target_price - entry_price);

  if (risk === 0) {
    throw new Error("Stoploss cannot be equal to entry price, risk would be zero.");
  }

  return reward / risk;
}

  ViewGraph(order_id: any, stock_name: any, entry_price: any, stoploss_price: any, target_price: any, purchased_date: any, completed_on: any, entry_timestamp: any, order_type: any, order_status: any, time_frame: any, expiry_date: any,stock_id:any) {
  this.isChartModalOpen = true;
  this.isLeftBarOpen = false;
  this.showReasonPanel = false;
  this.resetDrawingsForNewOrder();
  this.disconnectWebSocket()
  this.UpdateCnadleStockId=stock_id;
  let container = document.getElementById('chart-container_new');
  if (container) {
    container.innerHTML = '';
  }
    this.SelectedExpiry=expiry_date
    this.selectedOrderId = order_id;
    this.RRR=this.calculateRR(entry_price,stoploss_price,target_price)
    this.spinner.show();
    this.SpinnerCounter = 0;
    this.ViewGraphTimeFrame = time_frame;
    this.QualifiedZoneFlag = true;
    this.ChartRESPONSE = [];
    this.FullChartResponse = [];
    let exchange_type = "";
    this.SETUPREQ = true;
    this.SelectedStockName = stock_name;
    this.showmsg = "Analyzing Data and Generating Your Graph... Please Wait.";
    if (this.activeTab == "Stocks") {
      exchange_type = "cash";
    }
    else if (this.activeTab == "Future") {
      exchange_type = "futures";
    }
    else {
      exchange_type = this.activeTab
    }
    this.apiService.getGraphByOrderService(order_id, this.SelectedCountryName, exchange_type).subscribe(resp => {
      this.FullChartResponse = resp.response;
      if (this.activeTab == "Stocks") {
        this.getReasonForStocks()
        this.FetchStockZones(stock_name, time_frame, purchased_date, this.FullChartResponse, entry_timestamp, completed_on, entry_price, stoploss_price, target_price, order_type)
      }
      if (this.activeTab == "Commodity") {
        // this.getReasonForCommodity("commodity")
        this.fetchCommodityZones(stock_name, time_frame, purchased_date, this.FullChartResponse, entry_timestamp, completed_on, entry_price, stoploss_price, target_price, order_type, expiry_date)
      }
      if (this.activeTab == "Future") {
        // this.getReasonForCommodity("futures")
        this.fetchFutureZones(stock_name, time_frame, purchased_date, this.FullChartResponse, entry_timestamp, completed_on, entry_price, stoploss_price, target_price, order_type, expiry_date)
      }
    })
  }


  FetchStockZones(stock_name: any, time_frame: any, purchased_date: any, resp: any, entry_timestamp: any, completed_on: any, entry_price: any, stoploss_price: any, target_price: any, order_type: any) {
    this.spinner.show();
    this.finData = {
      country: localStorage.getItem('selectedCountryName'),
      tick: stock_name,
      time_frame: time_frame,
      last_d_time: purchased_date
    }
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
    if (time_frame == 1) {
      this.FullScreenModeValue = "daily";
      this.ModalHeader = "daily";
    }
    if (time_frame == 2) {
      this.FullScreenModeValue = "sixty";
      this.ModalHeader = "60 minute";
    }
    if (time_frame == 3) {
      this.FullScreenModeValue = "fifteen";
      this.ModalHeader = "15 minute";
    }
    if (time_frame == 25) {
      this.FullScreenModeValue = "seventy_five";
      this.ModalHeader = "75 minute";
    }
    if (time_frame == 5) {
      this.FullScreenModeValue = "one_twenty_five";
      this.ModalHeader = "125 minute";
    }
    if (time_frame == 6) {
      this.FullScreenModeValue = "twenty_five";
      this.ModalHeader = "25 minute";
    }
    if (this.activeMenu == "Pending") {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.fifteen.PRE, ...resp.fifteen.POST];
      }
      if (this.ViewGraphTimeFrame == 25) {
        this.ChartRESPONSE = [...resp.seventy_five.PRE, ...resp.seventy_five.POST];
      }
      if (this.ViewGraphTimeFrame == 5) {
        this.ChartRESPONSE = [...resp.one_twenty_five.PRE, ...resp.one_twenty_five.POST];
      }
      if (this.ViewGraphTimeFrame == 6) {
        this.ChartRESPONSE = [...resp.twenty_five.PRE, ...resp.twenty_five.POST];
      }
    }
    else if (this.activeMenu == "Progress") {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.fifteen.PRE, ...resp.fifteen.POST];
      }
      if (this.ViewGraphTimeFrame == 25) {
        this.ChartRESPONSE = [...resp.seventy_five.PRE, ...resp.seventy_five.POST];
      }
      if (this.ViewGraphTimeFrame == 5) {
        this.ChartRESPONSE = [...resp.one_twenty_five.PRE, ...resp.one_twenty_five.POST];
      }
      if (this.ViewGraphTimeFrame == 6) {
        this.ChartRESPONSE = [...resp.twenty_five.PRE, ...resp.twenty_five.POST];
      }
    }
    else {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
        this.preBars = resp.daily.PRE;
        this.postBars = resp.daily.POST;
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
        this.preBars = resp.sixty.PRE;
        this.postBars = resp.sixty.POST;
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.fifteen.PRE, ...resp.fifteen.POST];
        this.preBars = resp.fifteen.PRE;
        this.postBars = resp.fifteen.POST;
      }
      if (this.ViewGraphTimeFrame == 25) {
        this.ChartRESPONSE = [...resp.seventy_five.PRE, ...resp.seventy_five.POST];
        this.preBars = resp.seventy_five.PRE;
        this.postBars = resp.seventy_five.POST;
      }
      if (this.ViewGraphTimeFrame == 5) {
        this.ChartRESPONSE = [...resp.one_twenty_five.PRE, ...resp.one_twenty_five.POST];
      }
      if (this.ViewGraphTimeFrame == 6) {
        this.ChartRESPONSE = [...resp.twenty_five.PRE, ...resp.twenty_five.POST];
      }
    }
    const promises = [
      this.GetQualifiedZones(),
      this.GetAllZones(),
      this.GetBaseCandleData(),
      this.GetBuyZoneData(),
      this.GetSellZoneData(),
      this.OverLayFetching(),
      this.BadZones(),
      this.OptimizedBuySellZoneFunc(),
      this.previousHighService()
    ];
    Promise.all(promises).then(() => {
      const lastRow = this.ChartRESPONSE[this.ChartRESPONSE.length - 1];
      this.lastTime = lastRow.time;
      this.LoadChart(this.ChartRESPONSE, "chart-container_new");
      this.purchased_date = purchased_date;
      this.entry_timestamp = entry_timestamp;
      this.completed_on = completed_on;
      this.entry_price = entry_price;
      this.stoploss_price = stoploss_price;
      this.target_price = target_price;
      this.order_type = order_type;
      this.addPreviousHighPriceLine(this.FullScreenModeValue)
      this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      // if (this.activeMenu == "Success" || this.activeMenu == "Failed") {
      //   this.entryMark(
      //     this.barReplaytimestampInSeconds_entry,
      //     this.barReplaytimestampInSeconds_completed,
      //     this.barReplayorder_type
      //   );
      // }
      this.checkboxClicked('qualified_zones')
      this.connectWebSocket(this.FullScreenModeValue)
      this.spinner.hide();
    }).catch((error) => {
      console.error("Error occurred during API calls", error);
      this.spinner.hide();
    })
    ;
  }

  fetchCommodityZones(stock_name: any, time_frame: any, purchased_date: any, resp: any, entry_timestamp: any, completed_on: any, entry_price: any, stoploss_price: any, target_price: any, order_type: any, expiry_date: any) {
    this.spinner.show();
    const originalDateString = purchased_date;
    const originalDate = new Date(originalDateString);
    const year = originalDate.getFullYear();
    const month = ('0' + (originalDate.getMonth() + 1)).slice(-2);
    const day = ('0' + originalDate.getDate()).slice(-2);
    const hours = ('0' + originalDate.getHours()).slice(-2);
    const minutes = ('0' + originalDate.getMinutes()).slice(-2);
    const seconds = ('0' + originalDate.getSeconds()).slice(-2);
    const formattedDateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    this.finData = {
      st_sym: stock_name,
      exp_dt: expiry_date,
      last_d_time: formattedDateString
    }

    if (time_frame == 1) {
      this.FullScreenModeValue = "daily";
      this.ModalHeader = "daily";
    }
    if (time_frame == 2) {
      this.FullScreenModeValue = "two_forty";
      this.ModalHeader = "240 minute";
    }
    if (time_frame == 3) {
      this.FullScreenModeValue = "one_twenty";
      this.ModalHeader = "120 minute";
    }
    if (time_frame == 4) {
      this.FullScreenModeValue = "sixty";
      this.ModalHeader = "60 minute";
    }
    if (this.activeMenuCommodity == "Pending") {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.two_forty.PRE, ...resp.two_forty.POST];
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.one_twenty.PRE, ...resp.one_twenty.POST];
      }
      if (this.ViewGraphTimeFrame == 4) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
      }
    }
    else if (this.activeMenuCommodity == "Progress") {
     if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.two_forty.PRE, ...resp.two_forty.POST];
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.one_twenty.PRE, ...resp.one_twenty.POST];
      }
      if (this.ViewGraphTimeFrame == 4) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
      }
    }
    else {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
        this.preBars = resp.daily.PRE;
        this.postBars = resp.daily.POST;
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.two_forty.PRE, ...resp.two_forty.POST];
        this.preBars = resp.two_forty.PRE;
        this.postBars = resp.two_forty.POST;
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.one_twenty.PRE, ...resp.one_twenty.POST];
        this.preBars = resp.one_twenty.PRE;
        this.postBars = resp.one_twenty.POST;
      }
       if (this.ViewGraphTimeFrame == 4) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
        this.preBars = resp.sixty.PRE;
        this.postBars = resp.sixty.POST;
      }
    }
    this.finData.time_frame = time_frame;
    const promises = [
      this.GetQualifiedZonesForMcx(),
      this.GetBaseCandleDataForMcx(),
      this.OverLayFetchingForMcx(),
      this.BadZonesForMCX(),
      this.OptimizedBuySellZoneMCX(),
      this.previousHighServiceForMcxNsefo("commodity")
    ];
    Promise.all(promises).then(() => {
      const lastRow = this.ChartRESPONSE[this.ChartRESPONSE.length - 1];
      this.lastTime = lastRow.time;
      this.LoadChart(this.ChartRESPONSE, "chart-container_new");
      this.purchased_date = purchased_date;
      this.entry_timestamp = entry_timestamp;
      this.completed_on = completed_on;
      this.entry_price = entry_price;
      this.stoploss_price = stoploss_price;
      this.target_price = target_price;
      this.order_type = order_type;
      
      this.addPreviousHighPriceLine(this.FullScreenModeValue)
      this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      // if (this.activeMenuCommodity == "Success" || this.activeMenuCommodity == "Failed") {
      //   this.entryMark(
      //     this.barReplaytimestampInSeconds_entry,
      //     this.barReplaytimestampInSeconds_completed,
      //     this.barReplayorder_type
      //   );
      // }
      this.checkboxClicked('qualified_zones')
      this.spinner.hide();
    }).catch((error) => {
      console.error("Error occurred during API calls", error);
      this.spinner.hide();
    });
  }

  fetchFutureZones(stock_name: any, time_frame: any, purchased_date: any, resp: any, entry_timestamp: any, completed_on: any, entry_price: any, stoploss_price: any, target_price: any, order_type: any, expiry_date: any) {
    this.spinner.show();
    const originalDateString = purchased_date;
    const originalDate = new Date(originalDateString);
    const year = originalDate.getFullYear();
    const month = ('0' + (originalDate.getMonth() + 1)).slice(-2);
    const day = ('0' + originalDate.getDate()).slice(-2);
    const hours = ('0' + originalDate.getHours()).slice(-2);
    const minutes = ('0' + originalDate.getMinutes()).slice(-2);
    const seconds = ('0' + originalDate.getSeconds()).slice(-2);
    const formattedDateString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    this.finData = {
      st_sym: stock_name,
      exp_dt: expiry_date,
      last_d_time: formattedDateString
    }

    if (time_frame == 1) {
      this.FullScreenModeValue = "daily";
      this.ModalHeader = "daily";
    }
    if (time_frame == 2) {
      this.FullScreenModeValue = "sixty";
      this.ModalHeader = "60 minute";
    }
    if (time_frame == 3) {
      this.FullScreenModeValue = "fifteen";
      this.ModalHeader = "15 minute";
    }
    if (time_frame == 25) {
      this.FullScreenModeValue = "seventy_five";
      this.ModalHeader = "75 minute";
    }
    if (this.activeMenuFuture == "Pending") {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.fifteen.PRE, ...resp.fifteen.POST];
      }
      if (this.ViewGraphTimeFrame == 25) {
        this.ChartRESPONSE = [...resp.seventy_five.PRE, ...resp.seventy_five.POST];
      }
    }
    else if (this.activeMenuFuture == "Progress") {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.fifteen.PRE, ...resp.fifteen.POST];
      }
      if (this.ViewGraphTimeFrame == 25) {
        this.ChartRESPONSE = [...resp.seventy_five.PRE, ...resp.seventy_five.POST];
      }
    }
    else {
      if (this.ViewGraphTimeFrame == 1) {
        this.ChartRESPONSE = [...resp.daily.PRE, ...resp.daily.POST];
        this.preBars = resp.daily.PRE;
        this.postBars = resp.daily.POST;
      }
      if (this.ViewGraphTimeFrame == 2) {
        this.ChartRESPONSE = [...resp.sixty.PRE, ...resp.sixty.POST];
        this.preBars = resp.sixty.PRE;
        this.postBars = resp.sixty.POST;
      }
      if (this.ViewGraphTimeFrame == 3) {
        this.ChartRESPONSE = [...resp.fifteen.PRE, ...resp.fifteen.POST];
        this.preBars = resp.fifteen.PRE;
        this.postBars = resp.fifteen.POST;
      }
      if (this.ViewGraphTimeFrame == 25) {
        this.ChartRESPONSE = [...resp.seventy_five.PRE, ...resp.seventy_five.POST];
        this.preBars = resp.seventy_five.PRE;
        this.postBars = resp.seventy_five.POST;
      }
    }
    this.finData.time_frame = time_frame;
    const promises = [
      this.GetQualifiedZonesForNSEFO(),
      this.GetBaseCandleDataForNSEFO(),
      this.OverLayFetchingForNSEFO(),
      this.BadZonesForNSEFO(),
      this.OptimizedBuySellZoneNSEFO(),
      this.previousHighServiceForMcxNsefo("futures")
    ];
    Promise.all(promises).then(() => {
      const lastRow = this.ChartRESPONSE[this.ChartRESPONSE.length - 1];
      this.lastTime = lastRow.time;
      this.LoadChart(this.ChartRESPONSE, "chart-container_new");
      this.purchased_date = purchased_date;
      this.entry_timestamp = entry_timestamp;
      this.completed_on = completed_on;
      this.entry_price = entry_price;
      this.stoploss_price = stoploss_price;
      this.target_price = target_price;
      this.order_type = order_type;
       
      this.addPreviousHighPriceLine(this.FullScreenModeValue)
      this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      // if (this.activeMenuFuture == "Success" || this.activeMenuFuture == "Failed") {
      //   this.entryMark(
      //     this.barReplaytimestampInSeconds_entry,
      //     this.barReplaytimestampInSeconds_completed,
      //     this.barReplayorder_type
      //   );
      // }
     this.checkboxClicked('qualified_zones')
      this.spinner.hide();
    }).catch((error) => {
      console.error("Error occurred during API calls", error);
      this.spinner.hide();
    });
  }

  getsetup(purchased_date: any, entry_timestamp: any, completed_on: any, entry_price: any, stoploss_price: any, target_price: any, order_type: any) {
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
    const year3 = istDateObject.getUTCFullYear();
    const month3 = String(istDateObject.getUTCMonth() + 1).padStart(2, '0');
    const day3 = String(istDateObject.getUTCDate()).padStart(2, '0');
    const hours3 = String(istDateObject.getUTCHours()).padStart(2, '0');
    const minutes3 = String(istDateObject.getUTCMinutes()).padStart(2, '0');
    const seconds3 = String(istDateObject.getUTCSeconds()).padStart(2, '0');
    const entryddateOnly = `${year3}-${month3}-${day3} ${hours3}:${minutes3}:${seconds3}`;
    const entrydateObjectNumber = new Date(entryddateOnly);
    const timestampInMillisecondsss = entrydateObjectNumber.getTime();
    const timestampInSeconds_entry = Math.floor(timestampInMillisecondsss / 1000);

    // const CompleteddateObject = new Date(
    //   new Date(
    //     completed_on ? completed_on + 'Z' : new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'
    //   ).getTime() + 10 * 24 * 60 * 60 * 1000
    // );

    const CompleteddateObject = new Date(
      completed_on ? completed_on + 'Z' : new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'
    )

    if(this.activeMenu=="Progress" || this.activeMenu=="Pending" || this.activeMenuCommodity=="Progress" ||
       this.activeMenuCommodity=="Pending" || this.activeMenuFuture=="Progress" || this.activeMenuFuture=="Pending")
    {
      let adjustedTimestamp = timestampInSeconds_purchased;
      if (this.ViewGraphTimeFrame == 1) {
        // add 30 days
        adjustedTimestamp += 30 * 24 * 60 * 60;
      } else if (this.ViewGraphTimeFrame == 2) {
        // add 720 hours (30 days)
        adjustedTimestamp += 720 * 60 * 60;
      } else if (this.ViewGraphTimeFrame == 3) {
        // add 720 hours again (same as case 2)
        adjustedTimestamp += 720 * 60 * 60;
      }else if (this.ViewGraphTimeFrame == 25) {
        // add 720 hours again (same as case 2)
        adjustedTimestamp += 720 * 60 * 60;
      }else if (this.ViewGraphTimeFrame == 4) {
        // add 720 hours again (same as case 2)
        adjustedTimestamp += 720 * 60 * 60;
      }
      else if (this.ViewGraphTimeFrame == 5) {
        // add 720 hours again (same as case 2)
        adjustedTimestamp += 720 * 60 * 60;
      }else if (this.ViewGraphTimeFrame == 6) {
        // add 720 hours again (same as case 2)
        adjustedTimestamp += 720 * 60 * 60;
      }
      this.timestampInSeconds_completed = adjustedTimestamp;
      console.log("Final Adjusted Timestamp (in seconds):", this.timestampInSeconds_completed);
    }
    else{
 // const CompleteddateObject = new Date(completed_on + 'Z');
    const istOffset2 = 5.5 * 60 * 60 * 1000;
    const istDateObject2 = new Date(CompleteddateObject.getTime() + istOffset2);
    const year2 = istDateObject2.getUTCFullYear();
    const month2 = String(istDateObject2.getUTCMonth() + 1).padStart(2, '0');
    const day2 = String(istDateObject2.getUTCDate()).padStart(2, '0');
    const hours2 = String(istDateObject2.getUTCHours()).padStart(2, '0');
    const minutes2 = String(istDateObject2.getUTCMinutes()).padStart(2, '0');
    const seconds2 = String(istDateObject2.getUTCSeconds()).padStart(2, '0');
    const entryddateOnly2 = `${year2}-${month2}-${day2} ${hours2}:${minutes2}:${seconds2}`;
    const completeddateObjectNumber = new Date(entryddateOnly2);
    const timestampInMillisecondss = completeddateObjectNumber.getTime();
    this.timestampInSeconds_completed = Math.floor(timestampInMillisecondss / 1000);
    }

   


    this.addEntryPriceLine(entry_price, timestampInSeconds_purchased, this.timestampInSeconds_completed)
    this.addStoplossPriceLine(stoploss_price, timestampInSeconds_purchased, this.timestampInSeconds_completed)
    this.addTargetPriceLine(target_price, timestampInSeconds_purchased, this.timestampInSeconds_completed)


    if (this.activeMenu == "Success" || this.activeMenuCommodity == "Success" || this.activeMenuFuture == "Success") {
      this.barReplaytimestampInSeconds_completed = this.timestampInSeconds_completed;
      this.barReplaytimestampInSeconds_entry = timestampInSeconds_entry;
      this.barReplayorder_type = order_type;
      // this.entryMark(timestampInSeconds_entry, this.timestampInSeconds_completed, order_type);
    }
    if (this.activeMenu == "Failed" || this.activeMenuCommodity == "Failed" || this.activeMenuFuture == "Failed") {
      this.barReplaytimestampInSeconds_completed = this.timestampInSeconds_completed;
      this.barReplaytimestampInSeconds_entry = timestampInSeconds_entry;
      this.barReplayorder_type = order_type;
      // this.stoplossMark(timestampInSeconds_entry, this.timestampInSeconds_completed, order_type)
    }

    if (this.activeMenu == "Pending") {
      this.barReplaytimestampInSeconds_completed = this.timestampInSeconds_completed;
      this.barReplaytimestampInSeconds_entry = timestampInSeconds_entry;
      this.barReplayorder_type = order_type;
      this.addEntryPriceLine(entry_price, timestampInSeconds_purchased, this.lastTime)
      this.addStoplossPriceLine(stoploss_price, timestampInSeconds_purchased, this.lastTime)
      this.addTargetPriceLine(target_price, timestampInSeconds_purchased, this.lastTime)
      // this.entryMark(timestampInSeconds_entry, this.lastTime, order_type);
    }
    this.candlestickSeries.setMarkers([]);

    if (this.SETUPREQ) {
      if(this.activeTab== "Stocks"){
           if(this.activeMenu == "Failed" || this.activeMenu == "Success"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      if(this.activeMenu == "Progress"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      }

      if(this.activeTab== "Commodity"){
           if(this.activeMenuCommodity == "Failed" || this.activeMenuCommodity == "Success"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      if(this.activeMenuCommodity == "Progress"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      }

      if(this.activeTab== "Future"){
           if(this.activeMenuFuture == "Failed" || this.activeMenuFuture == "Success"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      if(this.activeMenuFuture == "Progress"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      }
   
      // if (this.activeMenu == "Failed" || this.activeMenuCommodity == "Failed" || this.activeMenuFuture == "Failed") {
      //   this.entryMark(
      //     this.barReplaytimestampInSeconds_entry,
      //     this.barReplaytimestampInSeconds_completed,
      //     this.barReplayorder_type
      //   );
      // }
      // if (this.activeMenu == "Success" || this.activeMenuCommodity == "Success" || this.activeMenuFuture == "Success") {
      //   this.entryMark(
      //     this.barReplaytimestampInSeconds_entry,
      //     this.barReplaytimestampInSeconds_completed,
      //     this.barReplayorder_type
      //   );
      // }
    }
  }

  // STOCK ZONES START

  BadZones() {
    this.BadZoneData = []
    this.apiService.GetBadZoneDataService(this.finData).subscribe(resp => {
      this.BadZoneData = resp.response;
    });
  }

  GetBaseCandleData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetBaseCandleData(this.finData).subscribe({
        next: (resp) => {
          this.BaseCandleData = resp.response;
          // console.log("RESPONSE 3 (BASE CANDLES)", this.BaseCandleData);
          resolve();
        },
        error: (err) => {
          reject(err);
        }
      });
    });
  }

  GetQualifiedZones(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetQualifiedZoneService(this.finData).subscribe({
        next: (resp) => {
          this.QualifiedData = resp.response;
          // console.log("RESPONSE 1 (QUALIFIED ZONES)", this.QualifiedData);
          resolve();
        },
        error: (err) => {
          console.error("Error in GetQualifiedZones", err);
          reject(err);
        }
      });
    });
  }

  GetBuyZoneData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetBuyZoneDataService(this.finData).subscribe({
        next: (resp) => {
          this.BuyZoneData = resp.response;
          // console.log("RESPONSE 4 (BUY ZONES)", this.BuyZoneData);
          resolve();
        },
        error: (err) => {
          console.error("Error in GetBuyZoneData", err);
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
          // console.log("RESPONSE 5 (SELL ZONES)", this.SellZoneData);
          resolve();
        },
        error: (err) => {
          console.error("Error in GetSellZoneData", err);
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
          this.BuyOverlayData = this.OverLayCandleData.Buy;
          this.SellOverlayData = this.OverLayCandleData.Sell;
          // console.log("RESPONSE 6 (OVERLAY ZONES)", this.OverLayCandleData);
          resolve();
        },
        error: (err) => {
          console.error("Error in OverLayFetching", err);
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
          // console.log("RESPONSE 2 (ALL ZONES)", this.AllZonesData);
          resolve();
        },
        error: (err) => {
          console.error("Error in GetAllZones", err);
          reject(err);
        }
      });
    });
  }

  OptimizedBuySellZoneFunc(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetOptimizedBuySellZoneService(this.finData).subscribe({
        next: (resp) => {
          this.OptimizedBuySellZoneData = resp.response;
          // console.log("RESPONSE 2 (ALL OptimizedBuySellZoneData)", this.OptimizedBuySellZoneData);
          resolve();
        },
        error: (err) => {
          console.error("Error in OptimizedBuySellZoneData", err);
          reject(err);
        }
      });
    });
  }

  // STOCK ZONES END

  // COMMODITY ZONES START

  GetQualifiedZonesForMcx(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.showmsg = "Fetching Data !";
      this.apiService.GetMcxQualifiedZoneCandleData(this.finData).subscribe({
        next: (resp) => {
          // console.log("Qualified Zone Commodity", resp);
          this.QualifiedData = resp.response;
          resolve();
        },
        error: (err) => {
          console.error("Error in GetQualifiedZonesForMcx", err);
          reject(err);
        }
      });
    });
  }

  OptimizedBuySellZoneMCX(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetOptimizedBuySellZoneMCXService(this.finData).subscribe({
        next: (resp) => {
          this.OptimizedBuySellZoneData = resp.response;
          // console.log("OPT ZONE Data Commodity", this.OptimizedBuySellZoneData);
          resolve();
        },
        error: (err) => {
          console.error("Error in GetOptimizedBuySellZoneMCX", err);
          reject(err);
        }
      });
    });
  }

  GetBaseCandleDataForMcx(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetMcxBaseCandleData(this.finData).subscribe({
        next: (resp) => {
          this.BaseCandleData = resp.response;
          // console.log("Base Candle Data Commodity", this.BaseCandleData);
          resolve();
        },
        error: (err) => {
          console.error("Error in GetBaseCandleDataForMcx", err);
          reject(err);
        }
      });
    });
  }

  OverLayFetchingForMcx(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetMcxOverLayZoneService(this.finData).subscribe({
        next: (resp: any) => {
          // console.log("Overlay Data Commodity", resp);
          this.OverLayCandleData = resp.response;
          this.BuyOverlayData = this.OverLayCandleData.Buy;
          this.SellOverlayData = this.OverLayCandleData.Sell;
          this.spinner.hide();
          resolve();
        },
        error: (err) => {
          console.error("Error in OverLayFetchingForMcx", err);
          this.spinner.hide();
          reject(err);
        }
      });
    });
  }

  BadZonesForMCX(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.BadZoneData = [];
      this.apiService.GetMcxBadZoneCandleData(this.finData).subscribe({
        next: (resp) => {
          this.BadZoneData = resp.response;
          resolve();
        },
        error: (err) => {
          console.error("Error in BadZonesForMCX", err);
          reject(err);
        }
      });
    });
  }

  // COMMODITY ZONES END

  // FUTURE ZONES START

  GetQualifiedZonesForNSEFO(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.showmsg = "Fetching Data !";
      this.apiService.GetFutureQualifiedZoneCandleData(this.finData).subscribe({
        next: (resp) => {
          // console.log("Qualified Zone", resp);
          this.QualifiedData = resp.response;
          resolve();
        },
        error: (err) => {
          console.error("Error in GetQualifiedZonesForNSEFO", err);
          reject(err);
        }
      });
    });
  }

  GetBaseCandleDataForNSEFO(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetFutureBaseCandleData(this.finData).subscribe({
        next: (resp) => {
          this.BaseCandleData = resp.response;
          // console.log("Base Candel Data", this.BaseCandleData);
          resolve();
        },
        error: (err) => {
          console.error("Error in GetBaseCandleDataForNSEFO", err);
          reject(err);
        }
      });
    });
  }

  OverLayFetchingForNSEFO(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.apiService.GetOverLayZoneService(this.finData).subscribe({
        next: (resp: any) => {
          // console.log("Overlay Data", resp);
          this.OverLayCandleData = resp.response;
          this.BuyOverlayData = this.OverLayCandleData.Buy;
          this.SellOverlayData = this.OverLayCandleData.Sell;

          this.spinner.hide();
          resolve();
        },
        error: (err) => {
          console.error("Error in OverLayFetchingForNSEFO", err);
          this.spinner.hide();
          reject(err);
        }
      });
    });
  }

  BadZonesForNSEFO(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.BadZoneData = [];
      this.showmsg = "Fetching Bad Zone Data !";
      this.apiService.GetFutureBadZoneCandleData(this.finData).subscribe({
        next: (resp) => {
          this.BadZoneData = resp.response;
          // console.log("BAD ZONE DATA", this.BadZoneData);
          resolve();
        },
        error: (err) => {
          console.error("Error in BadZonesForNSEFO", err);
          reject(err);
        }
      });
    });
  }

  OptimizedBuySellZoneNSEFO(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.OptimizedBuySellZoneData = [];
      this.showmsg = "Fetching Bad Zone Data !";
      this.apiService.GetOptimizedBuySellZoneNSEFOervice(this.finData).subscribe({
        next: (resp) => {
          this.OptimizedBuySellZoneData = resp.response;
          // console.log("OptimizedBuySellZone DATA", this.OptimizedBuySellZoneData);
          resolve();
        },
        error: (err) => {
          console.error("Error in OptimizedBuySellZoneData", err);
          reject(err);
        }
      });
    });
  }



  // FUTURE ZONES END

  LoadChart(data: any, chartId: any) {
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
      priceScale: {
        borderVisible: false,
        autoScale: true,
      }
    };

    const chartOptions = {
      layout: { textColor: 'black', background: { type: 'solid', color: 'white' } }
    };

    chart = createChart(document.getElementById(chartId)!, {
      ...chartProperties,
      layout: {
        background: {
          color: '#f0ffff',  // Background color
        },
      },
    });

    chart.applyOptions({
      watermark: {
        visible: true,
        fontSize: 35,
        horzAlign: 'right',
        vertAlign: 'bottom',
        color: 'rgb(128, 128, 128)',
        text: 'FIN PRODUCT BY ISPECK ',
      },
      grid: {
        vertLines: { visible: false }, // Disable vertical grid lines
        horzLines: { visible: false }, // Disable horizontal grid lines
      },
    });

    this.candlestickSeries = chart.addCandlestickSeries({
      upColor: '#1B880C',
      downColor: '#D90000',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    const postbars = [...new Array(100)].map((_, i) => ({
      time: data[data.length - 1].time + (i + 1) * this.xspan,
    }));
    this.allData = data;
    this.candlestickSeries.setData([...data, ...postbars]);

    // Adjust the price scale to "squeeze" the chart vertically, increasing candle height
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.01, // Reduce the top margin for the price scale
        bottom: 0.01, // Reduce the bottom margin to squeeze candles vertically
      },
      autoScale: true, // Ensure auto-scaling continues to work
    });

    chart.timeScale().fitContent();

    // Tool for drawing rectangles
    this.rectangleTool = new RectangleDrawingTool(
      chart,
      this.candlestickSeries,
      document.querySelector<HTMLDivElement>('#toolbar')!,
      { showLabels: false }
    );

    // EMA
    const maData = this.calculateMovingAverageSeriesData(data, 20);
    const maSeries = chart.addLineSeries({ color: '#2962FF', lineWidth: 1, title: 'EMA 20' });
    maSeries.setData(maData);

    // TOOLTIP
    chart.subscribeCrosshairMove(param => {
      if (param.time) {
        const seriesPrices = param.seriesData.get(this.candlestickSeries);
        if (seriesPrices) {
          this.toolTipData = seriesPrices;
          this.Open = this.toolTipData.open.toFixed(2);
          this.Close = this.toolTipData.close.toFixed(2);
          this.High = this.toolTipData.high.toFixed(2);
          this.Low = this.toolTipData.low.toFixed(2);
          this.CandleColor = this.Close > this.Open ? "green" : "red";
        } else {
          this.Open = "";
          this.Close = "";
          this.High = "";
          this.Low = "";
        }
      }
    });

    this.chart = chart;
    this.observeChartContainer(chartId);
    this.initManualRectangleTool(this.FullScreenModeValue, data);
    this.initChartDrawingTool(this.FullScreenModeValue, data);

    // if (this.activeMenu == "Pending") {
    const lastRow = data.slice(-1)[0];
    this.CreateClosingLine(lastRow.close)
    // }
  }


  // =========================
  // TRADINGVIEW DRAWING TOOLS
  // =========================

  private closeChartModalFromKeyboard(): void {
    const closeButton = document.querySelector(
      '#myModal [data-bs-dismiss="modal"]'
    ) as HTMLElement | null;

    if (closeButton) {
      closeButton.click();
      return;
    }

    this.CloseFullModal();
  }

  toggleLeftBar(): void {
    this.isLeftBarOpen = !this.isLeftBarOpen;
  }

  closeLeftBar(): void {
    this.isLeftBarOpen = false;
  }

  private resetDrawingsForNewOrder(): void {
    this.chartDrawingItems = [];
    this.manualRectangles = [];
    this.selectedChartDrawing = null;
    this.activeChartDrawingTool = 'select';
    this.activeManualZoneType = null;
  }

  private handleZoneShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();

    if (!['q', 'a', 'b', 'z'].includes(key)) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    switch (key) {
      case 'q':
        if (!this.QualifiedZoneFlag) {
          this.toastr.info('Qualified Zones are available only on the order execution timeframe.');
          return true;
        }
        this.safeToggleZone('qualified_zones');
        return true;

      case 'a':
        this.safeToggleZone('all_zones');
        return true;

      case 'b':
        this.safeToggleZone('base_candle');
        return true;

      case 'z':
        this.toggleContextualHtfZones();
        return true;
    }

    return false;
  }

  private safeToggleZone(option: string): void {
    try {
      this.checkboxClicked(option);
    } catch (error) {
      console.error(`Unable to render ${option}`, error);
      this.toastr.warning('Zone data is not available for the current timeframe.');
    }
  }

  private toggleContextualHtfZones(): void {
    if (!this.QualifiedZoneFlag) {
      this.safeToggleZone('optimized_buy_sell_zone');
      return;
    }

    const enable = !(
      this.selectedOptions['overlap_evaluate'] ||
      this.selectedOptions['overlap_analyze']
    );

    if (this.selectedOptions['overlap_evaluate'] !== enable) {
      this.safeToggleZone('overlap_evaluate');
    }

    if (this.selectedOptions['overlap_analyze'] !== enable) {
      this.safeToggleZone('overlap_analyze');
    }
  }

  private redrawSelectedZones(): void {
    const activeOptions = Object.keys(this.selectedOptions)
      .filter(option => this.selectedOptions[option] === true);

    Object.keys(this.selectedOptions).forEach(option => {
      this.selectedOptions[option] = false;
    });

    activeOptions.forEach(option => this.safeToggleZone(option));
  }

  selectChartDrawingTool(tool: ChartDrawingToolType): void {
    if (!this.chartDrawingTool) {
      this.toastr.warning('Drawing tools are still loading.');
      return;
    }

    try { this.manualRectangleTool?.stopDrawing(); } catch { }
    this.activeManualZoneType = null;
    this.selectedChartDrawing = null;
    this.activeChartDrawingTool = tool;

    if (tool === 'select') {
      try { this.manualRectangleTool?.setSelectionEnabled(true); } catch { }
      try {
        this.chartDrawingTool.setSelectionEnabled(true);
        this.chartDrawingTool.setActiveTool('select');
      } catch { }
      return;
    }

    try { this.manualRectangleTool?.setSelectionEnabled(false); } catch { }

    try {
      this.chartDrawingTool.setSelectionEnabled(true);
      this.chartDrawingTool.setActiveTool(tool);
    } catch (error) {
      console.error('Unable to activate chart drawing tool', error);
    }
  }

  private initChartDrawingTool(type: string, data: any[]): void {
    const chartContainer = this.elementRef.nativeElement.querySelector(
      '#chart-container_new'
    ) as HTMLElement;

    if (!chartContainer || !this.chart || !this.candlestickSeries) {
      return;
    }

    this.destroyChartDrawingTool();

    this.chartDrawingTool = new ChartDrawingTool(
      this.chart,
      this.candlestickSeries,
      chartContainer,
      {
        color: '#2962ff',
        selectedColor: '#111827',
        lineWidth: 1,
        shouldIgnoreMouseEvent: (event: MouseEvent) => {
          try {
            return !!this.manualRectangleTool?.isMouseEventOverRectangle(event);
          } catch {
            return false;
          }
        },
        onCreated: (item: ChartDrawingRecord) => {
          if (!this.chartDrawingItems.some(existing => existing.id === item.id)) {
            this.chartDrawingItems.push({ ...item });
          }
        },
        onUpdated: (item: ChartDrawingRecord) => {
          this.chartDrawingItems = this.chartDrawingItems.map(existing =>
            existing.id === item.id ? { ...item } : existing
          );
          this.selectedChartDrawing = { ...item };
        },
        onDeleted: (item: ChartDrawingRecord) => {
          this.chartDrawingItems = this.chartDrawingItems.filter(existing => existing.id !== item.id);
          this.selectedChartDrawing = null;
        },
        onToolChanged: (tool: ChartDrawingToolType) => {
          this.activeChartDrawingTool = tool;
          if (tool === 'select') {
            try { this.manualRectangleTool?.setSelectionEnabled(true); } catch { }
          } else {
            try { this.manualRectangleTool?.setSelectionEnabled(false); } catch { }
          }
        },
        onSelected: (item: ChartDrawingRecord | null) => {
          this.selectedChartDrawing = item ? { ...item } : null;
        }
      }
    );

    this.chartDrawingTool.setActiveTool(this.activeChartDrawingTool || 'select');
    this.restoreChartDrawingItems(data);
  }

  private destroyChartDrawingTool(): void {
    if (!this.chartDrawingTool) return;
    try { this.chartDrawingTool.destroy(); } catch { }
    this.chartDrawingTool = null;
  }

  private restoreChartDrawingItems(data: any[]): void {
    if (!this.chartDrawingTool || !data?.length) return;

    this.chartDrawingItems.forEach(item => {
      const restored: ChartDrawingRecord = {
        ...item,
        selected: false,
        p1: this.mapChartDrawingPointToCurrentFrame(item.p1, data),
        p2: item.p2 ? this.mapChartDrawingPointToCurrentFrame(item.p2, data) : undefined
      };
      this.chartDrawingTool?.addDrawing(restored);
    });
  }

  private mapChartDrawingPointToCurrentFrame(point: ChartDrawingPoint, data: any[]): ChartDrawingPoint {
    return {
      time: this.mapTimeToCurrentFrame(point.time, data),
      price: point.price
    };
  }

  private initManualRectangleTool(type: string, data: any[]): void {
    const chartContainer = this.elementRef.nativeElement.querySelector(
      '#chart-container_new'
    ) as HTMLElement;

    if (!chartContainer || !this.chart || !this.candlestickSeries) return;

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
        candleData: data,
        snapToOHLC: true,
        priceLabelFormatter: (price: number) => price.toFixed(2),
        timeLabelFormatter: (time: any) => this.formatDrawingTime(time),
        onRectangleCreated: (rect: ManualRectangleRecord) => {
          this.manualRectangles.push({
            ...rect,
            sourceTimeframe: type,
            symbol: this.getDrawingSymbol(),
            createdAt: Date.now()
          });
          this.activeManualZoneType = null;
          this.setChartDragEnabled(true);
          try {
            this.chartDrawingTool?.setSelectionEnabled(true);
            this.chartDrawingTool?.setActiveTool('select');
            this.activeChartDrawingTool = 'select';
          } catch { }
        },
        onRectangleSelected: (rect: ManualRectangleRecord | null) => {
          if (rect) this.selectedChartDrawing = null;
        },
        onRectangleDeleted: (rect: ManualRectangleRecord) => {
          this.manualRectangles = this.manualRectangles.filter(item => item.id !== rect.id);
          this.activeManualZoneType = null;
          this.forceChartRedraw();
        },
        onRectangleUpdated: (rect: ManualRectangleRecord) => {
          this.manualRectangles = this.manualRectangles.map(item =>
            item.id === rect.id
              ? { ...item, p1: rect.p1, p2: rect.p2, options: rect.options, extendRight: rect.extendRight }
              : item
          );
          this.forceChartRedraw();
        }
      },
      chartContainer
    );

    this.activeManualZoneType = null;
    this.restoreManualRectangles(data);
  }

  private destroyManualRectangleTool(): void {
    this.setChartDragEnabled(true);
    try { this.chartDrawingTool?.setSelectionEnabled(true); } catch { }

    if (this.manualRectangleTool) {
      try { this.manualRectangleTool.stopDrawing(); } catch { }
      try { this.manualRectangleTool.removeAllRectangles(); } catch { }
      try { this.manualRectangleTool.destroy(); } catch { }
      this.manualRectangleTool = null;
    }

    this.activeManualZoneType = null;
  }

  startBuyZoneDrawing(event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.startManualZoneDrawing('BUY');
  }

  startSellZoneDrawing(event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.startManualZoneDrawing('SELL');
  }

  private startManualZoneDrawing(zoneType: 'BUY' | 'SELL'): void {
    if (!this.manualRectangleTool) {
      this.toastr.warning('Manual zone drawing is still loading.');
      return;
    }

    if (this.activeManualZoneType === zoneType && this.manualRectangleTool.isDrawing()) {
      this.manualRectangleTool.stopDrawing();
      this.activeManualZoneType = null;
      this.setChartDragEnabled(true);
      try {
        this.chartDrawingTool?.setSelectionEnabled(true);
        this.chartDrawingTool?.setActiveTool('select');
        this.activeChartDrawingTool = 'select';
      } catch { }
      return;
    }

    try {
      this.chartDrawingTool?.setActiveTool('select');
      this.chartDrawingTool?.setSelectionEnabled(false);
    } catch { }

    this.selectedChartDrawing = null;
    this.activeChartDrawingTool = 'select';
    try { this.manualRectangleTool.setSelectionEnabled(true); } catch { }

    const isBuy = zoneType === 'BUY';
    this.manualRectangleTool.setDrawingStyle({
      fillColor: isBuy ? 'rgba(22, 163, 74, 0.20)' : 'rgba(220, 38, 38, 0.20)',
      outlineColor: isBuy ? '#16a34a' : '#dc2626',
      outlineWidth: 1,
      color: isBuy ? '#16a34a' : '#dc2626',
      text: isBuy ? 'BUY Zone' : 'SELL Zone'
    });

    this.activeManualZoneType = zoneType;
    this.setChartDragEnabled(false);
    this.manualRectangleTool.startDrawing();
  }

  private restoreManualRectangles(data: any[]): void {
    if (!this.manualRectangleTool || !data?.length) return;

    const currentSymbol = this.getDrawingSymbol();
    const lastCandleTime = data[data.length - 1]?.time;
    if (!lastCandleTime) return;

    this.manualRectangles
      .filter(rect => !rect.symbol || !currentSymbol || rect.symbol === currentSymbol)
      .forEach(rect => {
        const p1: Point = {
          time: this.mapTimeToCurrentFrame(rect.p1.time, data),
          price: rect.p1.price
        };
        const p2: Point = {
          time: lastCandleTime,
          price: rect.p2.price
        };
        const options: RectangleStyleOptions = {
          fillColor: rect.options?.fillColor || 'rgba(37, 99, 235, 0.20)',
          outlineColor: rect.options?.outlineColor || '#2962ff',
          outlineWidth: rect.options?.outlineWidth ?? 1,
          color: rect.options?.color || '#2962ff',
          textColor: rect.options?.textColor || rect.options?.color || '#2962ff',
          text: rect.options?.text || 'Manual Zone'
        };
        this.manualRectangleTool?.addRectangle(p1, p2, options, rect.id);
      });
  }

  private getDrawingSymbol(): string {
    return String(this.finData?.tick || this.finData?.st_sym || this.SelectedStockName || '');
  }

  private formatDrawingTime(time: any): string {
    if (typeof time === 'string') return time;
    if (typeof time === 'number') return new Date(time * 1000).toLocaleString();
    if (time?.year && time?.month && time?.day) return `${time.day}-${time.month}-${time.year}`;
    return '';
  }

  private toTimeNumber(time: any): number {
    if (typeof time === 'number') return time;
    if (typeof time === 'string') {
      const parsed = new Date(time).getTime();
      return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
    }
    if (time?.year && time?.month && time?.day) {
      return Math.floor(new Date(time.year, time.month - 1, time.day).getTime() / 1000);
    }
    return 0;
  }

  private mapTimeToCurrentFrame(originalTime: any, data: any[]): any {
    if (!data?.length) return originalTime;
    const target = this.toTimeNumber(originalTime);
    const sorted = [...data].sort((a, b) => this.toTimeNumber(a.time) - this.toTimeNumber(b.time));
    let selected = sorted[0].time;
    for (const candle of sorted) {
      if (this.toTimeNumber(candle.time) <= target) selected = candle.time;
      else break;
    }
    return selected;
  }

  private setChartDragEnabled(enabled: boolean): void {
    if (!this.chart) return;
    this.chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: enabled,
        horzTouchDrag: enabled,
        vertTouchDrag: enabled
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    });
  }

  private forceChartRedraw(): void {
    if (!this.chart) return;
    try {
      const range = this.chart.timeScale().getVisibleLogicalRange();
      if (range) this.chart.timeScale().setVisibleLogicalRange({ from: range.from, to: range.to });
    } catch { }
  }

  private deleteSelectedDrawingByKeyboard(): boolean {
    let deleted = false;
    try { deleted = !!this.manualRectangleTool?.deleteSelectedRectangle(); } catch { }
    if (!deleted) {
      try { deleted = !!this.chartDrawingTool?.deleteSelected(); } catch { }
    }
    if (deleted) this.selectedChartDrawing = null;
    return deleted;
  }

  deleteActiveDrawingFromLeftToolbar(): void {
    if (this.deleteSelectedDrawingByKeyboard()) {
      this.toastr.success('Drawing deleted');
    } else {
      this.toastr.info('Select a drawing first.');
    }
  }

  updateSelectedDrawingStyle(style: ChartDrawingStylePatch): void {
    const updated = this.chartDrawingTool?.updateSelectedStyle(style);
    if (updated) this.selectedChartDrawing = { ...updated };
  }

  onSelectedDrawingColorChange(event: Event): void {
    this.updateSelectedDrawingStyle({ color: (event.target as HTMLInputElement).value });
  }

  onSelectedDrawingLineWidthChange(event: Event): void {
    this.updateSelectedDrawingStyle({ lineWidth: Number((event.target as HTMLSelectElement).value) });
  }

  onSelectedDrawingLineStyleChange(event: Event): void {
    this.updateSelectedDrawingStyle({
      lineStyle: (event.target as HTMLSelectElement).value as ChartDrawingLineStyle
    });
  }

  onSelectedTextChange(event: Event): void {
    this.updateSelectedDrawingStyle({ text: (event.target as HTMLInputElement).value });
  }

  onSelectedTextFontSizeChange(event: Event): void {
    this.updateSelectedDrawingStyle({ fontSize: Number((event.target as HTMLSelectElement).value) });
  }

  toggleSelectedTextBold(): void {
    if (!this.selectedChartDrawing) return;
    this.updateSelectedDrawingStyle({
      fontWeight: this.selectedChartDrawing.fontWeight === 'bold' ? 'normal' : 'bold'
    });
  }

  onSelectedTextBackgroundChange(event: Event): void {
    this.updateSelectedDrawingStyle({ backgroundColor: (event.target as HTMLInputElement).value });
  }

  clearSelectedTextBackground(): void {
    this.updateSelectedDrawingStyle({ backgroundColor: undefined });
  }

  toggleSelectedDrawingLock(): void {
    if (!this.selectedChartDrawing) return;
    this.updateSelectedDrawingStyle({ locked: !this.selectedChartDrawing.locked });
  }

  onPositionTargetColorChange(event: Event): void {
    this.updateSelectedDrawingStyle({ targetColor: (event.target as HTMLInputElement).value });
  }

  onPositionStopColorChange(event: Event): void {
    this.updateSelectedDrawingStyle({ stopColor: (event.target as HTMLInputElement).value });
  }

  onPositionEntryColorChange(event: Event): void {
    this.updateSelectedDrawingStyle({ entryColor: (event.target as HTMLInputElement).value });
  }

  onPositionOpacityChange(event: Event): void {
    this.updateSelectedDrawingStyle({ fillOpacity: Number((event.target as HTMLInputElement).value) });
  }

  togglePositionLabels(): void {
    if (!this.selectedChartDrawing) return;
    this.updateSelectedDrawingStyle({ showLabels: this.selectedChartDrawing.showLabels === false });
  }

  duplicateSelectedChartDrawing(): void {
    if (this.chartDrawingTool?.duplicateSelected()) this.toastr.success('Drawing duplicated');
  }

  deleteSelectedChartDrawingFromPanel(): void {
    if (this.chartDrawingTool?.deleteSelected()) {
      this.selectedChartDrawing = null;
      this.toastr.success('Drawing deleted');
    }
  }

  isSelectedPositionDrawing(): boolean {
    return this.selectedChartDrawing?.type === 'longPosition' || this.selectedChartDrawing?.type === 'shortPosition';
  }

  isSelectedTextDrawing(): boolean {
    return this.selectedChartDrawing?.type === 'text';
  }

  isSelectedRectangleDrawing(): boolean {
    return this.selectedChartDrawing?.type === 'rectangle';
  }

  private observeChartContainer(chartId: string): void {
    this.disconnectChartResizeObserver();
    const container = document.getElementById(chartId);
    if (!container || typeof ResizeObserver === 'undefined') return;

    this.chartResizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || !this.chart) return;
      this.chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    });
    this.chartResizeObserver.observe(container);
  }

  private disconnectChartResizeObserver(): void {
    try { this.chartResizeObserver?.disconnect(); } catch { }
    this.chartResizeObserver = null;
  }

  private destroyInteractiveDrawingTools(): void {
    this.destroyChartDrawingTool();
    this.destroyManualRectangleTool();
    try { this.rectangleTool?.destroy?.(); } catch { }
    this.rectangleTool = null;
  }

  previousHighService() {
    this.apiService.GetprevioushighDataService(this.finData).subscribe(resp => {
      this.PreviousHighData = resp.response;
      console.log(`RESPONSE 7 (PREVIOUS HIGH) :`, this.PreviousHighData);
    })
  }

  previousHighServiceForMcxNsefo(exchange:any) {
    console.log("PH",this.finData)
    this.apiService.GetprevioushighDataMcxNsefoService(this.finData,exchange).subscribe(resp => {
      this.PreviousHighData = resp.response;
      console.log(`RESPONSE 7 (PREVIOUS HIGH) :`, this.PreviousHighData);
    })
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

  cleanupChart() {
    this.destroyInteractiveDrawingTools();
    this.disconnectChartResizeObserver();

    if (this.chart) {
      try { this.chart.remove(); } catch { }
      this.chart = null;
    }
  }

  addEntryPriceLine(price: number, time: any, extendedtime: any) {
  const futureTime = Math.floor(Date.now() / 1000) + this.FUTURE_SECONDS;
    this.buylineSeries = this.chart.addLineSeries({
      color: 'blue',
      lineWidth: 3,
      priceLineVisible: false,
      priceLineColor: 'blue',
      priceLineWidth: 2,
    });

    this.buylineSeries.setData([
      { time: time, value: price },
      { time: futureTime, value: price }
    ]);

    this.buylineSeries.setMarkers([
      {
        time: time,
        position: 'aboveBar',
        color: 'green',
        text: `Entry : ${price.toFixed(2)}\nR-R: ${this.RRR.toFixed(2)}`
      }
    ]);

    // Enable dragging functionality
    // this.makeLineDraggable(price, time, extendedtime);
  }

  addTargetPriceLine(price: number, time: any, extendedtime: any) {
    const futureTime = Math.floor(Date.now() / 1000) + this.FUTURE_SECONDS;
    this.targetlineSeries = this.chart.addLineSeries({
      color: 'green',
      lineWidth: 3,
      priceLineVisible: false,
      priceLineColor: 'green',
      priceLineWidth: 2,
    });

    this.targetlineSeries.setData([
      { time: time, value: price },
      { time: futureTime, value: price }
    ]);

    this.targetlineSeries.setMarkers([
      {
        time: time,
        position: 'aboveBar',
        color: 'green',
        text: `Target : ${price.toFixed(2)}`
      }
    ]);
    // Make the target price line draggable
    // this.makeTargetLineDraggable(price, time, extendedtime);
  }

  addStoplossPriceLine(price: number, time: any, extendedtime: any) {
    const futureTime = Math.floor(Date.now() / 1000) + this.FUTURE_SECONDS;
    this.stoplosslineSeries = this.chart.addLineSeries({
      color: 'red',
      lineWidth: 3,
      priceLineVisible: false,
      priceLineColor: 'red',
      priceLineWidth: 2,
    });

    this.stoplosslineSeries.setData([
      { time: time, value: price },
      { time: futureTime, value: price }
    ]);

    this.stoplosslineSeries.setMarkers([
      {
        time: time,
        position: 'belowBar',
        color: 'red',
        text: `Stoploss : ${price.toFixed(2)}`
      }
    ]);
    // Make the stoploss price line draggable
    // this.makeStoplossLineDraggable(price, time, extendedtime);
  }

  entryMark(entry_timestamp: any, exit_timestamp: any, order_type: any) {
    const buyZoneMarkers = [];
    if (order_type == "Sell") {
      buyZoneMarkers.push({
        time: entry_timestamp,
        position: 'aboveBar',
        color: 'green',
        shape: 'arrowDown',
        text: "Trade Started",
      });

      // Conditionally push the exit marker if the status is not "pending"
      if (this.activeMenu != "Pending" && this.activeMenu != "Progress") {
        buyZoneMarkers.push({
          time: exit_timestamp,
          position: 'belowBar',
          color: 'red',
          shape: 'arrowUp',
          text: "Trade Exited",
        });
      }
    }
    else {
      // First, push the entry marker
      buyZoneMarkers.push({
        time: entry_timestamp,
        position: 'belowBar',
        color: 'green',
        shape: 'arrowUp',
        text: "Trade Started"
      });

      // Conditionally push the exit marker if the status is not "pending"
      if (this.activeMenu != "Pending" && this.activeMenu != "Progress") {
        buyZoneMarkers.push({
          time: exit_timestamp,
          position: 'aboveBar',
          color: 'red',
          shape: 'arrowDown',
          text: "Trade Exited"
        });
      }
    }

    if (this.selectedOptions['base_candle']) {
      this.ModelPrediction = "";
      const fillColor = 'rgba(51,153,255,0.3)';
      const array = this.BaseCandleData[this.FullScreenModeValue];
      for (let item of array) {
        buyZoneMarkers.push({
          time: item,
          position: 'aboveBar',
          color: 'blue',
          shape: 'arrowDown',
          text: "B",
        });
      }
    }
    buyZoneMarkers.sort((a, b) => a.time - b.time);
    this.candlestickSeries.setMarkers(buyZoneMarkers);
  }

  stoplossMark(entry_timestamp: any, exit_timestamp: any, order_type: any) {
    const buyZoneMarkers = [];
    if (order_type == "Sell") {
      buyZoneMarkers.push(
        {
          time: entry_timestamp,
          position: 'aboveBar',
          color: 'green',
          shape: 'arrowDown',
          text: "Trade Started",
        },
        {
          time: exit_timestamp,
          position: 'belowBar',
          color: 'red',
          shape: 'arrowUp',
          text: "Stop Loss Hit",
        }
      )
    }
    else {
      buyZoneMarkers.push(
        {
          time: entry_timestamp,
          position: 'belowBar',
          color: 'green',
          shape: 'arrowUp',
          text: "Trade Started"
        },
        {
          time: exit_timestamp,
          position: 'aboveBar',
          color: 'red',
          shape: 'arrowDown',
          text: "Stop Loss Hit"
        }
      );
    }

    if (this.selectedOptions['base_candle']) {
      this.showmsg = "Fetching Base Candle Data !";
      this.ModelPrediction = "";
      const fillColor = 'rgba(51,153,255,0.3)';
      const array = this.BaseCandleData[this.FullScreenModeValue];
      for (let item of array) {
        buyZoneMarkers.push({
          time: item,
          position: 'aboveBar',
          color: 'blue',
          shape: 'arrowDown',
          text: "B",
        });
      }
    }
    buyZoneMarkers.sort((a, b) => a.time - b.time);
    this.candlestickSeries.setMarkers(buyZoneMarkers);
  }

  checkboxClicked(option: string) {
    this.candlestickSeries.setMarkers([]);
    this.selectedOptions[option] = !this.selectedOptions[option];
    let result = this.checkOptions();
    if (result == false) {
      this.rectangleTool.removeAllRectangles()

      if (this.selectedOptions['qualified_zones']) {
        this.showmsg = "Analyzing Qualified Zones !";
        this.ModelPrediction = "";
        const buy_array = this.QualifiedData["Buy"];
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        for (let item of Object.values(buy_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(255,51,51,0.2)';
        var sell_array = this.QualifiedData["Sell"];
        for (let item of Object.values(sell_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      }
      if (this.selectedOptions['all_zones']) {
        this.showmsg = "Analyzing All Zones !";
        this.ModelPrediction = "";
        const array = this.AllZonesData[this.FullScreenModeValue];
        const fillColorBuy = 'rgba(16, 185, 129, 0.16)';
        var buy_array = array['Buy'];
        for (let item of Object.values(buy_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(225, 29, 72, 0.16)';
        var sell_array = array['Sell'];
        for (let item of Object.values(sell_array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      }
      if (this.selectedOptions['base_candle']) {
        this.showmsg = "Analyzing Base Candles !";
        const BaseMarkers = [];
        this.ModelPrediction = "";
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
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      }
      if (this.selectedOptions['buy_sell_zone']) {
        this.showmsg = "Analyzing Buy/Sell Zones !";
        this.ModelPrediction = "";
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
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      }
      if (this.selectedOptions['bad_zone']) {
        this.ModelPrediction = "";
        let array = this.BadZoneData[this.FullScreenModeValue]
        const fillColor = "rgba(41, 3, 3, 0.21)"
        for (let item of Object.values(array)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColor });
        }
        // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
      }
      if (this.selectedOptions['optimized_buy_sell_zone']) {
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        var buy_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
        for (let item of Object.values(buy_array.BUY)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
        }
        const fillColorSell = 'rgba(255,51,51,0.2)';
        var sell_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
        for (let item of Object.values(sell_array.SELL)) {
          this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
        }
      }
      if (this.selectedOptions['overlap_evaluate']) {

        if (this.activeTab == "Stocks") {

          if (this.finData.time_frame == 1) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['monthly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['monthly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 2) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 3) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 25) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 5) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 6) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }
        }

        if (this.activeTab == "Commodity") {

          if (this.finData.time_frame == 1) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['monthly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['monthly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 2) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 3) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 4) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

        }

        if (this.activeTab == "Future") {

          if (this.finData.time_frame == 1) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['monthly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['monthly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 2) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 3) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 25) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }
        }

      }
      if (this.selectedOptions['overlap_analyze']) {

        if (this.activeTab == "Stocks") {

          if (this.finData.time_frame == 1) {
            const fillColorBuy = 'rgba(0,255,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 2) {
            const fillColorBuy = 'rgba(0,255,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 3) {
            const fillColorBuy = 'rgba(0,255,0,0.2)';
            var buy_array = this.BuyOverlayData['sixty'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['sixty'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

           if (this.finData.time_frame == 25) {
            const fillColorBuy = 'rgba(0,255,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }
          if (this.finData.time_frame == 5) {
            const fillColorBuy = 'rgba(0,255,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 6) {
            const fillColorBuy = 'rgba(0,255,0,0.2)';
            var buy_array = this.BuyOverlayData['one_twenty_five'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['one_twenty_five'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }
        }

        if (this.activeTab == "Commodity") {

          if (this.finData.time_frame == 1) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 2) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 3) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['two_forty'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['two_forty'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 4) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['two_forty'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['two_forty'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

        }

        if (this.activeTab == "Future") {

          if (this.finData.time_frame == 1) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['weekly'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['weekly'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 2) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

          if (this.finData.time_frame == 3) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['sixty'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['sixty'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

           if (this.finData.time_frame == 25) {
            const fillColorBuy = 'rgba(0,59,0,0.2)';
            var buy_array = this.BuyOverlayData['daily'];
            for (let item of Object.values(buy_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorBuy });
            }
            const fillColorSell = 'rgba(255,51,51,0.2)';
            var sell_array = this.SellOverlayData['daily'];
            for (let item of Object.values(sell_array)) {
              this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColorSell });
            }
            // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
          }

        }

      }
      // if (this.selectedOptions['setup']) {
      //   this.dropdownShow = true;
      // } else {
      //   this.dropdownShow = false;
      //   if (this.buylineSeries) {
      //     this.buylineSeries.setMarkers([]);
      //     this.buylineSeries.setData([]);
      //   }
      //   if (this.targetlineSeries) {
      //     this.targetlineSeries.setMarkers([]);
      //     this.targetlineSeries.setData([]);
      //   }
      //   if (this.stoplosslineSeries) {
      //     this.stoplosslineSeries.setMarkers([]);
      //     this.stoplosslineSeries.setData([]);
      //   }
      // }
      if (this.SETUPREQ) {
          if(this.activeTab== "Stocks"){
           if(this.activeMenu == "Failed" || this.activeMenu == "Success"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      if(this.activeMenu == "Progress"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      }

      if(this.activeTab== "Commodity"){
           if(this.activeMenuCommodity == "Failed" || this.activeMenuCommodity == "Success"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      if(this.activeMenuCommodity == "Progress"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      }

      if(this.activeTab== "Future"){
           if(this.activeMenuFuture == "Failed" || this.activeMenuFuture == "Success"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      if(this.activeMenuFuture == "Progress"){
         this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
      }
   
        // if (this.activeMenu == "Failed" || this.activeMenuCommodity == "Failed" || this.activeMenuFuture == "Failed") {
        //   this.entryMark(
        //     this.barReplaytimestampInSeconds_entry,
        //     this.barReplaytimestampInSeconds_completed,
        //     this.barReplayorder_type
        //   );
        // }
        // if (this.activeMenu == "Success" || this.activeMenuCommodity == "Success" || this.activeMenuFuture == "Success") {
        //   this.entryMark(
        //     this.barReplaytimestampInSeconds_entry,
        //     this.barReplaytimestampInSeconds_completed,
        //     this.barReplayorder_type
        //   );
        // }
      }
    }
    else {
      // this.dropdownShow = false;
      // this.candlestickSeries.setMarkers([]);
      // this.rectangleTool.removeAllRectangles()
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
      this.dropdownShow = false;
      this.candlestickSeries.setMarkers([]);
      this.rectangleTool.removeAllRectangles()
      if (this.SETUPREQ) {
        if (this.activeMenu == "Failed" || this.activeMenuCommodity == "Failed" || this.activeMenuFuture == "Failed") {
          this.entryMark(
            this.barReplaytimestampInSeconds_entry,
            this.barReplaytimestampInSeconds_completed,
            this.barReplayorder_type
          );
        }
        if (this.activeMenu == "Success" || this.activeMenuCommodity == "Success" || this.activeMenuFuture == "Success") {
          this.entryMark(
            this.barReplaytimestampInSeconds_entry,
            this.barReplaytimestampInSeconds_completed,
            this.barReplayorder_type
          );
        }
      }
      // this.getsetup(this.purchased_date, this.entry_timestamp, this.completed_on, this.entry_price, this.stoploss_price, this.target_price, this.order_type)
    }
  }

  checkOptions(): boolean {
    for (let key in this.selectedOptions) {
      if (this.selectedOptions[key]) {
        return false;
      }
    }
    return true;
  }

  CloseFullModal() {
    this.isChartModalOpen = false;
    this.isLeftBarOpen = false;
    this.showReasonPanel = false;
    this.allData = []
    this.preBars = []
    this.postBars = []
    this.reasons = [];

    this.ReplayFlag = false;
    this.ModelPrediction = "";
    this.cleanupChart();
    this.disconnectWebSocket()
    // this.selectedOption = '';
    this.dropdownShow = false;
    this.selectedOptions = {
      qualified_zones: false,
      all_zones: false,
      base_candle: false,
      buy_sell_zone: false,
      bad_zone: false,
      setup: false,
      overlap_evaluate: false,
      overlap_analyze: false,
      optimized_buy_sell_zone: false
    };
    this.resetDrawingsForNewOrder();
    const leftBar = document.getElementById('leftBar');
    if (leftBar!.classList.contains('open')) {
      leftBar!.classList.remove('open');
    }
  }

  toggleMaximize() {
    const modalElement = document.getElementById('myModal');
    if (this.isMaximized) {
      modalElement?.classList.remove('maximized');
    } else {
      modalElement?.classList.add('maximized');
    }
    this.isMaximized = !this.isMaximized;
  }

  onSearchButtonClick() {
    this.successPage = 1;
    this.progressPage = 1;
    this.pendingPage = 1;
    this.failedPage = 1;
    this.successPagecommodity = 1;
    this.failedPagecommodity = 1;
    this.pendingPagecommodity = 1;
    this.progressPageCommodity = 1;
    this.successPageFuture = 1;
    this.pendingPageFuture = 1;
    this.progressPageFuture = 1;
    this.failedPageFuture = 1;
    this.getorderscount()
    this.getSuccessOrders()
    this.getFailedOrders()
    this.getPendingOrders()
  }

  toggleBar() {
    const leftBar = document.getElementById('leftBar');
    if (leftBar) {
      const windowHeight: number = window.innerHeight;
      const targetHeight: number = 80;
      leftBar.style.top = `${targetHeight}px`;
      leftBar.style.height = `${windowHeight - targetHeight}px`;
      leftBar.style.overflowY = 'auto';
      if (leftBar.classList.contains('open')) {
        leftBar.classList.remove('open');
      } else {
        leftBar.classList.add('open');
      }
    }
  }

  onDeleteStocks(orderId: any): void {
    const confirmed = window.confirm('Are you sure you want to delete this order?');
    if (!confirmed) {
      return;
    }
    this.spinner.show();
    this.apiService.deleteorders(orderId).subscribe((resp) => {
      this.spinner.hide();
      if (resp.msg === 'success') {
        this.toastr.success('Deleted');
        this.getorderscount()
        this.getSuccessOrders(true)
        this.getFailedOrders(true)
        this.getPendingOrders(true)
        this.getProgressOrders(true)
      } else {
        this.toastr.error('Failed');
      }
    });
  }

  onDeleteCommodity(orderId: any): void {
    const confirmed = window.confirm('Are you sure you want to delete this order?');

    if (!confirmed) {
      return;
    }
    this.spinner.show();
    this.apiService.deleteordersCommodity(orderId).subscribe((resp) => {
      this.spinner.hide();
      if (resp.msg === 'success') {
        this.toastr.success('Deleted');
        this.getSuccessOrdersCommodity(true)
        this.getFailedOrdersCommodity(true)
        this.getPendingOrdersCommodity(true)
        this.getProgressOrdersCommodity(true)
      } else {
        this.toastr.error('Failed');
      }
    });
  }

  onDeleteFuture(orderId: any): void {
    const confirmed = window.confirm('Are you sure you want to delete this order?');
    if (!confirmed) {
      return;
    }
    this.spinner.show();
    this.apiService.deleteordersFuture(orderId).subscribe((resp) => {
      this.spinner.hide();
      if (resp.msg === 'success') {
        this.toastr.success('Deleted');
        this.getSuccessOrdersFuture(true)
        this.getFailedOrdersFuture(true)
        this.getPendingOrdersFuture(true)
        this.getProgressOrdersFuture(true)
      } else {
        this.toastr.error('Failed');
      }
    });
  }

  autoReplay(speed = 400) {
    this.ReplayFlag = true;
    this.candlestickSeries.setMarkers([]);
    // ✅ Reset replay index and data before starting
    this.currentPostIndex = 0;

    this.allData = [...this.preBars]; // Reset to just PRE bars
    this.candlestickSeries.setData(this.allData);

    const interval = setInterval(() => {
      if (this.currentPostIndex < this.postBars.length) {
        const nextBar = this.postBars[this.currentPostIndex];
        this.allData.push(nextBar);
        this.candlestickSeries.setData(this.allData);
        this.currentPostIndex++;
      } else {
        clearInterval(interval);

        // ✅ Call entryMark() after POST bars are done
        this.entryMark(
          this.barReplaytimestampInSeconds_entry,
          this.barReplaytimestampInSeconds_completed,
          this.barReplayorder_type
        );
      }
    }, speed);
  }

  UpdateStatus() {
    this.spinner.show()
    this.apiService.updateOrderEntryStats().subscribe(resp => {
      if (resp.msg == "success") {
        this.apiService.updateOrderStatusService().subscribe(resp => {
          if (resp.msg == "success") {
            this.toastr.success("Order Status Updated !")
            this.spinner.hide()
          }
          else {
            this.toastr.success("Order Updation Failed !")
            this.spinner.hide()
          }
        })
      }
      else {
        this.toastr.success("Order Updation Failed !")
        this.spinner.hide()
      }
    })
  }

  onSearchInput(value: string) {
    this.SearchDebounceFlag = true;
    this.searchSubject.next(value);
  }

  // Stocks

  goToNextPage() {
    const totalPages = this.getTotalPages();
    if (this.activeMenu === 'Success' && this.successPage < totalPages) {
      this.successPage++;
      this.getSuccessOrders(true);
    } else if (this.activeMenu === 'Failed' && this.failedPage < totalPages) {
      this.failedPage++;
      this.getFailedOrders(true);
    } else if (this.activeMenu === 'Pending' && this.pendingPage < totalPages) {
      this.pendingPage++;
      this.getPendingOrders(true);
    } else if (this.activeMenu === 'Progress' && this.progressPage < totalPages) {
      this.progressPage++;
      this.getProgressOrders(true);
    }
  }

  goToPreviousPage() {
    if (this.activeMenu === 'Success' && this.successPage > 1) {
      this.successPage--;
      this.getSuccessOrders(true);
    } else if (this.activeMenu === 'Failed' && this.failedPage > 1) {
      this.failedPage--;
      this.getFailedOrders(true);
    } else if (this.activeMenu === 'Pending' && this.pendingPage > 1) {
      this.pendingPage--;
      this.getPendingOrders(true);
    }
    else if (this.activeMenu === 'Progress' && this.progressPage > 1) {
      this.progressPage--;
      this.getProgressOrders(true);
    }
  }

  getTotalPages(): number {
    const total = this.activeMenu === 'Success' ? this.SuccessCount
      : this.activeMenu === 'Failed' ? this.FailedCount
        : this.activeMenu === 'Progress' ? this.ProgressCount
          : this.PendingCount;

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
    return this.activeMenu === 'Success' ? this.successPage
      : this.activeMenu === 'Failed' ? this.failedPage
        : this.activeMenu === 'Progress' ? this.progressPage
          : this.pendingPage;
  }

  goToPage(page: number) {
    if (this.activeMenu === 'Success') {
      this.successPage = page;
      this.getSuccessOrders(true);
    } else if (this.activeMenu === 'Failed') {
      this.failedPage = page;
      this.getFailedOrders(true);
    } else if (this.activeMenu == "Pending") {
      this.pendingPage = page;
      this.getPendingOrders(true);
    } else {
      this.progressPage = page;
      this.getProgressOrders(true)
    }
  }

  onPageSizeChange() {
    if (this.activeMenu === 'Success') {
      this.successPage = 1
      this.getSuccessOrders();
    } else if (this.activeMenu === 'Failed') {
      this.failedPage = 1;
      this.getFailedOrders();
    } else if (this.activeMenu === 'Pending') {
      this.pendingPage = 1;
      this.getPendingOrders();
    } else {
      this.progressPage = 1;
      this.getProgressOrders();
    }
  }

  sortData(column: string, orderType: 'pending' | 'success' | 'failed' | 'progress') {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    let orderList;
    if (this.activeTab == "Commodity") {
      if (orderType === 'pending') orderList = this.pendingOrdersCommodity;
      else if (orderType === 'success') orderList = this.successOrdersCommodity;
      else if (orderType === 'progress') orderList = this.progressOrdersCommodity
      else orderList = this.failedOrdersCommodity;
    }

    if (this.activeTab == "Stocks") {
      if (orderType === 'pending') orderList = this.pendingOrders;
      else if (orderType === 'success') orderList = this.successOrders;
      else if (orderType === 'progress') orderList = this.progressOrders
      else orderList = this.failedOrders;
    }

    if (this.activeTab == "Future") {
      if (orderType === 'pending') orderList = this.pendingOrdersFuture;
      else if (orderType === 'success') orderList = this.successOrdersFuture;
      else if (orderType === 'progress') orderList = this.progressOrdersFuture
      else orderList = this.failedOrdersFuture;
    }


    orderList.sort((a: { [x: string]: any; }, b: { [x: string]: any; }) => {
      const valA = a[column];
      const valB = b[column];

      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === 'string') {
        return this.sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return this.sortDirection === 'asc'
          ? valA - valB
          : valB - valA;
      }
    });
  }

  // Commodity

  onPageSizeChangeCommodity() {
    if (this.activeMenuCommodity === 'Success') {
      this.successPagecommodity = 1;
      this.getSuccessOrdersCommodity();
    } else if (this.activeMenuCommodity === 'Failed') {
      this.failedPagecommodity = 1;
      this.getFailedOrdersCommodity();
    } else if (this.activeMenuCommodity === 'Progress') {
      this.progressPageCommodity = 1;
      this.getProgressOrdersCommodity();
    } else {
      this.pendingPagecommodity = 1;
      this.getPendingOrdersCommodity();
    }
  }

  goToNextPageCommodity() {
    const totalPages = this.getTotalPagesCommodity();
    if (this.activeMenuCommodity === 'Success' && this.successPagecommodity < totalPages) {
      this.successPagecommodity++;
      this.getSuccessOrdersCommodity(true);
    } else if (this.activeMenuCommodity === 'Failed' && this.failedPagecommodity < totalPages) {
      this.failedPagecommodity++;
      this.getFailedOrdersCommodity(true);
    } else if (this.activeMenuCommodity === 'Pending' && this.pendingPagecommodity < totalPages) {
      this.pendingPagecommodity++;
      this.getPendingOrdersCommodity(true);
    } else {
      this.progressPageCommodity++;
      this.getProgressOrdersCommodity(true);
    }
  }

  goToPreviousPageCommodity() {
    if (this.activeMenuCommodity === 'Success' && this.successPagecommodity > 1) {
      this.successPagecommodity--;
      this.getSuccessOrdersCommodity(true);
    } else if (this.activeMenuCommodity === 'Failed' && this.failedPagecommodity > 1) {
      this.failedPagecommodity--;
      this.getFailedOrdersCommodity(true);
    } else if (this.activeMenuCommodity === 'Pending' && this.pendingPagecommodity > 1) {
      this.pendingPagecommodity--;
      this.getPendingOrdersCommodity(true);
    } else {
      this.progressPageCommodity--;
      this.getProgressOrdersCommodity(true);
    }
  }

  getTotalPagesCommodity(): number {
    const total = this.activeMenuCommodity === 'Success' ? this.SuccessCountCommodity
      : this.activeMenuCommodity === 'Failed' ? this.FailedCountCommodity
        : this.activeMenuCommodity === 'Progress' ? this.ProgressCountCommodity
          : this.PendingCountCommodity;
    return Math.ceil(total / this.pageSizeCommodity);
  }

  getPageNumbersCommodity(): number[] {
    const totalPages = this.getTotalPagesCommodity();
    const currentPage = this.getCurrentPageCommodity();

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

  getCurrentPageCommodity(): number {
    return this.activeMenuCommodity === 'Success' ? this.successPagecommodity
      : this.activeMenuCommodity === 'Failed' ? this.failedPagecommodity
        : this.activeMenuCommodity === 'Progress' ? this.progressPageCommodity
          : this.pendingPagecommodity;
  }

  goToPageCommodity(page: number) {
    if (this.activeMenuCommodity === 'Success') {
      this.successPagecommodity = page;
      this.getSuccessOrdersCommodity(true);
    } else if (this.activeMenuCommodity === 'Failed') {
      this.failedPagecommodity = page;
      this.getFailedOrdersCommodity(true);
    } else if (this.activeMenuCommodity === 'Progress') {
      this.progressPageCommodity = page;
      this.getProgressOrdersCommodity(true);
    } else {
      this.pendingPagecommodity = page;
      this.getPendingOrdersCommodity(true);
    }
  }

  getSuccessOrdersCommodity(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeCommodity,
      page_no: this.SearchDebounceFlag ? null : String(this.successPagecommodity),
      status: "success",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    this.apiService.getViewCommodityOrderListService(obj).subscribe(resp => {
      this.SearchDebounceFlag = false;
      this.successOrdersCommodity = [];
      this.successOrdersCommodity = resp.response.orders;
      if (highlight && this.searchText) {

        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.successOrdersCommodity.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.successPagecommodity = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      } 
      else if(trade_id){
        this.highlightByTradeId(trade_id, resp);
      }
        else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getFailedOrdersCommodity(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeCommodity,
      page_no: this.SearchDebounceFlag ? null : String(this.failedPagecommodity),
      status: "failed",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    this.apiService.getViewCommodityOrderListService(obj).subscribe(resp => {
      this.failedOrdersCommodity = [];
      this.SearchDebounceFlag = false;
      this.failedOrdersCommodity = resp.response.orders;
      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.failedOrdersCommodity.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.failedPagecommodity = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      } else if (trade_id) {
          this.highlightByTradeId(trade_id, resp);
        }
         else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getPendingOrdersCommodity(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeCommodity,
      page_no: this.SearchDebounceFlag ? null : String(this.pendingPagecommodity),
      status: "pending",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    this.apiService.getViewCommodityOrderListService(obj).subscribe(resp => {
      this.pendingOrdersCommodity = [];
      this.SearchDebounceFlag = false;
      this.pendingOrdersCommodity = resp.response.orders;
      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.pendingOrdersCommodity.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.pendingPagecommodity = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      }
       else if (trade_id) {
          this.highlightByTradeId(trade_id, resp);
        } else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getProgressOrdersCommodity(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeCommodity,
      page_no: this.SearchDebounceFlag ? null : String(this.progressPageCommodity),
      status: "progress",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
      prediction_type: this.predictionFilter
    }
    this.apiService.getViewCommodityOrderListService(obj).subscribe(resp => {
      this.progressOrdersCommodity = [];
      this.SearchDebounceFlag = false;
      this.progressOrdersCommodity = resp.response.orders;
      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.progressOrdersCommodity.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.progressPageCommodity = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      }
       else if (trade_id) {
          this.highlightByTradeId(trade_id, resp);
        } else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  // FUTURE API

  onPageSizeChangeFuture() {
    if (this.activeMenuFuture === 'Success') {
      this.successPageFuture = 1;
      this.getSuccessOrdersFuture();
    } else if (this.activeMenuFuture === 'Failed') {
      this.failedPageFuture = 1;
      this.getFailedOrdersFuture();
    } else if (this.activeMenuFuture === 'Progress') {
      this.progressPageFuture = 1;
      this.getProgressOrdersFuture();
    }
    else {
      this.pendingPageFuture = 1;
      this.getPendingOrdersFuture();
    }
  }

  goToNextPageFuture() {
    const totalPages = this.getTotalPagesFuture();
    if (this.activeMenuFuture === 'Success' && this.successPageFuture < totalPages) {
      this.successPageFuture++;
      this.getSuccessOrdersFuture(true);
    } else if (this.activeMenuFuture === 'Failed' && this.failedPageFuture < totalPages) {
      this.failedPageFuture++;
      this.getFailedOrdersFuture(true);
    } else if (this.activeMenuFuture === 'Pending' && this.pendingPageFuture < totalPages) {
      this.pendingPageFuture++;
      this.getPendingOrdersFuture(true);
    }
    else {
      this.progressPageFuture++;
      this.getProgressOrdersFuture(true);
    }
  }

  goToPreviousPageFuture() {
    if (this.activeMenuFuture === 'Success' && this.successPageFuture > 1) {
      this.successPageFuture--;
      this.getSuccessOrdersFuture(true);
    } else if (this.activeMenuFuture === 'Failed' && this.failedPageFuture > 1) {
      this.failedPageFuture--;
      this.getFailedOrdersFuture(true);
    } else if (this.activeMenuFuture === 'Pending' && this.pendingPageFuture > 1) {
      this.pendingPageFuture--;
      this.getPendingOrdersFuture(true);
    } else {
      this.progressPageFuture--;
      this.getProgressOrdersFuture(true);
    }
  }

  getTotalPagesFuture(): number {
    const total = this.activeMenuFuture === 'Success' ? this.SuccessCountFuture
      : this.activeMenuFuture === 'Failed' ? this.FailedCountFuture
        : this.activeMenuFuture === 'Progress' ? this.ProgressCountFuture
          : this.PendingCountFuture;
    return Math.ceil(total / this.pageSizeFuture);
  }

  getPageNumbersFuture(): number[] {
    const totalPages = this.getTotalPagesFuture();
    const currentPage = this.getCurrentPageFuture();

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

  getCurrentPageFuture(): number {
    return this.activeMenuFuture === 'Success' ? this.successPageFuture
      : this.activeMenuFuture === 'Failed' ? this.failedPageFuture
        : this.activeMenuFuture === 'Progress' ? this.progressPageFuture
          : this.pendingPageFuture;
  }

  goToPageFuture(page: number) {
    if (this.activeMenuFuture === 'Success') {
      this.successPageFuture = page;
      this.getSuccessOrdersFuture(true);
    } else if (this.activeMenuFuture === 'Failed') {
      this.failedPageFuture = page;
      this.getFailedOrdersFuture(true);
    } else if (this.activeMenuFuture === 'Progress') {
      this.progressPageFuture = page;
      this.getProgressOrdersFuture(true);
    }
    else {
      this.pendingPageFuture = page;
      this.getPendingOrdersFuture(true);
    }
  }

  getSuccessOrdersFuture(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeFuture,
      page_no: this.SearchDebounceFlag ? null : String(this.successPageFuture),
      status: "success",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
        prediction_type:this.predictionFilter
    }
    this.apiService.getViewFutureOrderListService(obj).subscribe(resp => {
      this.SearchDebounceFlag = false;
      this.successOrdersFuture = [];
      this.successOrdersFuture = resp.response.orders;
      if (highlight && this.searchText) {

        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.successOrdersFuture.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.successPageFuture = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      } else if(trade_id){
        this.highlightByTradeId(trade_id, resp);
      }else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getFailedOrdersFuture(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeFuture,
      page_no: this.SearchDebounceFlag ? null : String(this.failedPageFuture),
      status: "failed",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
        prediction_type:this.predictionFilter
    }
    this.apiService.getViewFutureOrderListService(obj).subscribe(resp => {
      this.failedOrdersFuture = [];
      this.SearchDebounceFlag = false;
      this.failedOrdersFuture = resp.response.orders;
      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.failedOrdersFuture.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.failedPageFuture = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      } else if(trade_id){
        this.highlightByTradeId(trade_id, resp);
      }else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getPendingOrdersFuture(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeFuture,
      page_no: this.SearchDebounceFlag ? null : String(this.pendingPageFuture),
      status: "pending",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
        prediction_type:this.predictionFilter
    }
    this.apiService.getViewFutureOrderListService(obj).subscribe(resp => {
      this.pendingOrdersFuture = [];
      this.SearchDebounceFlag = false;
      this.pendingOrdersFuture = resp.response.orders;
      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.pendingOrdersFuture.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.pendingPageFuture = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      }else if(trade_id){
        this.highlightByTradeId(trade_id, resp);
      } else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  getProgressOrdersFuture(highlight: boolean = false, trade_id: any = null) {
    this.showmsg = "Fetching Data!";
    this.spinner.show();
    let obj = {
      country_id: Number(localStorage.getItem('selectedCountryId')),
      start_date: this.selectedDateRange.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRange.endDate.format('YYYY-MM-DD'),
      stock_tick: this.searchText,
      limit: this.pageSizeFuture,
      page_no: this.SearchDebounceFlag ? null : String(this.progressPageFuture),
      status: "progress",
      time_frame: this.timeframe_forOrderList,
      order_by_purchased_cmp_date: this.isChecked,
      order_type: this.selectTradeType,
      trade_id: trade_id,
        prediction_type:this.predictionFilter
    }
    this.apiService.getViewFutureOrderListService(obj).subscribe(resp => {
      this.progressOrdersFuture = [];
      this.SearchDebounceFlag = false;
      this.progressOrdersFuture = resp.response.orders;
      if (highlight && this.searchText) {
        const lowerSearch = this.searchText.toLowerCase();
        const matches = this.progressOrdersFuture.filter((order: { stock_tick: string; }) =>
          order.stock_tick?.toLowerCase().includes(lowerSearch)
        );

        this.MatchedCount = matches.length;

        if (matches.length > 0) {
          this.highlightedStockTick = matches[0].stock_tick;
          this.highlightedTradeId = null;

          setTimeout(() => {
            const target = this.stockCells.find(
              cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === this.highlightedStockTick.toLowerCase()
            );

            if (target) {
              target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              this.progressPageFuture = resp.response.page_no;
            }
          });
        } else {
          this.highlightedStockTick = '';
        }
      }else if(trade_id){
        this.highlightByTradeId(trade_id, resp);
      } else {
        this.highlightedStockTick = '';
        this.MatchedCount = 0;
      }
      this.spinner.hide();
    });
  }

  onCmpToggle(event: Event) {
    this.isChecked = (event.target as HTMLInputElement).checked;
    if (this.activeTab == 'Stocks') {
      this.getSuccessOrders();
      this.getFailedOrders();
      this.getPendingOrders();
      this.getProgressOrders();
      this.getorderscount();
    }
    else if (this.activeTab == 'Commodity') {
      this.getSuccessOrdersCommodity();
      this.getFailedOrdersCommodity();
      this.getPendingOrdersCommodity();
      this.getProgressOrdersCommodity();
      this.getCommodityorderscount();
    }
    else {
      this.getSuccessOrdersFuture();
      this.getFailedOrdersFuture();
      this.getPendingOrdersFuture();
      this.getProgressOrdersFuture();
      this.getFuturesorderscount();
    }
  }

  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  exportToExcel() {
    let data;
    if (this.activeTab === 'Stocks') {
      if (this.activeMenu === 'Success') {
        data = this.successOrders;
      } else if (this.activeMenu === 'Failed') {
        data = this.failedOrders;
      } else if (this.activeMenu === 'Pending') {
        data = this.pendingOrders;
      } else if (this.activeMenu === 'Progress') {
        data = this.progressOrders;
      } else {
        this.toastr.error('Please select a valid menu to export data');
        return;
      }
    } else if (this.activeTab === 'Commodity') {
      if (this.activeMenuCommodity === 'Success') {
        data = this.successOrdersCommodity;
      } else if (this.activeMenuCommodity === 'Failed') {
        data = this.failedOrdersCommodity;
      } else if (this.activeMenuCommodity === 'Pending') {
        data = this.pendingOrdersCommodity;
      } else if (this.activeMenuCommodity === 'Progress') {
        data = this.progressOrdersCommodity;
      } else {
        this.toastr.error('Please select a valid menu to export data');
        return;
      }
    } else if (this.activeTab === 'Future') {
      if (this.activeMenuFuture === 'Success') {
        data = this.successOrdersFuture;
      } else if (this.activeMenuFuture === 'Failed') {
        data = this.failedOrdersFuture;
      } else if (this.activeMenuFuture === 'Pending') {
        data = this.pendingOrdersFuture;
      } else if (this.activeMenuFuture === 'Progress') {
        data = this.progressOrdersFuture;
      } else {
        this.toastr.error('Please select a valid menu to export data');
        return;
      }
    } else {
      this.toastr.error('Please select a valid tab to export data');
      return;
    }
    // const data = this.activeTab === 'Stocks' ? this.successOrders : [];
    if (!data || data.length === 0) {
      this.toastr.error('No data available to export');
      return;
    }


    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    const excelBuffer: any = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob: Blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    const uuid = this.generateUUID();
    const fileName = `order_${uuid}.xlsx`;
    // const fileName = `Orders_${this.activeTab}_${this.selectedDateRange.startDate.format('YYYYMMDD')}_${this.selectedDateRange.endDate.format('YYYYMMDD')}.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toastr.success('Data exported successfully');
  }

  viewReason() {
    this.showReasonPanel = true;
  }

  closePanel() {
    this.showReasonPanel = false;

  }

  getReasonForStocks() {
    const payload = {
      order_id: this.selectedOrderId,
      table_name: 'order'
    };

    this.apiService.getReasonData(payload).subscribe({
      next: (res: any) => {
        if (res?.response) {
          this.reasons = Object.entries(res.response).map(
            ([key, value]) => `${key} : ${value}`
          );
        } else {
          this.reasons = ['No data available'];
        }
      },
      error: (err) => {
        console.error('API Error:', err);
        this.reasons = ['Error fetching reasons'];
      }
    });
  }

  // getReasonForCommodity(segment:any)
  // {
  //   const payload={
  //      order_id: this.selectedOrderId,
  //     segment : segment
  //   }

  //   this.apiService.getReasonForMCXFUT(payload).subscribe(resp=>{
  //     if(resp.msg=="success")
  //     {
  //        if (resp?.response) {
  //         this.reasons = Object.entries(resp.response).map(
  //           ([key, value]) => `${key} : ${value}`
  //         );
  //       } else {
  //         this.spinner.hide()
  //         this.reasons = ['No data available'];
  //       }
  //     }
  //     else
  //     {
  //       this.spinner.hide()
  //       this.toastr.error("Error fetching Trade Reason !")
  //     }
  //   })
  // }

  togglePopsup() {
    this.isPopupOpen = !this.isPopupOpen;
  }

  openPopup() {
    this.isPopupOpen = true;
  }

  resetFilter() {
    this.isChecked = false;
    this.selectTradeType = "all";
    this.predictionFilter =null
    this.timeframe_forOrderList = null
    this.selectedDateRange = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.getorderscount();
    this.getCommodityorderscount();
    this.getFuturesorderscount();
    this.PrepDebounce();
    this.getSuccessOrders();
    this.getFailedOrders();
    this.getPendingOrders();
    this.getProgressOrders();
    this.getSuccessOrdersCommodity();
    this.getFailedOrdersCommodity();
    this.getPendingOrdersCommodity();
    this.getProgressOrdersCommodity();
    this.getSuccessOrdersFuture();
    this.getFailedOrdersFuture();
    this.getPendingOrdersFuture();
    this.getProgressOrdersFuture();
    this.onPredictionFilterChange();
  }

 connectWebSocket(type: any): void {
    this.webSocketService.connect(this.finData.tick, this.finData.time_frame, this.UpdateCnadleStockId, type);
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



onPredictionFilterChange() {
   if (this.activeTab == 'Stocks') {
      this.getSuccessOrders();
      this.getFailedOrders();
      this.getPendingOrders();
      this.getProgressOrders();
      this.getorderscount();
    }
    else if (this.activeTab == 'Commodity') {
      this.getSuccessOrdersCommodity();
      this.getFailedOrdersCommodity();
      this.getPendingOrdersCommodity();
      this.getProgressOrdersCommodity();
      this.getCommodityorderscount();
    }
    else {
      this.getSuccessOrdersFuture();
      this.getFailedOrdersFuture();
      this.getPendingOrdersFuture();
      this.getProgressOrdersFuture();
      this.getFuturesorderscount();
    }
   this.getorderscount();
}

openBar(isOpen: boolean) {
  this.isLeftBarOpen = isOpen;
}


}