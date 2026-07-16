import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { NotificationCenterService } from 'src/app/services/notification-center.service';

@Component({
  selector: 'app-notification-popup',
  templateUrl: './notification-popup.component.html',
  styleUrls: ['./notification-popup.component.css']
})
export class NotificationPopupComponent {


  constructor(private apiService: ApiService,private toastr: ToastrService,private router: Router,private notificationCenter: NotificationCenterService){}

  showPopup = false;
  popupMessage = "";

  @Input() message!: string;
  @Input() id!: number;
  @Input() stock_tick!: string;
  @Output() close = new EventEmitter<void>();

@ViewChild('popup') popupElement!: ElementRef;

isDragging = false;
offsetX = 0;
offsetY = 0;


  show(message: string) {
    this.popupMessage = message;
    this.showPopup = true;

    // Auto-close after 10 seconds (optional)
    setTimeout(() => this.showPopup = false, 10000);
  }

  closePopup() {
    this.showPopup = false;
  }

  openChart(stock_tick:any) {
    this.close.emit()
    this.apiService.seenNotification(this.id).subscribe((res:any)=>{
      if(res.msg=="success")
      {
        this.close.emit()
        this.notificationCenter.refreshHistory();
        this.router.navigate(['chart_analytics', stock_tick.toLowerCase()]);
      }
      else
      {
        this.toastr.error("Failed !")
      }

  });
    
  }

  openSetNew() {
    console.log("Open SetNew clicked");
    // your logic here
  }

  startDrag(event: MouseEvent) {
    event.preventDefault();
  
    const popup = this.popupElement.nativeElement;
  
    this.isDragging = true;
    this.offsetX = event.clientX - popup.offsetLeft;
    this.offsetY = event.clientY - popup.offsetTop;
  
    document.addEventListener('mousemove', this.dragMove, { passive: true });
    document.addEventListener('mouseup', this.stopDrag);
  }
  
  dragMove = (event: MouseEvent) => {
    if (!this.isDragging) return;
  
    const popup = this.popupElement.nativeElement;
  
    // Smooth dragging using requestAnimationFrame
    requestAnimationFrame(() => {
      popup.style.left = event.clientX - this.offsetX + 'px';
      popup.style.top = event.clientY - this.offsetY + 'px';
      popup.style.position = 'fixed';
    });
  };
  
  stopDrag = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.dragMove);
    document.removeEventListener('mouseup', this.stopDrag);
  };

  seen(id:any)
  {
    console.log(id)
    this.apiService.seenNotification(this.id).subscribe((res:any)=>{
        if(res.msg=="success")
        {
          this.notificationCenter.refreshHistory();
          this.close.emit()
        }
        else
        {
          this.toastr.error("Failed !")
        }

    });
  }

  onCloseClicked(id:any) {
    this.seen(id)
  }

}
