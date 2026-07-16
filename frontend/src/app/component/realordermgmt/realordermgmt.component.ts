import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';

type OrderState =
  | 'PENDING_ENTRY'
  | 'ACTIVE'
  | 'TARGET_HIT'
  | 'STOPLOSS_HIT'
  | 'CANCELLED'
  | 'REJECTED';

type DrawerKind = 'new' | 'modify' | 'alert';
type ConfirmAction = 'cancel' | 'squareoff' | 'delete';

interface AlertItem {
  id: any;
  type: 'ENTRY' | 'STOPLOSS' | 'TARGET' | 'CMP' | string;
  condition: '>=' | '<=' | string;
  price: number;
  channel: 'APP' | 'PUSH' | 'BOTH' | string;
  message?: string;
}

interface RealOrder {
  id: any;
  orderId: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  side: 'BUY' | 'SELL';
  state: OrderState;
  entry: number;
  sl: number;
  tp: number;
  qty: number;
  orderType: 'LIMIT' | 'MARKET';
  validity: 'DAY' | 'IOC';
  cmp: number;
  pnl: number;
  alerts: AlertItem[];
}

@Component({
  selector: 'app-realordermgmt',
  templateUrl: './realordermgmt.component.html',
  styleUrls: ['./realordermgmt.component.css']
})
export class RealordermgmtComponent implements OnInit {
  Role:any;
  isAdmin=false;
  UserName:any;
  q = '';
  filterStatus: 'OPEN' | 'COMPLETED' | 'ALL' = 'OPEN';
  filterExchange: 'ALL' | string = 'ALL';
  exchangeList: string[] = ['NSE', 'FUTURE', 'COMMODITY'];


  orders: RealOrder[] = [];
  filteredOrders: RealOrder[] = [];

  stats = { open: 0, active: 0, completed: 0, unreadAlerts: 0 };

  drawer: { open: boolean; kind: DrawerKind; order?: RealOrder } = { open: false, kind: 'new' };

  confirm: { open: boolean; action: ConfirmAction; order?: RealOrder } = {
    open: false,
    action: 'delete',
  };

  // Drawer forms
  orderForm = {
    symbol: '',
    exchange: 'NSE',
    side: 'BUY' as 'BUY' | 'SELL',
    timeframe: '15m',
    entry: 0,
    sl: 0,
    tp: 0,
    qty: 1,
    orderType: 'LIMIT' as 'LIMIT' | 'MARKET',
    validity: 'DAY' as 'DAY' | 'IOC',
  };

  alertForm = {
    type: 'ENTRY',
    condition: '>=' as '>=' | '<=',
    price: null as any,
    channel: 'APP',
    message: '',
  };

  constructor(private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService) { }

