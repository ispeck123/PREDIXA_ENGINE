import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface UiNotification {
  id: any;
  fullText: string;
  stock_tick: string;
  read: boolean;
}

export interface UiStockNotification {
  id: any;
  fullText: string;
  stock_tick: string;
  read: boolean;
  alertType:'BUY' | 'SELL' | string;
  notification_type : string;
  trade_signal_id:any;
  exchange:any;
  timeframe:any;
}
export interface UiPopup {
  id: any;
  message: string;
  stock_tick: string;
}

export interface NotificationState {
  raw: any[];
  notifications: UiNotification[];
  popups: UiPopup[];
  unreadCount: number;
}

export interface StockNotificationState {
  notifications: UiStockNotification[];
  unreadCount: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private shownPopupIds = new Set<any>();

  private stateSubject = new BehaviorSubject<NotificationState>({
    raw: [],
    notifications: [],
    popups: [],
    unreadCount: 0,
  });

  private stateStockSubject = new BehaviorSubject<StockNotificationState>({
    notifications: [],
    unreadCount: 0,
  });

  /** Subscribe from header or any component */
  state$: Observable<NotificationState> = this.stateSubject.asObservable();
  stateStock$: Observable<StockNotificationState> = this.stateStockSubject.asObservable();

  constructor(private apiService: ApiService) {}

  /** Call this whenever you want to refresh notifications (FCM trigger / on load) */
  refreshHistory(): void {
    const userId = localStorage.getItem('UserId');
    const countryId = localStorage.getItem('selectedCountryId');

    if (!userId || !countryId) {
      console.warn('[NotificationCenter] Missing UserId or selectedCountryId');
      this.stateSubject.next({
        raw: [],
        notifications: [],
        popups: [],
        unreadCount: 0,
      });
      return;
    }

    this.apiService.historyAlertService(userId, countryId).subscribe({
      next: (res: any) => {
        const notifList: any[] = res?.response?.data ?? [];

        // notifList.sort((a: any, b: any) => {
        //   const da = new Date(a.notification_sent_at || a.created_at || 0).getTime();
        //   const db = new Date(b.notification_sent_at || b.created_at || 0).getTime();
        //   return db - da;
        // });

        const popups: UiPopup[] = [];

        const notifications: UiNotification[] = notifList.map((n: any) => {
          const dt = new Date(n.notification_sent_at || n.created_at);
          const formattedDate =
            ('0' + dt.getDate()).slice(-2) + '/' +
            ('0' + (dt.getMonth() + 1)).slice(-2) + '/' +
            dt.getFullYear().toString().slice(-2) + ' ' +
            ('0' + dt.getHours()).slice(-2) + ':' +
            ('0' + dt.getMinutes()).slice(-2) + ':' +
            ('0' + dt.getSeconds()).slice(-2);

          const cond = n.condition === 0 ? '<=' : '>=';

          const finalMsg =
            `${formattedDate} : ${n.stock_symbol} has hit target ${cond} ${n.threshold} : ${n.message}`;

          // popup only once for unread
          if (n.notification_seen === 0 && !this.shownPopupIds.has(n.id)) {
            this.shownPopupIds.add(n.id);
            popups.push({
              id: n.id,
              message: finalMsg,
              stock_tick: n.stock_symbol,
            });
          }

          return {
            id: n.id,
            fullText: finalMsg,
            stock_tick: n.stock_symbol,
            read: n.notification_seen === 1,
          };
        });

        const unreadCount = notifications.filter(n => !n.read).length;

        this.stateSubject.next({
          raw: notifList,
          notifications,
          popups,
          unreadCount,
        });
      },
      error: (err) => {
        console.error('[NotificationCenter] History alert API error:', err);
      },
    });
  }

  /** Optional: if you want to clear popup tracking (e.g., on logout) */
  resetPopupTracking(): void {
    this.shownPopupIds.clear();
  }

  refreshStockHistory(): void {
    const userId = localStorage.getItem('UserId');
    const countryId = localStorage.getItem('selectedCountryId');
  
    if (!userId || !countryId) {
      console.warn('[NotificationCenter] Missing UserId or selectedCountryId');
      this.stateStockSubject.next({ notifications: [], unreadCount: 0 });
      return;
    }
  
    this.apiService.historyStockService(userId, countryId).subscribe({
      next: (res: any) => {
        const notifList: any[] = res?.response?.data ?? [];
        const notifications: UiStockNotification[] = notifList.map((n: any) => {
          // 1) choose datetime field
          const rawDt = n.notification_sent_at;
          const dt = rawDt ? new Date(rawDt) : new Date();
  
          // dd/MM/yy HH:mm:ss
          const formattedDate =
            ('0' + dt.getDate()).slice(-2) + '/' +
            ('0' + (dt.getMonth() + 1)).slice(-2) + '/' +
            dt.getFullYear().toString().slice(-2) + ' ' +
            ('0' + dt.getHours()).slice(-2) + ':' +
            ('0' + dt.getMinutes()).slice(-2) + ':' +
            ('0' + dt.getSeconds()).slice(-2);
  
          // 2) build message parts
          const symbol = n.stock_symbol ?? '';
          const alertType = (n.alert_type ?? '').toUpperCase(); // BUY / SELL


  
          // notification_type examples: entry_hit, target_hit, stoploss_hit ...
          const notifTypeRaw = (n.notification_type ?? '').toString();
          const notifType =
            notifTypeRaw === 'entry_hit' ? 'entry' :
            notifTypeRaw === 'target_hit' ? 'target' :
            notifTypeRaw === 'stoploss_hit' ? 'stoploss' :
            notifTypeRaw.replace(/_/g, ' '); // fallback

          
          const isRead =
          notifTypeRaw === 'entry_hit'
            ? Number(n.entry_notification_seen ?? 0) === 1
            : (notifTypeRaw === 'stoploss_hit' || notifTypeRaw === 'target_hit')
              ? Number(n.stoploss_target_notification_seen ?? 0) === 1
              : false; // fallback for unknown types
  
          // 3) pick which price to show based on notification_type
          let priceLabel = 'price';
          let priceValue: any = null;
  
          if (notifTypeRaw === 'entry_hit') {
            priceLabel = 'entry';
            priceValue = n.entry_price;
          } else if (notifTypeRaw === 'target_hit') {
            priceLabel = 'target';
            priceValue = n.target_price;
          } else if (notifTypeRaw === 'stoploss_hit') {
            priceLabel = 'stoploss';
            priceValue = n.stoploss_price;
          } else {
            // default fallback
            priceLabel = 'entry';
            priceValue = n.entry_price;
          }
  
          const fullText =
            `${formattedDate} : ${symbol} has hit ${notifType} ${priceValue}`;
  
          return {
            id: n.id,
            fullText,
            stock_tick: n.stock_tick || symbol,
            read: isRead,
            alertType,
            notification_type : notifTypeRaw,
            trade_signal_id: n.trade_signal_id,
            exchange:n.exchange,
            timeframe:n.timeframe
          };
        });
  
        const unreadCount = notifications.filter(x => !x.read).length;
        this.stateStockSubject.next({
          notifications,
          unreadCount,
        });
      },
      error: (err) => {
        console.error('[NotificationCenter] History stock API error:', err);
        this.stateStockSubject.next({ notifications: [], unreadCount: 0 });
      },
    });
  }
  
}
