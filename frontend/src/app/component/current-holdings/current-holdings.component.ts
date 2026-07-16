import { Component, ElementRef, HostListener, QueryList, ViewChildren } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import moment from 'moment';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';
import { WebSocketService } from 'src/app/services/web-socket.service';

@Component({
  selector: 'app-current-holdings',
  templateUrl: './current-holdings.component.html',
  styleUrls: ['./current-holdings.component.css']
})
export class CurrentHoldingsComponent {

  Role: any;
  isAdmin: any;
  UserName: any;
  pageSize = 10;
  SelectedCountryId: any;
  SelectedCountryName: any;
  selectedDateRange: any;
  StartDate: any;
  EndDate: any
  showmsg: any;
  UserID: any;
  searchText: string = '';
  currentPage: any = 1;
  AllHoldings: any;
  overAll: any;
  colorInterval: any;
  TotalCount: any = 0;
  pageSizeOptions = [2, 10, 25, 50, 100, 500];
  SearchDebounceFlag: boolean = false;
  highlightedStockNames: string[] = [];
  MatchedCount: number = 0;
  candles: { color: string; height: number, wickHeight: number }[] = [];
  searchSubject: Subject<string> = new Subject<string>();
  currentStatus: any="running";
  isPopupOpen = false;
  IsLoadingVisible: boolean = false;
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  pendingGttOrders: any[] = [];
  ordersBySymbol: { [key: string]: any[] } = {};
  expandedHoldingSymbol: string | null = null;
  selectedGttOrder: any = null;
  showModifyGttModal = false;


  

  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  private searchSubscription: Subscription;
  constructor(private fb: FormBuilder,private webSocketService: WebSocketService, private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService) { }

  modifyGttForm = this.fb.group({
    id: [''],
    qty: [0],
    entry: [0],
    tp: [0],
    sl: [0],
    type: ['']
  });

  ngOnDestroy(): void {
    this.disconnectWebSocket();
  }

  disconnectWebSocket(): void {
    this.webSocketService.disconnectHoldingListSocket();
  }

  normalizeGttSymbol(symbol: string): string {
    if (!symbol) return '';
    const parts = symbol.split(':');
    const exchangePart = parts.length > 1 ? parts[1] : parts[0];
    return exchangePart.replace('-EQ', '').trim().toUpperCase();
  }

  loadPendingGttOrders() {
    this.apiService.getPendingGttOrders().subscribe({
      next: (resp: any[]) => {
        this.pendingGttOrders = resp || [];
        this.groupOrdersBySymbol();
      },
      error: (err) => {
        console.error('Error loading pending GTT orders', err);
        this.pendingGttOrders = [];
        this.ordersBySymbol = {};
      }
    });
  }

  groupOrdersBySymbol() {
    this.ordersBySymbol = {};

    for (const order of this.pendingGttOrders) {
      const normalizedSymbol = this.normalizeGttSymbol(order.symbol);

      if (!this.ordersBySymbol[normalizedSymbol]) {
        this.ordersBySymbol[normalizedSymbol] = [];
      }

      this.ordersBySymbol[normalizedSymbol].push(order);
    }
  }

  toggleHoldingOrders(symbol: string) {
    this.expandedHoldingSymbol =
      this.expandedHoldingSymbol === symbol ? null : symbol;
  }

  getOrdersForHolding(symbol: string): any[] {
    const normalizedSymbol = this.normalizeGttSymbol(symbol);
    return this.ordersBySymbol[normalizedSymbol] || [];
  }

  hasOrdersForHolding(symbol: string): boolean {
    return this.getOrdersForHolding(symbol).length > 0;
  }

  getSideLabel(side: number): string {
    return side === 1 ? 'BUY' : side === -1 ? 'SELL' : '-';
  }

  getOcoLabel(oco: number): string {
    return oco === 1 ? 'Single' : oco === 2 ? 'OCO' : '-';
  }

  openModifyGtt(order: any) {
    this.selectedGttOrder = { ...order };
    this.showModifyGttModal = true;

    const type = this.getOcoLabel(order.gtt_oco_ind); // Single or OCO

    this.modifyGttForm.patchValue({
      id: order.gtt_id || '',
      qty: order.qty || 0,
      entry: type === 'Single' ? (order.price_trigger || 0) : 0,
      tp: type === 'OCO' ? (order.price_trigger || 0) : 0,
      sl: type === 'OCO' ? (order.price2_trigger || 0) : 0,
      type: type
    });
  }

  closeModifyGttModal() {
    this.showModifyGttModal = false;
    this.selectedGttOrder = null;
    this.modifyGttForm.reset({
      id: '',
      qty: 0,
      entry: 0,
      tp: 0,
      sl: 0,
      type: ''
    });
  }

