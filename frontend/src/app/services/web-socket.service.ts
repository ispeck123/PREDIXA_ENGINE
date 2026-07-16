import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
 WebsocketWSS = 'ws';

  private readonly wsBase = environment.production
  ? `wss://${window.location.host}${environment.wsPath}`
  : environment.wsBase;
  
  private stockSocket!: WebSocket;
  private stockSubject = new Subject<any>();

  private indexSocket!: WebSocket;
  private indexSubject = new Subject<any>();

  private listSocket!: WebSocket;
  private listSubject = new Subject<any>();

  private listSocketParam!: WebSocket;
  private listSubjectParam = new Subject<any>();

  private listCustomStockParam!: WebSocket;
  private listSubjectCustomParam = new Subject<any>();

  private OICustomData!: WebSocket;
  private OISubjectData = new Subject<any>();

  private RealOrderSocket!: WebSocket;
  private RealOrderSubjectData = new Subject<any>();

  private WatchListSocket!: WebSocket;
  private WatchListSubjectData = new Subject<any>();

  private HoldingListSocket!: WebSocket;
  private HoldingListSubjectData = new Subject<any>();

  private StockListSocket!: WebSocket;
  private StockListSubjectData = new Subject<any>();

  private FutureExpiryListSocket!: WebSocket;
  private FutureExpiryListSubjectData = new Subject<any>();



  // WEBSOCKET 1
  connect(stockTick: string, time_frame: any, stock_id: any, type: any): void {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/${stock_id}/${type}`;
    this.stockSocket = new WebSocket(wsUrl);

    this.stockSocket.onmessage = (event) => {
      this.stockSubject.next(event.data);
    };

    this.stockSocket.onclose = () => {
      console.log('Stock WebSocket disconnected');
    };

    this.stockSocket.onerror = (error) => {
      console.error('Stock WebSocket error:', error);
    };
  }

  getStockMessage(): Observable<any> {
    return this.stockSubject.asObservable();
  }

  disconnectStock() {
    if (this.stockSocket) {
      this.stockSocket.close();
      console.log("Stock WebSocket connection closed.");
    }
  }

  getIndexMessage(): Observable<any> {
    return this.indexSubject.asObservable();
  }

  disconnectIndex() {
    if (this.indexSocket) {
      this.indexSocket.close();
      console.log("Index WebSocket connection closed.");
    }
  }

  // WEBSOCKET 3
  listindex() {
    const wsUrl = `${this.wsBase}/stock_price`;
    this.listSocket = new WebSocket(wsUrl);

    this.listSocket.onmessage = (event) => {
      this.listSubject.next(event.data);
    };

    this.listSocket.onclose = () => {
      console.log('List WebSocket disconnected');
    };

    this.listSocket.onerror = (error) => {
      console.error('List WebSocket error:', error);
    };
  }

  getListMessage(): Observable<any> {
    return this.listSubject.asObservable();
  }

  disconnectList() {
    if (this.listSocket) {
      this.listSocket.close();
      console.log("List WebSocket connection closed.");
    }
  }

  // WEBSOCKET 4
  StockByIndexParam(payload: { index_id: number, page: number, offset: any, IndexName: any, searchKey: any, userId: any }) {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/stock_live_prices?index_id=` + payload.index_id + `&stock_exchange=` + payload.IndexName + `&search_key=` + payload.searchKey + `&page_no=` + payload.page + `&limit=` + payload.offset + '&user_id=' + payload.userId;
    this.listSocketParam = new WebSocket(wsUrl);

    this.listSocketParam.onmessage = (event) => {
      this.listSubjectParam.next(event.data);
    };

    this.listSocketParam.onclose = () => {
      console.log('List WebSocket disconnected');
    };

    this.listSocketParam.onerror = (error) => {
      console.error('List WebSocket error:', error);
    };
  }

  StockByIndexMessageParam(): Observable<any> {
    return this.listSubjectParam.asObservable();
  }

  disconnectStockByIndex() {
    if (this.listSocketParam) {
      this.listSocketParam.close();
      console.log("List WebSocket connection closed.");
    }
  }

  // WEBSOCKET 5
  listindexParam(payload: { index_id: number, page: number, offset: any, selectedCountry: any }) {
    const wsUrl = `${this.wsBase}/stock_price_by_stock_index_map?index_id=` + payload.index_id + `&page_id=` + payload.page + `&limit=` + payload.offset + `&country=` + payload.selectedCountry;
    this.listSocketParam = new WebSocket(wsUrl);

    this.listSocketParam.onmessage = (event) => {
      this.listSubjectParam.next(event.data);
    };

    this.listSocketParam.onclose = () => {
      console.log('List WebSocket disconnected');
    };

    this.listSocketParam.onerror = (error) => {
      console.error('List WebSocket error:', error);
    };
  }

  getListMessageParam(): Observable<any> {
    return this.listSubjectParam.asObservable();
  }

  disconnectListParam() {
    if (this.listSocketParam) {
      this.listSocketParam.close();
      console.log("List WebSocket connection closed.");
    }
  }

  // WEBSOCKET 6
  listCustomindexParam(payload: { exchange: any, page: number, offset: any, search_key: any }) {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/ind_stock_live_prices?stock_exchange=` + payload.exchange + `&search_key=` + payload.search_key + `&page_no=` + payload.page + `&limit=` + payload.offset;
    this.listCustomStockParam = new WebSocket(wsUrl);

    this.listCustomStockParam.onmessage = (event) => {
      this.listSubjectCustomParam.next(event.data);
    };

    this.listCustomStockParam.onclose = () => {
      console.log('List WebSocket disconnected');
    };

    this.listCustomStockParam.onerror = (error) => {
      console.error('List WebSocket error:', error);
    };
  }

  getCustomListMessageParam(): Observable<any> {
    return this.listSubjectCustomParam.asObservable();
  }

  disconnectCustomListParam() {
    if (this.listCustomStockParam) {
      this.listCustomStockParam.close();
      console.log("List WebSocket connection closed.");
    }
  }

  // WEBSOCKET 7
  connectOI(scrip: string, expiry: any): void {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/get_future_oi?symbol=${scrip}&expiry_date=${expiry}`;
    this.OICustomData = new WebSocket(wsUrl);

    this.OICustomData.onmessage = (event) => {
      this.OISubjectData.next(event.data);
    };

    this.OICustomData.onclose = () => {
      console.log('Stock WebSocket disconnected');
    };

    this.OICustomData.onerror = (error) => {
      console.error('Stock WebSocket error:', error);
    };
  }

  getOIMessage(): Observable<any> {
    return this.OISubjectData.asObservable();
  }

  disconnectOI() {
    if (this.OICustomData) {
      this.OICustomData.close();
      console.log("Stock WebSocket connection closed.");
    }
  }


  getRealOrderMessage(): Observable<any> {
    return this.RealOrderSubjectData.asObservable();
  }

  disconnectRealOrder() {
    if (this.RealOrderSocket) {
      this.RealOrderSocket.close();
      console.log("Stock WebSocket connection closed.");
    }
  }



    // WEBSOCKET 9
  connectWatchlist(userid: any, countryId: any,stock_exchange:any,page_no:any,limit:any,searchKey = ''): void {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/stock_live_prices/watchlist?user_id=${userid}&country_id=${countryId}&stock_exchange=${stock_exchange}&page_no=${page_no}&limit=${limit}&search_key=${searchKey}`;
    this.WatchListSocket = new WebSocket(wsUrl);

    this.WatchListSocket.onmessage = (event) => {
      this.WatchListSubjectData.next(event.data);
    };

    this.WatchListSocket.onclose = () => {
      console.log('Watchlist WebSocket disconnected');
    };

    this.WatchListSocket.onerror = (error) => {
      console.error('Watchlist WebSocket error:', error);
    };
  }

  getWatchlistData(): Observable<any> {
    return this.WatchListSubjectData.asObservable();
  }

  disconnectWatchlistSocket() {
    if (this.WatchListSocket) {
      this.WatchListSocket.close();
      console.log("Watchlist WebSocket connection closed.");
    }
  }


     // WEBSOCKET 10
  connectHoldinglistOrders(symbol: any,page_no:any,limit:any): void {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/holdings?symbol=${symbol}&page_no=${page_no}&limit=${limit}`;
    this.HoldingListSocket = new WebSocket(wsUrl);

    this.HoldingListSocket.onmessage = (event) => {
      this.HoldingListSubjectData.next(event.data);
    };

    this.HoldingListSocket.onclose = () => {
      console.log('Bucketlist WebSocket disconnected');
    };

    this.HoldingListSocket.onerror = (error) => {
      console.error('Bucketlist WebSocket error:', error);
    };
  }

  getHoldingListData(): Observable<any> {
    return this.HoldingListSubjectData.asObservable();
  }

  disconnectHoldingListSocket() {
    if (this.HoldingListSocket) {
      this.HoldingListSocket.close();
      console.log("Holdinglist WebSocket connection closed.");
    }
  }

  // WEBSOCKET 11

    ConnectStockList(): void {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/all_stock_live_prices`;
    this.StockListSocket = new WebSocket(wsUrl);

    this.StockListSocket.onmessage = (event) => {
      this.StockListSubjectData.next(event.data);
    };

    this.StockListSocket.onclose = () => {
      console.log('StockListSocket WebSocket disconnected');
    };

    this.StockListSocket.onerror = (error) => {
      console.error('StockListSocket WebSocket error:', error);
    };
  }

  getFullStockListData(): Observable<any> {
    return this.StockListSubjectData.asObservable();
  }

  disconnectStockListSocket() {
    if (this.StockListSocket) {
      this.StockListSocket.close();
      console.log("StockListSocket WebSocket connection closed.");
    }
  }


    // WEBSOCKET 12

    ConnectFutureExpiryList(expiry:any): void {
    const wsUrl = `${this.wsBase}/${this.WebsocketWSS}/all_future_live_prices?expiry=${expiry}`;
    this.FutureExpiryListSocket = new WebSocket(wsUrl);

    this.FutureExpiryListSocket.onmessage = (event) => {
      this.FutureExpiryListSubjectData.next(event.data);
    };

    this.FutureExpiryListSocket.onclose = () => {
      console.log('FutureExpiryList WebSocket disconnected');
    };

    this.FutureExpiryListSocket.onerror = (error) => {
      console.error('FutureExpiryList WebSocket error:', error);
    };
    }

  getFutureExpiryList(): Observable<any> {
    return this.FutureExpiryListSubjectData.asObservable();
  }

  disconnectFutureExpiryList() {
    if (this.FutureExpiryListSocket) {
      this.FutureExpiryListSocket.close();
      console.log("FutureExpiryList WebSocket connection closed.");
    }
  }


}