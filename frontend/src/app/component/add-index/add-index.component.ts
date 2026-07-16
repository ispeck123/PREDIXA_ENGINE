import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';
@Component({
  selector: 'app-add-index',
  templateUrl: './add-index.component.html',
  styleUrls: ['./add-index.component.css']
})
export class AddIndexComponent implements OnInit {
  NewsData: any;
  candles: { color: string; height: number; wickHeight: number }[] = [];
  showmsg: any;
  colorInterval: any;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  currentPage: number = 1;
  pageSize: number = 10;
  itemsPerPage: number = 10;
  SelectedCountryId: any;
   addIndexForm: FormGroup;
exchangeList: any[] = [];
exchangeLists: any[] = [];
 isLoading=true;
sortColumn: string = '';
sortDirection: 'asc' | 'desc' = 'asc';


        


  constructor(
    private apiService: ApiService,
    private http: HttpClient,
    private fb: FormBuilder,
    private router: Router,
    private spinner: NgxSpinnerService,
    private toastr: ToastrService
  ) {
  this.addIndexForm = this.fb.group({
  index_name: ['', Validators.required],
  symbol: ['', Validators.required],
  exchange_id: ['', Validators.required]
});
  }

  ngOnInit(): void {
    this.Role = localStorage.getItem('role');
    this.SelectedCountryId = localStorage.getItem('selectedCountryId');
    this.UserName = localStorage.getItem('UserName');

    this.isAdmin = this.Role === "admin";

    this.GetNews();
     this.loadExchanges();
     this.getallExchanges();
  }


  GetNews() {
    this.showmsg = "Fetching Latest News";
    this.spinner.show();
    this.apiService.getNewsService().subscribe((data) => {
      this.spinner.hide();
      this.NewsData = data.response.news.sort((a: any, b: any) => {
        return new Date(b.published).getTime() - new Date(a.published).getTime();
      });
    });
  }

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


submitIndex(): void {
  this.addIndexForm.markAllAsTouched();

  if (this.addIndexForm.invalid) {
    this.toastr.error('Please fill all required fields');
    return;
  }

  const indexData = {
    country_id: this.SelectedCountryId, 
    index_name: this.addIndexForm.get('index_name')?.value,
    symbol: this.addIndexForm.get('symbol')?.value,
    exchange_ids: [this.addIndexForm.get('exchange_id')?.value] // Note: expecting an array
  };

  console.log('Submitting index:', indexData);

  this.apiService.addIndex(indexData).subscribe({
    next: (response) => { 
      if(response.msg=='success') {
        this.toastr.success('Index added successfully');
           this.addIndexForm.reset();
           this.getallExchanges();
      } else {
        this.toastr.error('Failed to add index: ' + response.msg);
        return;
      }

      // console.log('Index added successfully:', response);
      // this.toastr.success('Index added successfully');
   
    },
    error: (error) => {
      console.error('Error adding index:', error);
      this.toastr.error('Failed to add index');
    }
  });
}
  get paginatedStockList() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.exchangeLists.slice(startIndex, endIndex);
  }
  

  get totalExchangePages() {
    return Math.ceil(this.exchangeLists.length / this.itemsPerPage);
  }
  sortData(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.exchangeLists.sort((a: any, b: any) => {
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
 

  loadExchanges() {
    this.apiService.getExchanges(this.SelectedCountryId).subscribe({
      next: (res) => {
        this.exchangeList = res.response;
      },
      error: (err) => {
        console.error('Failed to fetch exchanges:', err);
      }
    });
  }

getallExchanges() {
this.apiService.getindex(this.SelectedCountryId).subscribe({
  next: (res) => {
    this.exchangeLists = res.response;
    console.log('Exchanges fetched successfully:', this.exchangeLists);
    this.isLoading = false; // Set loading to false after data is fetched
  },
  error: (err) => {
    console.error('Failed to fetch exchanges:', err);
    this.toastr.error('Failed to fetch exchanges');
  }     
});
  } 
}