  buildModifyGttPayload() {
    const formValue = this.modifyGttForm.value;
    const type = formValue.type;

    const payload: any = {
      id: formValue.id,
      qty: Number(formValue.qty || 0),
      entry: 0,
      sl: 0,
      tp: 0
    };

    if (type === 'Single') {
      payload.entry = Number(formValue.entry || 0);
    } else if (type === 'OCO') {
      payload.tp = Number(formValue.tp || 0);
      payload.sl = Number(formValue.sl || 0);
    }

    return payload;
  }

  submitModifyGtt() {
    const payload = this.buildModifyGttPayload();

    if (!payload.id) {
      alert('GTT ID is missing');
      return;
    }

    if (!payload.qty || payload.qty <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }

    if (this.modifyGttForm.value.type === 'Single' && (!payload.entry || payload.entry <= 0)) {
      alert('Entry must be greater than 0');
      return;
    }

    if (this.modifyGttForm.value.type === 'OCO') {
      if (!payload.tp || payload.tp <= 0) {
        alert('TP must be greater than 0');
        return;
      }

      if (!payload.sl || payload.sl <= 0) {
        alert('SL must be greater than 0');
        return;
      }
    }

    this.apiService.modifyGttOrder(payload).subscribe({
      next: (resp: any) => {
        const fyersResp = resp?.fyers_response;

        if (fyersResp?.s === 'error') {
          this.toastr.error(fyersResp?.message || 'GTT modification failed');
          return;
        }

        this.toastr.success(resp?.message || 'GTT order modified successfully');
        this.closeModifyGttModal();
        this.loadPendingGttOrders();
      },
      error: (err) => {
        console.error('Modify GTT failed', err);
        this.toastr.error(err?.error?.message || 'Failed to modify GTT order');
      }
    });
  }

  CancelGtt(order: any) {
  if (!order?.gtt_id) {
    this.toastr.error('GTT ID not found');
    return;
  }

  const confirmCancel = confirm(`Do you want to cancel GTT order ${order.gtt_id}?`);
  if (!confirmCancel) return;

  this.apiService.cancelGttOrder(order.gtt_id).subscribe({
    next: (resp: any) => {
      console.log('Cancel GTT response:', resp);

      if (resp?.fyers_response?.s === 'error') {
        this.toastr.error(resp?.fyers_response?.message || 'Failed to cancel GTT order');
        return;
      }

      this.toastr.success(resp?.message || 'GTT order cancelled successfully');

      this.loadPendingGttOrders();

      if (this.expandedHoldingSymbol) {
        const current = this.expandedHoldingSymbol;
        const remainingOrders = this.getOrdersForHolding(current);
        if (!remainingOrders || remainingOrders.length === 0) {
          this.expandedHoldingSymbol = null;
        }
      }
    },
    error: (err) => {
      console.error('Cancel GTT error:', err);
      this.toastr.error(err?.error?.message || 'Error while cancelling GTT order');
    }
  });
}

  ngOnInit(): void {
    this.SelectedCountryId = localStorage.getItem('selectedCountryId')
    this.SelectedCountryName = localStorage.getItem('selectedCountryName')
    this.selectedDateRange = {
      startDate: moment().startOf('year'),     // January 1st, current year
      endDate: moment().endOf('year')          // December 31st, current year
    };
    this.StartDate = this.selectedDateRange.startDate.format('YYYY-MM-DD');
    this.EndDate = this.selectedDateRange.endDate.format('YYYY-MM-DD');
    this.Role = localStorage.getItem('role');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.UserID = localStorage.getItem('UserId');
    this.PrepDebounce();
    this.connectWebSocket(false);
    this.loadPendingGttOrders();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent) {
    const clickedInsidePopup = (event.target as HTMLElement).closest('.filter-popup');
    const clickedOnButton = (event.target as HTMLElement).closest('.filter-btn');

    if (!clickedInsidePopup && !clickedOnButton) {
      this.isPopupOpen = false;
    }
  }

