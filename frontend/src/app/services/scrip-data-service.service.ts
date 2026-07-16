import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ScripDataServiceService {

   private scrips: any[] = [];
   private CustomObject: any[] = [];

   private Futurescrips: any[] = [];

 setScrips(data: any[]) {
    this.scrips = data;
    localStorage.setItem('scrips', JSON.stringify(data));  // ✅ store in localStorage
  }

  setScripsForNSEFO(data: any[]) {
    this.Futurescrips = data;
    localStorage.setItem('Futurescrips', JSON.stringify(data));  // ✅ store in localStorage for NSEFO
  }

  getScrips(): any[] {
    // If memory copy is empty, try to load from localStorage
    if (this.scrips.length === 0) {
      const stored = localStorage.getItem('scrips');
      if (stored) {
        this.scrips = JSON.parse(stored);
      }
    }
    return this.scrips;
  }

  clearScrips() {
    this.scrips = [];
    localStorage.removeItem('scrips');  // ✅ clear from storage
  }

      getScripsForNSEFO(): any[] {
    // If memory copy is empty, try to load from localStorage
    if (this.Futurescrips.length === 0) {
      const stored = localStorage.getItem('Futurescrips');
      if (stored) {
        this.Futurescrips = JSON.parse(stored);
      }
    }
    return this.Futurescrips;
  }

  clearScripsForNSEFO() {
    this.Futurescrips = [];
    localStorage.removeItem('Futurescrips');  // ✅ clear from storage
  }


  setCustomeObject(data: any[]) {
    localStorage.setItem('CustomObject', JSON.stringify(data));  // ✅ store in localStorage
  }

  getCustomObjectData(): any[] {
    // If memory copy is empty, try to load from localStorage
      const stored = localStorage.getItem('CustomObject');
      if (stored) {
        this.CustomObject = JSON.parse(stored);
      }
    return this.CustomObject;
  }
  
  constructor() { }
}
