import { Component, ElementRef, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { BehaviorSubject, Subject } from 'rxjs';
// import { debounceTime } from 'rxjs/operators';
import { IDropdownSettings } from 'ng-multiselect-dropdown';
import { HttpClient } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-system-management',
  templateUrl: './system-management.component.html',
  styleUrls: ['./system-management.component.css']
})
export class SystemManagementComponent implements OnInit {
  listData: any[] = [];
  activeMenu: string = 'stock';
  token: string = '';
  stockData: any[] = [];
  showmsg: any;
  watchlist: any[] = [];

  candles: { color: string; height: number, wickHeight: number }[] = [];
  colorInterval: any;
  AddStockForm: FormGroup;
  submittedforAddStock = false;
  filteredListData: any[] = [...this.listData];
  IsLoadingVisible: boolean = false;
  private searchSubject = new BehaviorSubject<string>('');
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  isLoading = true;
  dropdownList: any;
  selectedItems: any;
  dropdownSettings: IDropdownSettings = {};
  highlightedStockNames: string[] = [];
  highlightedStockNamesforSystmAlrt: string[] = [];
  indexData: any;
  WatchlistData: any;
  UserId: any;
  watchlistIds: any;
  watchlistMap: any;
  indexList: any;
  ProcessStockActive: boolean = false;
  SelectedProcessStockId: any;
  SelectedProcessCountryName: any;
  StockList: any;
  filteredStockList: any;
  currentPage: any = 1;
  currentPageforSystmAlrt: any = 1;
  itemsPerPage: number = 10; // default
  totalCount: any;
  searchText: string = '';
  pageSize:any = 10;
  MatchedCount: number = 1;
  pageSizeforSystmAlrt = 10;
  pageSizeOptions = [2, 10, 25, 50, 100];
  SelectedCountryId: any;
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  showAddIndexPanel = false;
  addIndexForm: FormGroup;
  addStockForm: FormGroup;

  showAddStockPanel = false;
  symbolControl = new FormControl('');
  searchSubjectforSystemAlrt = new Subject<string>();
  symbolOptions: string[] = [];
  searchTextforSystemAlrt: string = '';
  selectedIndexIds: string = '';
  TotalCount: any = 0;


  @ViewChildren('stockCell') stockCells!: QueryList<ElementRef>;
  payload: { country_name: string | null; index_id: any; page_no: any; limit: number; stock_tick: string; };
  constructor(
    private toastr: ToastrService,
    private webSocketService: WebSocketService,
    private router: Router,
    private fb: FormBuilder,
    private spinner: NgxSpinnerService,
    private apiService: ApiService,
    private formBuilder: FormBuilder,
    private http: HttpClient
  ) {
    this.addIndexForm = this.fb.group({
      index_name: ['', Validators.required]
    });

  }

  ngOnInit(): void {
    this.getIndexData();
    this.SelectedCountryId = localStorage.getItem('selectedCountryId')
    this.Role = localStorage.getItem('role');
    this.getAllSetStock(true);
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.buildAddStockForm();
    // this.setupSearchSubscription();
    this.getAllIndexes();
    this.PrepDebounce();

  }


  // GetAllStocks() {
  //   this.apiService.getAllStocksService(localStorage.getItem('selectedCountryName')).subscribe(resp => {
  //     if (resp.msg == "success") {
  //       this.StockList = resp.response;
  //       this.filteredStockList = [...resp.response]; // make a copy
  //       console.log("STOCK DATA", this.StockList);
  //       this.currentPage = 1; // reset to first page
  //       this.isLoading=false;
  //     }
  //     else {
  //       this.StockList=[];
  //       this.toastr.error("Failed")
  //     }
  //   })
  // }

  // getAllIndexes(){
  //   this.apiService.getAllIndexes(this.SelectedCountryId).subscribe(resp=>{
  //     if(resp.msg=="success")
  //     {
  //       this.indexList=resp.response;
  //       console.log("Index List",this.indexList);
  //     }
  //     else{
  //       this.toastr.error("Failed")
  //     }
  //   })
  // }

  getIndexData() {
    this.apiService.getIndexService().subscribe(resp => {
      if (resp.msg = "success") {
        this.indexData = resp.response;
        this.dropdownList = this.indexData.map((item: { index_id: any; index_name: any; }) => ({
          item_id: item.index_id,
          item_text: item.index_name
        }));
      }
      else {
        this.toastr.error("Failed")
      }
    })
  }

  onItemSelect(item: any) {
    console.log(item);
  }

  onSelectAll(items: any) {
    console.log(items);
  }