  ngOnInit(): void {
    this.Role = localStorage.getItem('role');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.refresh(); // initial
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

  alerts(){
    this.router.navigate(['alerts']);
  }

  autoorders() {
    this.router.navigate(['auto-order-list']);
  }

  stock_screener() {
    this.router.navigate(['home']);
  }

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  news() {
    this.router.navigate(['news']);
  }

  available_trades(){
    this.router.navigate(['trades']);
  }


  refresh(): void {
    // TODO: replace with API call
    this.orders = [
      {
        id: 1,
        orderId: 'ROM-10021',
        symbol: 'RELIANCE',
        exchange: 'NSE',
        timeframe: '15m',
        side: 'BUY',
        state: 'PENDING_ENTRY',
        entry: 2510,
        sl: 2480,
        tp: 2580,
        qty: 1,
        orderType: 'LIMIT',
        validity: 'DAY',
        cmp: 2501,
        pnl: 0,
        alerts: [],
      },
      {
        id: 2,
        orderId: 'ROM-10022',
        symbol: 'TCS',
        exchange: 'NSE',
        timeframe: '5m',
        side: 'SELL',
        state: 'ACTIVE',
        entry: 3940,
        sl: 3980,
        tp: 3860,
        qty: 2,
        orderType: 'LIMIT',
        validity: 'DAY',
        cmp: 3922,
        pnl: 36,
        alerts: [{ id: 'a1', type: 'TARGET', condition: '<=', price: 3860, channel: 'APP', message: 'Target watch' }],
      },
      {
        id: 3,
        orderId: 'ROM-10023',
        symbol: 'INFY',
        exchange: 'NSE',
        timeframe: '1h',
        side: 'BUY',
        state: 'TARGET_HIT',
        entry: 1480,
        sl: 1460,
        tp: 1515,
        qty: 1,
        orderType: 'LIMIT',
        validity: 'DAY',
        cmp: 1515,
        pnl: 35,
        alerts: [],
      },
    ];

    this.recomputeStats();
    this.applyFilters();
  }

  applyFilters(): void {
    const q = (this.q || '').trim().toLowerCase();
    this.filteredOrders = this.orders.filter(o => {
      const matchesQ =
        !q ||
        o.symbol.toLowerCase().includes(q) ||
        (o.orderId || '').toLowerCase().includes(q);

      const matchesExchange = this.filterExchange === 'ALL' || o.exchange === this.filterExchange;

      const isOpen = o.state === 'PENDING_ENTRY' || o.state === 'ACTIVE';
      const isCompleted = o.state === 'TARGET_HIT' || o.state === 'STOPLOSS_HIT';

      const matchesStatus =
        this.filterStatus === 'ALL'
          ? true
          : this.filterStatus === 'OPEN'
            ? isOpen
            : isCompleted;

      return matchesQ && matchesExchange && matchesStatus;
    });
  }

  clearSearch(): void {
    this.q = '';
    this.applyFilters();
  }

  recomputeStats(): void {
    const open = this.orders.filter(x => x.state === 'PENDING_ENTRY').length;
    const active = this.orders.filter(x => x.state === 'ACTIVE').length;
    const completed = this.orders.filter(x => x.state === 'TARGET_HIT' || x.state === 'STOPLOSS_HIT').length;
    this.stats = { ...this.stats, open, active, completed };
  }

  // Drawer open/close
  openDrawer(kind: DrawerKind, order?: RealOrder): void {
    this.confirm.open = false; // close confirm bar
    this.drawer = { open: true, kind, order };

    if (kind === 'new') {
      this.orderForm = {
        symbol: '',
        exchange: 'NSE',
        side: 'BUY',
        timeframe: '15m',
        entry: 0,
        sl: 0,
        tp: 0,
        qty: 1,
        orderType: 'LIMIT',
        validity: 'DAY',
      };
    }

    if (kind === 'modify' && order) {
      this.orderForm = {
        symbol: order.symbol,
        exchange: order.exchange,
        side: order.side,
        timeframe: order.timeframe,
        entry: order.entry,
        sl: order.sl,
        tp: order.tp,
        qty: order.qty,
        orderType: order.orderType,
        validity: order.validity,
      };
    }

    if (kind === 'alert' && order) {
      this.alertForm = { type: 'ENTRY', condition: '>=', price: null, channel: 'APP', message: '' };
      this.autofillAlertPrice();
    }
  }

  closeDrawer(): void {
    this.drawer = { open: false, kind: 'new' };
  }

  drawerTitle(kind: DrawerKind): string {
    if (kind === 'new') return 'New Order Ticket';
    if (kind === 'modify') return 'Modify Order';
    return 'Add Alert';
  }

  // Submit
  submitNewOrder(): void {
    const symbol = (this.orderForm.symbol || '').trim().toUpperCase();
    if (!symbol) return;

    const newOrder: RealOrder = {
      id: String(Date.now()),
      orderId: `ROM-${Math.floor(10000 + Math.random() * 89999)}`,
      symbol,
      exchange: this.orderForm.exchange,
      timeframe: this.orderForm.timeframe,
      side: this.orderForm.side,
      state: 'PENDING_ENTRY',
      entry: Number(this.orderForm.entry || 0),
      sl: Number(this.orderForm.sl || 0),
      tp: Number(this.orderForm.tp || 0),
      qty: Number(this.orderForm.qty || 1),
      orderType: this.orderForm.orderType,
      validity: this.orderForm.validity,
      cmp: Number(this.orderForm.entry || 0),
      pnl: 0,
      alerts: [],
    };

    // TODO: call API create
    this.orders = [newOrder, ...this.orders];
    this.recomputeStats();
    this.applyFilters();
    this.closeDrawer();
  }

  submitModify(): void {
    const o = this.drawer.order;
    if (!o) return;

    // enforce rule
    if (this.canEditEntry(o.state)) o.entry = Number(this.orderForm.entry || o.entry);
    if (this.canEditSL(o.state)) o.sl = Number(this.orderForm.sl || o.sl);
    if (this.canEditTP(o.state)) o.tp = Number(this.orderForm.tp || o.tp);
    if (this.canEditQty(o.state)) o.qty = Number(this.orderForm.qty || o.qty);
    if (this.canEditOrderType(o.state)) o.orderType = this.orderForm.orderType;
    if (this.canEditValidity(o.state)) o.validity = this.orderForm.validity;

    // TODO: call API modify
    this.applyFilters();
    this.closeDrawer();
  }

  submitAlert(): void {
    const o = this.drawer.order;
    if (!o) return;

    if (!this.canEditAlertPrice(o.state, this.alertForm.type)) return;
    const price = Number(this.alertForm.price);
    if (!price || price <= 0) return;

    const a: AlertItem = {
      id: 'al-' + Date.now(),
      type: this.alertForm.type,
      condition: this.alertForm.condition,
      price,
      channel: this.alertForm.channel,
      message: this.alertForm.message || '',
    };

    o.alerts = o.alerts || [];
    o.alerts.unshift(a);

    // TODO: call API add alert
    this.closeDrawer();
  }

  autofillAlertPrice(): void {
    const o = this.drawer.order;
    if (!o) return;
    if (this.alertForm.price !== null && this.alertForm.price !== '') return;

    if (this.alertForm.type === 'ENTRY') this.alertForm.price = o.entry;
    if (this.alertForm.type === 'STOPLOSS') this.alertForm.price = o.sl;
    if (this.alertForm.type === 'TARGET') this.alertForm.price = o.tp;
    if (this.alertForm.type === 'CMP') this.alertForm.price = o.cmp;
  }

  // Confirm bar
  openConfirm(action: ConfirmAction, order: RealOrder): void {
    this.drawer.open = false;
    this.confirm = { open: true, action, order };
  }

  doConfirm(): void {
    const action = this.confirm.action;
    const o = this.confirm.order;
    if (!o) return;

    if (action === 'cancel' && this.canCancel(o.state)) {
      o.state = 'CANCELLED';
    }
    if (action === 'squareoff' && this.canSquareOff(o.state)) {
      // demo: close position
      o.state = 'STOPLOSS_HIT';
    }
    if (action === 'delete' && this.canDelete(o.state)) {
      this.orders = this.orders.filter(x => x.id !== o.id);
    }

    // TODO: call API for cancel/squareoff/delete
    this.confirm.open = false;
    this.recomputeStats();
    this.applyFilters();
  }

  // Rules
  canEditEntry(state: OrderState){ return state === 'PENDING_ENTRY'; }
  canEditSL(state: OrderState){ return state === 'PENDING_ENTRY' || state === 'ACTIVE'; }
  canEditTP(state: OrderState){ return state === 'PENDING_ENTRY' || state === 'ACTIVE'; }
  canEditQty(state: OrderState){ return state === 'PENDING_ENTRY'; }
  canEditOrderType(state: OrderState){ return state === 'PENDING_ENTRY'; }
  canEditValidity(state: OrderState){ return state === 'PENDING_ENTRY'; }

  canCancel(state: OrderState){ return state === 'PENDING_ENTRY'; }
  canSquareOff(state: OrderState){ return state === 'ACTIVE'; }
  canDelete(state: OrderState){
    return state === 'CANCELLED' || state === 'REJECTED' || state === 'TARGET_HIT' || state === 'STOPLOSS_HIT';
  }

  canEditAlertPrice(state: OrderState, type: string): boolean {
    if (state === 'ACTIVE' && type === 'ENTRY') return false;
    if (state === 'TARGET_HIT' || state === 'STOPLOSS_HIT' || state === 'CANCELLED' || state === 'REJECTED') return false;
    return true;
  }

  // Text
  labelState(state: OrderState){
    if(state === 'PENDING_ENTRY') return 'Pending Entry';
    if(state === 'ACTIVE') return 'Active';
    if(state === 'TARGET_HIT') return 'Target Hit';
    if(state === 'STOPLOSS_HIT') return 'Stoploss Hit';
    if(state === 'CANCELLED') return 'Cancelled';
    if(state === 'REJECTED') return 'Rejected';
    return state;
  }

  stateHint(state?: OrderState){
    if(!state) return '';
    if(state === 'PENDING_ENTRY') return 'Entry not hit: you may modify Entry, SL, Target, Qty, OrderType & Validity.';
    if(state === 'ACTIVE') return 'Entry hit: only SL & Target can be modified. Entry & Qty are locked.';
    return 'This order is not editable.';
  }

  alertHint(state: OrderState, type: string){
    if (state === 'PENDING_ENTRY') return 'Entry not hit: alerts allowed for Entry / SL / Target / CMP.';
    if (state === 'ACTIVE' && type === 'ENTRY') return 'Entry hit: Entry alert disabled. Use SL/Target/CMP.';
    if (state === 'ACTIVE') return 'Position open: alerts allowed for SL / Target / CMP.';
    return 'Order closed: alerts disabled.';
  }

  confirmTitle(action: ConfirmAction){
    if(action === 'cancel') return 'Cancel this pending order?';
    if(action === 'squareoff') return 'Square-off this position?';
    return 'Delete this record?';
  }
}