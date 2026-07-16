import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ZIndexManagerService {
  private currentZIndex = 999999;  // Starting point for modals

  getNextZIndex(): number {
    return ++this.currentZIndex;
  }
}