  connectWebSocket(highlight: boolean = false) {
    // this.filteredListData = [];
    this.webSocketService.disconnectHoldingListSocket();
    this.IsLoadingVisible = true;

    this.webSocketService.connectHoldinglistOrders(this.searchText, this.currentPage, this.pageSize);

    this.webSocketService.getHoldingListData().subscribe((data) => {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

        this.AllHoldings = parsedData.holdings || [];
        this.TotalCount = parsedData.overall.count_total || 0;
        this.overAll = parsedData.overall || 0;
        this.IsLoadingVisible = false;

        if (highlight && this.searchText) {
          const lowerSearch = this.searchText.trim().toLowerCase();

          const matches = this.AllHoldings.filter((item: { symbol: string }) =>
            item.symbol?.toLowerCase().includes(lowerSearch)
          );

          this.MatchedCount = matches.length;
          this.highlightedStockNames = matches.map((item: { symbol: any; }) => item.symbol);

          if (matches.length > 0) {
            const firstMatchName = matches[0].symbol;

            setTimeout(() => {
              const target = this.stockCells.find(cell =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === firstMatchName.toLowerCase()
              );

              if (target) {
                this.currentPage = parsedData.page_no
                target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          } else {
            this.highlightedStockNames = [];
          }
        } else {
          this.highlightedStockNames = [];
          this.MatchedCount = 0;
        }

      } catch (error) {
        console.error("Error parsing WebSocket data:", error);
        this.AllHoldings = [];
        this.IsLoadingVisible = false;
      }
    });
  }

  isHighlighted(stockName: string): boolean {
    return this.highlightedStockNames
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  goToNextPage() {
    const totalPages = this.getTotalPages();
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.connectWebSocket(true);
    }
  }

  goToPreviousPage() {
    this.currentPage--;
    this.connectWebSocket(true);
  }

  getTotalPages(): number {
    const total = this.TotalCount || 0;
    return Math.ceil(total / this.pageSize);
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const currentPage = this.getCurrentPage();

    const maxVisible = 5;
    let startPage = Math.max(currentPage - Math.floor(maxVisible / 2), 1);
    let endPage = Math.min(startPage + maxVisible - 1, totalPages);

    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(endPage - maxVisible + 1, 1);
    }

    const pageNumbers: number[] = [];
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return pageNumbers;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.connectWebSocket(true);
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.connectWebSocket(true);
  }

    PrepDebounce() {
    this.searchSubject.pipe(
      debounceTime(400)
    ).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchText = trimmed;
      this.currentPage = null;
      this.connectWebSocket(true);
    });
  }

  onSearchInput(value: string) {
    // this.SearchDebounceFlag = true;
    this.searchSubject.next(value);
  }

    onCurrentStatusTypeChange() { 
    if(this.currentStatus=="running")
    {
      this.connectWebSocket(false);
    }
    else
    {

    }

  }

  togglePopsup() {
    this.isPopupOpen = !this.isPopupOpen;
  }

  openPopup() {
    this.isPopupOpen = true;
  }

  resetFilter() {
  }

  sortTable(column: string): void {
  if (this.sortColumn === column) {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    this.sortColumn = column;
    this.sortDirection = 'asc';
  }

  this.AllHoldings = [...this.AllHoldings].sort((a: any, b: any) => {
    let valueA = a[column];
    let valueB = b[column];

    if (column === 'symbol') {
      valueA = (valueA || '').toString().toLowerCase();
      valueB = (valueB || '').toString().toLowerCase();

      if (this.sortDirection === 'asc') {
        return valueA.localeCompare(valueB);
      } else {
        return valueB.localeCompare(valueA);
      }
    } else {
      valueA = Number(valueA) || 0;
      valueB = Number(valueB) || 0;

      if (this.sortDirection === 'asc') {
        return valueA - valueB;
      } else {
        return valueB - valueA;
      }
    }
  });
}


  toggleRowSelection(item: any, event: any) {
    item.selected = event.target.checked;
  }

  toggleSelectAll(event: any) {
    const checked = event.target.checked;
    this.AllHoldings.forEach((item: any) => {
      item.selected = checked;
    });
  }

  isAllSelected(): boolean {
    return this.AllHoldings?.length > 0 &&
          this.AllHoldings.every((item: any) => item.selected);
  }

  isSomeSelected(): boolean {
    return this.AllHoldings?.some((item: any) => item.selected);
  }

  getSelectedHoldingIds(): string[] {
    return this.AllHoldings
      .filter((item: any) => item.selected)
      .map((item: any) => item.id);
  }

  exitSelectedPositions() {
    const selectedIds = this.getSelectedHoldingIds();

    if (!selectedIds.length) {
      this.toastr.warning('Please select at least one holding');
      return;
    }

    const payload = {
      ids: selectedIds
    };

    console.log("Exit positions payload:", payload);

    // this.apiService.exitPositions(payload).subscribe({
    //   next: (resp: any) => {
    //     console.log('Exit positions response:', resp);
    //     this.toastr.success(resp?.message || 'Selected positions exit request sent successfully');
    //     this.connectWebSocket(false);
    //   },
    //   error: (err) => {
    //     console.error('Exit positions error:', err);
    //     this.toastr.error(err?.error?.message || 'Failed to exit selected positions');
    //   }
    // });
  }

  hasAnyHoldingSelected(): boolean {
    return this.AllHoldings?.some((item: any) => item.selected);
  }

}