  get h() {
    return this.AddStockForm.controls;
  }
  getAllIndexes(): void {
    this.apiService.getAllIndexes(this.SelectedCountryId).subscribe({
      next: (resp) => {
        if (resp.msg === 'success') {
          this.indexList = resp.response;
        } else {
          this.toastr.error("Failed to load indexes");
        }
      },
      error: (err) => {
        this.toastr.error("API error while fetching indexes");
        console.error(err);
      }
    });
  }

  setupSearchSubscription() {
    this.searchSubject.pipe(debounceTime(300)).subscribe((search) => {
      const trimmed = search.trim().toLowerCase();
      if (!trimmed) {
        this.filteredStockList = [...this.StockList];
      } else {
        this.filteredStockList = this.StockList.filter((stock: { stock_tick: string; y_finance: string }) =>
          stock.stock_tick.toLowerCase().startsWith(trimmed) ||
          stock.y_finance.toLowerCase().startsWith(trimmed)
        );
      }
      this.currentPage = 1; // reset to first page after filtering
    });
  }

  onSearchChange(searchValue: string) {

    this.searchSubject.next(searchValue);
  }

  filterStocks() {

  }

  getTextColor(value: any): string {
    if (!value) return ''; // Handle null or undefined cases

    let cleanedValue = value.toString().match(/-?\d+(\.\d+)?/); // Extract only the number (including decimals)
    let numericValue = cleanedValue ? Number(cleanedValue[0]) : NaN;
    return isNaN(numericValue) ? '' : (numericValue < 0 ? 'text-red' : 'text-green');
  }

  AddStock() {
    this.submittedforAddStock = true;
    this.AddStockForm.markAllAsTouched();
    if (this.AddStockForm.invalid) {
      console.log("INVALID");
      return;
    }
    if (this.AddStockForm.valid) {
      this.spinner.show();
      this.showmsg = "Adding Stock. PLease Wait !!"
      const rawData = this.AddStockForm.value;

      const cleanedData = {
        ...rawData,
        stock_name: rawData.stock_name.trim(),
        y_stock_name: rawData.y_stock_name.trim(),
        index_ids: rawData.index_ids.map((id: string) => +id),
        country: localStorage.getItem('selectedCountryName')  // Convert to number
      };
      console.log("data", cleanedData);
      this.apiService.addstockservice(cleanedData).subscribe(resp => {
        if (resp.msg == "success") {
          console.log("ADD STOCK", resp);
          this.SelectedProcessStockId = resp.response.stock_id;
          this.SelectedProcessCountryName = resp.response.country;
          this.spinner.hide();
          this.ProcessStockActive = true;
          this.toastr.success("New Stock Added Successfully !");
        }
        else {
          this.ProcessStockActive = false;
          this.spinner.hide();
          this.toastr.error("Stock Is Already Exists !");
        }
      });
    }
  }

  PrepDebounce() {

    this.searchSubject.pipe(
      debounceTime(400)
    ).subscribe((value: string) => {
      const trimmed = value.trim().toLowerCase();
      this.searchText = trimmed;
      // this.currentPage = null;
      this.getAllSetStock(true);
    });


    // this.searchSubjectforSystemAlrt.pipe(
    //   debounceTime(400)
    // ).subscribe((value: string) => {
    //   const trimmed = value.trim().toLowerCase();
    //   this.searchTextforSystemAlrt = trimmed;
    //   this.currentPage = null;
    //   this.getAllSetAlert(true);
    // });

  }

  Search() {

    this.currentPage = 1; // Reset to first page on new search
    this.searchSubject.next(this.searchText);
    console.log("Search Text", this.searchText);
    this.getAllSetStock(true);

  }
  processStock() {
    this.showmsg = "Processing Stock. Please Wait !!"
    this.spinner.show();
    this.apiService.processStockService(this.SelectedProcessStockId, this.SelectedProcessCountryName).subscribe(resp => {
      if (resp.msg == "success") {
        this.toastr.success("Processed Successfully !");
        this.ProcessStockActive = false;
        this.spinner.hide();
      }
      else {
        this.spinner.hide();
        this.toastr.error("Failed !");
        this.ProcessStockActive = true;
      }
    }
    )
  }

  dashboard() {
    this.router.navigate(['dashboard']);
  }

  private buildAddStockForm() {
    this.AddStockForm = this.formBuilder.group({
      stock_name: ['', [Validators.required]],
      y_stock_name: ['', [Validators.required]],
      index_ids: [[]]
    })
  }

