import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HeaderTriggerService {
  private _refreshNotif$ = new Subject<void>();
  refreshNotif$ = this._refreshNotif$.asObservable();

  triggerNotificationRefresh() {
    this._refreshNotif$.next();
  }
}
