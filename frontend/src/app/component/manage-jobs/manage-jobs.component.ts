import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-manage-jobs',
  templateUrl: './manage-jobs.component.html',
  styleUrls: ['./manage-jobs.component.css']
})
export class ManageJobsComponent implements OnInit
{

  activeMenu: string = 'stock';

  
  constructor( private router: Router) { }

  ngOnInit(): void {
    // Initialization logic here
  }

  alerts(){
    this.router.navigate(['alerts']);
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

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }

}
