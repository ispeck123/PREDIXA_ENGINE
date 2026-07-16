// country.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { filter, finalize, map, shareReplay, switchMap, take, tap } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface Country { id: any; country_name: string; flag?: string; country_id: string; }

@Injectable({ providedIn: 'root' })
export class CountryService {
  private _countries$ = new BehaviorSubject<Country[]>([]);
  private _selectedCountry$ = new BehaviorSubject<Country | null>(null);

  countries$ = this._countries$.asObservable();
  selectedCountry$ = this._selectedCountry$.asObservable(); // dashboard should subscribe to this

 constructor(private api: ApiService) {
  const savedId   = localStorage.getItem('selectedCountryId');   // ✅ restore id
  const savedName = localStorage.getItem('selectedCountryName');
  const savedFlag = localStorage.getItem('selectedCountryFlag') || undefined;

  if (savedId || savedName) {
    this._selectedCountry$.next({
      id: savedId,                    // keep if you still use `id` elsewhere
      country_id: savedId ?? '',      // ✅ include country_id
      country_name: savedName ?? '',
      flag: savedFlag
    } as Country);
  }
}


  /** Load countries and ensure a selected country is set (restore or default). */
  init(userId: any): Observable<Country> {
    return this.api.getCountryAccessService(userId).pipe(
      tap((res: any) => this._countries$.next(res.response || [])),
      map((res: any) => {
        const list: Country[] = res.response || [];
        const savedName = localStorage.getItem('selectedCountryName');
        let selected = this._selectedCountry$.value;

        if (savedName) {
          selected = list.find(c => c.country_name === savedName) ?? selected;
        }
        if (!selected && list.length) selected = list[0];

        if (selected) this.setSelectedCountry(selected);
        return selected!;
      }),
      shareReplay(1)
    );
  }

  /** Ensure we have a real selected country (waits until set). */
  ensureSelected(userId: any): Observable<Country> {
    if (this._selectedCountry$.value && this._countries$.value.length) {
      return of(this._selectedCountry$.value!);
    }
    // If countries not loaded yet, load then emit the first real selected value.
    return this.init(userId).pipe(
      switchMap(() => this.selectedCountry$.pipe(filter(Boolean), take(1)))
    );
  }

  setSelectedCountry(c: Country): void {
    this._selectedCountry$.next(c);
    localStorage.setItem('selectedCountryName', c.country_name);
    localStorage.setItem('selectedCountryId', c.country_id);
    if (c.flag) localStorage.setItem('selectedCountryFlag', c.flag);
  }
}
