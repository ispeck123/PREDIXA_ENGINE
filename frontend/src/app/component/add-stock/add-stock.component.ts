import { query } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-add-stock',
  templateUrl: './add-stock.component.html',
  styleUrls: ['./add-stock.component.css']
})
export class AddStockComponent implements OnInit {
  NewsData: any;
  candles: { color: string; height: number; wickHeight: number }[] = [];
  showmsg: any;
  colorInterval: any;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  currentPage: number = 1;
  pageSize: number = 10;
  addStockForm: FormGroup;
  selectedIndexIds: number[] = [];
  selectedstockname: any[] = [];
  showAddStockPanel = false;
  symbol = new FormControl('');
  symbolOptions: any[] = [];
  indexData: any;
  indexList: any[] = [];
  SelectedCountryId: any;
  dropdownOpen = false;
  selectedItems: any[] = [];
  isDropdownVisible: boolean = false;
  dropdownSettings: any = {};
  dropdownSettingsforstock: any = {};
  @ViewChild('symbolDropdown', { static: false }) symbolDropdown: ElementRef;
  @ViewChild('indexDropdown', { static: false }) indexDropdown: ElementRef;
  ProcessStockFlag = false;
  SelectedCountryName: any;





  constructor(
    private apiService: ApiService,
    private http: HttpClient,
    private fb: FormBuilder,
    private router: Router,
    private spinner: NgxSpinnerService,
    private toastr: ToastrService
  ) {
    // this.addStockForm = this.fb.group({
    //   stock_name: ['', Validators.required],
    //   symbol: ['', Validators.required],
    // });
    //  console.log("nnnnnnnnnnnn",this.addStockForm)
  }


