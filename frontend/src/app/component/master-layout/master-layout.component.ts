import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { LayoutToggleService } from 'src/app/services/layout-toggle.service';

@Component({
  selector: 'app-master-layout',
  templateUrl: './master-layout.component.html',
  styleUrls: ['./master-layout.component.css']
})
export class MasterLayoutComponent {
  @Input() isAdmin = false;
  @Output() collapsedChange = new EventEmitter<boolean>();
  isCollapsed = false;   // desktop collapse
  isMobile = false;      // responsive breakpoint
  isOpen = false;        // mobile drawer open
  Role: any;


  constructor(private router: Router, private layout: LayoutToggleService) {
    this.checkScreen();
  }

  ngOnInit()
  {
    this.checkScreen();
    this.layout.open$.subscribe(val => {
      if (this.isMobile) this.isOpen = val;
    });
    this.Role = localStorage.getItem('role');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
  }


  @HostListener('window:resize')
  onResize() {
    this.checkScreen();
  }

  private checkScreen() {
    this.isMobile = window.innerWidth <= 992;
    if (!this.isMobile) this.isOpen = false; // no drawer on desktop
  }

  toggleCollapse() {
  if (this.isMobile) return;
  this.isCollapsed = !this.isCollapsed;
  this.collapsedChange.emit(this.isCollapsed);
}


  open() {
    if (this.isMobile) this.isOpen = true;
  }

  close() {
    this.isOpen = false;
    this.layout.close(); // keep service state in sync
  }

  go(path: string) {
    this.router.navigate([path]);
    if (this.isMobile) this.close();
  }

  isActive(path: string) {
    return this.router.url.startsWith(path);
  }

  logout() {
    this.router.navigate(['/landing']);
  }
}
