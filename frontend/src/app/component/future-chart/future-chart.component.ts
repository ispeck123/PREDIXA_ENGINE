import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  Renderer2,
  TemplateRef,
  ViewChild,
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

import {
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  Subject,
  switchMap,
} from 'rxjs';
import { WebSocketService } from 'src/app/services/web-socket.service';
import moment from 'moment';
import { ThisReceiver } from '@angular/compiler';
import { FloatingModalComponent } from '../floating-modal/floating-modal.component';
import { ScripDataServiceService } from 'src/app/services/scrip-data-service.service';
import { DatePipe } from '@angular/common';
// import { Chart, ChartData, ChartOptions } from 'chart.js';
// import annotationPlugin from 'chartjs-plugin-annotation';
// import annotationPlugin from 'chartjs-plugin-annotation';
// import { Chart, ChartData, ChartOptions, registerables } from 'chart.js';
import { NgSelectComponent } from '@ng-select/ng-select';
import { ManualRectangleRecord, Point, RectangleDrawingTool, RectangleStyleOptions } from '../homecandles/rectangle-drawing-tool';
import { ChartDrawingLineStyle, ChartDrawingPoint, ChartDrawingRecord, ChartDrawingStylePatch, ChartDrawingTool, ChartDrawingToolType } from '../homecandles/chart-drawing-tool';


interface Patch {
  qualified_zones?: boolean;
  optimized_buy_sell_zone?: boolean;
}

interface MenuRule {
  base: string;
  htf_zone?: Record<string, Patch>;
}

interface HtfZoneMemory {
  htf: boolean;
  qualified: boolean;
}

