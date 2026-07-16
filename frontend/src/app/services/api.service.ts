import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  ApiUrl = environment.http.api;
  FutureApiUrl = environment.http.future;
  ServiceApiUrl = environment.http.service;

  constructor(private httpclient: HttpClient) { }

  plotService(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'generate_candlestick_chart?tick=' + obj.stockname + '&time_frame=' + obj.filtername + '&last_d_time=' + obj.datetime, { headers: reqHeader });
  }
  
   getFuturesExpiryDate(key: string): Observable<any> {
    if (!key || key.trim() === '') {
      return of(null); // empty observable if key is blank
    }
    const url = `${this.FutureApiUrl}get_futures_expiry_dates?key=${key}`;
    return this.httpclient.get<any>(url).pipe(
      catchError((err) => {
        console.error('API error:', err);
        return of(null);
      })
    );
  }

  saveCustomDashboard(data: any) {
    return this.httpclient.post(this.ServiceApiUrl + 'save_custom_dashboard', data);
  }
  getStockSearch(country: number, key: string): Observable<any> {
  const url = `${this.ServiceApiUrl}search_stock?country=${country}&key=${key}`;
  return this.httpclient.get<any>(url);
}

 // fetch symbols from API
  getFyersSymbols(query: string): Observable<any> {
    return this.httpclient.get<any>(`${this.ServiceApiUrl}get_fyers_symbol?symbol=${query}`);
  }
  getCustomDashboard(userId: number, countryId: number) {
    return this.httpclient.get(`${this.ServiceApiUrl}get_custom_dashboard?user_id=${userId}&country_id=${countryId}`);
  }
  addIndex(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + 'add_new_index', obj, { headers: reqHeader });
  }
  generateAlert(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + 'evaluate_and_generate_alert', obj, { headers: reqHeader });
  }
  getExchanges(countryId: number): Observable<any> {
    return this.httpclient.get<any>(`${this.ApiUrl}get_exchanges?country_id=${countryId}`);
  }
  getindex(countryId: number): Observable<any> {
    return this.httpclient.get<any>(`${this.ApiUrl}get_all_stock_indices?country_id=${countryId}`);
  }
  OnGetStockIdByTradeidService(tradeId: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get-stock-id/{trade_id}?avl_trade_id=' + tradeId, { headers: reqHeader });
  }

  createorder(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + 'create_order', obj, { headers: reqHeader });
  }

  createBucketOrdersService(obj:any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'create/bucket/orders', obj, { headers: reqHeader });
  }

  createorderForMCXservice(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'create_commodity_order', obj, { headers: reqHeader });
  }

  createorderForNSEFOservice(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'create_futures_order', obj, { headers: reqHeader });
  }

  getOrdersCountService(payload: any): Observable<any> {
    const reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + 'get_order_count', payload, { headers: reqHeader });
  }

  getCommodityOrdersCountService(payload: any): Observable<any> {
    const reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'get_commodities_order_count', payload, { headers: reqHeader });
  }

  getFutureOrdersCountService(payload: any): Observable<any> {
    const reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'get_futures_order_count', payload, { headers: reqHeader });
  }

  getAutoOrdersCountService(payload: any): Observable<any> {
    const reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + 'get_auto_order_count', payload, { headers: reqHeader });
  }

  getCandleDataService(): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_stock_data_by_timeframe?stock_name=HDFC&time_frame=1', { headers: reqHeader });
  }

  getViewOrderListService(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "get_order_list", obj, { headers: reqHeader });
  }

  getViewCommodityOrderListService(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + "get_commodities_order_list", obj, { headers: reqHeader });
  }

  getViewFutureOrderListService(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + "get_futures_order_list", obj, { headers: reqHeader });
  }

  getViewAutoOrderListService(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "get_auto_order_list", obj, { headers: reqHeader });
  }

  getViewAlertListService(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "get_alerts", obj, { headers: reqHeader });
  }

  onSearchOrderListService(sendObject: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_filtered_orders?country_id=' + sendObject.country_id + '&tick=' + sendObject.tick + '&start_time=' + sendObject.start_time + '&end_time=' + sendObject.end_time, { headers: reqHeader });
  }

  onSearchautoOrderListService(sendObject: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_filtered_auto_orders?country_id=' + sendObject.country_id + '&tick=' + sendObject.tick + '&start_time=' + sendObject.start_time + '&end_time=' + sendObject.end_time, { headers: reqHeader });
  }

  getautoorderlistservive(Country_id: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_auto_order_list?country_id=' + Country_id, { headers: reqHeader })
  }
  // createorder(orderData: any): Observable<any> {
  //   const reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
  //   return this.httpclient.post<any>(this.ApiUrl + 'create_order', orderData, { headers: reqHeader });
  // }

  getDeleteService(order_id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "delete_order?id=" + order_id, { headers: reqHeader });
  }
  getFuturesExpiryDates(key: string): Observable<any> {
    return this.httpclient.get<any>(`${this.FutureApiUrl}/get_futures_expiry_dates?key=${key}`);
  }

  tokenService(token: any, state: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "submit_request_token_and_generate_access?request_token=" + token + "&state=" + state, { headers: reqHeader });
  }

  accessTokenValidationService() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "validate_generated_access_token", { headers: reqHeader });
  }

  updateOrderStatusService() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "update_order_status", { headers: reqHeader });
  }

  updateAutoOrderStatusService() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "update_auto_order_status", { headers: reqHeader });
  }

  updateOrderEntryStats() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "update_order_entry_stats", { headers: reqHeader });
  }

  updateAutoOrderEntryStats() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "update_auto_order_entry_stats", { headers: reqHeader });
  }

  downloadLatestDataService() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "download_latest_data", { headers: reqHeader });
  }

  parseLatestDataCsvService() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "parse_latest_data_csv", { headers: reqHeader });
  }

  processStockItemsService() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "process_stock_items", { headers: reqHeader });
  }

  getStockList(country_name: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "get_list_of_stock?country_name=" + country_name, { headers: reqHeader });
  }

  fetchCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_candle_chart_data?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }
  getStockListByIndex(payload: any) {
    return this.httpclient.post<any>(this.ApiUrl + 'get_stock_list', payload);
  }

  fetchAvailableTradesCandleData(obj: any, exchange_name: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_candle_chart_data?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  getReasonData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_setup_reason?order_id=' + obj.order_id + '&table_name=' + obj.table_name, { headers: reqHeader });
  }

   getReasonForMCXFUT(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_setup_reason_futures_commodity?order_id=' + obj.order_id + '&segment=' + obj.segment, { headers: reqHeader });
  }

  getReasonDataAvailableTrades(tradeId: number) {
    const reqHeader = new HttpHeaders({
      'Content-Type': 'application/json',
      'No-Auth': 'True'
    });

    // Correct query parameter: trade_id
    return this.httpclient.get<any>(
      `${this.FutureApiUrl}available_trade_reason?trade_id=${tradeId}`,
      { headers: reqHeader }
    );
  }



  fetchingOverlayService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_fixed_time_eae_zones?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetZoneData() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'calculate_zone');
  }

  GetBaseCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'calculate_base_candles?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetAllZonesData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'calculate_all_zones?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetBuyZoneDataService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'calculate_buy_zone?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetSellZoneDataService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'calculate_sell_zone?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetprevioushighDataService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_all_time_high_and_previous_high?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetprevioushighDataMcxNsefoService(obj: any, exchange: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_all_time_high_and_previous_high_future_commodity?country_name=' + localStorage.getItem('selectedCountryName') + '&tick=' + obj.st_sym + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time + '&exp_str=' + obj.exp_dt + '&segment=' + exchange, { headers: reqHeader });
  }

  GetSetupDataService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_setup?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetGapDataService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_gaps?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetQualifiedZoneService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_qualified_zones?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetBadZoneDataService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'bad_zone_records?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  getModelPredictionService(data: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'fetch_stock_model_prediction', data, { headers: reqHeader });
  }

  getMCXModelPredictionService(data: any, expiry_date: any, type: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'fetch_futures_and_commodity_model_prediction?exp_date=' + expiry_date + '&segment=' + type, data, { headers: reqHeader });
  }

  getGraphByOrderService(order_id: any, country_name: any, exchange_type: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'view_order_candlestick?order_id=' + order_id + '&country_name=' + country_name + '&exchange_type=' + exchange_type, { headers: reqHeader });
  }

  getGraphByautoOrderService(order_id: any, country_name: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'view_auto_order_candlestick?order_id=' + order_id + '&country_name=' + country_name, { headers: reqHeader });
  }

  SearchStockonKey(value: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'search?keyword=' + value, { headers: reqHeader });
  }

  addstockservice(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ServiceApiUrl + 'add_new_stock', obj, { headers: reqHeader });
  }

  addstockProcessingservice(stock_id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'process_new_stock?stock_id=' + stock_id, { headers: reqHeader });
  }

  GetOptimizedBuySellZoneService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'calculate_opt_zone?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetOptimizedBuySellZoneMCXService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_commodities_opt_zones?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  GetOptimizedBuySellZoneNSEFOervice(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_futures_opt_zones?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  TrendAnalyzerService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'calculate_stock_trend?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  deleteAutoorders(id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'delete_order_from_auto?order_id=' + id, { headers: reqHeader });
  }

  deleteorders(id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'delete_order?id=' + id, { headers: reqHeader });
  }

  deleteordersCommodity(id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'delete_commodity_order?order_id=' + id, { headers: reqHeader });
  }

  deleteordersFuture(id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'delete_futures_order?order_id=' + id, { headers: reqHeader });
  }

  getNewsService(): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'market-news', { headers: reqHeader });
  }

  // getDailyTrades(): Observable<any> {
  //   var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
  //   return this.httpclient.get<any>(this.ApiUrl + 'get_available_trades_daily?country_name='+localStorage.getItem('selectedCountryName'), { headers: reqHeader });
  // }

  getDailyTrades(page: number, search: string, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_daily_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }

  get120Trades(page: number, search: string, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_one_twenty_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }

  get240Trades(page: number, search: string, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_two_forty_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }

  get75Trades(page: number, search: string, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_seventy_five_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }

  getSixtyTrades(page: any, search: any, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_sixty_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }


  // getSixtyTrades(page:any,search:any): Observable<any> {
  //   var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
  //   return this.httpclient.get<any>(this.ApiUrl + 'get_available_trades_sixty?country_name='+localStorage.getItem('selectedCountryName'), { headers: reqHeader });
  // }

  getFifteenTrades(page: any, search: any, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_fifteen_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }


  // getFifteenTrades(page:any,search:any): Observable<any> {
  //   var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
  //   return this.httpclient.get<any>(this.ApiUrl + 'get_available_trades_fifteen?country_name='+localStorage.getItem('selectedCountryName'), { headers: reqHeader });
  // }

  getAvailableTradedBySearch(time_frame: any, selectedStock: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_available_trades_by_stock?country_name=' + localStorage.getItem('selectedCountryName') + '&stock_name=' + selectedStock + '&time_frame=' + time_frame, { headers: reqHeader });
  }

  GetGapUpDownDataService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_gaps?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  login(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "login_user", obj);
  }

  getCountry() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "get/country/list");
  }
  getUserSubscription(userId: number): Observable<any> {
    return this.httpclient.get(this.ApiUrl + "check-subscription?user_id=" + userId);
  }

  getWatchlistService(UserId: any, country: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "get_user_watchlist?user_id=" + UserId + "&country_id=" + country, { headers: reqHeader });
  }

  AddToWatchListService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "add_to_watchlist", obj);
  }

  getIndexService() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "get/index");
  }

  removeFromWatchlist(watchlist_id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.delete<any>(this.ApiUrl + "watchlist/" + watchlist_id, { headers: reqHeader });
  }

  getIndexDataById(index_id: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "get/index?index_id=" + index_id, { headers: reqHeader });
  }

  getAllUsersService() {
    return this.httpclient.get<any>(this.ApiUrl + "get_all_user");
  }

  getAllSubscriptionsService() {
    return this.httpclient.get<any>(this.ApiUrl + "get_all_subscriptions");
  }

  OnSubmitofAssignPlanService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "user-create_user_subscription", obj);
  }

  getCountryAccessService(userid: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + "user-country-access?user_id=" + userid, { headers: reqHeader });
  }

  setCountryAccessService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "user_grant_country_access", obj);
  }
  createuserService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + "create_user", obj);
  }


  getAllUsersSubscriptionslistService() {
    return this.httpclient.get<any>(this.ApiUrl + "get_all_users_subscriptions");
  }
  updatePlanStatus(subscriptionId: number, status: boolean) {
    const url = this.ApiUrl + `update_user_subscription?subcription_id=${subscriptionId}&is_active=${status}`;
    return this.httpclient.get<any>(url);
  }
  getUserExchanges(userId: number, country_id: any): Observable<any> {
    return this.httpclient.get(this.ApiUrl + "user-exchanges?user_id=" + userId + "&country_id=" + country_id);
  }

  getUserCountryAccessService(userid: any) {
    return this.httpclient.get<any>(this.ApiUrl + "user-country-access?user_id=" + userid);
  }

  updateCandleDataService(stock_id: any) {
    const country = localStorage.getItem('selectedCountryName')
    return this.httpclient.get<any>(this.ApiUrl + "process_stock_delta_update?stock_id=" + stock_id + '&country_name=' + country);
  }

  getStockExchanges(user_id: any) {
    return this.httpclient.get<any>(this.ApiUrl + "user-exchanges?user_id=" + user_id + '&country_id=' + Number(localStorage.getItem('selectedCountryId')));
  }

  getIndexesByExchange(exchange_id: any) {
    return this.httpclient.get<any>(this.ApiUrl + "exchange-indexes?exchange_id=" + exchange_id);
  }

  getMcxService() {
    return this.httpclient.get<any>(this.ApiUrl + "commodity-instruments");
  }

  getScripData() {
    return this.httpclient.get<any>(this.ApiUrl + "get_all_future_symbols");
  }

  getFuturesListService(scrip: any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_future_options_by_symbols?symbol=" + scrip);
  }

  updateBTCDataService() {
    return this.httpclient.get<any>(this.ApiUrl + "update_btc_usd_data");
  }

  getAllIndexes(countryid: any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_all_stock_indices?country_id=" + countryid);
  }
  addNewStock(stockData: any): Observable<any> {
    const url = `${this.ServiceApiUrl}add_new_stock`;
    return this.httpclient.post(url, stockData);
  }
  processStockService(stock_id: any, country: any) {
    return this.httpclient.get<any>(this.ApiUrl + "process_new_stock?country_name=" + country + "&stock_id=" + stock_id);
  }

  getStockDataByCountry(country: any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_list_of_stock?country_name=" + country);
  }

  getStockdataBYTick(StockTickByParam: any, countryName: any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_stock_info?country_name=" + countryName + "&stock_tick=" + StockTickByParam);
  }

  getFutureChartData(symbol: any, expiry_date: any) {
    return this.httpclient.get<any>(this.FutureApiUrl + "get_futures_data?st_sym=" + symbol + "&exp_dt=" + expiry_date);
  }

  getAllStocksService(country: any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_stock_info?country_name=" + country);
  }

  deleteStockService(stock_id: any, countryName: any) {
    console.log(this.ApiUrl + "delete_stock?country_name=" + countryName + "&stock_id=" + stock_id);
    return this.httpclient.delete<any>(this.ApiUrl + "delete_stock?country_name=" + countryName + "&stock_id=" + stock_id);
  }

  sortbycmpservice(time_fr: any, countryName: any) {
    return this.httpclient.get<any>(this.ApiUrl + "fetch_filtered_stock_available_trades?time_fr=" + time_fr + "&country_name=" + countryName);
  }
  deleteUser(user_id: number): Observable<any> {
    return this.httpclient.delete(`${this.ApiUrl}delete_user?user_id=${user_id}`);
  }

  getAlertsService(UserId: any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_alerts?user_id=" + UserId);
  }

  deleteAlertService(alert_id: any) {
    return this.httpclient.delete<any>(this.FutureApiUrl + "alerts/delete/" + alert_id);
  }

  deleteTRadeService(trade_id: any) {
    return this.httpclient.delete<any>(this.FutureApiUrl + "delete_available_trades?trade_id=" + trade_id);
  }

  onSubmitSetAlertService(data: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'alerts/create', data, { headers: reqHeader });
  }

  getAllSetAlertsService(userId: any) {
    return this.httpclient.get<any>(this.FutureApiUrl + "get_alerts?user_id=" + userId);
  }

  getFutureData(symbol: any, expiry_date: any, Time_frame: any,last_d_time?:any) {
    return this.httpclient.get<any>(this.FutureApiUrl + "get_futures_candlestick_data?st_sym=" + symbol + "&exp_dt=" + expiry_date + "&time_frame=" + Time_frame + "&last_d_time=" + last_d_time);
  }

  getMcxData(symbol: any, expiry_date: any, time_frame: any,last_d_time?:any) {
    return this.httpclient.get<any>(this.FutureApiUrl + "get_commodities_candlestick_data?st_sym=" + symbol + "&exp_dt=" + expiry_date + "&time_frame=" + time_frame + "&last_d_time=" + last_d_time);
  }

  GetFutureBaseCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_base_candles_futures?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + "&time_frame=" + obj.time_frame, { headers: reqHeader });
  }

  GetFutureBadZoneCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'bad_zone_records_futures?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + "&time_frame=" + obj.time_frame, { headers: reqHeader });
  }

  GetFutureQualifiedZoneCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_qualified_zones_futures?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetFutureOptimizedZoneCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_futures_opt_zones?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetOverLayZoneService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_fixed_futures_time_eae_zones?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetSetupZoneService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_setup_futures?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  getFuturesDatesBySymbol(): Observable<string[]> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_expiry_list_by_commodity_symbol', { headers: reqHeader });
  }


  // MCX API SERVICE 


  GetMcxBaseCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_base_candles_commodity?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetMcxBadZoneCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'bad_zone_records_commodity?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetMcxQualifiedZoneCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_qualified_zones_commodity?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetMcxOptimizedZoneCandleData(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_commodities_opt_zones?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetMcxOverLayZoneService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_fixed_commodity_time_eae_zones?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  GetMcxSetupZoneService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_setup_commodities?st_sym=' + obj.st_sym + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&time_frame=' + obj.time_frame, { headers: reqHeader });
  }

  createorderforMCX(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'create_commodity_order', obj, { headers: reqHeader });
  }
  createorderforNSEFO(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + 'create_futures_order', obj, { headers: reqHeader });
  }

  upadteAlertService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.put<any>(this.FutureApiUrl + 'update_available_trade?trade_id=' + obj.trade_id + '&entry=' + obj.entry + '&stop_loss=' + obj.stop_loss + '&target=' + obj.target + '&prediction=' + obj.prediction + '&probability=' + obj.probability, { headers: reqHeader });
  }

  tradeSignal(country_name: any, id: any, status: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'change_stock_status?country_name=' + country_name + '&stock_id=' + id + '&status=' + status, { headers: reqHeader });
  }

  getStockTickbySymbolService(stockName: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_stock_tick_by_symbol?stock_name=' + stockName, { headers: reqHeader });
  }

  getCurrentStatus(trade_id: any, exchange: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_order_status_from_trade_id?trade_id=' + trade_id + '&exchange=' + exchange, { headers: reqHeader });
  }

   PricePercentageService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'check_price_percentage_across_timeframe?country_name=' + obj.country + '&tick=' + obj.tick + '&time_frame=' + obj.time_frame + '&last_d_time=' + obj.last_d_time, { headers: reqHeader });
  }

  PricePercentageNsefoService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'check_price_percentage_across_timeframe_future_and_commodity?country_name=' + obj.country_name + '&tick=' + obj.st_sym + '&time_frame=' + obj.time_frame + '&exp_dt=' + obj.exp_dt + '&last_d_time=' + obj.last_d_time + '&is_future='+obj.is_future, { headers: reqHeader });
  }

   getOIDataService(symbol:any,expiry_date:any){
     var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'get_future_oi?symbol=' + symbol + '&expiry_date=' + expiry_date, { headers: reqHeader });
  }

   getMCXexpiryDatesBySymbol(symbol:any){
     var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_expiry_list_by_commodity_symbol?symbol=' + symbol ,{ headers: reqHeader });
  }

  future_liquidity_by_volume_Service(){
     var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'future_liquidity_by_volume' , { headers: reqHeader });
  }

  get125Trades(page: number, search: string, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_one_twenty_five_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }

   get25Trades(page: number, search: string, pageSize: any, start: any, end: any, exchange_id: any, orderByDate: any, orderByCMP: any, tradeType: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'get_available_trades_twenty_five_filter?country_name=' + localStorage.getItem('selectedCountryName') + '&page_no=' + page + '&limit=' + pageSize + '&search_key=' + search + '&start_date=' + start + '&end_date=' + end + '&exchange_id=' + exchange_id + '&order_by_date=' + orderByDate + '&order_by_cmp=' + orderByCMP + '&trade_type=' + tradeType, { headers: reqHeader });
  }
  
  EditCustomAlertDetailsService(obj:any){
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.ApiUrl + 'update_custom_alerts' ,obj, { headers: reqHeader });
  }

  GetCustomAlertByIdservice(id:any){
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
   return this.httpclient.get<any>(this.ApiUrl + 'get_custom_alerts_id?alert_id=' + id, { headers: reqHeader });
  }

 generateCustomAlertsService(obj:any): Observable<any> {
  var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
  return this.httpclient.post<any>(this.ApiUrl + 'generate_custom_alerts' ,obj, { headers: reqHeader });
  }

  getAllCustomAlertsService(obj: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
   return this.httpclient.post<any>(this.ApiUrl + "get_custom_alerts" , obj, { headers: reqHeader });
  }

  deleteCustomAlertService(alert_id: any) {
    return this.httpclient.delete<any>(this.ApiUrl + "delete_custom_alerts?alert_id=" + alert_id);
  }

  getTrendingNewsService(): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.ApiUrl + 'short_term_trading_news', { headers: reqHeader });
  }

  seenNotification(alert_id: any) {
    return this.httpclient.get<any>(this.ApiUrl + "seen_custom_alerts?alert_id=" + alert_id);
  }

  seenStockNotification(alert_id: any,notification_type:any) {
    return this.httpclient.get<any>(this.ApiUrl + "seen_order_alerts?alert_id=" + alert_id+"&notification_type="+notification_type);
  }


  historyAlertService(user_id:any,country_id:any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_custom_alerts_notifications?user_id=" + user_id + "&country_id=" + country_id);
  }

  historyStockService(user_id:any,country_id:any) {
    return this.httpclient.get<any>(this.ApiUrl + "get_order_alerts_notifications?user_id=" + user_id + "&country_id=" + country_id);
  }

  readAllService() {
    return this.httpclient.get<any>(this.ApiUrl + "seen_order_alerts?alert_id=all");
  }

  getAllBucketListOrderService(obj: any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + "get/bucket/orders", obj, { headers: reqHeader });
  }

  approveBucketOrderService(obj:any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + "approve/reject/bucket/orders", obj, { headers: reqHeader });
  }

  getBucketOrdersCountService(obj:any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + "get/bucket/order/count", obj, { headers: reqHeader });
  }

  getAllHoldingsService(obj:any): Observable<any> {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post<any>(this.FutureApiUrl + "get/holdings", obj, { headers: reqHeader });
  }

  getOHLCdataService(tick: any, category: any, timeframe: any, single_timeframe: any, start_date: any, end_date: any, expiry_date: any): Observable<any> {
    return this.httpclient.get(
      this.FutureApiUrl +
      'get_ohlc_stock_data?tick=' + tick +
      '&category=' + category +
      '&time_frame=' + timeframe +
      '&single_time_frame=' + single_timeframe +
      '&start_date=' + start_date +
      '&end_date=' + end_date +
      '&expiry_date=' + expiry_date,
      {
        responseType: 'blob',
        observe: 'response'
      }
    );
  }

  getPendingGttOrders() {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return  this.httpclient.get<any[]>(this.FutureApiUrl + 'fyers/pending/gtt_orders', { headers: reqHeader });
  }

  modifyGttOrder(payload: any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post(this.FutureApiUrl + 'fyers/modify/gtt_order', payload, { headers: reqHeader });
  }

  cancelGttOrder(gttId: string) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.post(`${this.FutureApiUrl}fyers/cancel/gtt_order?gtt_id=${encodeURIComponent(gttId)}`, {}, { headers: reqHeader }
    );
  }

  getSharedTradeByTradeId(tradeId: any) {
    return this.httpclient.get<any>(this.FutureApiUrl + "share_trade_detail?trade_id=" + tradeId);
  }

  GetAllZonesFutureAndCommodity(obj:any) {
    var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
    return this.httpclient.get<any>(this.FutureApiUrl + 'calculate_all_zones_future_and_commodity?tick=' + obj.tick + '&time_frame=' + obj.time_frame  + '&last_d_time=' + obj.last_d_time + "&exp_dt=" + obj.exp_dt + "&is_future=" + obj.is_future, { headers: reqHeader });
  }

  getTradeScope(){
    return this.httpclient.get<any>(this.FutureApiUrl + "get_trading_scope");
  }

  // exitPositions(payload: any) {
  //     var reqHeader = new HttpHeaders({ 'Content-Type': 'application/json', 'No-Auth': 'True' });
  //   return this.httpclient.post(`${this.FutureApiUrl}fyers/positions/exit`,payload  , { headers: reqHeader });
  // }

}
