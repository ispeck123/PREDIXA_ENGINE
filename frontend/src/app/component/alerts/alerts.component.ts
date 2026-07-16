import { ThisReceiver } from '@angular/compiler';
import { Component, ElementRef, HostListener, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { time } from 'echarts';
import { createChart, CrosshairMode } from 'lightweight-charts';
import moment from 'moment';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';
import { RectangleDrawingTool } from '../homecandles/rectangle-drawing-tool';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EqualStencilFunc } from 'three';
import { NotificationCenterService } from 'src/app/services/notification-center.service';
import { HeaderTriggerService } from 'src/app/services/header-trigger.service';
import { MasterHeaderComponent } from '../master-header/master-header.component';

@Component({
  selector: 'app-alerts',
  templateUrl: './alerts.component.html',
  styleUrls: ['./alerts.component.css']
})
export class AlertsComponent implements OnInit {
  @ViewChild(MasterHeaderComponent) header!: MasterHeaderComponent;
  trackByTick = (_: number, item: any) => item?.stock_tick;

  showPriceAlert = false;
  showPriceAlertforUpdate = false;
  candles: Array<{ color: string; height: number; wickHeight: number } | { open: number; high: number; low: number; close: number; volume: number; time: number }> = [];
  showmsg: any;
  colorInterval: any;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  trigger_price: any;
  AlertsData: any;
  UserId: any;
  RRR: any;
  xspan: number = 60; // Default to 60 seconds (1 minute) per bar, adjust as needed
  updateModelPredictionFlag: boolean = false;
  SelectedCountryID: any;
  candlestickSeries: any;
  rectangleTool: any;
  created_at: any;
  private areaSeries: any;
  dropdownShow: any;
  UpdateTradeFlag = false;
  BadZoneData: any;
  selectedDateRange: any;
  selectedDateRangeforSystmAlrt: any
  StartDate: any;
  StartDateforSystmAlrt: any;
  EndDate: any;
  EndDateforSystmAlrt: any;
  currentPage: any = 1;
  currentPageforSystmAlrt: any = 1;
  itemsPerPage: number = 10; // default
  totalCount: any;
  ModalHeader: any;
  searchText: string = '';
  searchTextcustom: string = '';
  searchTextforSystemAlrt: string = '';
  searchSubject = new Subject<string>();
  searchSubjectforSystemAlrt = new Subject<string>();
  searchSubjectforCustomAlrt = new Subject<string>();
  highlightedStockName: string = '';
  private keySub!: Subscription;
  highlightedStockTick: string = '';
  MatchedCount: number = 0;
  sortColumnSystem: string = '';
  sortDirectionSystem: 'asc' | 'desc' = 'asc';
  FullScreenModeValue: any;
  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  pageSize = 10;
  pageSizeforSystmAlrt = 10;
  pageSizeforCustomAlrt = 10;
  pageSizeOptions = [2, 10, 25, 50, 100];
  highlightedStockNames: string[] = [];
  highlightedStockNamesforSystmAlrt: string[] = [];
  highlightedStockNamesforCustomAlrt: string[] = [];
  TotalCount: any = 0;
  SearchDebounceFlag: boolean = false;
  isNotificationVisible: boolean = false;
  private triggerlineSeries: any;
  payload: any;
  SelectedStockName: any;
  private buylineSeries: any;
  TriggerPrice: any;
  TriggerTime: any;
  QualifiedZoneFlag: boolean = false;
  alerttype: any;
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
  webSocketService: any;
  Index_Id: any;
  timeframe: any;
  exchange: any;
  IsLoadingVisible: boolean;
  filteredListData: any = [];
  selectedTab: string = 'custom';
  totalCountforSystmAlrt: any = 0;
  totalCountforCustomAlrt: any = 0;
  sortColumnCustom: string = '';
  sortDirectionCustom: 'asc' | 'desc' = 'asc';

  toolTipData: any; // Added to fix compile error

  chart: any; // Added to fix "Property 'chart' does not exist" error

  Open: string = '';
  Close: string = '';
  High: string = '';
  Low: string = '';
  CandleColor: string = '';
  SelectedCountryName: any;
  finData: any; // Added to fix compile error
  SelectedExchange_Name: any; // Added to fix compile error
  logoutTimer: any;
  QualifiedData: any;
  BaseCandleData: any;
  BuyZoneData: any;
  SellZoneData: any;
  AllZonesData: any;
  OverLayCandleData: any;
  BuyOverlayData: any;
  SellOverlayData: any;
  SelectedExpiryDate: any;
  OptimizedBuySellZoneData: any;
  PreviousHighData: any;
  SpinnerCounter: any;
  selectedOptions: any = {
    base_candle: false,
    buy_sell_zone: false,
    bad_zone: false,
    setup: false,
    overlap_evaluate: false,
    overlap_analyze: false
  };
  FullChartResponse: any;
  PriceAlertForm: FormGroup;
  PriceAlertUpdateForm: FormGroup;
  stockData: any[] = [];
  submitted: boolean = false;
  submittedforedit: boolean = false;
  selectedDateRangeforCustom: any;
  customAlertData: any = [];
  selectedAlertId: any = null;


  constructor(private notificationCenter: NotificationCenterService, private formBuilder: FormBuilder, private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService) { }

  openPriceAlert() {
    this.showPriceAlert = true;
  }

  closePriceAlert() {
    this.showPriceAlert = false;
    this.submitted = false;
    this.PriceAlertForm.get('stock_symbol')?.reset();
    this.PriceAlertForm.get('threshold')?.reset();
    this.PriceAlertForm.get('condition')?.reset();
    this.PriceAlertForm.get('message')?.reset();
  }

  closePriceAlertUpdate() {
    this.showPriceAlertforUpdate = false;
    this.submittedforedit = false;
  }

  searchStocks = (term: string, item: any) => {
    if (!term) return true;
    term = term.toLowerCase().trim();
    const tick = (item?.stock_tick ?? '').toLowerCase();
    const name = (item?.name ?? '').toLowerCase();
    return tick.includes(term) || name.includes(term);
  };

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    // ✅ Prevent shortcut logic if focus is in an input or textarea
    const tagName = (event.target as HTMLElement).tagName.toLowerCase();
    const isEditable = (event.target as HTMLElement).isContentEditable;

    if (tagName === 'input' || tagName === 'textarea' || isEditable) {
      return;
    }
    // this.QualifiedZoneFlag = false;
    if (event.key == "ArrowLeft") {
      this.shiftChart(-10);
    }
    if (event.key == "ArrowRight") {
      this.shiftChart(10);
    }

    if (event.key == "+" || event.key == "=") {
      this.scaleChart(1 / 8, true);
    }

    if (event.key == "-") {
      this.scaleChart(1 / 8, false);
    }