const STANDARD_HTF_ZONE_RULES_SECOND: Record<string, MenuRule> = {
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
      seventy_five: { optimized_buy_sell_zone: true },
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


@Component({
  selector: 'app-future-chart',
  templateUrl: './future-chart.component.html',
  styleUrls: ['./future-chart.component.css'],
})
export class FutureChartComponent implements OnInit {
  // chartData!: ChartData<'bar'>;
  // chartOptions!: ChartOptions;
  @ViewChild('modalalert') modalalert!: FloatingModalComponent;
  @ViewChild('chart_container_new') chartContainer!: ElementRef;
  private readonly MIN_PRICE = 0;
  showmsg: any;
  OIData: any[] = []; // this will hold resp.response.optionsChain
  underlyingPrice: number = 0; // this will hold resp.response.underlyingValue
  SelectedScrips: any;
  QualifiedData: any;
  PreviousHighData: any;
  showPopup = false;
  BuySetupData: any;
  SellSetupData: any;
  previewLine: any = null;
  CancelReplayClicked: boolean = false;
  BuyZoneData: any;
  OptimizedBuySellZoneData: any;
  isSidebarOpen = false;
  submittedForMannual: boolean = false;
  SellZoneData: any;
  stockDatas: any;
  showCreateOrderModal = false;
  timer: any;
  BaseCandleData: any;
  submitted: boolean = false;
  replayMode = false;
  stockData: any;
  BadZoneData: any;
  AllZonesData: any;
  setupData: any;
  selectedFutureOption: any = null;
  TrendAnalyzer: any;
  candles: { color: string; height: number; wickHeight: number }[] = [];
  colorInterval: any;
  private areaSeries: any;
  private candlestickSeries: any;
  xspan: any;
  selectedStockId: any;
  rectangleTool: any;
  toolTipData: any;
  Open: any;
  High: any;
  Low: any;
  Close: any;
  stock_id: any;
  CandleColor: any;
  TrackFullScreenMode: boolean = false;
  fincreateform: FormGroup;
  FullScreenModeValue: any;
  ModalHeader: any;
  dropdownShow: boolean = false;
  isReplayMode: boolean = false;
  suggestion: boolean = false;
  UpdateCnadleStockId: any;
  ChartRESPONSE: any;
  createorderResp: any;
  private chart: any;
  selectedOptions: any = {
    base_candle: false,
    buy_sell_zone: false,
    bad_zone: false,
    setup: false,
    overlap_evaluate: false,
    overlap_analyze: false,
    all_zones:false
  };
  DailyLabel: any;
  SixtyLabel: any;
  Seventy_FiveLabel: any;
  isReplayPlaying: boolean = false;
  Fifteen_MinuteLabel: any;
  lastCMPLine: any = null;
  SelectedStockName: any;
  selectedStockName: any;
  @ViewChild('closeButtonHide') closeButtonHide: ElementRef;
  @ViewChild('closeButton') closeButton: ElementRef;
  @ViewChild('modalA') modalA!: FloatingModalComponent;
  viewGraphOverlapMemory: Record<string, HtfZoneMemory> = {};
  isNotificationVisible: boolean = false;
  selectedOption: any;
  finData: any;
  private buylineSeries: any;
  private targetlineSeries: any;
  private stoplosslineSeries: any;
  finform: FormGroup;
  buyZoneMarkers: any;
  showPrompt: boolean = false;
  userAction: string = '';
  time_frame: any;
  replayVisibleData: any[] = [];
  replayFutureData: any[] = [];
  QualifiedVisibility: boolean = false;
  OverlayVisibility: boolean = false;
  SetupVisibility: boolean = false;
  OverLayCandleData: any;
  BuyOverlayData: any;
  SellOverlayData: any;
  SETUPTYPE: any;
  setupdataStatus: any;
  ModelPrediction: any;
  BuyTimestampData: any;
  EntryPrice: any;
  EntryTime: any;
  updateModelPredictionFlag: boolean = false;
  TargetPrice: any;
  StoplossPrice: any;
  SellTimestampData: any;
  alertForm: FormGroup;
  submitStock = false;
  countryId: any;
  userId: any;
  UserName: any;
  allSetAlerts: any = [];
  isOrderPanelOpen = false;
  selectedDate: any;
  SellEntryPrice: any;
  SellTargetPrice: any;
  SellStoplossPrice: any;
  BuyEntryPrice: any;
  BuyTargetPrice: any;
  BuystoplossPrice: any;
  OrderButtonFlag: boolean = false;
  selectedLine: any = null;
  SelectedFutureStockName: any;
  SelectedExpiryDate: any;
  CreateButtonFlag = false;
  SelectedPrediction: any;
  SelectedProbability: any;
  MonthlyLabel: any;
  WeeklyLabel: any;
  entryEnabled = true;
  targetEnabled = true;
  stoplossEnabled = true;
  ViewSetUpAnywayFlag: boolean = false;
  boundShowPreviewLine: ((param: any) => void) | null = null;
  boundFixLineAtPrice: ((param: any) => void) | null = null;
  placementMode: 'none' | 'entry' | 'target' | 'stoploss' = 'none';
  private readonly FUTURE_SECONDS = 60 * 60 * 24 * 365 * 1;
  horizontalLines: any[] = [];
  private readonly DEFAULT_SCALE_MARGINS = { top: 0.0, bottom: 0.0 };
  createBtnFlgForMannualSetup: boolean = false;
  fincreateformForMannualSetup: FormGroup;
  RiskToReward: any;
  private _dragListenersAttached = false;
  showCreateOrderModalForMAnnual = false;
  OIDetailsData: any;
  selectedScrip: any;
  selectedExpiry: any;
  ScripData: any;
  isScripInvalidFlag = false;
  selectedScrips: any[] = [];
  FutureListOption: any;
  FutureListOption_date: any;
  MasterSymbol: any;
  MasterExpiry: any;
  @ViewChild('scripSelect') scripSelect!: NgSelectComponent;
  expiryDates: string[] = [];
  showFuturesPopup: boolean = false;
  showSubdataPopup = false;
  popupPosition = { top: '0px', left: '0px' };
  PricePercentageData: any;
  modalAPos = { top: 0, left: 0 };
  showMobileTradeMenu = false;
  isLeftBarOpen = false;
  isChartInverted: boolean = false;
  isMobileView = false;
  selectedFutureDate: any;
  AnalyzeOverlayData: any;
  TradeSetupReason: any;
  isDisabled = false;
  AllzoneData:any;


    //#region Custom tool and zone 
  
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
    
      //#endregion

  constructor(
    private formBuilder: FormBuilder,
    private webSocketService: WebSocketService,
    private renderer: Renderer2,
    private toastr: ToastrService,
    private datePipe: DatePipe,
    private elementRef: ElementRef,
    private scripDataService: ScripDataServiceService,
    private router: Router,
    private spinner: NgxSpinnerService,
    private apiService: ApiService
  ) {
    this.xspan = 3600;
  }

  openBar(isOpen: boolean): void {
    this.isLeftBarOpen = isOpen;
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

  // SHORTCUT KEY ZONES CODE

  @HostListener('document:keydown', ['$event'])
  handleSecondChartShortcutKeys(event: KeyboardEvent): void {
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
        this.toggleQualifiedZoneShortcutBySecondRule();
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
        this.toggleHtfShortcutBySecondRule();
        break;
    }
  }

  private toggleQualifiedZoneShortcutBySecondRule(): void {
    /*
      Q / qualified_zones should work only on execution/base timeframe.
  
      Base timeframe comes from:
      this.finData.time_frame
  
      1  => daily
      2  => sixty
      3  => fifteen
      25 => seventy_five
    */

    const rule = this.getCurrentSecondRuleForShortcut();

    if (!rule) {
      console.log('Q blocked: No SECOND HTF rule found.');
      return;
    }

    const currentTf = this.normalizeSecondShortcutTf(this.FullScreenModeValue);
    const baseTf = this.normalizeSecondShortcutTf(rule.base);

    if (currentTf !== baseTf) {
      console.log(
        `Q blocked: qualified_zones allowed only on execution timeframe. Base: ${baseTf}, Current: ${currentTf}`
      );
      return;
    }

    this.checkboxClicked('qualified_zones');
  }

  private toggleHtfShortcutBySecondRule(): void {
    /*
      Z key behavior:
  
      1. If current chart is execution/base timeframe:
         Z toggles htf_zone
  
      2. If current chart is valid HTF child from STANDARD_HTF_ZONE_RULES_SECOND:
         Z toggles optimized_buy_sell_zone
  
      3. If current chart is not mapped:
         Do nothing
    */

    const rule = this.getCurrentSecondRuleForShortcut();

    if (!rule) {
      console.log('Z blocked: No SECOND HTF rule found.');
      return;
    }

    const currentTf = this.normalizeSecondShortcutTf(this.FullScreenModeValue);
    const baseTf = this.normalizeSecondShortcutTf(rule.base);

    // Case 1: current timeframe is execution/base timeframe
    if (currentTf === baseTf) {
      this.checkboxClicked('htf_zone');
      return;
    }

    // Case 2: current timeframe is valid HTF child
    const patch = rule.htf_zone?.[currentTf];

    if (!patch) {
      console.log(
        `Z blocked: ${currentTf} is not mapped under base ${baseTf}`
      );
      return;
    }

    if (patch.optimized_buy_sell_zone !== true) {
      console.log(
        `Z blocked: optimized_buy_sell_zone is not enabled for ${currentTf}`
      );
      return;
    }

    /*
      Apply patch values except optimized_buy_sell_zone.
      checkboxClicked('optimized_buy_sell_zone') will toggle optimized_buy_sell_zone itself.
    */
    Object.keys(patch).forEach((key) => {
      if (key !== 'optimized_buy_sell_zone') {
        this.selectedOptions[key] = (patch as any)[key];
      }
    });

    this.checkboxClicked('optimized_buy_sell_zone');
  }

  private getCurrentSecondRuleForShortcut(): MenuRule | null {
    /*
      IMPORTANT:
      Do not use this.activeMenu here.
  
      Correct execution/base timeframe source is:
      this.finData.time_frame
    */

    const baseMenu = this.getSecondBaseMenuFromFinData();

    if (!baseMenu) {
      return null;
    }

    return STANDARD_HTF_ZONE_RULES_SECOND[baseMenu] || null;
  }

  private getSecondBaseMenuFromFinData(): string | null {
    const tf = Number(this.finData?.time_frame);

    const timeFrameMap: Record<number, string> = {
      1: 'daily',
      2: 'sixty',
      3: 'fifteen',
      25: 'seventy_five',
    };

    return timeFrameMap[tf] || null;
  }

  private normalizeSecondShortcutTf(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  // SHORTCUT KEY ZONES CODE END


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

  updateSelectedDate(event: any): void {
    const value = event.target.value;

    this.selectedFutureDate = value;

    if (Array.isArray(this.SelectedScrips)) {
      this.SelectedScrips.forEach((item: any) => {
        item.last_d_time = value; // or formatted value
      });
    }

    this.SelectedScrips.forEach((item: any, index: any) => {
      this.callApi(item, index);
    });

  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const target2 = event.target as HTMLElement;
    if (
      target2.tagName === 'INPUT' ||
      target2.tagName === 'TEXTAREA' ||
      target2.getAttribute('contenteditable') === 'true' ||
      (target2 as HTMLInputElement).isContentEditable
    ) {
      return;
    }

    if (event.key === 'Delete' && this.selectedLine) {
      if (this.selectedLine.type === 'entry') {
        console.log('hhhhhhhhhh', event.key);

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

    const target = event.target as HTMLElement;
    const isInputField =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (isInputField) {
      return;
    }
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
          this.toastr.error(`No Data Found on Seventy Five Minutes !`);
        }
        break;
      case '6':
        dataPresent = !!this.ChartRESPONSE['sixty'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('sixty', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on Sixty Minutes !`);
        }
        break;
      case '5':
        dataPresent = !!this.ChartRESPONSE['fifteen'];
        if (dataPresent) {
          // this.selectedOptions = [];
          this.dropdownShow = false;
          this.ChangeScreenMode('fifteen', 'chart-container_new');
        } else {
          this.toastr.error(`No Data Found on Fifteen Minutes !`);
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
      case 'l':
      case 'L':
        if (this.TrackFullScreenMode) {
          // this.drawLineSeries()
        }
        break;
      case 'C':
      case 'c':
        if (this.TrackFullScreenMode) {
          // this.drawCandleSeries()
        }
        break;
    }
  }

  getCurrentDateTime(): string {
    const finDataStock = this.finData;
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

  getScriprData() {
    this.apiService.getScripData().subscribe((res: any) => {
      if (res.msg == 'success') {
        this.ScripData = res.response;
      } else if (res.msg == 'failed') {
        this.toastr.error('Failed to fetch stock exchanges');
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
        if (res.msg == 'success') {
          this.selectedScrips = [];
          this.FutureListOption = res.response;
          this.setDefaultExpiry();
        } else {
          this.toastr.error('Failed to fetch data');
        }
      });
  }

  setDefaultExpiry() {
    if (this.FutureListOption?.length) {
      const first = this.FutureListOption[0].expiry_date;
      this.selectedExpiry = first;
      Promise.resolve().then(() => this.onExpiryChange(first));
    } else {
      this.selectedExpiry = null; // no expiries available
    }
  }

  onExpiryChange(expiry: Date | string) {
    this.disconnectOIService();
    this.GetIOData(this.selectedScrip, expiry);
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

  openModalA() {
    this.modalA.show();
  }

  shiftChart(diff: number) {
    const currentPos = this.chart.timeScale().scrollPosition();
    this.chart.timeScale().scrollToPosition(currentPos + diff, false);

    requestAnimationFrame(() => {
      // this.redrawCanvas();
    });
  }

  scaleChart(pct: number, zoomIn: boolean): void {
    const timeScale = this.chart.timeScale();
    const direction = zoomIn ? -1 : 1;
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

    requestAnimationFrame(() => {
      // this.redrawCanvas();
    });
  }

  ChangeScreenMode(type: any, chartId: any) {
    const prevFullScreen = this.FullScreenModeValue;
    if (prevFullScreen === type) {
      return;
    }
    this.isNotificationVisible = false;
    this.updateModelPredictionFlag = false;
    this.destroyManualRectangleTool();
    const dataPresent: boolean = !!this.ChartRESPONSE[type];
    if (dataPresent) {
      this.suggestion = false;
      switch (type) {
        case 'monthly':
          this.FullScreenModeValue = type;
          this.ModalHeader = type;
          this.QualifiedVisibility = false;
          this.OverlayVisibility = false;
          this.SetupVisibility = false;

          this.suggestion = false;
          break;
        case 'weekly':
          this.FullScreenModeValue = type;
          this.ModalHeader = type;
          this.QualifiedVisibility = false;
          this.OverlayVisibility = false;
          this.SetupVisibility = false;
          this.suggestion = false;
          break;
        case 'daily':
          this.FullScreenModeValue = type;
          this.ModalHeader = type;
          if (this.time_frame == 1) {
            this.QualifiedVisibility = true;
            this.OverlayVisibility = true;
            this.SetupVisibility = true;
          } else {
            this.QualifiedVisibility = false;
            this.OverlayVisibility = false;
            this.SetupVisibility = false;
          }
          break;
        case 'seventy_five':
          this.FullScreenModeValue = type;
          this.ModalHeader = '75 Minute';
          if (this.time_frame == 25) {
            this.QualifiedVisibility = true;
            this.OverlayVisibility = true;
            this.SetupVisibility = true;
          } else {
            this.QualifiedVisibility = false;
            this.OverlayVisibility = false;
            this.SetupVisibility = false;
          }
          break;
        case 'sixty':
          this.FullScreenModeValue = type;
          this.ModalHeader = '60 Minute';
          if (this.time_frame == 2) {
            this.QualifiedVisibility = true;
            this.OverlayVisibility = true;
            this.SetupVisibility = true;
          } else {
            this.QualifiedVisibility = false;
            this.OverlayVisibility = false;
            this.SetupVisibility = false;
          }
          break;
        case 'fifteen':
          this.FullScreenModeValue = type;
          this.ModalHeader = '15 Minute';
          if (this.time_frame == 3) {
            this.QualifiedVisibility = true;
            this.OverlayVisibility = true;
            this.SetupVisibility = true;
          } else {
            this.QualifiedVisibility = false;
            this.OverlayVisibility = false;
            this.SetupVisibility = false;
          }
          break;
      }
      const data = this.ChartRESPONSE[type];
      this.cleanup();
      this.LoadChart(data, chartId, true);
      const now = new Date();
      const dayOfWeek = now.getDay();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const lastRow = data.slice(-1)[0];
      this.CreateClosingLine(lastRow.close);
      this.addPreviousHighPriceLine(type);
      this.initOldZoneRectangleTool(chartId);
      this.initManualRectangleTool(type, data);
      this.initChartDrawingTool(type, data);
      this.applyViewGraphOverlapLogic(prevFullScreen);
      this.checkboxClicked(this.selectedOptions)
      this.addHighestCallOi();
      this.addHighestPutoi();
      // Check if today is Monday to Friday (1 to 5) and the time is between 9:15 AM to 3:30 PM
      if (
        dayOfWeek >= 1 &&
        dayOfWeek <= 5 &&
        (hours > 9 || (hours === 9 && minutes >= 15)) &&
        (hours < 15 || (hours === 15 && minutes <= 30))
      ) {
        // this.connectWebSocket();
      } else {
        console.log(
          'WebSocket connection can only be made between Monday to Friday, 9:15 AM to 3:30 PM.'
        );
      }
    } else {
      this.toastr.error(`No Data found !`);
      return;
    }
  }

  addPreviousHighPriceLine(key: any) {
    const previousHigh = this.PreviousHighData[key].previous_high;
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

  private buildForm() {
    this.alertForm = this.formBuilder.group({
      user_id: [Number(this.userId)],
      country_id: [Number(this.countryId)],
      stock_symbol: ['', Validators.required],
      exchange: ['NSEFO'],
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
  }

  private buildForms() {
    this.finform = this.formBuilder.group({
      country: [localStorage.getItem('selectedCountryName')],
      tick: ['', [Validators.required]],
      time_frame: ['', [Validators.required]],
      last_d_time: [''],
      stock_id: [''],
    });
    this.fincreateformForMannualSetup = this.formBuilder.group({
      stock_tick: [''],
      stock_id: [''],
      prediction: [''],
      probability: [''],
      country_id: [Number(this.countryId)],
      order_type: ['', [Validators.required]],
      entry_price: ['', [Validators.required]],
      stoploss_price: ['', [Validators.required]],
      target_price: ['', [Validators.required]],
      stock_quantity: ['', [Validators.required]],
      purchased_cmp_date: [''],
      time_frame: [''],
      exp_date: [''],
    });
  }

  private CreateForm() {
    this.fincreateform = this.formBuilder.group({
      prediction: [''],
      probability: [''],
      exp_date: [''],
      stock_tick: ['', Validators.required],
      stock_id: [''],
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

  ngOnInit(): void {
    this.UserName = localStorage.getItem('UserName');
    this.countryId = localStorage.getItem('selectedCountryId');
    this.getScriprData();
    this.userId = localStorage.getItem('UserId');
    this.buildForm();
    this.buildForms();
    this.CreateForm();
    this.SelectedScrips = this.scripDataService.getScripsForNSEFO();
    console.log('Received scrips:', this.SelectedScrips);
    if (this.SelectedScrips.length > 0) {
      // this.showPrompt = true;
      this.confirmActionNgINit();
    }
    this.getAllSetAlerts();

    // Assuming your form is called `form`
    this.alertForm.get('trigger_price')?.valueChanges.subscribe(() => {
      this.calculateMinMax();
    });

    this.alertForm.get('threshold')?.valueChanges.subscribe(() => {
      this.calculateMinMax();
    });

  }

  ngOnDestroy(): void {
    this.disconnectWebSocket();
    this.disconnectOIService();
  }

  get g() {
    return this.fincreateform.controls;
  }
  get j() {
    return this.alertForm.controls;
  }

  get k() {
    return this.fincreateformForMannualSetup.controls;
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
    if (this.finData?.st_sym) {
      const tickUpper = this.finData.st_sym.toUpperCase(); //nabonita
      this.alertForm.get('stock_symbol')?.patchValue(tickUpper);
    }

    this.alertForm.get('timeframe')?.patchValue(this.time_frame); //nabonita

    this.modalalert.show();
    this.hideContextMenu();
  }

  stockDataFunc() {
    this.apiService
      .getStockList(localStorage.getItem('selectedCountryName'))
      .subscribe((data) => {
        const apiResponse = data.response;
        this.stockDatas = apiResponse;
        // console.log('list data', this.stockData);
      });
  }

  onCountryChange(countryName: any) {
    this.apiService.getStockDataByCountry(countryName).subscribe((resp) => {
      if (resp.response && Array.isArray(resp.response)) {
        this.stockData = resp.response.sort(
          (a: { stock_tick: string }, b: { stock_tick: any }) =>
            a.stock_tick.localeCompare(b.stock_tick)
        );
      } else {
        this.stockData = [];
      }
      // console.log('this.stockData', this.stockData);
    });
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

  LoadChart(data: any, chartId: any, isFullScreen: boolean = false) {
    console.log('Full SCreen Data', data);

    let chart = null;
    // this.cleanupChart()
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

    chart = createChart(document.getElementById(chartId)!, {
      ...chartProperties,
      layout: {
        background: {
          color: '#f0ffff',
        },
      },
    });

    if (isFullScreen === true) {
      chart.applyOptions({
        watermark: {
          visible: true,
          fontSize: 20,
          horzAlign: 'left',
          vertAlign: 'top',
          color: 'rgb(128, 128, 128)',
          text: this.SelectedStockName.toUpperCase() + " | " + this.ModalHeader.toUpperCase() + "(NSEFO)",
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

    // NUMBER 1
    this.candlestickSeries = chart.addCandlestickSeries({
      upColor: '#006401',
      downColor: '#8b0101',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      lastValueVisible: false,
      priceLineVisible: false,
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
        top: 0.0,
        bottom: 0.0,
      },
    });

    this.rectangleTool = new RectangleDrawingTool(
      chart,
      this.candlestickSeries,
      document.querySelector<HTMLDivElement>('#toolbar')!,
      {
        showLabels: false,
      }
    );
    const maData = this.calculateMovingAverageSeriesData(data, 20);

    const maSeries = chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 1,
      title: 'EMA',
    });
    maSeries.setData(maData);

    //  const candlestickSeries = chart.addCandlestickSeries({
    //     upColor: '#006401',
    //     downColor: '#8b0101',
    //     borderVisible: false,
    //     wickUpColor: '#26a69a',
    //     wickDownColor: '#ef5350',
    //     lastValueVisible: false,
    //     priceLineVisible: false,
    //   });
    //   candlestickSeries.setData([...data, ...postbars]);

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#006401',
      downColor: '#8b0101',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    candlestickSeries.setData([...data, ...postbars]);

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
    this.chart = chart;
    this.chart.subscribeClick(this.onChartClick.bind(this));
  }

  FullScreenMode(type: any, chartId: any) {
    this.disconnectWebSocket();
    const chart_container_new = this.elementRef.nativeElement.querySelector(
      '#chart-container_new'
    ); //nabonita
    if (chart_container_new) {
      chart_container_new.innerHTML = '';
    }
    this.destroyManualRectangleTool();
    this.TrackFullScreenMode = true;
    this.dropdownShow = false;
    switch (type) {
      case 'monthly':
        this.FullScreenModeValue = type;
        this.ModalHeader = type;
        this.QualifiedVisibility = false;
        this.OverlayVisibility = false;
        this.SetupVisibility = false;
        this.suggestion = false;
        break;
      case 'weekly':
        this.FullScreenModeValue = type;
        this.ModalHeader = type;
        this.QualifiedVisibility = false;
        this.OverlayVisibility = false;
        this.SetupVisibility = false;
        this.suggestion = false;
        break;
      case 'daily':
        this.FullScreenModeValue = type;
        this.ModalHeader = type;
        if (this.time_frame == 1) {
          this.QualifiedVisibility = true;
          this.OverlayVisibility = true;
          this.SetupVisibility = true;
        } else {
          this.QualifiedVisibility = false;
          this.OverlayVisibility = false;
          this.SetupVisibility = false;
        }
        break;
      case 'seventy_five':
        this.FullScreenModeValue = type;
        this.ModalHeader = '75 Minute';
        if (this.time_frame == 25) {
          this.QualifiedVisibility = true;
          this.OverlayVisibility = true;
          this.SetupVisibility = true;
        } else {
          this.QualifiedVisibility = false;
          this.OverlayVisibility = false;
          this.SetupVisibility = false;
        }
        break;
      case 'sixty':
        this.FullScreenModeValue = type;
        this.ModalHeader = '60 Minute';
        if (this.time_frame == 2) {
          this.QualifiedVisibility = true;
          this.OverlayVisibility = true;
          this.SetupVisibility = true;
        } else {
          this.QualifiedVisibility = false;
          this.OverlayVisibility = false;
          this.SetupVisibility = false;
        }
        break;
      case 'fifteen':
        this.FullScreenModeValue = type;
        this.ModalHeader = '15 Minute';
        if (this.time_frame == 3) {
          this.QualifiedVisibility = true;
          this.OverlayVisibility = true;
          this.SetupVisibility = true;
        } else {
          this.QualifiedVisibility = false;
          this.OverlayVisibility = false;
          this.SetupVisibility = false;
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
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const lastRow = data.slice(-1)[0];
    this.CreateClosingLine(lastRow.close);
    this.addPreviousHighPriceLine(type);
    this.addHighestCallOi();
    this.addHighestPutoi();

    // console.log('this.chartContainer', this.chartContainer);
    this.chartContainer.nativeElement.addEventListener(
      'contextmenu',
      (event: MouseEvent) => {
        event.preventDefault();
        this.showContextMenu(event.clientX, event.clientY);
      }
    );
    document.addEventListener('click', () => this.hideContextMenu());
  }

  addHighestCallOi() {
    const CALLOI = this.OIDetailsData?.strike_price_of_highest_callOi
    const CALLOILine = {
      price: CALLOI,
      color: 'green',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Highest Call OI',
    };
    this.candlestickSeries.createPriceLine(CALLOILine);
  }

  addHighestPutoi() {
    const PUTOI = this.OIDetailsData?.strike_price_of_highest_putOi
    const PUTOILine = {
      price: PUTOI,
      color: 'red',
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Highest Put OI',
    };
    this.candlestickSeries.createPriceLine(PUTOILine);
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

  callApi(item: { symbol: string; expiry_date: string, last_d_time: any }, index: number) {
    // const currentDateTime = moment();
    // const last_d_time = currentDateTime.format('YYYY-MM-DD HH:mm:ss');
    const currentDateTime = moment();
    const last_d_time = item?.last_d_time ? moment(item.last_d_time).format('YYYY-MM-DD HH:mm:ss') : currentDateTime.format('YYYY-MM-DD HH:mm:ss');
    this.selectedFutureDate = last_d_time;
    this.GetIOData(item.symbol, item.expiry_date);
    this.MasterExpiry = item.expiry_date;
    this.MasterSymbol = item.symbol;
    this.SelectedStockName = item.symbol;
    const formattedExpiry = this.datePipe.transform(
      item.expiry_date,
      'dd-MM-yyyy'
    );
    this.SelectedExpiryDate = formattedExpiry;
    this.apiService
      .getFutureData(item.symbol, formattedExpiry, this.userAction, last_d_time)
      .subscribe((response) => {
        this.ChartRESPONSE = response.response;
        // console.log('Chart Response', this.ChartRESPONSE);
        this.DailyLabel = 'Daily';
        this.SixtyLabel = '60 Minutes';
        this.Seventy_FiveLabel = '75 Minutes';
        this.Fifteen_MinuteLabel = '15 Minutes';
        this.MonthlyLabel = 'Monthly';
        this.WeeklyLabel = 'Weekly';
        if (this.userAction == '1') {
          this.LoadChart(this.ChartRESPONSE.daily, 'daily');
          this.LoadChart(this.ChartRESPONSE.weekly, 'weekly');
          this.LoadChart(this.ChartRESPONSE.monthly, 'monthly');
        }
        if (this.userAction == '2') {
          this.LoadChart(this.ChartRESPONSE.daily, 'daily');
          this.LoadChart(this.ChartRESPONSE.weekly, 'weekly');
          // this.LoadChart(this.ChartRESPONSE.seventy_five, 'seventy_five');
          this.LoadChart(this.ChartRESPONSE.sixty, 'sixty');
        }
        if (this.userAction == '3') {
          this.LoadChart(this.ChartRESPONSE.daily, 'daily');
          this.LoadChart(this.ChartRESPONSE.fifteen, 'fifteen');
          // this.LoadChart(this.ChartRESPONSE.seventy_five, 'seventy_five');
          this.LoadChart(this.ChartRESPONSE.sixty, 'sixty');
        }
        if (this.userAction == '25') {
          this.LoadChart(this.ChartRESPONSE.weekly, 'weekly');
          this.LoadChart(this.ChartRESPONSE.daily, 'daily');
          this.LoadChart(this.ChartRESPONSE.seventy_five, 'seventy_five');
        }

        this.FetchAllZones(item.symbol, formattedExpiry, last_d_time);
      });
  }

  PricePercentageNsefo() {
    let obj = {
      country_name: localStorage.getItem('selectedCountryName'),
      st_sym: this.finData.st_sym,
      time_frame: this.finData.time_frame,
      exp_dt: this.finData.exp_dt,
      last_d_time: this.finData.last_d_time,
      is_future: true
    }
    this.apiService.PricePercentageNsefoService(obj).subscribe(resp => {
      console.log("Price Percentage Future: ", resp);
      this.PricePercentageData = resp.response;
    });
  }

  toggleBar() {
    const leftPanel = document.getElementById('leftPanel');
    if (leftPanel) {
      leftPanel.classList.remove('open');
    }
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

  selectTime(value: string) {
    this.userAction = value;
    this.confirmAction(); // immediately trigger the action
  }

  confirmActionNgINit(): void {
    // this.showPrompt = false;
    const chartIds = [
      'daily',
      'sixty',
      'seventy_five',
      'fifteen',
      'weekly',
      'monthly',
    ];
    chartIds.forEach((id) => {
      const chartElement = document.getElementById(id);
      if (chartElement) {
        chartElement.innerHTML = '';
      }
    });
    // console.log("User selected:", this.userAction);
    this.userAction = '2';
    this.time_frame = this.userAction;
    if (this.SelectedScrips.length > 0) {
      console.log("Selected scrips in confirmAction:", this.SelectedScrips);
      this.SelectedScrips.forEach((item: any, index: any) => {
        this.callApi(item, index);
      });
    } else {
      console.warn('No scrips received');
    }
  }

  confirmAction(): void {
    // this.showPrompt = false;
    const chartIds = [
      'daily',
      'sixty',
      'seventy_five',
      'fifteen',
      'weekly',
      'monthly',
    ];
    chartIds.forEach((id) => {
      const chartElement = document.getElementById(id);
      if (chartElement) {
        chartElement.innerHTML = '';
      }
    });
    // console.log("User selected:", this.userAction);
    // this.userAction = "2";
    this.time_frame = this.userAction;
    if (this.SelectedScrips.length > 0) {
      console.log("Selected scrips in confirmAction:", this.SelectedScrips);
      this.SelectedScrips.forEach((item: any, index: any) => {
        this.callApi(item, index);
      });
    } else {
      console.warn('No scrips received');
    }
  }

  FetchAllZones(symbol: any, expiry_date: any, last_d_time?: any) {
    this.spinner.show();
    this.QualifiedData = null;
    this.PreviousHighData = null;
    this.BuySetupData = null;
    this.SellSetupData = null;
    this.BuyZoneData = null;
    this.OptimizedBuySellZoneData = null;
    this.SellZoneData = null;
    this.BaseCandleData = null;
    this.BadZoneData = null;
    this.AllZonesData = null;
    this.setupData = null;
    this.TrendAnalyzer = '';
    this.showmsg = 'Analyzing Data and Generating Your Graph... Please Wait.';

    this.clearChartDiv();


    // const currentDateTime = moment();
    // const last_d_time_now = currentDateTime.format('YYYY-MM-DD HH:mm:ss');

    this.finData = {
      st_sym: symbol,
      exp_dt: expiry_date,
      last_d_time: last_d_time,
      time_frame: this.userAction,
    };
    console.log('OBJECT DATA', this.finData);
    this.PricePercentageNsefo();
    // Execute all API calls
    Promise.all([
      this.GetBaseCandleData(),
      this.GetBadZoneData(),
      this.GetQualifiedZoneData(),
      this.OptimizedBuySellZoneFunc(),
      this.OverLayFetching(),
      this.SetupDataFunction(),
      this.previousHighServiceForMcxNsefo(),
       this.GetAllZoneCandleDataForFuture()
    ])
      .then(() => {
        console.log('All APIs completed');
      })
      .catch((error) => {
        this.spinner.hide();
        console.error('Error in API calls:', error);
      })
      .finally(() => {
        this.spinner.hide();
      });
  }

  previousHighServiceForMcxNsefo(): Promise<any> {
    return firstValueFrom(
      this.apiService.GetprevioushighDataMcxNsefoService(
        this.finData,
        'futures'
      )
    ).then((resp) => {
      this.PreviousHighData = resp.response;
      // console.log(`RESPONSE 7 (PREVIOUS HIGH) :`, this.PreviousHighData);
    });
  }

  GetBaseCandleData(): Promise<any> {
    return firstValueFrom(
      this.apiService.GetFutureBaseCandleData(this.finData)
    ).then((resp) => {
      this.BaseCandleData = resp.response;
      console.log('RESPONSE 1 (BASE CANDLE)', this.BaseCandleData);
    });
  }

  GetAllZoneCandleDataForFuture(): Promise<any> {
    let obj = {
      tick: this.finData.st_sym,
      time_frame: this.finData.time_frame,
      last_d_time: this.finData.last_d_time,
      exp_dt: this.finData.exp_dt,
      is_future: true
    }
    return firstValueFrom(
      this.apiService.GetAllZonesFutureAndCommodity(obj)
    ).then((resp) => {
      this.AllzoneData = resp.response;
      console.log('NEW RESPONSE 2 (all CANDLE)', this.AllzoneData);
    });
  }

  GetBadZoneData(): Promise<any> {
    return firstValueFrom(
      this.apiService.GetFutureBadZoneCandleData(this.finData)
    ).then((resp) => {
      this.BadZoneData = resp.response;
      // console.log('RESPONSE 2 (BAD ZONE)', this.BadZoneData);
    });
  }

  GetQualifiedZoneData(): Promise<any> {
    this.finData.time_frame = this.time_frame;
    return firstValueFrom(
      this.apiService.GetFutureQualifiedZoneCandleData(this.finData)
    ).then((resp) => {
      this.QualifiedData = resp.response;
      // console.log('RESPONSE 3 (QUALIFIED ZONE)', this.QualifiedData);
    });
  }

  OptimizedBuySellZoneFunc(): Promise<any> {
    this.finData.time_frame = this.time_frame;
    return firstValueFrom(
      this.apiService.GetFutureOptimizedZoneCandleData(this.finData)
    ).then((resp) => {
      this.OptimizedBuySellZoneData = resp.response;
      // console.log('RESPONSE 4 (OPTIMIZED ZONE)', this.OptimizedBuySellZoneData);
    });
  }

  OverLayFetching(): Promise<any> {
    this.finData.time_frame = this.time_frame;
    return firstValueFrom(
      this.apiService.GetOverLayZoneService(this.finData)
    ).then((resp) => {
      this.OverLayCandleData = resp.response;
      const OverlayFetcher = resp.response;
      this.BuyOverlayData = this.OverLayCandleData.Execute.Buy;
      this.SellOverlayData = this.OverLayCandleData.Execute.Sell;
      this.AnalyzeOverlayData = OverlayFetcher.Analyse;
    });
  }

  SetupDataFunction(): Promise<any> {
    this.finData.time_frame = this.time_frame;
    return firstValueFrom(
      this.apiService.GetSetupZoneService(this.finData)
    ).then((resp) => {
      this.setupData = resp.response;
      // console.log('RESPONSE 6 (SETUP DATA):', this.setupData);
    });
  }

  clearChartDiv() {
    const monthlyDiv =
      this.elementRef.nativeElement.querySelector('#FutureChartOne');
    const weeklyDiv =
      this.elementRef.nativeElement.querySelector('#FutureChartTwo');
    const dailyDiv =
      this.elementRef.nativeElement.querySelector('#FutureChartThree');

    if (monthlyDiv) {
      monthlyDiv.innerHTML = '';
    }
    if (weeklyDiv) {
      weeklyDiv.innerHTML = '';
    }
    if (dailyDiv) {
      dailyDiv.innerHTML = '';
    }
  }

  CloseFullModal() {
    this.isDisabled=false;
    this.EntryPrice = null;
    this.TargetPrice = null;
    this.StoplossPrice = null;
    this.fincreateformForMannualSetup.reset();
    this.clearManualZoneDrawings();
    this.clearChartDrawingItems();
    this.fincreateform.reset();
    this.submittedForMannual = false;
    this.submitted = false;
    this.showCreateOrderModal = false;
    this.showCreateOrderModalForMAnnual = false;
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

  alerts() {
    this.router.navigate(['alerts']);
  }

  disconnectWebSocket(): void {
    this.webSocketService.disconnectStock();
  }

  disconnectOIService() {
    this.webSocketService.disconnectOI();
  }

  dashboard() {
    this.router.navigate(['dashboard']);
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['landing']);
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

  available_trades() {
    this.router.navigate(['trades']);
  }

  checkOptions(): boolean {
    for (let key in this.selectedOptions) {
      if (this.selectedOptions[key]) {
        return false;
      }
    }
    return true;
  }

  // checkboxClicked(option: string) {
  //   this.candlestickSeries.setMarkers([]);
  //   this.selectedOptions[option] = !this.selectedOptions[option];
  //   let result = this.checkOptions();
  //   if (result == false) {
  //     if (this.rectangleTool) {
  //       this.rectangleTool.removeAllRectangles();
  //     }

  //     if (this.selectedOptions['qualified_zones']) {
  //       let buy_array = this.QualifiedData['Buy'];
  //       let sell_array = this.QualifiedData['Sell'];
  //       const fillColorBuy = 'rgba(0,255,0,0.2)';
  //       if (buy_array.length > 0) {
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //       }
  //       const fillColorSell = 'rgba(255,51,51,0.2)';
  //       if (sell_array.length > 0) {
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }
  //     }
  //     // if (this.selectedOptions['all_zones']) {
  //     //   const array = this.AllZonesData[this.FullScreenModeValue];

  //     //   const fillColorBuy = 'rgba(50,50,50,0.5)';
  //     //   const fillColorSell = 'rgba(50,50,50,0.5)';

  //     //   const buy_array = array['Buy'];
  //     //   const sell_array = array['Sell'];

  //     //   const zoneMarkers: any[] = [];

  //     //   for (let item of Object.values(buy_array)) {
  //     //     const rect = item as { time: number; price: number }[];
  //     //     this.rectangleTool.addRectanglesFromData(rect, fillColorBuy);

  //     //     const midTime = Math.floor((rect[0].time + rect[rect.length - 1].time) / 2);

  //     //     zoneMarkers.push({
  //     //       time: midTime,
  //     //       position: 'belowBar',
  //     //       color: 'green',
  //     //       shape: 'arrowUp',
  //     //       text: 'Buy',
  //     //     });
  //     //   }

  //     //   for (let item of Object.values(sell_array)) {
  //     //     const rect = item as { time: number; price: number }[];
  //     //     this.rectangleTool.addRectanglesFromData(rect, fillColorSell);

  //     //     const midTime = Math.floor((rect[0].time + rect[rect.length - 1].time) / 2);

  //     //     zoneMarkers.push({
  //     //       time: midTime,
  //     //       position: 'aboveBar',
  //     //       color: 'red',
  //     //       shape: 'arrowDown',
  //     //       text: 'Sell',
  //     //     });
  //     //   }

  //     //   zoneMarkers.sort((a, b) => a.time - b.time);
  //     //   this.candlestickSeries.setMarkers(zoneMarkers);
  //     // }
  //     if (this.selectedOptions['base_candle']) {
  //       this.showmsg = 'Fetching Base Candle Data !';
  //       this.buyZoneMarkers = [];
  //       const fillColor = 'rgba(51,153,255,0.3)';
  //       const array = this.BaseCandleData[this.FullScreenModeValue];
  //       for (let item of array) {
  //         this.buyZoneMarkers.push({
  //           time: item,
  //           position: 'aboveBar',
  //           color: 'blue',
  //           shape: 'arrowDown',
  //           text: 'B',
  //         });
  //       }
  //       this.candlestickSeries.setMarkers(this.buyZoneMarkers);
  //     }
  //     if (this.selectedOptions['buy_sell_zone']) {
  //       const fillColorBuy = 'rgba(0,255,0,0.2)';
  //       var buy_array = this.BuyZoneData[this.FullScreenModeValue];
  //       console.log(buy_array);
  //       for (let item of Object.values(buy_array)) {
  //         this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //       }
  //       const fillColorSell = 'rgba(255,51,51,0.2)';
  //       var sell_array = this.SellZoneData[this.FullScreenModeValue];
  //       console.log(sell_array);
  //       for (let item of Object.values(sell_array)) {
  //         this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //       }
  //     }
  //     if (this.selectedOptions['bad_zone']) {
  //       let array = this.BadZoneData[this.FullScreenModeValue];
  //       const fillColor = 'rgba(41, 3, 3, 0.21)';
  //       for (let item of Object.values(array)) {
  //         this.rectangleTool.addRectanglesFromData(item, fillColor);
  //       }
  //     }
  //     if (this.selectedOptions['overlap_evaluate']) {
  //       if (this.time_frame == 25) {
  //         const fillColorBuy = 'rgba(0,59,0,0.2)';
  //         var buy_array = this.BuyOverlayData['weekly'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         var sell_array = this.SellOverlayData['weekly'];
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }

  //       if (this.time_frame == 2) {
  //         const fillColorBuy = 'rgba(0,59,0,0.2)';
  //         let buy_array = null;
  //         let sell_array = null;
  //         buy_array = this.BuyOverlayData['weekly'];
  //         sell_array = this.SellOverlayData['weekly'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }

  //       if (this.time_frame == 3) {
  //         const fillColorBuy = 'rgba(0,59,0,0.2)';
  //         var buy_array = this.BuyOverlayData['daily'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         var sell_array = this.SellOverlayData['daily'];
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }

  //       if (this.time_frame == 1) {
  //         const fillColorBuy = 'rgba(0,59,0,0.2)';
  //         var buy_array = this.BuyOverlayData['monthly'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         var sell_array = this.SellOverlayData['monthly'];
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }
  //     }
  //     if (this.selectedOptions['overlap_analyze']) {
  //       if (this.time_frame == 25) {
  //         const fillColorBuy = 'rgba(0,255,0,0.2)';
  //         var buy_array = this.BuyOverlayData['daily'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         var sell_array = this.SellOverlayData['daily'];
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }

  //       if (this.time_frame == 2) {
  //         const fillColorBuy = 'rgba(0,255,0,0.2)';
  //         var buy_array = this.BuyOverlayData['daily'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         var sell_array = this.SellOverlayData['daily'];
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }

  //       if (this.time_frame == 3) {
  //         const fillColorBuy = 'rgba(0,255,0,0.2)';
  //         var buy_array = this.BuyOverlayData['seventy_five'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         var sell_array = this.SellOverlayData['seventy_five'];
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }
  //       if (this.time_frame == 1) {
  //         const fillColorBuy = 'rgba(0,59,0,0.2)';
  //         var buy_array = this.BuyOverlayData['weekly'];
  //         for (let item of Object.values(buy_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //         }
  //         const fillColorSell = 'rgba(255,51,51,0.2)';
  //         var sell_array = this.SellOverlayData['weekly'];
  //         for (let item of Object.values(sell_array)) {
  //           this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //         }
  //       }
  //     }
  //     if (this.selectedOptions['optimized_buy_sell_zone']) {
  //       const fillColorBuy = 'rgba(0,255,0,0.2)';
  //       console.log(this.FullScreenModeValue);
  //       var buy_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
  //       console.log('BUY', buy_array.BUY);
  //       for (let item of Object.values(buy_array.BUY)) {
  //         this.rectangleTool.addRectanglesFromData(item, fillColorBuy);
  //       }
  //       const fillColorSell = 'rgba(255,51,51,0.2)';
  //       var sell_array =
  //         this.OptimizedBuySellZoneData[this.FullScreenModeValue];
  //       console.log('SELL', sell_array);
  //       for (let item of Object.values(sell_array.SELL)) {
  //         this.rectangleTool.addRectanglesFromData(item, fillColorSell);
  //       }
  //     }
  //     // if (this.selectedOptions['gap_up_down']) {
  //     //   const fillColor = 'rgba(183,199,21, 1)'; // Green for Gap Up
  //     //   const fillColor2 = 'rgba(189, 70, 25, 1)'; // Red for Gap Down

  //     //   const gapData = this.GapUpDownData[this.FullScreenModeValue];

  //     //   // Initialize marker arrays if needed
  //     //   const gapMarkers: any[] = [];

  //     //   // Gap Up
  //     //   for (let item of Object.values(gapData.gap_ups)) {
  //     //     const rect = item as { time: number; price: number }[];
  //     //     this.rectangleTool.addRectanglesFromData(item, fillColor);

  //     //     // Add Up Arrow Marker
  //     //     gapMarkers.push({
  //     //       time: rect[0].time,          // assuming 'time' exists in item
  //     //       position: 'belowBar',
  //     //       color: 'green',
  //     //       shape: 'arrowUp',
  //     //       text: 'Gap Up',
  //     //     });
  //     //   }

  //     //   // Gap Down
  //     //   for (let item of Object.values(gapData.gap_downs)) {
  //     //     const rect = item as { time: number; price: number }[];
  //     //     this.rectangleTool.addRectanglesFromData(item, fillColor2);

  //     //     // Add Down Arrow Marker
  //     //     gapMarkers.push({
  //     //       time: rect[0].time,
  //     //       position: 'aboveBar',
  //     //       color: 'red',
  //     //       shape: 'arrowDown',
  //     //       text: 'Gap Down',
  //     //     });
  //     //   }
  //     //   gapMarkers.sort((a, b) => a.time - b.time);
  //     //   // Finally, set the markers on your series
  //     //   const allMarkers = [...gapMarkers, ...this.buyZoneMarkers];
  //     //   allMarkers.sort((a, b) => a.time - b.time);
  //     //   this.candlestickSeries.setMarkers(allMarkers);
  //     // }

  //     if (this.selectedOptions['setup']) {
  //       this.dropdownShow = true;
  //     } else {
  //       this.dropdownShow = false;
  //       if (this.buylineSeries) {
  //         this.buylineSeries.setMarkers([]);
  //         this.buylineSeries.setData([]);
  //       }
  //       if (this.targetlineSeries) {
  //         this.targetlineSeries.setMarkers([]);
  //         this.targetlineSeries.setData([]);
  //       }
  //       if (this.stoplosslineSeries) {
  //         this.stoplosslineSeries.setMarkers([]);
  //         this.stoplosslineSeries.setData([]);
  //       }
  //     }
  //   } else {
  //     this.dropdownShow = false;
  //     this.candlestickSeries.setMarkers([]);
  //     this.rectangleTool.removeAllRectangles();
  //     if (this.buylineSeries) {
  //       this.buylineSeries.setMarkers([]);
  //       this.buylineSeries.setData([]);
  //     }
  //     if (this.targetlineSeries) {
  //       this.targetlineSeries.setMarkers([]);
  //       this.targetlineSeries.setData([]);
  //     }
  //     if (this.stoplosslineSeries) {
  //       this.stoplosslineSeries.setMarkers([]);
  //       this.stoplosslineSeries.setData([]);
  //     }
  //   }
  // }

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

          console.log('Overlap found:', i, j);
          console.log('Zone 1:', this.getZoneBounds(zones[i]));
          console.log('Zone 2:', this.getZoneBounds(zones[j]));
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
    const outlineWidth = 0.5;

    this.candlestickSeries?.setMarkers([]);
    this.selectedOptions[option] = !this.selectedOptions[option];

    const result = this.checkOptions();

    if (result === false) {

      this.rectangleTool?.removeAllRectangles();

      if (this.selectedOptions['qualified_zones']) {
        const buyData = this.QualifiedData?.Buy || {};
        const sellData = this.QualifiedData?.Sell || {};

        const buyItems = Object.values(buyData);
        const sellItems = Object.values(sellData);

        const buyOverlap = this.markOverlappingZones(buyItems);
        const sellOverlap = this.markOverlappingZones(sellItems);

        buyItems.forEach((item: any, index: number) => {
          const isOverlap = buyOverlap.has(index);

          this.drawHigherTFZones(
            [item],
            isOverlap ? 'rgba(46, 204, 113, 0.38)' : 'rgba(0,255,0,0.2)',
            isOverlap ? 'rgba(22, 160, 133, 1)' : 'rgba(0, 255, 0, 0.4)',
            isOverlap ? 1 : 0,
            '',
            ''
          );
        });

        sellItems.forEach((item: any, index: number) => {
          const isOverlap = sellOverlap.has(index);

          this.drawHigherTFZones(
            [item],
            isOverlap ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255,51,51,0.2)',
            isOverlap ? 'rgba(185, 28, 28, 1)' : 'rgba(255, 51, 51, 0.45)',
            isOverlap ? 1 : 0,
            '',
            ''
          );
        });
      }

      /* ================= Base Candle ================= */
      if (this.selectedOptions['base_candle']) {
        this.showmsg = 'Fetching Base Candle Data !';
        this.buyZoneMarkers = [];

        const array = this.BaseCandleData?.[this.FullScreenModeValue];
        if (Array.isArray(array)) {
          this.buyZoneMarkers = array.map(item => ({
            time: item,
            position: 'aboveBar',
            color: 'blue',
            shape: 'arrowDown',
            text: 'B'
          }));
          this.candlestickSeries?.setMarkers(this.buyZoneMarkers);
        }
      }

      /* ================= Buy Sell Zone ================= */
      if (this.selectedOptions['buy_sell_zone']) {
        this.drawRectanglesSafe(
          this.BuyZoneData?.[this.FullScreenModeValue],
          'rgba(0,255,0,0.2)'
        );
        this.drawRectanglesSafe(
          this.SellZoneData?.[this.FullScreenModeValue],
          'rgba(255,51,51,0.2)'
        );
      }

      /* ================= All Zone ================= */
      if (this.selectedOptions['all_zones']) {
          const buyZone =this.AllzoneData?.[this.FullScreenModeValue]?.Buy || [];
          const sellZone = this.AllzoneData?.[this.FullScreenModeValue]?.Sell || [];
        this.drawRectanglesSafe(
         buyZone,
          'rgba(0,255,0,0.2)'
        );
        this.drawRectanglesSafe(
          sellZone,
          'rgba(255,51,51,0.2)'
        );
      }

      /* ================= Bad Zone ================= */
      if (this.selectedOptions['bad_zone']) {
        this.drawRectanglesSafe(
          this.BadZoneData?.[this.FullScreenModeValue],
          'rgba(41,3,3,0.21)'
        );
      }

      if (this.selectedOptions['htf_zone']) {
        this.drawHtfZones(
          buyfillColor,
          buyoutlineColor,
          buytextColor,
          sellfillColor,
          selloutlineColor,
          selltextColor,
          outlineWidth
        );
      }

      /* ================= Optimized Buy Sell Zone ================= */
      if (this.selectedOptions['optimized_buy_sell_zone']) {
        const zone =
          this.OptimizedBuySellZoneData?.[this.FullScreenModeValue];

        this.drawRectanglesSafe(
          zone?.Buy,
          'rgba(0,255,0,0.2)'
        );
        this.drawRectanglesSafe(
          zone?.Sell,
          'rgba(255,51,51,0.2)'
        );

        this.drawParentAnalyzeZoneOnChildChartSecond(
          buyfillColor,
          buyoutlineColor,
          buytextColor,
          sellfillColor,
          selloutlineColor,
          selltextColor
        );
      }

      /* ================= Setup ================= */
      if (this.selectedOptions['setup']) {
        this.dropdownShow = true;
      } else {
        this.dropdownShow = false;
        this.buylineSeries?.setMarkers([]);
        this.buylineSeries?.setData([]);
        this.targetlineSeries?.setMarkers([]);
        this.targetlineSeries?.setData([]);
        this.stoplosslineSeries?.setMarkers([]);
        this.stoplosslineSeries?.setData([]);
      }

    } else {

      /* ================= Reset All ================= */
      this.dropdownShow = false;
      this.candlestickSeries?.setMarkers([]);
      this.rectangleTool?.removeAllRectangles();

      this.buylineSeries?.setMarkers([]);
      this.buylineSeries?.setData([]);
      this.targetlineSeries?.setMarkers([]);
      this.targetlineSeries?.setData([]);
      this.stoplosslineSeries?.setMarkers([]);
      this.stoplosslineSeries?.setData([]);
    }
  }

  private getHtfZoneKeysByExecutionTimeframe(): string[] {
    const tf = Number(this.time_frame || this.finData?.time_frame);

    const map: Record<number, string[]> = {
      1: ["monthly", "weekly"],          // Daily -> Monthly + Weekly
      2: ["weekly", "daily"],            // 60 Min -> Weekly + Daily
      3: ["daily", "seventy_five"],      // 15 Min -> Daily + 75 Min
      25: ["weekly", "daily"],           // 75 Min -> Weekly + Daily
    };

    return map[tf] || [];
  }

  private getHtfLabel(tfKey: string): string {
    const labelMap: Record<string, string> = {
      monthly: "Monthly",
      weekly: "Weekly",
      daily: "Daily",
      sixty: "60 Min",
      fifteen: "15 Min",
      seventy_five: "75 Min",
    };

    return labelMap[tfKey] || tfKey;
  }

  private drawHtfZones(
    buyfillColor: string,
    buyoutlineColor: string,
    buytextColor: string,
    sellfillColor: string,
    selloutlineColor: string,
    selltextColor: string,
    outlineWidth: number
  ): void {
    const htfKeys = this.getHtfZoneKeysByExecutionTimeframe();

    for (const tfKey of htfKeys) {
      const label = this.getHtfLabel(tfKey);

      this.drawHigherTFZones(
        this.BuyOverlayData?.[tfKey],
        buyfillColor,
        buyoutlineColor,
        outlineWidth,
        label,
        buytextColor
      );

      this.drawHigherTFZones(
        this.SellOverlayData?.[tfKey],
        sellfillColor,
        selloutlineColor,
        outlineWidth,
        label,
        selltextColor
      );
    }
  }

  drawHigherTFZones(data: any, fillColor: any, outlineColor: any, outlineWidth: any, text: any, textColor: any) {
    if (!this.rectangleTool || !data || typeof data !== 'object') return;

    try {
      for (const item of Object.values(data)) {
        if (!item) continue;
        this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColor, outlineColor: outlineColor, outlineWidth: outlineWidth, text: text, textColor: textColor });
      }
    } catch (err) {
      console.warn('Rectangle skipped:', err);
    }
  }



  private drawRectanglesSafe(data: any, fillColor: string): void {
    if (!this.rectangleTool || !data || typeof data !== 'object') return;

    try {
      for (const item of Object.values(data)) {
        if (!item) continue;
        this.rectangleTool.addRectanglesFromData(item, { fillColor: fillColor });
      }
    } catch (err) {
      console.warn('Rectangle skipped:', err);
    }
  }



  showMarketAlert(TrandeMessage: any) {
    this.isNotificationVisible = true;
  }

  stopTimer() {
    clearInterval(this.timer);
  }

  private getNumberValue(value: any): number {
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  }

  private calculateSetupRR(type: "BUY" | "SELL", setupData: any): number {
    const entry = this.getNumberValue(setupData?.entry_price);
    const target = this.getNumberValue(setupData?.target_price);
    const stopLoss = this.getNumberValue(setupData?.stop_loss);

    if (!entry || !target || !stopLoss) {
      return 0;
    }

    let risk = 0;
    let reward = 0;

    if (type === "BUY") {
      // BUY: SL should be below entry, target should be above entry
      if (stopLoss >= entry || target <= entry) {
        return 0;
      }

      risk = entry - stopLoss;
      reward = target - entry;
    }

    if (type === "SELL") {
      // SELL: SL should be above entry, target should be below entry
      if (stopLoss <= entry || target >= entry) {
        return 0;
      }

      risk = stopLoss - entry;
      reward = entry - target;
    }

    if (risk <= 0) {
      return 0;
    }

    return Number((reward / risk).toFixed(4));
  }

  setupType(setupType: any) {
    this.TradeSetupReason = "";
    this.ModelPrediction = "";
    this.isDisabled=false;
    this.CreateButtonFlag = true;
    this.createBtnFlgForMannualSetup = false;

    this.entryEnabled = true;
    this.targetEnabled = true;
    this.stoplossEnabled = true;

    this.ViewSetUpAnywayFlag = false;
    this.ModelPrediction = '';

    let RRR: any = null;

    const BUY_MIN_RRR = 2.1;
    const SELL_MIN_RRR = 2.1;

    this.removeAllEntry();
    this.clearTradeTigerSetupLines();
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
        this.CreateButtonFlag = false;
        this.showMarketAlert(this.ModelPrediction);
      } else {
        this.BuySetupData = this.setupData[setupType];

        if (this.BuySetupData == undefined) {
          this.ModelPrediction = 'NOT A GOOD CONDITION TO TRADE !';
          this.CreateButtonFlag = false;
          this.showMarketAlert(this.ModelPrediction);
        } else {
          this.BuyTimestampData = this.setupData['BUY_TIMESTAMPS'];
         const buyRRR = this.calculateSetupRR("BUY", this.BuySetupData);

          if (buyRRR < BUY_MIN_RRR) {
            this.ViewSetUpAnywayFlag = true;

            const Prediction = 'Not a good condition to trade.';
            const Message = 'RISK TO REWARD not satisfied!';

            this.showMarketAlert2(Prediction, Message);
            return;
          }

          this.ViewSetUpAnywayFlag = false;

          if (
            !this.drawBackendSetupUsingTradeTigerTool(
              'BUY',
              this.BuySetupData.entry_price,
              this.BuySetupData.target_price,
              this.BuySetupData.stop_loss,
              this.BuyTimestampData.entry_price_timestamp,
              this.BuyTimestampData.target_price_timestamp,
              this.BuyTimestampData.entry_price_timestamp
            )
          ) {
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
            tick: this.SelectedStockName,
            country_id: localStorage.getItem('selectedCountryId'),
          };

          this.apiService
            .getMCXModelPredictionService(
              data,
              this.SelectedExpiryDate,
              'futures'
            )
            .subscribe((resp) => {
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
        this.CreateButtonFlag = false;
        this.showMarketAlert(this.ModelPrediction);
      } else {
        this.SellSetupData = this.setupData[setupType];

        if (this.SellSetupData == undefined) {
          this.ModelPrediction = 'NOT A GOOD CONDITION TO TRADE !';
          this.CreateButtonFlag = false;
          this.showMarketAlert(this.ModelPrediction);
        } else {
          this.SellTimestampData = this.setupData['SELL_TIMESTAMPS'];
          const sellRRR = this.calculateSetupRR("SELL", this.SellSetupData);

          if (sellRRR < SELL_MIN_RRR) {
            this.ViewSetUpAnywayFlag = true;

            const Prediction = 'Not a good condition to trade.';
            const Message = 'RISK TO REWARD not satisfied!';

            this.showMarketAlert2(Prediction, Message);
            return;
          }

          this.ViewSetUpAnywayFlag = false;

          if (
            !this.drawBackendSetupUsingTradeTigerTool(
              'SELL',
              this.SellSetupData.entry_price,
              this.SellSetupData.target_price,
              this.SellSetupData.stop_loss,
              this.SellTimestampData.entry_price_timestamp,
              this.SellTimestampData.target_price_timestamp,
              this.SellTimestampData.entry_price_timestamp
            )
          ) {
            this.CreateButtonFlag = false;
            return;
          }

          const parsedTimeFrame = parseInt(this.finData.time_frame, 10);

          const data = {
            order_type: 'Sell',
            entry_price: this.SellSetupData.entry_price,
            target_price: this.SellSetupData.target_price,
            stoploss_price: this.SellSetupData.stop_loss,
            last_d_time: this.finData.last_d_time,
            time_frame: parsedTimeFrame,
            tick: this.SelectedStockName,
            country_id: localStorage.getItem('selectedCountryId'),
          };

          this.apiService
            .getMCXModelPredictionService(
              data,
              this.SelectedExpiryDate,
              'futures'
            )
            .subscribe((resp) => {
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

  showMarketAlert2(Prediction: any, TrandeMessage: any) {
    this.TradeSetupReason = TrandeMessage;
    this.ModelPrediction = Prediction;
    this.isNotificationVisible = true;
  }

  ViewSetupAnyway() {
    this.isDisabled = true;

    try {
      this.removeAllEntry();
    } catch { }

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

  UpdatePrediction() {
    this.spinner.show();
    const data = {
      order_type: this.SETUPTYPE,
      entry_price: this.EntryPrice,
      target_price: this.TargetPrice,
      stoploss_price: this.StoplossPrice,
      last_d_time: this.finData.last_d_time,
      time_frame: this.finData.time_frame,
      tick: this.SelectedStockName,
      country_id: localStorage.getItem('selectedCountryId'),
    };
    // console.log('Update Object', data);
    this.apiService
      .getMCXModelPredictionService(data, this.SelectedExpiryDate, 'futures')
      .subscribe((resp) => {
        // console.log('Model Prediction', resp);
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

  closeNotification() {
    this.isNotificationVisible = false;
  }

  addEntryPriceLine(price: number, time: any, extendedtime: any) {
    let RRR = null;
    if (this.SETUPTYPE == 'BUY') {
      RRR = this.setupData['BUY_RRR'];
      this.BuyEntryPrice = price;
    } else {
      RRR = this.setupData['SELL_RRR'];
      this.SellEntryPrice = price;
    }

    this.buylineSeries = this.chart.addLineSeries({
      color: 'blue',
      lineWidth: 2,
      priceLineVisible: false,
      priceLineColor: 'blue',
      priceLineWidth: 5,
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
        text: `R-R: ${RRR}\nEntry: ${price.toFixed(2)}`,
        size: 2,
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
    const pixelThreshold = 6; // Pixel-based tolerance
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
      // console.log('PRICE TO COORDINATE', lineY);

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
    // console.log('DISABLED CALLED');
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

    if (this.SETUPTYPE == 'BUY') {
      this.BuyTargetPrice = price;
    } else {
      this.SellTargetPrice = price;
    }
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
    const pixelThreshold = 6; // Pixel-based threshold
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
    if (this.SETUPTYPE == 'BUY') {
      this.BuystoplossPrice = price;
    } else {
      this.SellStoplossPrice = price;
    }
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
    const pixelThreshold = 6; // pixel-based proximity threshold
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

  onSubmitSetAlert() {
    this.submitStock = true;
    this.alertForm.markAllAsTouched();
    if (this.alertForm.invalid) {
      this.toastr.error('This fields are required !');
      return;
    } else {
      this.spinner.show();
      const setAlertData = this.alertForm.value;
      // console.log('setAlertData', setAlertData);
      this.apiService
        .onSubmitSetAlertService(setAlertData)
        .subscribe((resp) => {
          if (resp.msg == 'success') {
            this.spinner.hide();
            this.toastr.success(resp.response.message);
            this.submitStock = false;
            // console.log('onSubmitSetAlert', resp);
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
            // console.log(resp);
            return;
          }
        });
    }
  }

  getAllSetAlerts() {
    this.apiService.getAllSetAlertsService(this.userId).subscribe((resp) => {
      if ((resp.msg = 'success')) {
        this.allSetAlerts = resp.response;
        // console.log('getAllSetAlerts', this.allSetAlerts);
      } else {
        // console.log(resp);
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

  openOrderPanel() {
    this.isOrderPanelOpen = true;
  }

  closeOrderPanel() {
    this.isOrderPanelOpen = false;
    this.resetOrderForm(); // Optional: reset form when closing
  }

  resetOrderForm() {
    this.fincreateform.reset();
  }

  // onOrderTypeChange() {
  //   const order_type = this.fincreateform.get('order_type')?.value;
  //   if (order_type) {
  //     const setup = this.setupData[order_type.toUpperCase()];
  //     if (setup) {
  //       if ((order_type.toUpperCase() === 'BUY' && setup.entry_price)) {
  //         this.fincreateform.patchValue({
  //           entry_price: this.BuyEntryPrice.toFixed(2),
  //           stoploss_price: this.BuystoplossPrice.toFixed(2),
  //           target_price: this.BuyTargetPrice.toFixed(2),
  //         });

  //       }
  //       else if ((order_type.toUpperCase() === 'SELL' && setup.entry_price)) {
  //         this.fincreateform.patchValue({
  //           entry_price: this.SellEntryPrice.toFixed(2),
  //           stoploss_price: this.SellStoplossPrice.toFixed(2),
  //           target_price: this.SellTargetPrice.toFixed(2),
  //         });
  //       }
  //     } else {
  //       alert('No valid data for selected order type');
  //       this.fincreateform.patchValue({
  //         entry_price: '',
  //         stoploss_price: '',
  //         target_price: ''
  //       });
  //     }
  //   }
  // }

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

  openCreateOrderPanel() {
    this.showCreateOrderModal = true;
    if (this.SelectedStockName) {
      this.fincreateform.patchValue({
        stock_tick: this.SelectedStockName,
        stock_id: this.SelectedScrips[0].id.toString(),
      });
      // console.log('Patched stock_tick:', this.SelectedStockName);
      // console.log('patched stock id', this.SelectedScrips.id);
    } else {
      console.warn('SelectedStockName is undefined');
    }
    this.onOrderTypeChange();
  }

  closeCreateOrderPanel() {
    this.showCreateOrderModal = false;
    this.fincreateform.reset();
    this.submitted = false;
  }

  // onCountryChange(countryName: any) {
  //   this.apiService.getStockDataByCountry(countryName).subscribe(resp => {
  //     if (resp.response && Array.isArray(resp.response)) {
  //       this.stockData = resp.response.sort((a: { stock_tick: string; }, b: { stock_tick: any; }) =>
  //         a.stock_tick.localeCompare(b.stock_tick)
  //       );
  //     } else {
  //       this.stockData = [];
  //     }
  //     console.log("this.stockData",this.stockData);
  //   });
  // }

  create() {
    this.showmsg = 'Please Wait !!';
    this.submitted = true;
    this.fincreateform.markAllAsTouched();

    if (this.fincreateform.invalid) {
      return;
    }

    this.spinner.show();

    // Only patch additional computed fields
    this.fincreateform.patchValue({
      prediction: this.SelectedPrediction,
      probability: this.SelectedProbability / 100,
      exp_date: this.SelectedExpiryDate,
      country_id: this.countryId,
      purchased_cmp_date: this.getCurrentDateTime(),
      time_frame: this.finData.time_frame,
    });

    const fincreateorderData = this.fincreateform.value;
    // console.log('form data', fincreateorderData);

    this.apiService
      .createorderforNSEFO(fincreateorderData)
      .subscribe((resp) => {
        this.createorderResp = resp;
        // console.log('Create order response', resp);
        this.resetOrderForm();

        if (resp.msg === 'success') {
          this.spinner.hide();
          this.toastr.success('Order Create Success', 'ALERT!');
          this.showCreateOrderModal = false;
          this.submitted = false;
        } else {
          this.spinner.hide();
          this.toastr.error(resp.msg, 'ALERT!');
        }
      });
  }

  openCreateOrderPanelforMannual() {
    this.showCreateOrderModalForMAnnual = true;
    if (this.SelectedStockName) {
      this.fincreateformForMannualSetup.patchValue({
        stock_tick: this.SelectedStockName,
        stock_id: this.SelectedScrips[0].id.toString(),
        exp_date: this.SelectedScrips[0].expiry_date,
      });
      // console.log('Patched stock_tick: mannual', this.SelectedStockName);
      // console.log('patched stock id for mannual', this.SelectedScrips[0].id);
    } else {
      console.warn('SelectedStockName is undefined');
    }
    this.onOrderTypeChange();
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

      // Safely patch additional values
      const timeFrameValue = Number(this.finData?.time_frame) || 0; // ✅ default to 0 if missing

      const finDataStock = this.fincreateformForMannualSetup.value;
      // console.log('FINDATASTOCK createForMannualSetup', finDataStock);
      this.fincreateformForMannualSetup.patchValue({
        prediction: this.SelectedPrediction,
        probability: this.SelectedProbability / 100,
        country_id: this.countryId,
        // stock_tick: this.selectedStockId,
        purchased_cmp_date: this.getCurrentDateTime(),
        time_frame: timeFrameValue,
        // time_frame: finDataStock.time_frame,
        // stock_id: String(this.UpdateCnadleStockId),
      });
      const fincreateorderData = this.fincreateformForMannualSetup.value;
      // console.log('Homecandle formss', fincreateorderData);
      this.apiService.createorderforNSEFO(fincreateorderData).subscribe((resp) => {
        // console.log('create response', resp);
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

  closeCreateOrderPanelforMannual() {
    this.showCreateOrderModalForMAnnual = false;
    this.fincreateformForMannualSetup.reset();
    this.submittedForMannual = false;
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
      tick: this.SelectedStockName,
      country_id: localStorage.getItem('selectedCountryId'),
    };

    // console.log('getCustomMOdelPrediction DATA', data);
    this.apiService
      .getMCXModelPredictionService(data, this.SelectedExpiryDate, 'futures')
      .subscribe({
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
  private validatePlacement(
    mode: 'entry' | 'target' | 'stoploss',
    price: number
  ): { ok: boolean; msg?: string } {
    // Rule #0: Prevent duplicate line of same type
    // if (mode === 'entry' && this.entryLine) {
    //   return { ok: false, msg: 'Entry already exists' };
    // }
    // if (mode === 'target' && this.targetLine) {
    //   return { ok: false, msg: 'Target already exists' };
    // }
    // if (mode === 'stoploss' && this.stoplossLine) {
    //   return { ok: false, msg: 'Stoploss already exists' };
    // }

    // Rule #1: Target/SL cannot be placed before Entry exists
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

    // From here: mode is 'target' or 'stoploss'
    const entryPrice = this.entryLine?.price ?? 0;
    const isAbove = price > entryPrice;
    const isBelow = price < entryPrice;

    // Disallow exactly equal (ambiguous)
    if (price === entryPrice) {
      return { ok: false, msg: 'Move off the Entry price' };
    }

    // Rule #2 + #3: enforce opposite sides once the other line exists
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

    // (Optional safety) If after this placement both SL & Target would exist,
    // ensure Entry is strictly between them (guards against any edge case).
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

  capitalize(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1);
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

    // ✅ Keep only lines that are not entry/stoploss/target
    this.horizontalLines = this.horizontalLines.filter(
      (l) => !['entry', 'stoploss', 'target'].includes(l.type)
    );

    // ✅ Clear selection
    this.selectedLine = null;
  }

  GetIOData(symbol: any, expiry_date: any) {
    this.OIData = [];
    this.OIDetailsData = [];
    this.webSocketService.connectOI(symbol, expiry_date);
    this.webSocketService.getOIMessage().subscribe((resp) => {
      const parsedResp = typeof resp === 'string' ? JSON.parse(resp) : resp;
      // console.log('RESP OI', parsedResp);
      this.OIData = parsedResp.optionsChain;
      this.OIDetailsData = parsedResp;
      // this.CallingOIChart();
    });
  }

  // CallingOIChart() {
  //   const strikeMap: any = {};
  //   this.OIData.forEach((opt: any) => {
  //     if (!strikeMap[opt.strike_price]) {
  //       strikeMap[opt.strike_price] = {
  //         strike: opt.strike_price,
  //         call: 0,
  //         put: 0,
  //       };
  //     }
  //     if (opt.option_type === 'CE') {
  //       strikeMap[opt.strike_price].call = opt.oich;
  //     } else {
  //       strikeMap[opt.strike_price].put = opt.oich;
  //     }
  //   });

  //   const finalData = Object.values(strikeMap);

  //   const strikes = finalData.map((d: any) => d.strike.toString());
  //   const callOI = finalData.map((d: any) => d.call);
  //   const putOI = finalData.map((d: any) => d.put);

  //   this.chartData = {
  //     labels: strikes,
  //     datasets: [
  //       {
  //         label: 'Put OI Chg',
  //         data: putOI,
  //         backgroundColor: '#00C853',
  //         barPercentage: 1, 
  //         categoryPercentage: 0.6, // space between groups
  //       },
  //       {
  //         label: 'Call OI Chg',
  //         data: callOI,
  //         backgroundColor: '#D50000', // red
  //         barPercentage: 1,
  //         categoryPercentage: 0.6,
  //       },
  //     ],
  //   };

  //   this.chartOptions = {
  //     responsive: true,
  //     plugins: {
  //       legend: { position: 'bottom' },
  //       title: {
  //         display: true,
  //         text: this.OIDetailsData.stock + ':' + 'OI Change (Call vs Put)',
  //       },
  //       tooltip: {
  //         mode: 'index',
  //         intersect: false,
  //         callbacks: {
  //           title: function (context: any) {
  //             // context[0].label is the x-axis value (strike)
  //             return 'Strike : ' + context[0].label;
  //           },
  //           label: function (context: any) {
  //             let label = context.dataset.label || '';
  //             if (label) {
  //               label += ': ';
  //             }
  //             return label + context.parsed.y.toLocaleString();
  //           },
  //         },
  //       },
  //       annotation: {
  //         annotations: {
  //           underlyingLine: {
  //             type: 'line',
  //             xMin: strikes.indexOf(
  //               this.findNearestStrike(strikes, this.underlyingPrice).toString()
  //             ),
  //             xMax: strikes.indexOf(
  //               this.findNearestStrike(strikes, this.underlyingPrice).toString()
  //             ),
  //             borderColor: 'blue',
  //             borderWidth: 2,
  //             borderDash: [6, 6],
  //             label: {
  //               display: true,
  //               // content: `Underlying: ${this.underlyingPrice}`,
  //               position: 'start',
  //             },
  //           },
  //         },
  //       },
  //     },
  //     scales: {
  //       x: {
  //         stacked: false,
  //         grid: { display: false },
  //       },
  //       y: {
  //         beginAtZero: true,
  //       },
  //     },
  //   };
  // }

  private findNearestStrike(strikes: string[], price: number): number {
    const nums = strikes.map((s) => Number(s));
    return nums.reduce((prev, curr) =>
      Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
    );
  }

  openPopup() {
    this.showPopup = true;
  }

  closePopup() {
    if (this.scripSelect) {
      this.scripSelect.clearModel();
      this.scripSelect.close();
    }
    this.selectedScrip = null;
    this.FutureListOption = [];
    this.selectedExpiry = null;
    this.disconnectOIService();
    this.GetIOData(this.MasterSymbol, this.MasterExpiry);
    this.showPopup = false;
  }


  // ShowFuturesData() {
  //   if (this.isScripInvalid()) {
  //     this.isScripInvalidFlag = true;
  //     return;
  //   }

  //   this.isScripInvalidFlag = false;

  //   this.apiService.getFuturesListService(this.selectedScrip).subscribe({
  //     next: (res: any) => {
  //       if (res.msg === 'success') {
  //         this.selectedScrips = [];
  //         this.FutureListOption = res.response;

  //         // Extract expiry dates list from API response
  //     this.expiryDates = Array.from(
  //   new Set(res.response.map((item: any) => String(item.expiry_date)))
  // );

  //         // Show popup
  //         this.showFuturesPopup = true;
  //       } else {
  //         this.toastr.error('Failed to fetch data');
  //       }
  //     },
  //     error: () => {
  //       this.toastr.error('Error fetching Futures data');
  //     }
  //   });
  // }

  // // When user selects an expiry date
  // selectExpiryDate(date: string) {
  //   this.SelectedExpiryDate = date;
  //   this.showFuturesPopup = false;
  // }


  // ShowFuturesData() {
  //   if (this.isScripInvalid()) {
  //     this.isScripInvalidFlag = true;
  //     return;
  //   }

  //   this.isScripInvalidFlag = false;

  //   this.apiService.getFuturesListService(this.selectedScrip).subscribe({
  //     next: (res: any) => {
  //       if (res.msg === 'success') {
  //         this.selectedScrips = [];
  //         this.FutureListOption = res.response;

  //         // Extract expiry dates list from API response
  //         this.expiryDates = Array.from(
  //           new Set(res.response.map((item: any) => String(item.expiry_date)))
  //         );

  //         // ✅ Only show popup if expiry dates exist
  //         if (this.expiryDates.length > 0) {
  //           this.showFuturesPopup = true;
  //         } else {
  //           this.toastr.warning('No expiry dates found for this scrip');
  //         }
  //       } else {
  //         this.toastr.error('Failed to fetch data');
  //       }
  //     },
  //     error: () => {
  //       this.toastr.error('Error fetching Futures data');
  //     }
  //   });
  // }

  // toggleFuturesPopup(event: MouseEvent) {
  //   event.stopPropagation(); // prevents click bubbling
  //   this.showFuturesPopup = !this.showFuturesPopup;
  // }

  // // When user selects an expiry date
  // selectExpiryDate(date: string) {
  //   alert("")
  //   this.SelectedExpiryDate = date;
  //   this.showFuturesPopup = false;
  // }

  // // ✅ Optional: close popup when clicked outside
  // @HostListener('document:click', ['$event'])
  // onClickOutside(event: MouseEvent) {
  //   const target = event.target as HTMLElement;
  //   if (!target.closest('.subdata-popup') && !target.closest('.fa-calendar')) {
  //     this.showFuturesPopup = false;
  //   }
  // }
  toggleSubdataPopup(event: MouseEvent) {
    event.stopPropagation(); // prevent closing when button clicked
    this.showSubdataPopup = !this.showSubdataPopup;

    if (this.showSubdataPopup) {
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      this.popupPosition = {
        top: rect.bottom + window.scrollY + 8 + 'px',
        left: rect.left + window.scrollX + 'px'
      };
      this.ShowFuturesDatas();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const popupElement = document.querySelector('.subdata-popup');
    const buttonElement = document.querySelector('.change-btn');
    const target = event.target as HTMLElement;

    // If the click is outside the popup and button, close it
    if (
      this.showSubdataPopup &&
      popupElement &&
      !popupElement.contains(target) &&
      buttonElement &&
      !buttonElement.contains(target)
    ) {
      this.showSubdataPopup = false;
    }
  }

  ShowFuturesDatas() {
    this.apiService.getFuturesListService(this.MasterSymbol).subscribe({
      next: (res: any) => {
        if (res.msg === 'success') {
          this.FutureListOption_date = res.response ?? [];
          this.assignExpiryTiersForDateList(); // ⬅️ add this
          // console.log("API Response******:", this.FutureListOption_date);
        } else {
          this.toastr.error('Failed to fetch data');
        }
      },
      error: (err) => {
        console.error("Error fetching futures data:", err);
        this.toastr.error('Something went wrong while fetching data');
      }
    });
  }

  /** Tags items as NEAR, NEXT, FAR based on earliest expiries. */
  private assignExpiryTiersForDateList(): void {
    if (!Array.isArray(this.FutureListOption_date)) return;

    // Sort a copy by expiry to avoid reordering your original array
    const sorted = [...this.FutureListOption_date].sort(
      (a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
    );

    // Assign tiers by index in the sorted order
    sorted.forEach((item, idx) => {
      item.expiryTier = idx === 0 ? 'NEAR' : idx === 1 ? 'NEXT' : 'FAR';
    });
  }


  selectFuture(list: any) {
    this.selectedFutureOption = list;
    this.scripDataService.setScrips([this.selectedFutureOption]);
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/futures']);
    });
    // console.log('Selected Future Option:', this.selectedFutureOption);
  }

  private applyViewGraphOverlapLogic(prevFullScreen: string) {
    const tf = Number(this.finData.time_frame);

    const timeFrameMap: Record<number, string> = {
      1: "daily",
      2: "sixty",
      3: "fifteen",
      25: "seventy_five",
    };

    const activeMenu = timeFrameMap[tf];
    if (!activeMenu) return;

    let rule: MenuRule | undefined = STANDARD_HTF_ZONE_RULES_SECOND[activeMenu];

    if (!rule) {
      rule = Object.values(STANDARD_HTF_ZONE_RULES_SECOND).find(
        r => r.base === prevFullScreen || r.base === this.FullScreenModeValue
      );
    }

    if (!rule) return;

    const memKey = rule.base;

    if (!this.viewGraphOverlapMemory[memKey]) {
      this.viewGraphOverlapMemory[memKey] = {
        htf: false,
        qualified: false
      };
    }

    const mem = this.viewGraphOverlapMemory[memKey];

    /**
     * 1. If leaving base timeframe,
     * remember HTF Zone and Qualified Zone state.
     */
    if (prevFullScreen === rule.base) {
      mem.htf = !!this.selectedOptions["htf_zone"];
      mem.qualified = !!this.selectedOptions["qualified_zones"];
    }

    /**
     * 2. If leaving mapped HTF child timeframe,
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
     * 5. Reset child-side computed option.
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

    console.log("tf:", tf);
    console.log("activeMenu:", activeMenu);
    console.log("prevFullScreen:", prevFullScreen);
    console.log("FullScreenModeValue:", this.FullScreenModeValue);
    console.log("rule:", rule);
    console.log("memKey:", memKey);
    console.log("mem:", mem);
    console.log("selectedOptions:", this.selectedOptions);
  }

  private getParentAnalyzeTfKeyForCurrentChartSecond(): string | null {
    const tf = Number(this.finData.time_frame);

    const timeFrameMap: Record<number, string> = {
      1: "daily",
      2: "sixty",
      3: "fifteen",
      25: "seventy_five",
    };

    const activeMenu = timeFrameMap[tf];

    if (!activeMenu) {
      return null;
    }

    const rule = STANDARD_HTF_ZONE_RULES_SECOND[activeMenu];

    if (!rule || !rule.htf_zone) {
      return null;
    }

    const htfKeys = Object.keys(rule.htf_zone);

    /*
      Examples:
  
      daily:
      htfKeys = ["monthly", "weekly"]
      current chart = weekly
      parent = monthly
  
      sixty:
      htfKeys = ["weekly", "daily"]
      current chart = daily
      parent = weekly
  
      fifteen:
      htfKeys = ["daily", "seventy_five"]
      current chart = seventy_five
      parent = daily
  
      seventy_five:
      htfKeys = ["weekly", "daily"]
      current chart = daily
      parent = weekly
    */

    const currentIndex = htfKeys.indexOf(this.FullScreenModeValue);

    if (currentIndex <= 0) {
      return null;
    }

    return htfKeys[currentIndex - 1];
  }

  private getAnalyzeOverlayZoneDataSecond(parentTfKey: string): any {
    if (!this.AnalyzeOverlayData) {
      return null;
    }

    // Case 1: AnalyzeOverlayData has timeframe keys
    // Example: this.AnalyzeOverlayData["monthly"]
    if (this.AnalyzeOverlayData[parentTfKey]) {
      return this.AnalyzeOverlayData[parentTfKey];
    }

    // Case 2: AnalyzeOverlayData itself is direct Buy/Sell object
    // Example: { Buy: [...], Sell: [...] }
    if (this.AnalyzeOverlayData.Buy || this.AnalyzeOverlayData.Sell) {
      return this.AnalyzeOverlayData;
    }

    return null;
  }

  private drawParentAnalyzeZoneOnChildChartSecond(
    buyfillColor: string,
    buyoutlineColor: string,
    buytextColor: string,
    sellfillColor: string,
    selloutlineColor: string,
    selltextColor: string
  ): void {
    const parentTfKey = this.getParentAnalyzeTfKeyForCurrentChartSecond();

    if (!parentTfKey) {
      return;
    }

    const zoneData = this.getAnalyzeOverlayZoneDataSecond(parentTfKey);

    if (!zoneData) {
      console.log("No AnalyzeOverlayData found for:", parentTfKey);
      return;
    }

    const label = this.getHtfLabelSecond(parentTfKey);

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

  private getHtfLabelSecond(tfKey: string): string {
    const labelMap: Record<string, string> = {
      monthly: "Monthly",
      weekly: "Weekly",
      daily: "Daily",
      sixty: "60 Min",
      fifteen: "15 Min",
      seventy_five: "75 Min",
    };

    return labelMap[tfKey] || tfKey;
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

  toggleMobileTradeMenu(): void {
    this.showMobileTradeMenu = !this.showMobileTradeMenu;
  }

  closeMobileTradeMenu(): void {
    this.showMobileTradeMenu = false;
  }

  toggleChartInversion() {
    this.isChartInverted = !this.isChartInverted;
    if (this.chart) {
      this.chart.priceScale('right').applyOptions({
        invertScale: this.isChartInverted,
      });
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.isMobileView = window.innerWidth <= 768;
  }

  setPopupPosition(triggerElement: HTMLElement) {
    const rect = triggerElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    this.isMobileView = window.innerWidth <= 768;

    if (this.isMobileView) {
      this.popupPosition = {
        top: '38%',
        left: '50%'
      };
      return;
    }

    this.popupPosition = {
      top: `${rect.bottom + scrollTop + 10}px`,
      left: `${rect.left + scrollLeft + rect.width / 2}px`
    };
  }

  closeSubdataPopup() {
    this.showSubdataPopup = false;
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
  
  
      // CUSTOM ENTRY | TARGET | STOPPLOSS
  
      private drawBackendSetupUsingTradeTigerTool(setupType: 'BUY' | 'SELL', entryPrice: any, targetPrice: any, stoplossPrice: any, entryTime: any, targetTime: any, stoplossTime: any): boolean {
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
  
    
    }