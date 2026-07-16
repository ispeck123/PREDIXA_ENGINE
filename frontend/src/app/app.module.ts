import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DashboardComponent } from './component/dashboard/dashboard.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import * as PlotlyJS from 'plotly.js-dist-min';
import { PlotlyModule } from 'angular-plotly.js';
import { HttpClientModule } from '@angular/common/http';
import { NgxSpinnerModule } from 'ngx-spinner';
import { ToastrModule } from 'ngx-toastr';
import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { TooltipModule } from 'ng2-tooltip-directive';
import { NgxEchartsModule } from 'ngx-echarts';
import { OrderlistComponent } from './component/orderlist/orderlist.component';
import { HomecandlesComponent } from './component/homecandles/homecandles.component';
import { AutoOrderListComponent } from './component/auto-order-list/auto-order-list.component';
import { NgxDaterangepickerBootstrapModule, NgxDaterangepickerLocaleService } from 'ngx-daterangepicker-bootstrap';
import { FooterComponent } from './component/footer/footer.component';
import { LandingPageComponent } from './component/landing-page/landing-page.component';
import { SystemManagementComponent } from './component/system-management/system-management.component';
import { NewsComponent } from './component/news/news.component';
import { WatchlistComponent } from './component/watchlist/watchlist.component';
import { AvailableTradesComponent } from './component/available-trades/available-trades.component';
import { IndexStockListComponent } from './component/index-stock-list/index-stock-list.component';
import { ChartAnalyticsComponent } from './component/chart-analytics/chart-analytics.component';
import { NgMultiSelectDropDownModule } from 'ng-multiselect-dropdown';
import { MasterHeaderComponent } from './component/master-header/master-header.component';
import { UserSubscriptionComponent } from './component/user-subscription/user-subscription.component';
import { FloatingModalComponent } from './component/floating-modal/floating-modal.component';
import { ManageJobsComponent } from './component/manage-jobs/manage-jobs.component';
import { AlertsComponent } from './component/alerts/alerts.component';
import { FutureChartComponent } from './component/future-chart/future-chart.component';
import { McxComponent } from './component/mcx/mcx.component';
import { HomecandlesForTestComponent } from './component/homecandles-for-test/homecandles-for-test.component';
import { AddStockComponent } from './component/add-stock/add-stock.component';
import { AddIndexComponent } from './component/add-index/add-index.component';
import { UserManagementComponent } from './component/user-management/user-management.component';
import { NgSelectModule } from '@ng-select/ng-select';
import { BlockSpinnerComponent } from './component/block-spinner/block-spinner.component';
import { FeatureComponent } from './component/feature/feature.component';
import { NotificationPopupComponent } from './component/notification-popup/notification-popup.component';
import { RealordermgmtComponent } from './component/realordermgmt/realordermgmt.component';
import { BucketOrdersComponent } from './component/bucket-orders/bucket-orders.component';
import { TestingDemoComponent } from './component/testing-demo/testing-demo.component';
import { MasterLayoutComponent } from './component/master-layout/master-layout.component';
import { CurrentHoldingsComponent } from './component/current-holdings/current-holdings.component';


PlotlyModule.plotlyjs = PlotlyJS;



@NgModule({
  declarations: [
    AppComponent,
    DashboardComponent,
    OrderlistComponent,
    HomecandlesComponent,
    AutoOrderListComponent,
    FooterComponent,
    LandingPageComponent,
    SystemManagementComponent,
    NewsComponent,
    WatchlistComponent,
    AvailableTradesComponent,
    IndexStockListComponent,
    ChartAnalyticsComponent,
    MasterHeaderComponent,
    UserSubscriptionComponent,
    FloatingModalComponent,
    ManageJobsComponent,
    AlertsComponent,
    FutureChartComponent,
    McxComponent,
    HomecandlesForTestComponent,
    AddStockComponent,
    AddIndexComponent,
    UserManagementComponent,
    BlockSpinnerComponent,
    FeatureComponent,
    NotificationPopupComponent,
    RealordermgmtComponent,
    BucketOrdersComponent,
    TestingDemoComponent,
    MasterLayoutComponent,
    CurrentHoldingsComponent,
  ],
  imports: [
    NgSelectModule ,
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    PlotlyModule,
    HttpClientModule,
    NgxJsonViewerModule,
    ToastrModule.forRoot(),
    NgMultiSelectDropDownModule.forRoot(),
    BrowserAnimationsModule,
    TooltipModule,
    NgxSpinnerModule,
    NgxDaterangepickerBootstrapModule.forRoot(),
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    }),
    NgMultiSelectDropDownModule.forRoot()
  ],
  providers: [ NgxDaterangepickerLocaleService ,DatePipe],
  bootstrap: [AppComponent]
})
export class AppModule { }