    let dataPresent = false;
    if (this.exchange == "NSE") {
      if (this.timeframe == 1) {
        switch (event.key) {
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              this.selectedOptions = []
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
              this.selectedOptions = []
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
              this.selectedOptions = []
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

      if (this.timeframe == 2) {
        switch (event.key) {
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
          case 'd':
          case 'D':
            dataPresent = !!this.FullChartResponse['daily'];
            if (dataPresent) {
              this.selectedOptions = []
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
              this.selectedOptions = []
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
              this.selectedOptions = []
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

      if (this.timeframe == 3) {
        switch (event.key) {
          case '5':
            dataPresent = !!this.FullChartResponse['fifteen'];
            if (dataPresent) {
              this.selectedOptions = []
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
              this.selectedOptions = []
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
          case '7':
            dataPresent = !!this.FullChartResponse['sixty'];
            if (dataPresent) {
              this.selectedOptions = []
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

      if (this.timeframe == 25) {
        switch (event.key) {
          case '7':
            dataPresent = !!this.FullChartResponse['seventy_five'];
            if (dataPresent) {
              this.selectedOptions = []
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
              this.selectedOptions = []
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
          case 'w':
          case 'W':
            dataPresent = !!this.FullChartResponse['weekly'];
            if (dataPresent) {
              this.selectedOptions = []
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

    if (this.exchange == "MCX") {
      if (this.timeframe == 1) {
        switch (event.key) {
          case 'm':
          case 'M':
            dataPresent = !!this.FullChartResponse['monthly'];
            if (dataPresent) {
              this.selectedOptions = []
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
              this.selectedOptions = []
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
              this.selectedOptions = []
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

      if (this.timeframe == 2) {
        switch (event.key) {
          case '7':
            dataPresent = !!this.FullChartResponse['two_forty'];
            if (dataPresent) {
              this.selectedOptions = []
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
              this.selectedOptions = []
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
              this.selectedOptions = []
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

      // if (this.activeMenu == "one_twenty") {
      //   switch (event.key) {
      //     case '5':
      //       dataPresent = !!this.FullChartResponse['one_twenty'];
      //       if (dataPresent) {
      //         this.selectedOptions = []
      //         this.dropdownShow = false;
      //         this.QualifiedZoneFlag = true;
      //         this.ChangeScreenMode('one_twenty', 'chart-container_new', true);
      //       }
      //       else {
      //         this.toastr.error(`No Data Found !`)
      //       }
      //       break;
      //     case 'd':
      //     case 'D':
      //       dataPresent = !!this.FullChartResponse['daily'];
      //       if (dataPresent) {
      //         this.selectedOptions = []
      //         this.dropdownShow = false;
      //         this.QualifiedZoneFlag = false;
      //         this.ChangeScreenMode('daily', 'chart-container_new', false);
      //       }
      //       else {
      //         this.toastr.error(`No Data Found !`)
      //       }
      //       break;
      //     case '7':
      //       dataPresent = !!this.FullChartResponse['two_forty'];
      //       if (dataPresent) {
      //         this.selectedOptions = []
      //         this.dropdownShow = false;
      //         this.QualifiedZoneFlag = false;
      //         this.ChangeScreenMode('two_forty', 'chart-container_new', false);
      //       }
      //       else {
      //         this.toastr.error(`No Data Found !`)
      //       }
      //       break;
      //   }
      // }

      // if (this.activeMenu == "two_forty") {
      //   switch (event.key) {
      //     case '5':
      //       dataPresent = !!this.FullChartResponse['two_forty'];
      //       if (dataPresent) {
      //         this.selectedOptions = []
      //         this.dropdownShow = false;
      //         this.QualifiedZoneFlag = true;
      //         this.ChangeScreenMode('two_forty', 'chart-container_new', true);
      //       }
      //       else {
      //         this.toastr.error(`No Data Found !`)
      //       }
      //       break;
      //     case 'd':
      //     case 'D':
      //       dataPresent = !!this.FullChartResponse['daily'];
      //       if (dataPresent) {
      //         this.selectedOptions = []
      //         this.dropdownShow = false;
      //         this.QualifiedZoneFlag = false;
      //         this.ChangeScreenMode('daily', 'chart-container_new', false);
      //       }
      //       else {
      //         this.toastr.error(`No Data Found !`)
      //       }
      //       break;
      //     case '7':
      //       dataPresent = !!this.FullChartResponse['weekly'];
      //       if (dataPresent) {
      //         this.selectedOptions = []
      //         this.dropdownShow = false;
      //         this.QualifiedZoneFlag = false;
      //         this.ChangeScreenMode('weekly', 'chart-container_new', false);
      //       }
      //       else {
      //         this.toastr.error(`No Data Found !`)
      //       }
      //       break;
      //   }
      // }
    }

    // if (this.exchange.exchange_name == "NSEFO") {

    //   if (this.activeMenu == "daily") {
    //     switch (event.key) {
    //       case 'm':
    //       case 'M':
    //         dataPresent = !!this.FullChartResponse['monthly'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('monthly', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case 'd':
    //       case 'D':
    //         dataPresent = !!this.FullChartResponse['daily'];
    //         if (dataPresent) {
    //           this.QualifiedZoneFlag = true;
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.ChangeScreenMode('daily', 'chart-container_new', true);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case 'w':
    //       case 'W':
    //         dataPresent = !!this.FullChartResponse['weekly'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('weekly', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //     }
    //   }

    //   if (this.activeMenu == "sixty") {
    //     switch (event.key) {
    //       case '7':
    //         dataPresent = !!this.FullChartResponse['weekly'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('weekly', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case 'd':
    //       case 'D':
    //         dataPresent = !!this.FullChartResponse['daily'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('daily', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case '6':
    //         dataPresent = !!this.FullChartResponse['sixty'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = true;
    //           this.ChangeScreenMode('sixty', 'chart-container_new', true);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //     }
    //   }

    //   if (this.activeMenu == "seventy_five") {
    //     switch (event.key) {
    //       case '5':
    //         dataPresent = !!this.FullChartResponse['seventy_five'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = true;
    //           this.ChangeScreenMode('seventy_five', 'chart-container_new', true);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case 'd':
    //       case 'D':
    //         dataPresent = !!this.FullChartResponse['daily'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('daily', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case '7':
    //         dataPresent = !!this.FullChartResponse['weekly'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('weekly', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //     }
    //   }

    //   if (this.activeMenu == "fifteen") {
    //     switch (event.key) {
    //       case '5':
    //         dataPresent = !!this.FullChartResponse['fifteen'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = true;
    //           this.ChangeScreenMode('fifteen', 'chart-container_new', true);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case 'd':
    //       case 'D':
    //         dataPresent = !!this.FullChartResponse['daily'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('daily', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //       case '7':
    //         dataPresent = !!this.FullChartResponse['sixty'];
    //         if (dataPresent) {
    //           this.selectedOptions = []
    //           this.dropdownShow = false;
    //           this.QualifiedZoneFlag = false;
    //           this.ChangeScreenMode('sixty', 'chart-container_new', false);
    //         }
    //         else {
    //           this.toastr.error(`No Data Found !`)
    //         }
    //         break;
    //     }
    //   }
    // }
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
    this.PriceAlertForm = this.formBuilder.group({
      user_id: [Number(this.UserId)],
      country_id: [Number(this.SelectedCountryID)],
      stock_symbol: ['', [Validators.required]],
      exchange_id: [],
      threshold: [, [Validators.required]],
      condition: ['', [Validators.required]],
      message: ['']
    });
    this.PriceAlertUpdateForm = this.formBuilder.group({
      alert_id: [],
      stock_symbol: ['', [Validators.required]],
      threshold: [, [Validators.required]],
      condition: ['', [Validators.required]],
      message: ['']
    });
  }

  ngOnInit(): void {

    this.Role = localStorage.getItem('role');
    this.UserId = localStorage.getItem('UserId');
    this.SelectedCountryName = localStorage.getItem('selectedCountryName');
    this.SelectedCountryID = localStorage.getItem('selectedCountryId');
    this.setDateRangeBasedOnTab();

    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.buildForm();

    this.PrepDebounce();
    this.getAllSetAlert(true);
    this.stockDataFunc();

    this.selectedDateRangeforCustom = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.getAllCustomAlerts(true);
  }

  get f() {
    return this.PriceAlertForm.controls;
  }

  get g() {
    return this.PriceAlertUpdateForm.controls;
  }

  ViewAnalytics(stock_tick: any) {
    this.router.navigate(['chart_analytics', stock_tick.toLowerCase()]);
  }

  cleanup(): void {
    if (this.chart) {
      this.chart.remove();
    }
  }

  setDateRangeBasedOnTab() {
    if (this.selectedTab === 'custom') {
      this.selectedDateRangeforCustom = {
        startDate: moment().startOf('year'),
        endDate: moment().endOf('year')
      };
      this.StartDate = this.selectedDateRangeforCustom.startDate.format('YYYY-MM-DD');
      this.EndDate = this.selectedDateRangeforCustom.endDate.format('YYYY-MM-DD');
    }
    else {
      this.selectedDateRangeforSystmAlrt = {
        startDate: moment().startOf('year'),
        endDate: moment().endOf('year')
      };
      this.StartDateforSystmAlrt = this.selectedDateRangeforSystmAlrt.startDate.format('YYYY-MM-DD');
      this.EndDateforSystmAlrt = this.selectedDateRangeforSystmAlrt.endDate.format('YYYY-MM-DD');
    }
  }


  PrepDebounce() {
    this.searchSubjectforCustomAlrt.pipe(
      debounceTime(400)
    ).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchTextcustom = trimmed;

      if (!trimmed) {
        this.highlightedStockNamesforCustomAlrt = [];
        this.highlightedStockNames = [];
        this.MatchedCount = 0;
      }

      this.currentPage = null;
      this.getAllCustomAlerts(true);
    });

    this.searchSubjectforSystemAlrt.pipe(
      debounceTime(400)
    ).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchTextforSystemAlrt = trimmed;

      if (!trimmed) {
        this.highlightedStockNamesforSystmAlrt = [];
        this.highlightedStockNames = [];
        this.MatchedCount = 0;
      }

      this.currentPageforSystmAlrt = null;
      this.getAllSetAlert(true);
    });
  }

  Search() {
    if (this.selectedTab == 'custom') {
      this.currentPage = 1;
      this.StartDate = this.selectedDateRangeforCustom.startDate.format('YYYY-MM-DD');
      this.EndDate = this.selectedDateRangeforCustom.endDate.format('YYYY-MM-DD');
      this.getAllCustomAlerts(true);
    } else {
      this.currentPageforSystmAlrt = 1;
      this.StartDateforSystmAlrt = this.selectedDateRangeforSystmAlrt.startDate.format('YYYY-MM-DD');
      this.EndDateforSystmAlrt = this.selectedDateRangeforSystmAlrt.endDate.format('YYYY-MM-DD');
      this.getAllSetAlert(true);
    }
  }

  selectTab(tab: string): void {
    this.selectedTab = tab;
    this.setDateRangeBasedOnTab();

    if (tab === 'custom') {
      this.getAllCustomAlerts(true);
    } else {
      this.getAllSetAlert(true);
    }
  }

  getAllSetAlert(highlight: boolean = false) {
    this.spinner.show();

    this.payload = {
      country_id: localStorage.getItem("selectedCountryId"),
      user_id: this.UserId,
      page_no: this.currentPageforSystmAlrt != null ? this.currentPageforSystmAlrt.toString() : undefined,
      limit: this.pageSizeforSystmAlrt,
      stock_tick: this.searchTextforSystemAlrt,
      start_date: this.StartDateforSystmAlrt,
      end_date: this.EndDateforSystmAlrt,
      is_system: true
    };
    this.apiService.getViewAlertListService(this.payload).subscribe(resp => {
      console.log("After Payload", this.payload);
      console.log("After Resp get all set alert", resp)
      this.spinner.hide();
      if (resp.msg === "success") {
        const parsedData = typeof resp === 'string' ? JSON.parse(resp) : resp;
        this.filteredListData = resp.response.alerts || [];
        this.applySystemAlertSorting();
        this.totalCountforSystmAlrt = resp.response.total_count;
        this.TotalCount = resp.response.total_count;

        const isCustomTab = this.selectedTab === 'custom';
        const searchText = isCustomTab ? this.searchText : this.searchTextforSystemAlrt;

        // Highlight if search matches
        if (highlight && searchText) {
          const lowerSearch = searchText.trim().toLowerCase();

          const matches = this.filteredListData.filter((item: { stock_symbol: string }) =>
            item.stock_symbol?.toLowerCase().includes(lowerSearch)
          );

          this.MatchedCount = matches.length;
          this.highlightedStockNames = matches.map((item: { stock_symbol: any; }) => item.stock_symbol);
          this.highlightedStockNamesforSystmAlrt = matches.map((item: { stock_symbol: any; }) => item.stock_symbol);  //newadded

          if (matches.length > 0) {
            const firstMatchName = matches[0].stock_symbol;
            this.currentPage = resp.response.page_no
            this.currentPageforSystmAlrt = resp.response.page_no;
            setTimeout(() => {
              const target = this.stockCells.find((cell: { nativeElement: { getAttribute: (arg0: string) => string; }; }) =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === firstMatchName.toLowerCase()
              );

              if (target) {
                target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          } else {
            this.highlightedStockNames = [];
            this.highlightedStockNamesforSystmAlrt = [];
            this.MatchedCount = 0;
          }
        } else {
          this.highlightedStockNames = [];
          this.highlightedStockNamesforSystmAlrt = [];
          this.MatchedCount = 0;
        }
      } else {
        this.toastr.error("Failed to fetch alerts");
        this.highlightedStockNames = [];
        this.highlightedStockNamesforSystmAlrt = [];
        this.MatchedCount = 0;
        this.TotalCount = 0;
      }
    });
  }

  GetAlerts() {
    // this.spinner.show()
    this.apiService.getAlertsService(this.UserId).subscribe(data => {
      this.spinner.hide()
      if (data.msg == "success") {
        this.toastr.success('Alerts Fetched Successfully');
      }
      else {
        this.toastr.error('Failed to Fetch Alerts');
      }
      this.AlertsData = data.response;
    });
  }

  deleteAlert(alertid: any) {
    const confirmation = window.confirm("Are you sure , you want to delete?");
    if (confirmation) {
      this.apiService.deleteAlertService(alertid).subscribe(data => {
        this.showmsg = data.msg;
        if (this.showmsg == "success") {
          this.toastr.success('Alert Deleted Successfully');
          this.getAllSetAlert();
        }
        else {
          this.toastr.error('Alert Deletion Failed');
        }
      });
    }
  }

  deleteCustomAlert(alertid: any) {
    const confirmation = window.confirm("Are you sure , you want to delete?");
    if (confirmation) {
      this.apiService.deleteCustomAlertService(alertid).subscribe(data => {
        this.showmsg = data.msg;
        if (this.showmsg == "success") {
          this.toastr.success('Alert Deleted Successfully');
          this.notificationCenter.refreshHistory()
          this.getAllCustomAlerts();
        }
        else {
          this.toastr.error('Alert Deletion Failed');
        }
      });
    }
  }

  goToNextPage() {
    if (this.selectedTab == 'custom') {
      const totalPages = this.getTotalPagesForCustmAlrt();
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.getAllCustomAlerts(true);
      }
    } else {
      const totalPages = this.getTotalPagesforSystmAlert();
      if (this.currentPageforSystmAlrt < totalPages) {
        this.currentPageforSystmAlrt++;
        this.getAllSetAlert(true);
      }
    }
  }

  goToPreviousPage() {
    if (this.selectedTab == 'custom') {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.getAllCustomAlerts(true);
      }
    } else {
      if (this.currentPageforSystmAlrt > 1) {
        this.currentPageforSystmAlrt--;
        this.getAllSetAlert(true);
      }
    }
  }

  isHighlighted(stockName: string): boolean {
    return this.highlightedStockNames
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlightedforCustomAlrt(stockName: string): boolean {
    return this.highlightedStockNamesforCustomAlrt
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlightedforSystmAlrt(stockName: string): boolean {
    return this.highlightedStockNamesforSystmAlrt
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  getPageNumbers(): number[] {
    if (this.selectedTab == 'custom') {
      const totalPages = this.getTotalPagesForCustmAlrt();
      const currentPage = this.getCurrentPageforCustomAlrt();

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
    else {
      const totalPages = this.getTotalPagesforSystmAlert();
      const currentPage = this.getCurrentPageforSystmAlrt();
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
  }

  onSearchInput(value: string) {
    this.searchSubject.next(value);
  }

  onSearchInputforSystmAlrt(value: string) {
    if (!value || !value.trim()) {
    this.searchTextforSystemAlrt = '';
    this.highlightedStockNamesforSystmAlrt = [];
    this.highlightedStockNames = [];
    this.MatchedCount = 0;
  }

  this.searchSubjectforSystemAlrt.next(value);
  }

  onSearchInputforCustomAlrt(value: string) {
     if (!value || !value.trim()) {
    this.searchTextcustom = '';
    this.highlightedStockNamesforCustomAlrt = [];
    this.highlightedStockNames = [];
    this.MatchedCount = 0;
  }

  this.searchSubjectforCustomAlrt.next(value);
  }

  goToPage(page: number) {
    if (this.selectedTab == 'custom') {
      this.currentPage = page;
      this.getAllCustomAlerts(true);
    } else {
      this.currentPageforSystmAlrt = page;
      this.getAllSetAlert(true);
    }
  }

  onPageSizeChange() {
    if (this.selectedTab == 'custom') {
      this.currentPage = 1;
      this.getAllCustomAlerts(true);
    } else {
      this.currentPageforSystmAlrt = 1;
      this.getAllSetAlert(true);
    }
  }

  getTotalPages(): number {
    return Math.ceil(this.TotalCount / this.pageSize);
  }

  getTotalPagesForCustmAlrt(): number {
    return Math.ceil(this.totalCountforCustomAlrt / this.pageSizeforCustomAlrt);
  }

  getTotalPagesforSystmAlert(): number {
    return Math.ceil(this.totalCountforSystmAlrt / this.pageSizeforSystmAlrt);
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getCurrentPageforCustomAlrt(): number {
    return this.currentPage || 1;
  }

  getCurrentPageforSystmAlrt(): number {
    return this.currentPageforSystmAlrt || 1;
  }

  CloseFullModal() {
    this.isNotificationVisible = false;
    // this.ModelPrediction = "";
    this.cleanupChart();
    // this.selectedOption = '';
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
    // this.modalalert.hide();
    // this.submitStock = false;
  }

  cleanupChart() {
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }

  openBar() {
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

  ViewGraph(stock_tick: string, created_at: string, EXP_NUM: string, alert_type: string, exchange: string, alertId: string, timeframe: string, trigger_price: any) {
    this.spinner.show();
    console.log("ViewGraph called with:", { stock_tick, created_at, EXP_NUM, alert_type, exchange, alertId, timeframe, trigger_price });
    let container = document.getElementById('chart-container_new');
    if (container) {
      container.innerHTML = ''; // clears old chart
    }
    // ✅ Ensure timeframe is numeric
    this.timeframe = typeof timeframe === "string" ? parseInt(timeframe, 10) : timeframe;

    // ✅ Set FullScreenModeValue
    switch (this.timeframe) {
      case 1:
        this.FullScreenModeValue = "daily";
        break;
      case 2:
        this.FullScreenModeValue = "sixty";
        break;
      case 25:
        this.FullScreenModeValue = "seventy_five";
        break;
      case 15:
        this.FullScreenModeValue = "fifteen";
        break;
      default:
        this.FullScreenModeValue = "unknown";
        break;
    }

    this.SelectedStockName = stock_tick;
    this.alerttype = alert_type;
    this.Index_Id = alertId;
    this.trigger_price = trigger_price;
    this.timeframe = timeframe;
    this.created_at = created_at;
    this.exchange = exchange;
    this.SelectedExpiryDate = EXP_NUM;
    this.ModalHeader = "View Graph";
    const currentDateTime = new Date();
    console.log("created at:", this.timeframe);
    const formattedDateString = moment(currentDateTime).format("YYYY-MM-DD HH:mm:ss");
    const modal = document.getElementById('fullModal');
    if (modal) modal.style.display = 'block';
    if (this.exchange == "NSE") {
      this.finData = {
        country: localStorage.getItem('selectedCountryName'),
        tick: this.SelectedStockName,
        time_frame: this.timeframe,
        last_d_time: formattedDateString
      }
      console.log("finData:", this.finData);

      this.FetchCandlesAndZones();
    }

    if (this.exchange == "MCX") {
      const formattedDate = `${EXP_NUM.slice(0, 2)}-${EXP_NUM.slice(2, 4)}-${EXP_NUM.slice(4)}`;
      this.finData = {
        st_sym: this.SelectedStockName,
        exp_dt: formattedDate,
        last_d_time: formattedDateString,
        time_frame: 1
      }

      // this.FetchCandleAndDataForMCX(entry_price, stoploss_price, target_price, entry_timestamp, extendedtime, EXP_NUM)
    }

    if (this.exchange == "NSEFO") {
      const formattedDate = `${EXP_NUM.slice(0, 2)}-${EXP_NUM.slice(2, 4)}-${EXP_NUM.slice(4)}`;
      this.finData = {
        st_sym: this.SelectedStockName,
        exp_dt: formattedDate,
        time_frame: this.timeframe,
        last_d_time: formattedDateString,

      }

      // this.FetchCandleAndDataForNSEFO(entry_price, stoploss_price, target_price, entry_timestamp, extendedtime, EXP_NUM)
    }

  }

  FetchCandlesAndZones() {
    this.spinner.show();
    const currentDateTime = new Date();
    const formattedDateString = moment(currentDateTime).format("YYYY-MM-DD HH:mm:ss");
    if (!this.finData.country || !this.finData.tick || !this.finData.time_frame) {
      console.error("Missing required parameters:", this.finData);
      return;
    }

    this.apiService.fetchCandleData(this.finData).subscribe(
      (data: any) => {
        console.log("API response:", data);
        if (data.msg === "success") {
          let chartdata = null;
          this.FullChartResponse = data.response;
          console.log("Candle Data:", this.timeframe);
          if (this.timeframe == 1) {
            this.QualifiedZoneFlag = true
            chartdata = data.response['daily']
            console.log("Daily Data:", data.response['daily']);
          }
          else if (this.timeframe == 2) {
            this.QualifiedZoneFlag = true
            chartdata = data.response['sixty']
            console.log("Hourly Data:", data.response['sixty']);
          }
          else if (this.timeframe == 25) {
            this.QualifiedZoneFlag = true
            chartdata = data.response['seventy_five']
            console.log("75 Min Data:", data.response['seventy_five']);
          }
          else {
            this.QualifiedZoneFlag = true
            chartdata = data.response['fifteen']
            console.log("15 Min Data:", data.response['fifteen']);
          }
          this.LoadChart(chartdata, 'chart-container_new');
          this.loadAllZones();
          this.spinner.hide();

          // Example: Add trigger price lines if they exist
          // if (data.response?.triggers && Array.isArray(data.response.triggers)) {
          //   data.response.triggers.forEach((trigger: { price: number; time: any; extended_time: any; }) => {
          //     if (trigger.price && trigger.time && trigger.extended_time) {
          //       this.addTriggerPriceLine(trigger.price, trigger.time, trigger.extended_time);
          //     }
          //   });
          // }

        } else {
          console.error("No candle data or failed to fetch:", data.response);
        }
      },
      (error) => {
        console.error("API error while fetching candle data:", error);
      }
    );
  }

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
        fontSize: 35,
        horzAlign: 'right',
        vertAlign: 'bottom',
        color: 'rgb(128, 128, 128)',
        text: 'FIN PRODUCT BY ISPECK ',
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

  async loadAllZones() {
    this.showmsg = "Fetching All Zones...";
    this.spinner.show(); // show spinner
    try {
      await Promise.all([
        this.GetQualifiedZones(),
        this.GetBaseCandleData(),
        this.GetBuyZoneData(),
        this.GetSellZoneData(),
        this.OverLayFetching(),
        this.GetAllZones(),
        this.BadZones(),
        this.OptimizedBuySellZoneFunc()
      ]);
      this.drawTriggerPriceLine();
      this.spinner.hide();
      console.log("All zones loaded successfully");
    } catch (err) {
      console.error("Error while loading zones:", err);
      this.spinner.hide();
    }
  }

  GetQualifiedZones() {
    this.showmsg = "Fetching Data !";
    console.log("ggggggggggg", this.finData)
    this.apiService.GetQualifiedZoneService(this.finData).subscribe(resp => {
      this.QualifiedData = resp.response;
      // console.log("QUALIFIED STOCKS",this.QualifiedData)
      this.SpinnerCounter++;
      if (this.SpinnerCounter == 6) {
        this.spinner.hide();
      }
    });
  }

  previousHighService() {
    this.apiService.GetprevioushighDataService(this.finData).subscribe(resp => {
      this.PreviousHighData = resp.response;
      this.addPreviousHighPriceLine(this.FullScreenModeValue);
      console.log(`RESPONSE 7 (PREVIOUS HIGH) :`, this.PreviousHighData);
    })
  }

  addPreviousHighPriceLine(key: any) {
    const previousHigh = this.PreviousHighData[key].previous_high
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

  CreateClosingLine(price: number) {
    if (this.chart) {
      // Find the last candle that has a 'time' property
      const lastCandleWithTime = [...this.candles].reverse().find(
        (candle: any) =>
          candle &&
          typeof candle === 'object' &&
          'time' in candle &&
          typeof (candle as any).time === 'number'
      );
      if (lastCandleWithTime && typeof (lastCandleWithTime as any).time === 'number') {
        this.chart.addLineSeries({
          color: '#FF0000',
          lineWidth: 1,
          priceLineVisible: true,
        }).setData([{ time: (lastCandleWithTime as any).time, value: price }]);
      }
    }
  }

  calculateMovingAverageSeriesData(data: any[], period: number) {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      const avg = data.slice(i - period + 1, i + 1)
        .reduce((sum, item) => sum + item.close, 0) / period;
      result.push({ time: data[i].time, value: avg });
    }
    return result;
  }

  isCustomCandle(candle: any): candle is { color: string; height: number; wickHeight: number } {
    return 'color' in candle && 'height' in candle && 'wickHeight' in candle;
  }

  OptimizedBuySellZoneFunc() {
    this.apiService.GetOptimizedBuySellZoneService(this.finData).subscribe(resp => {
      this.OptimizedBuySellZoneData = resp.response;
      // console.log("OPTIMIZED BUY SELL STOCKS",this.OptimizedBuySellZoneData)
    });
  }

  OptimizedBuySellZoneMCX() {
    this.apiService.GetOptimizedBuySellZoneMCXService(this.finData).subscribe(resp => {
      this.OptimizedBuySellZoneData = resp.response;
      // console.log("OPTIMIZED BUY SELL MCX", this.OptimizedBuySellZoneData)
    });
  }

  OptimizedBuySellZoneNSEFO() {
    this.apiService.GetOptimizedBuySellZoneNSEFOervice(this.finData).subscribe(resp => {
      this.OptimizedBuySellZoneData = resp.response;
      // console.log("OPTIMIZED BUY SELL FUTURE", this.OptimizedBuySellZoneData)
    });
  }

  GetQualifiedZonesForMcx() {
    this.showmsg = "Fetching Data !";
    this.apiService.GetMcxQualifiedZoneCandleData(this.finData).subscribe(resp => {
      this.QualifiedData = resp.response;

      this.SpinnerCounter++;
    });
  }

  GetQualifiedZonesForNSEFO() {
    this.showmsg = "Fetching Data !";
    this.apiService.GetFutureQualifiedZoneCandleData(this.finData).subscribe(resp => {
      this.QualifiedData = resp.response;
      // console.log("QUALIFIED NSEFO",this.QualifiedData)
    });
  }

  GetBaseCandleData() {
    this.apiService.GetBaseCandleData(this.finData).subscribe(resp => {
      this.BaseCandleData = resp.response
      // console.log("BASE CANDLE STOCKS",this.BaseCandleData)
      this.SpinnerCounter++;
      if (this.SpinnerCounter == 6) {
        this.spinner.hide();
      }
    })
  }

  GetBaseCandleDataForMcx() {
    this.apiService.GetMcxBaseCandleData(this.finData).subscribe(resp => {
      this.BaseCandleData = resp.response
      // console.log("BASE CANDLE MCX",this.BaseCandleData)
    })
  }

  GetBaseCandleDataForNSEFO() {
    this.apiService.GetFutureBaseCandleData(this.finData).subscribe(resp => {
      this.BaseCandleData = resp.response
      // console.log("BASE CANDLE FUTURE",this.BaseCandleData)
    })
  }

  GetBuyZoneData() {
    this.apiService.GetBuyZoneDataService(this.finData).subscribe(resp => {
      this.BuyZoneData = resp.response
      // console.log("BUY ZONE DATA STOCKS",this.BuyZoneData)
      this.SpinnerCounter++;
      if (this.SpinnerCounter == 6) {
        this.spinner.hide();
      }
    })
  }

  GetSellZoneData() {
    this.apiService.GetSellZoneDataService(this.finData).subscribe(resp => {
      this.SellZoneData = resp.response
      // console.log("SELL ZONE DATA STOCKS",this.SellZoneData)
      this.SpinnerCounter++;
      if (this.SpinnerCounter == 6) {
        this.spinner.hide();
      }
    })
  }

  OverLayFetching() {
    this.apiService.fetchingOverlayService(this.finData).subscribe((resp: any) => {
      this.OverLayCandleData = resp.response
      // console.log("OVERLAY DATA STOCKS",this.OverLayCandleData)
      this.BuyOverlayData = this.OverLayCandleData.Buy;
      this.SellOverlayData = this.OverLayCandleData.Sell;
      this.SpinnerCounter++;
      if (this.SpinnerCounter == 6) {
        this.spinner.hide();
      }
    })
  }

  OverLayFetchingForMcx() {
    this.apiService.GetMcxOverLayZoneService(this.finData).subscribe((resp: any) => {
      this.OverLayCandleData = resp.response
      // console.log("OVERLAY DATA MCX",this.OverLayCandleData)
      this.BuyOverlayData = this.OverLayCandleData.Buy;
      this.SellOverlayData = this.OverLayCandleData.Sell;
      this.spinner.hide()
    })
  }

  OverLayFetchingForNSEFO() {
    this.apiService.GetOverLayZoneService(this.finData).subscribe((resp: any) => {
      this.OverLayCandleData = resp.response
      // console.log("OVERLAY DATA NSEFO",this.OverLayCandleData)
      this.BuyOverlayData = this.OverLayCandleData.Buy;
      this.SellOverlayData = this.OverLayCandleData.Sell;
      this.spinner.hide()
    })
  }

  GetAllZones() {
    this.apiService.GetAllZonesData(this.finData).subscribe(resp => {
      this.AllZonesData = resp.response
      this.SpinnerCounter++;
      if (this.SpinnerCounter == 6) {
        this.spinner.hide();
      }
    })
  }

  BadZones() {
    this.BadZoneData = []
    // this.showmsg = "Fetching Bad Zone Data !";
    this.apiService.GetBadZoneDataService(this.finData).subscribe(resp => {
      this.BadZoneData = resp.response;
    });
  }

  BadZonesForMCX() {
    this.BadZoneData = []
    this.showmsg = "Fetching Bad Zone Data !";
    this.apiService.GetMcxBadZoneCandleData(this.finData).subscribe(resp => {
      this.BadZoneData = resp.response;
    });
  }

  BadZonesForNSEFO() {
    this.BadZoneData = []
    this.showmsg = "Fetching Bad Zone Data !";
    this.apiService.GetFutureBadZoneCandleData(this.finData).subscribe(resp => {
      this.BadZoneData = resp.response;
    });
  }

  checkOptions(): boolean {
    for (let key in this.selectedOptions) {
      if (this.selectedOptions[key]) {
        return false;
      }
    }
    return true;
  }

  checkboxClicked(option: string) {
    if (this.candlestickSeries) {
      this.candlestickSeries.setMarkers([]);
    }
    if (this.rectangleTool) {
      this.rectangleTool.removeAllRectangles();
    }

    // ✅ Toggle state safely
    this.selectedOptions[option] = !this.selectedOptions[option];
    let result = this.checkOptions();

    if (result === false) {
      // QUALIFIED ZONES
      if (this.selectedOptions['qualified_zones'] && this.QualifiedData) {
        this.showmsg = "Fetching All Zones Data !";
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        const fillColorSell = 'rgba(255,51,51,0.2)';

        if (this.QualifiedData["Buy"]) {
          for (let item of Object.values(this.QualifiedData["Buy"])) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorBuy);
          }
        }

        if (this.QualifiedData["Sell"]) {
          for (let item of Object.values(this.QualifiedData["Sell"])) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorSell);
          }
        }
      }

      // ALL ZONES
      if (this.selectedOptions['all_zones'] && this.AllZonesData?.[this.FullScreenModeValue]) {
        this.showmsg = "Fetching All Zones Data !";
        const array = this.AllZonesData[this.FullScreenModeValue];
        const fillColorBuy = 'rgba(50,50,50,0.5)';
        const fillColorSell = 'rgba(50,50,50,0.5)';

        if (array['Buy']) {
          for (let item of Object.values(array['Buy'])) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorBuy);
          }
        }

        if (array['Sell']) {
          for (let item of Object.values(array['Sell'])) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorSell);
          }
        }
      }

      // BASE CANDLE
      if (this.selectedOptions['base_candle'] && this.BaseCandleData?.[this.FullScreenModeValue]) {
        this.showmsg = "Fetching Base Candle Data !";
        const BaseMarkers = [];
        for (let item of this.BaseCandleData[this.FullScreenModeValue]) {
          BaseMarkers.push({
            time: item,
            position: 'aboveBar',
            color: 'blue',
            shape: 'arrowDown',
            text: "B",
          });
        }
        this.candlestickSeries?.setMarkers(BaseMarkers);
      }

      // BUY/SELL ZONE
      if (this.selectedOptions['buy_sell_zone']) {
        this.showmsg = "Fetching Buy/Sell Zone !";
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        const fillColorSell = 'rgba(255,51,51,0.2)';

        if (this.BuyZoneData?.[this.FullScreenModeValue]) {
          for (let item of Object.values(this.BuyZoneData[this.FullScreenModeValue])) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorBuy);
          }
        }

        if (this.SellZoneData?.[this.FullScreenModeValue]) {
          for (let item of Object.values(this.SellZoneData[this.FullScreenModeValue])) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorSell);
          }
        }
      }

      // BAD ZONE
      if (this.selectedOptions['bad_zone'] && this.BadZoneData?.[this.FullScreenModeValue]) {
        const fillColor = "rgba(41, 3, 3, 0.21)";
        for (let item of Object.values(this.BadZoneData[this.FullScreenModeValue])) {
          this.rectangleTool?.addRectanglesFromData(item, fillColor);
        }
      }

      // OPTIMIZED BUY/SELL ZONE
      if (this.selectedOptions['optimized_buy_sell_zone'] && this.OptimizedBuySellZoneData?.[this.FullScreenModeValue]) {
        const buy_array = this.OptimizedBuySellZoneData[this.FullScreenModeValue];
        const fillColorBuy = 'rgba(0,255,0,0.2)';
        const fillColorSell = 'rgba(255,51,51,0.2)';

        if (buy_array?.BUY) {
          for (let item of Object.values(buy_array.BUY)) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorBuy);
          }
        }

        if (buy_array?.SELL) {
          for (let item of Object.values(buy_array.SELL)) {
            this.rectangleTool?.addRectanglesFromData(item, fillColorSell);
          }
        }
      }
    } else {
      // ✅ when options are unchecked
      this.dropdownShow = false;
      this.candlestickSeries?.setMarkers([]);
      this.rectangleTool?.removeAllRectangles();
    }
  }

  drawTriggerPriceLine() {
    let extendedtime = 60 * 60 * 24 * 10; // default 10 days in seconds

    switch (this.timeframe) {
      case 1: // Daily + 10 days
        extendedtime = 60 * 60 * 24 * 10;
        break;
      case 2: // 60 min + 10 days
        extendedtime = 60 * 60 * 24 * 10;
        break;
      case 3: // 15 min + 10 days
        extendedtime = 60 * 60 * 24 * 10;
        break;
      case 25: // 75 min + 10 days
        extendedtime = 60 * 60 * 24 * 10;
        break;
      default:
        extendedtime = 60 * 60 * 24 * 10;
        break;
    }

    // ✅ Ensure created_at is UNIX seconds
    const startTime = this.normalizeToUnix(this.created_at);
    const endTime = startTime + extendedtime;

    console.log(`Calculated End Time: ${endTime} (Extended Time: ${extendedtime} seconds)`);

    // Call function to draw
    this.addTriggerPriceLine(this.trigger_price, startTime, endTime);

    console.log(
      `Trigger Line => Price: ${this.trigger_price}, Start: ${startTime}, End: ${endTime}`
    );
  }

  normalizeToUnix(time: any): number {
    if (typeof time === "number") {
      // If timestamp is in ms, convert to sec
      return time > 9999999999 ? Math.floor(time / 1000) : time;
    } else if (typeof time === "string") {
      return Math.floor(new Date(time).getTime() / 1000);
    } else if (time instanceof Date) {
      return Math.floor(time.getTime() / 1000);
    } else {
      console.error("❌ Invalid time format:", time);
      return Math.floor(Date.now() / 1000); // fallback to now
    }
  }

  addTriggerPriceLine(price: number, startTime: number, endTime: number) {
    console.log("Adding Trigger Price Line with:", { price, startTime, endTime });
    this.buylineSeries = this.chart.addLineSeries({
      color: 'blue',
      lineWidth: 2,
      priceLineVisible: false,
      priceLineColor: 'blue',
      priceLineWidth: 5,
    });
    const lineData = [
      { time: startTime, value: price },
      { time: endTime, value: price }
    ];
    this.buylineSeries.setData(lineData);
    this.buylineSeries.setMarkers([
      {
        time: startTime,
        position: 'aboveBar',
        color: 'blue',
        text: `Alert Price: ${price.toFixed(2)}`,
        size: 2
      },
    ]);

    // Save for later use
    this.TriggerPrice = price;
    this.TriggerTime = startTime;
  }

  ChangeScreenMode(type: any, chartId: any, setupReq: boolean) {
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
        case "one_twentyfive":
          this.ModalHeader = "125 Minute";
          this.FullScreenModeValue = type;
          break;
      }
      const data = this.FullChartResponse[type];
      this.cleanup();
      this.LoadChart(data, chartId);
      const lastRow = data.slice(-1)[0];
      this.CreateClosingLine(lastRow.close)
      this.drawTriggerPriceLine()
      // if (setupReq) {
      //   this.getsetup(this.purchased_date, this.entry_timestamp, this.entry_price, this.stoploss_price, this.target_price)
      // }
    }
    else {
      this.toastr.error(`No Data found !`)
      return;
    }
  }

  stockDataFunc() {
    this.apiService
      .getStockList(localStorage.getItem('SelectedCountryName'))
      .subscribe((data) => {
        const apiResponse = data.response;
        this.stockData = apiResponse;
      });
  }

  generateCustomAlerts() {
    this.showmsg = "Please wait..";
    this.spinner.show();
    var data = this.PriceAlertForm.value;
    this.submitted = true;
    this.PriceAlertForm.markAllAsTouched();
    if (this.PriceAlertForm.invalid) {
      this.toastr.error("Please fill all the required fields !");
      this.spinner.hide();
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
          this.showPriceAlert = false;
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

  getAllCustomAlerts(highlight: boolean = false) {
    let obj = {
      country_id: this.SelectedCountryID,
      user_id: this.UserId,
      stock_symbol: this.searchTextcustom,
      start_date: this.selectedDateRangeforCustom.startDate.format('YYYY-MM-DD'),
      end_date: this.selectedDateRangeforCustom.endDate.format('YYYY-MM-DD'),
      page_no: this.currentPage != null ? this.currentPage.toString() : undefined,
      limit: this.pageSizeforCustomAlrt
    }
    this.showmsg = "Fetching Custom Alerts...."
    this.apiService.getAllCustomAlertsService(obj).subscribe(data => {
      if (data.msg == "success") {
        this.spinner.hide();
        this.customAlertData = data.response.alerts;
        this.applyCustomAlertSorting();
        this.totalCountforCustomAlrt = data.response.total_count;
        this.TotalCount = data.response.total_count;
        // setTimeout(() => {
        //   this.notificationCenter.refreshHistory();
        // }, 12000);

        // Highlight if search matches
        if (highlight && this.searchTextcustom) {
          const lowerSearch = this.searchTextcustom.trim().toLowerCase();

          const matches = this.customAlertData.filter((item: { stock_symbol: string }) =>
            item.stock_symbol?.toLowerCase().includes(lowerSearch)
          );

          this.MatchedCount = matches.length;
          this.highlightedStockNamesforCustomAlrt = matches.map((item: { stock_symbol: any; }) => item.stock_symbol);  //newadded

          if (matches.length > 0) {
            const firstMatchName = matches[0].stock_symbol;
            this.currentPage = data.response.page_no
            setTimeout(() => {
              const target = this.stockCells.find((cell: { nativeElement: { getAttribute: (arg0: string) => string; }; }) =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === firstMatchName.toLowerCase()
              );

              if (target) {
                target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          } else {
            this.spinner.hide();
            this.highlightedStockNames = [];
            this.highlightedStockNamesforCustomAlrt = [];
            this.MatchedCount = 0;
          }
        }
      }
      else {
        this.spinner.hide();
        this.highlightedStockNames = [];
        this.highlightedStockNamesforCustomAlrt = [];
        this.MatchedCount = 0;
        this.TotalCount = 0;
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

  editCustomAlert(alertId: any) {
    this.showPriceAlertforUpdate = true;
    this.GetCustomAlertById(alertId)
    this.selectedAlertId = alertId;
  }

  resetUpdateForm() {
    if (!this.selectedAlertId) return;
    this.GetCustomAlertById(this.selectedAlertId);
  }

  GetCustomAlertById(id: any) {
    this.apiService.GetCustomAlertByIdservice(id).subscribe(resp => {
      const dataObject = resp.response.data[0];
      console.log("GetCustomAlertById Data obj", dataObject)
      this.PriceAlertUpdateForm.patchValue({
        alert_id: dataObject.id,
        stock_symbol: dataObject.stock_symbol,
        threshold: dataObject.threshold,
        condition: dataObject.condition == 1 ? "true" : "false",
        message: dataObject.message,
      });
      this.getAllCustomAlerts();
    })
  }

  EditCustomAlertDetails() {
    this.submittedforedit = true;
    this.PriceAlertUpdateForm.markAllAsTouched();
    if (this.PriceAlertUpdateForm.invalid) {
      return;
    }
    else {
      this.showmsg = "Please wait..";
      this.spinner.show();
      const updatedata = {
        alert_id: this.PriceAlertUpdateForm.value.alert_id,
        threshold: this.PriceAlertUpdateForm.value.threshold,
        condition: this.PriceAlertUpdateForm.value.condition,
        message: this.PriceAlertUpdateForm.value.message
      };
      this.apiService.EditCustomAlertDetailsService(updatedata).subscribe(resp => {
        console.log("EditCustomAlertDetailsafterUpdate", resp)
        if ((resp.msg == "success")) {
          this.spinner.hide();
          this.toastr.success(resp.response);
          this.notificationCenter.refreshHistory()
          this.showPriceAlertforUpdate = false;
          this.getAllCustomAlerts();
        }
        else {
          this.spinner.hide();
          this.toastr.error(resp.msg);
        }
      })
    }
  }

  sortCustomAlerts(column: string, preserveDirection: boolean = false): void {
  if (this.sortColumnCustom === column) {
    if (!preserveDirection) {
      this.sortDirectionCustom = this.sortDirectionCustom === 'asc' ? 'desc' : 'asc';
    }
  } else {
    this.sortColumnCustom = column;
    if (!preserveDirection) {
      this.sortDirectionCustom = 'asc';
    }
  }

  const direction = this.sortDirectionCustom === 'asc' ? 1 : -1;

  this.customAlertData = [...this.customAlertData].sort((a: any, b: any) => {
    let av: any;
    let bv: any;

    switch (column) {
      case 'stock_symbol':
        av = String(a.stock_symbol || '').toLowerCase();
        bv = String(b.stock_symbol || '').toLowerCase();
        return av.localeCompare(bv) * direction;

      case 'threshold':
        av = Number(a.threshold || 0);
        bv = Number(b.threshold || 0);
        return (av - bv) * direction;

      case 'condition':
        av = Number(a.condition || 0);
        bv = Number(b.condition || 0);
        return (av - bv) * direction;

      case 'created_at':
        av = new Date(a.created_at || 0).getTime();
        bv = new Date(b.created_at || 0).getTime();
        return (av - bv) * direction;

      case 'message':
        av = String(a.message || '').toLowerCase();
        bv = String(b.message || '').toLowerCase();
        return av.localeCompare(bv) * direction;

      default:
        return 0;
    }
  });
}

  sortSystemAlerts(column: string, preserveDirection: boolean = false): void {
  if (this.sortColumnSystem === column) {
    if (!preserveDirection) {
      this.sortDirectionSystem = this.sortDirectionSystem === 'asc' ? 'desc' : 'asc';
    }
  } else {
    this.sortColumnSystem = column;
    if (!preserveDirection) {
      this.sortDirectionSystem = 'asc';
    }
  }

  const direction = this.sortDirectionSystem === 'asc' ? 1 : -1;

  this.filteredListData = [...this.filteredListData].sort((a: any, b: any) => {
    let av: any;
    let bv: any;

    switch (column) {
      case 'stock_symbol':
        av = String(a.stock_symbol || '').toLowerCase();
        bv = String(b.stock_symbol || '').toLowerCase();
        return av.localeCompare(bv) * direction;

      case 'exchange':
        av = String(a.exchange || '').toLowerCase();
        bv = String(b.exchange || '').toLowerCase();
        return av.localeCompare(bv) * direction;

      case 'timeframe':
        av = Number(a.timeframe || 0);
        bv = Number(b.timeframe || 0);
        return (av - bv) * direction;

      case 'trigger_price':
        av = Number(a.trigger_price || 0);
        bv = Number(b.trigger_price || 0);
        return (av - bv) * direction;

      case 'target_percentage':
        av = Number(a.target_percentage || 0);
        bv = Number(b.target_percentage || 0);
        return (av - bv) * direction;

      case 'threshold':
        av = Number(a.threshold || 0);
        bv = Number(b.threshold || 0);
        return (av - bv) * direction;

      case 'price_range_min':
        av = Number(a.price_range_min || 0);
        bv = Number(b.price_range_min || 0);
        return (av - bv) * direction;

      case 'price_range_max':
        av = Number(a.price_range_max || 0);
        bv = Number(b.price_range_max || 0);
        return (av - bv) * direction;

      case 'alert_type':
        av = String(a.alert_type || '').toLowerCase();
        bv = String(b.alert_type || '').toLowerCase();
        return av.localeCompare(bv) * direction;

      case 'cooldown_minutes':
        av = Number(a.cooldown_minutes || 0);
        bv = Number(b.cooldown_minutes || 0);
        return (av - bv) * direction;

      case 'created_at':
        av = new Date(a.created_at || 0).getTime();
        bv = new Date(b.created_at || 0).getTime();
        return (av - bv) * direction;

      case 'note':
        av = String(a.note || '').toLowerCase();
        bv = String(b.note || '').toLowerCase();
        return av.localeCompare(bv) * direction;

      default:
        return 0;
    }
  });
}

  private applyCustomAlertSorting(): void {
    if (!this.sortColumnCustom) return;
    this.sortCustomAlerts(this.sortColumnCustom, true);
  }

  private applySystemAlertSorting(): void {
    if (!this.sortColumnSystem) return;
    this.sortSystemAlerts(this.sortColumnSystem, true);
  }

}
