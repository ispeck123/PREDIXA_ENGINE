import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './component/dashboard/dashboard.component';
import { OrderlistComponent } from './component/orderlist/orderlist.component';
import { HomecandlesComponent } from './component/homecandles/homecandles.component';
import { AutoOrderListComponent } from './component/auto-order-list/auto-order-list.component';
import { LandingPageComponent } from './component/landing-page/landing-page.component';
import { SystemManagementComponent } from './component/system-management/system-management.component';
import { NewsComponent } from './component/news/news.component';
import { WatchlistComponent } from './component/watchlist/watchlist.component';
import { AvailableTradesComponent } from './component/available-trades/available-trades.component';
import { IndexStockListComponent } from './component/index-stock-list/index-stock-list.component';
import { ChartAnalyticsComponent } from './component/chart-analytics/chart-analytics.component';
import { AuthGuard } from './services/auth.guard';
import { UserSubscriptionComponent } from './component/user-subscription/user-subscription.component';
import { ManageJobsComponent } from './component/manage-jobs/manage-jobs.component';
import { AlertsComponent } from './component/alerts/alerts.component';
import { FutureChartComponent } from './component/future-chart/future-chart.component';
import { McxComponent } from './component/mcx/mcx.component';
import { HomecandlesForTestComponent } from './component/homecandles-for-test/homecandles-for-test.component';
import { AddStockComponent } from './component/add-stock/add-stock.component';
import { AddIndexComponent } from './component/add-index/add-index.component';
import { UserManagementComponent } from './component/user-management/user-management.component';
import { FeatureComponent } from './component/feature/feature.component';
import { RealordermgmtComponent } from './component/realordermgmt/realordermgmt.component';
import { BucketOrdersComponent } from './component/bucket-orders/bucket-orders.component';
import { TestingDemoComponent } from './component/testing-demo/testing-demo.component';
import { CurrentHoldingsComponent } from './component/current-holdings/current-holdings.component';

const routes: Routes = [
  { path: '', component: HomecandlesForTestComponent },
  { path: '', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'login', component: LandingPageComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: 'orderlist', component: OrderlistComponent, canActivate: [AuthGuard] },
  { path: 'home', component: HomecandlesComponent, canActivate: [AuthGuard] },
  { path: 'home/:tick/:filter/:date', component: HomecandlesComponent, canActivate: [AuthGuard] },
  { path: 'auto-order-list', component: AutoOrderListComponent, canActivate: [AuthGuard] },
  { path: 'system-management', component: SystemManagementComponent, canActivate: [AuthGuard] },
  { path: 'news', component: NewsComponent, canActivate: [AuthGuard] },
  { path: 'watchlist', component: WatchlistComponent, canActivate: [AuthGuard] },
  { path: 'trades', component: AvailableTradesComponent},
  { path: 'indexlistStock/:id', component: IndexStockListComponent, canActivate: [AuthGuard] },
  {
    path: 'chart_analytics/:stock_tick',
    component: ChartAnalyticsComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'chart_analytics/:stock_tick/:time_frame',
    component: ChartAnalyticsComponent,
    canActivate: [AuthGuard]
  },
  { path: 'user-plans', component: UserSubscriptionComponent, canActivate: [AuthGuard] },
  { path: 'manage-jobs', component: ManageJobsComponent, canActivate: [AuthGuard] },
  { path: 'alerts', component: AlertsComponent, canActivate: [AuthGuard] },
  { path: 'futures', component: FutureChartComponent, canActivate: [AuthGuard] },
  { path: 'mcx', component: McxComponent, canActivate: [AuthGuard] },
  { path: "landing", component: HomecandlesForTestComponent },
  { path: "add_stock", component: AddStockComponent },
  { path: "add_index", component: AddIndexComponent },
  { path: "user-management", component: UserManagementComponent },
  { path: "feature", component: FeatureComponent },
  { path: "realorders", component: RealordermgmtComponent },
  { path: "bucket-orders", component: BucketOrdersComponent },
  { path: "test", component: TestingDemoComponent },
  { path: "holdings", component: CurrentHoldingsComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
  providers: [AuthGuard]
})
export class AppRoutingModule { }
