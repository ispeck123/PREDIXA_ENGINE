import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from 'ng2-charts';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-news',
  templateUrl: './news.component.html',
  styleUrls: ['./news.component.css']
})
export class NewsComponent implements OnInit {

  NewsData: any;
  TrendingNewsData:any;
  candles: { color: string; height: number, wickHeight: number }[] = [];
  showmsg:any;
  colorInterval: any;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  currentPage: number = 1;
  currentPageForTrending: number = 1;
  pageSize: number = 10;
  activeTab: string = 'News'; // Default tab


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
    this.GetNews();
    this.GetTrendingNews();
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

  GetNews() {
    this.showmsg="Fetching Latest News";
    this.spinner.show();
    this.apiService.getNewsService().subscribe(
      (data) => {
        this.spinner.hide();
        this.NewsData = data.response.news;
        this.NewsData = data.response.news.sort((a: { published: string | number | Date; }, b: { published: string | number | Date; }) => {
          return new Date(b.published).getTime() - new Date(a.published).getTime();
        });
        
        console.log("The News",this.NewsData);
      })
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
  
   GetTrendingNews() {
    this.showmsg="Fetching Latest Trending News";
    this.spinner.show();
    this.apiService.getTrendingNewsService().subscribe(
      (data) => {
        this.spinner.hide();
        this.TrendingNewsData = data.response.news;
        console.log("Trending data",this.TrendingNewsData)
        this.TrendingNewsData = data.response.news.sort((a: { published: string | number | Date; }, b: { published: string | number | Date; }) => {
          return new Date(b.published).getTime() - new Date(a.published).getTime();
        });
      })
  }

    get paginatedTrendingNews(): any[] {
    const start = (this.currentPageForTrending - 1) * this.pageSize;
    return this.TrendingNewsData.slice(start, start + this.pageSize);
  }

  get totalPagesForTrendingNews(): number {
    return Math.ceil(this.TrendingNewsData.length / this.pageSize);
  }

   changePageForTrending(page: number): void {
    if (page >= 1 && page <= this.totalPagesForTrendingNews) {
      this.currentPageForTrending = page;
    }
  }

    SwitchMasterMenu(menu: string) {
    this.activeTab = menu;
    if (menu === 'News') {
      // this.activeMenu = "Success"
      // this.successPage = 1;
      this.GetNews();
    } else if (menu === 'trendingNews') {
      // this.activeMenuCommodity = "Success";
      // this.successPagecommodity = 1;
      this.GetNews();
    } 
  }
}