  onCheckboxChange(event: any) {
    const selectedIndices = this.AddStockForm.get('index_ids')?.value || [];

    if (event.target.checked) {
      selectedIndices.push(event.target.value);
    } else {
      const idx = selectedIndices.indexOf(event.target.value);
      if (idx > -1) {
        selectedIndices.splice(idx, 1);
      }
    }

    this.AddStockForm.get('index_ids')?.setValue(selectedIndices);
    this.AddStockForm.get('index_ids')?.updateValueAndValidity();
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['landing']);
  }

  alerts() {
    this.router.navigate(['alerts']);
  }

  orderList() {
    this.router.navigate(['orderlist']);
  }

  autoorders() {
    this.router.navigate(['auto-order-list']);
  }

  stock_screener() {
    this.router.navigate(['home']);
  }

  news() {
    this.router.navigate(['news']);
  }

  switchMenu(menu: string) {
    this.activeMenu = menu;
  }

  validateToken() {
    console.log('Validating token:', this.token);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }

  ngOnDestroy() {
    console.log("system-management component destroyed. Closing WebSocket connection.");
    this.webSocketService.disconnectList(); // Call the disconnect method
  }

  addToWatchlist(Stock_Id: any) {
    let obj = {
      user_id: localStorage.getItem('UserId'),
      stock_id: Stock_Id,
      country: localStorage.getItem('selectedCountryId'),
    }
    console.log(obj);
    this.apiService.AddToWatchListService(obj).subscribe((res: any) => {
      console.log(res);
      if (res.msg == "success") {
        this.toastr.success('Added to Watchlist');
        // this.getWatchList()
      }
      else {
        this.toastr.error('Already Added to Watchlist');
      }
    })
  }

  removeFromWatchlist(watchlist_id: any) {
    this.apiService.removeFromWatchlist(watchlist_id).subscribe(resp => {
      console.log(resp);
      if (resp.msg == "success") {
        this.toastr.success("Removed !")
        // this.getWatchList()
      }
      else {
        this.toastr.error("Failed !")
      }

    })
  }

  updateCandleData(stock_id: any) {
    this.spinner.show()
    this.apiService.updateCandleDataService(stock_id).subscribe(resp => {
      if (resp.msg == "success") {
        this.toastr.success("Candle Data Updated !")
        this.getAllSetStock(true);
        this.spinner.hide()
      }
      else {
        this.toastr.error("Updateion Failed !")
        this.getAllSetStock(true);
        this.spinner.hide()
      }
    })
  }

  deleteStock(stock_id: any) {
    const confirmed = confirm('Are you sure you want to delete this stock?');
    if (confirmed) {
      this.spinner.show();
      this.apiService.deleteStockService(stock_id, localStorage.getItem('selectedCountryName'))
        .subscribe(resp => {
          this.spinner.hide();
          if (resp.msg === "success") {
            this.toastr.success("Deleted Successfully !");
          } else {
            this.toastr.error("Failed !");
          }
          this.getAllSetStock(true);
        });
    }
  }

  // get paginatedStockList() {
  //   const startIndex = (this.currentPage - 1) * this.itemsPerPage;
  //   const endIndex = startIndex + this.itemsPerPage;
  //   return this.filteredStockList.slice(startIndex, endIndex);
  // }

  // get totalPages() {
  //   return Math.ceil(this.filteredStockList.length / this.itemsPerPage);
  // }

  sortData(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.filteredStockList.sort((a: any, b: any) => {
      let valueA = a[column];
      let valueB = b[column];

      if (column === 'is_active') {
        valueA = a[column] == '1' || a[column] == 1 ? 'Active' : 'Inactive';
        valueB = b[column] == '1' || b[column] == 1 ? 'Active' : 'Inactive';
      }

      if (typeof valueA === 'string') {
        return this.sortDirection === 'asc'
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA);
      }

      return this.sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    });
  }

  toggleProc(stockId: number, event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const isChecked = inputElement.checked;

    if (stockId == null) return;

    const newValue = isChecked ? 1 : 0;

    const stock = this.filteredListData.find((s: { id: number; }) => s.id === stockId);
    console.log("STOCK", stock)
    if (!stock) return;
    let status = false;
    stock.is_proc = newValue;
    if (newValue == 0) {
      status = false;
    }
    else {
      status = true;
    }
    this.spinner.show()
    console.log("NEW VALUE", newValue)
    this.apiService.tradeSignal(localStorage.getItem('selectedCountryName'), stockId, status).subscribe(resp => {
      this.getAllSetStock(true);
      this.spinner.hide()
    })
  }

  openAddIndexModal(): void {
    this.router.navigate(['add_index']);
  }

  closeAddIndexPanel(): void {
    this.showAddIndexPanel = false;
  }

  submitIndex(): void {
    if (this.addIndexForm.valid) {
      const indexData = this.addIndexForm.value;
      console.log('Submitting index:', indexData);
      this.closeAddIndexPanel();
    }
  }
  onIndexChange(event: any) {
    console.log("Selected Index IDs", event);
    const selectedIndexIds = event;
    if (selectedIndexIds) {
      this.selectedIndexIds = selectedIndexIds;
      console.log("Selected Index IDs", this.selectedIndexIds);
      this.currentPage = 1; // Reset to first page on new selection
      this.getAllSetStock(true);
    } else {
      this.selectedIndexIds = '';
      this.getAllSetStock(true);
    }
  }


  openAddStockModal() {
    this.router.navigate(['add_stock']);
  }

  goToNextPage() {

    const totalPages = this.getTotalPages();
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.getAllSetStock(true);
    }



  }

  goToPreviousPage() {
    this.currentPage--;
    this.getAllSetStock(true);
  }

  isHighlighted(stockName: string): boolean {
    return this.highlightedStockNames
      .some(name => name.toLowerCase() === stockName.toLowerCase());
  }

  isHighlightedforSystmAlrt(stockName: string): boolean {
    return this.highlightedStockNamesforSystmAlrt
      .some(name => name.toLowerCase() === stockName.toLowerCase());
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


    // const totalPages = this.getTotalPagesforSystmAlert();
    // const currentPage = this.getCurrentPageforSystmAlrt();
    // const maxVisible = 5;
    // let startPage = Math.max(currentPage - Math.floor(maxVisible / 2), 1);
    // let endPage = Math.min(startPage + maxVisible - 1, totalPages);
    // if (endPage - startPage < maxVisible - 1) {
    //   startPage = Math.max(endPage - maxVisible + 1, 1);
    // }
    // const pageNumbers: number[] = [];
    // for (let i = startPage; i <= endPage; i++) {
    //   pageNumbers.push(i);
    // }
    // return pageNumbers;

  }

  onSearchInput(value: string) {
    this.searchSubject.next(value);
    console.log("Search Text", this.searchText);
  }

  onSearchInputforSystmAlrt(value: string) {
    this.searchSubjectforSystemAlrt.next(value);
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.getAllSetStock(true);
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.getAllSetStock(true);
  }

  getTotalPages(): number {
    return Math.ceil(this.TotalCount / this.pageSize);
  }

  getTotalPagesforSystmAlert(): number {
    return Math.ceil(this.TotalCount / this.pageSizeforSystmAlrt);
  }

  getCurrentPage(): number {
    return this.currentPage;

  }

  getCurrentPageforSystmAlrt(): number {
    return this.currentPage;
  }

  getAllSetStock(highlight: boolean = false) {
    this.spinner.show();
      if(this.searchText)
      {
        this.currentPage=""
      }

    this.payload = {
      country_name: localStorage.getItem("selectedCountryName"),
      index_id: this.selectedIndexIds.length > 0 ? this.selectedIndexIds : '',
      page_no: this.currentPage != null ? this.currentPage.toString() : '',
      limit: this.pageSize,
      stock_tick: this.searchText,
    };


    console.log("Payload", this.payload);

    this.apiService.getStockListByIndex(this.payload).subscribe(resp => {
      console.log("After Payload", this.payload);
      console.log("After Resp get all set alert", resp)
      this.spinner.hide();
      if (resp.msg === "success") {
        const parsedData = typeof resp === 'string' ? JSON.parse(resp) : resp;
        this.filteredListData = resp.response.stocks;
        console.log("Filtered List Data", this.filteredListData);
        this.TotalCount = resp.response.total_stocks;
        console.log("Filtert total count", this.TotalCount);


        const searchText = this.searchText || this.searchTextforSystemAlrt;

        // Highlight if search matches
        if (highlight && searchText) {
          const lowerSearch = searchText.trim().toLowerCase();

          const matches = this.filteredListData.filter((item: { stock_tick: string }) =>
            item.stock_tick?.toLowerCase().includes(lowerSearch)
          );

          this.MatchedCount = matches.length;
          this.highlightedStockNames = matches.map((item: { stock_tick: any; }) => item.stock_tick);
          this.highlightedStockNamesforSystmAlrt = matches.map((item: { stock_tick: any; }) => item.stock_tick);  //newadded

          if (matches.length > 0) {
            const firstMatchName = matches[0].stock_tick;
            this.currentPage = resp.response.page_no
            setTimeout(() => {
              const target = this.stockCells.find((cell: { nativeElement: { getAttribute: (arg0: string) => string; }; }) =>
                cell.nativeElement
                  .getAttribute('data-stock')
                  ?.toLowerCase() === firstMatchName.toLowerCase()
              );

              if (target) {
                target.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          } else {
            this.highlightedStockNames = [];
            this.highlightedStockNamesforSystmAlrt = [];
          }
        } else {
          this.highlightedStockNames = [];
          this.highlightedStockNamesforSystmAlrt = [];
          this.MatchedCount = 0;
        }
      } else {
        this.toastr.error("Failed to fetch alerts");
        this.MatchedCount = 0;
        this.TotalCount = 0;
      }
    });
  }

}