  ngOnInit(): void {
    this.Role = localStorage.getItem('role');
    this.SelectedCountryId = localStorage.getItem('selectedCountryId');
    this.UserName = localStorage.getItem('UserName');
    this.SelectedCountryName = localStorage.getItem('selectedCountryName');
    this.isAdmin = this.Role === "admin";
    this.initializeDropdownSettings();
    this.initializeDropdownSettingsforstock();

    this.fetchSymbols('');
    this.createForm();
    this.getAllIndexes();

  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown')) {
      this.dropdownOpen = false;
    }
  }
  createForm() {
    this.addStockForm = this.fb.group({
      stock_name: [''],
      symbol: ['', Validators.required],
      table_name: [[]] // No Validators.required
    });
  }


  initializeDropdownSettings() {
    this.dropdownSettings = {
      singleSelection: false,
      idField: 'index_id',
      textField: 'index_name',
      selectAllText: 'Select All',
      unSelectAllText: 'Unselect All',
      itemsShowLimit: 5,
      allowSearchFilter: true
    };
  }

  initializeDropdownSettingsforstock() {

    this.dropdownSettingsforstock = {
      singleSelection: true,
      idField: 'symbol',
      textField: 'symbol',
      allowSearchFilter: true,
      closeDropDownOnSelection: true
    };

  }

  onSymbolDropdownOpen() {
    setTimeout(() => {
      const searchInput: HTMLInputElement | null =
        document.querySelector('.multiselect-dropdown .filter-textbox input');
      console.log(searchInput)
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }
  onIndexDropdownOpen(): void {
    setTimeout(() => {
      const searchInput =
        document.querySelector('.multiselect-dropdown .filter-textbox input') as HTMLInputElement;

      console.log('Search Input:', searchInput);

      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }


  getAllIndexes() {
    this.apiService.getAllIndexes(this.SelectedCountryId).subscribe(resp => {
      if (resp.msg === "success") {
        this.indexList = resp.response;
      } else {
        this.toastr.error("Failed to load indexes");
      }
    });
  }

  // GetNews() {
  //   this.showmsg = "Fetching Latest News";
  //   this.spinner.show();
  //   this.apiService.getNewsService().subscribe((data) => {
  //     this.spinner.hide();
  //     this.NewsData = data.response.news.sort((a: any, b: any) => {
  //       return new Date(b.published).getTime() - new Date(a.published).getTime();
  //     });
  //   });
  // }

  get paginatedNews(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.NewsData.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.NewsData.length / this.pageSize);
  }

  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  dashboard() { this.router.navigate(['dashboard']); }
  logout() { localStorage.clear(); this.router.navigate(['landing']); }
  orderList() { this.router.navigate(['orderlist']); }
  alerts() { this.router.navigate(['alerts']); }
  autoorders() { this.router.navigate(['auto-order-list']); }
  stock_screener() { this.router.navigate(['home']); }
  sysmgmt() { this.router.navigate(['system-management']); }
  news() { this.router.navigate(['news']); }
  available_trades() { this.router.navigate(['trades']); }

  // onSymbolChange(selected: any) {
  //   const parts = selected.item_text.split('|');
  //   let customName = parts[1]?.trim() || ''; // text after "|"

  //   // Remove all special characters except underscore
  //   customName = customName.replace(/[^a-zA-Z0-9_]/g, '');

  //   // set value to stock_name form control
  //   this.addStockForm.get('stock_name')?.setValue(customName);
  // }
  onSymbolChange(selected: any) {
    const parts = selected?.item_text?.split('|') || [];
    let customName = parts[1]?.trim() || '';

    // Remove all special characters except underscore
    customName = customName.replace(/[^a-zA-Z0-9_]/g, '');

    // set value to stock_name form control
    this.addStockForm.get('stock_name')?.setValue(customName);
  }


  onSymbolInputChange(): void {
    const query = this.symbol.value ?? '';
    console.log(query)
    if (query.length >= 2) {
      this.fetchSymbols(query);
    } else {
      this.symbolOptions = [];
    }
    this.isDropdownVisible = this.symbolOptions.length > 0;
  }


  fetchSymbols(query: string): void {
    this.apiService.getFyersSymbols(query).subscribe({
      next: (res) => {
        const matches = res.response?.match_symbols || [];
        this.symbolOptions = matches.map((item: any) => ({
          item_id: item.symbol,                 // for bindValue
          item_text: `${item.symbol} | ${item.name}` // for bindLabel
        }));
        console.log("Fetched Symbols:", this.symbolOptions);
        this.isDropdownVisible = this.symbolOptions.length > 0;
      },
      error: (err) => {
        console.error("Error fetching symbols:", err);
        this.symbolOptions = [];
        this.isDropdownVisible = false;
      }
    });
  }


  selectSymbol(symbol: string): void {
    this.symbol.setValue(symbol);
    this.symbolOptions = [];
  }

  submitStock(): void {
    const selectedSymbol = this.addStockForm.value.symbol;
    // 🔍 Check if the symbol user selected exists in dropdown
    const isValidSymbol = this.symbolOptions.some(
      item => item.item_id === selectedSymbol
    );
    if (!isValidSymbol) {
      this.toastr.error("Please select a valid stock from the dropdown.");
      return; // ❌ Stop submit
    }
    console.log("Submitting stock:", this.addStockForm.value);
    if (this.addStockForm.valid) {
      const selectedIndexIds = (this.addStockForm.value.table_name || []).map((item: any) => item.index_id);
      const selectedSymbol = this.addStockForm.value.symbol || '';
      const stockData = {
        country: this.SelectedCountryId,
        stock_name: this.addStockForm.value.stock_name.toLowerCase(),
        symbol: selectedSymbol,
        index_ids: selectedIndexIds
      };
      this.spinner.show()
      console.log("LOAD", stockData)
      this.showmsg = "Adding Stock. Please Wait !!"
      this.apiService.addNewStock(stockData).subscribe(response => {
        if (response?.msg == 'success') {
          this.toastr.success('Stock added successfully!');
          console.log("STOCK RESPONSE", response)
          this.addStockForm.reset();
          this.spinner.hide()
          this.ProcessStock(response.response.stock_id)
          // this.router.navigate(['system-management']);
          // this.SelectedCountryId = null;
        } else {
          this.spinner.hide()
          this.toastr.error(response?.response || 'Failed to add stock');
        }
      });
    } else {
      this.spinner.show()
      this.toastr.warning('Please fill all fields');
    }
  }


  ProcessStock(stock_id: any) {
    this.showmsg = "Processing Stock. Please Wait !!"
    this.spinner.show();
    this.apiService.processStockService(stock_id, this.SelectedCountryName).subscribe(resp => {
      if (resp.msg == "success") {
        this.toastr.success("Processed Successfully !");
        this.router.navigate(['system-management']);
        this.spinner.hide();
      }
      else {
        this.spinner.hide();
        this.toastr.error("Processing Failed !");
      }
    })

  }


}




