import { Component, ElementRef, HostListener, Input, Renderer2 } from '@angular/core';
import { WebSocketService } from 'src/app/services/web-socket.service';
import { ZIndexManagerService } from 'src/app/services/zindex-manager.service';

@Component({
  selector: 'app-floating-modal',
  template: `
    <div *ngIf="visible"
        class="floating-modal"
        [ngClass]="[animationState, isMobileView ? 'mobile-view' : 'desktop-view', isMaximized ? 'maximized-view' : '']"
        [style.top.px]="isMobileView ? null : top"
        [style.left.px]="isMobileView ? null : left"
        [style.width.px]="isMobileView ? null : width"
        [style.height.px]="isMobileView ? null : height"
        [style.zIndex]="zIndex"
        (mousedown)="bringToFront($event)">

      <div class="floating-header"
          (mousedown)="!isMobileView && startDrag($event)">
        <span class="floating-title">
          {{ title }} <span *ngIf="symbol">- {{ symbol }} ({{ expiry }})</span>
        </span>

        <div class="floating-actions">
          <button class="control-btn" *ngIf="!isMobileView" (click)="toggleMaximize()">
            <span *ngIf="!isMaximized">🗖</span>
            <span *ngIf="isMaximized">🗗</span>
          </button>
          <button class="close-btn" (click)="hide()">×</button>
        </div>
      </div>

      <div class="floating-body">
        <ng-content></ng-content>
      </div>

      <div class="resize-handle"
          *ngIf="!isMobileView && !isMaximized"
          (mousedown)="startResize($event)">
      </div>
    </div>
  `,
  styleUrls: ['./floating-modal.component.css']
})
export class FloatingModalComponent {
  @Input() title: string = 'Window';
  @Input() top: number = 100;
  @Input() left: number = 100;
  @Input() width: number = 700;
  @Input() height: number = 500;
  @Input() chartId!: string;
  @Input() symbol: string = '';
  @Input() expiry: string = '';
  @Input() Open: string = '';
  @Input() High: string = '';
  @Input() Low: string = '';
  @Input() Close: string = '';

  visible: boolean = false;
  zIndex: number = 1000;
  isMobileView: boolean = false;

  private dragging = false;
  private resizing = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  animationState: 'open' | 'close' = 'open';
  isMaximized: boolean = false;

  backupPosition: { top: number, left: number, width: number, height: number } | null = null;

  private animationFrameId: number | null = null;
  private pendingMouseX = 0;
  private pendingMouseY = 0;

  constructor(
    private webSocketService:WebSocketService,
    private el: ElementRef,
    private renderer: Renderer2,
    private zIndexManager: ZIndexManagerService
  ) {
    this.checkScreen();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.checkScreen();

    if (this.visible && this.isMobileView) {
      this.isMaximized = false;
    }

    if (!this.isMobileView && !this.isMaximized && this.visible) {
      this.keepModalInsideViewport();
    }
  }

  private checkScreen() {
    this.isMobileView = window.innerWidth <= 992;
  }

  private getModalElement(): HTMLElement | null {
    return this.el.nativeElement.querySelector('.floating-modal');
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private keepModalInsideViewport(): void {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const safeWidth = Math.min(this.width, viewportWidth);
    const safeHeight = Math.min(this.height, viewportHeight);

    this.width = safeWidth;
    this.height = safeHeight;

    const maxLeft = Math.max(0, viewportWidth - safeWidth);
    const maxTop = Math.max(0, viewportHeight - safeHeight);

    this.left = this.clamp(this.left, 0, maxLeft);
    this.top = this.clamp(this.top, 0, maxTop);
  }

  toggleMaximize() {
    if (this.isMobileView) return;

    if (!this.isMaximized) {
      this.backupPosition = {
        top: this.top,
        left: this.left,
        width: this.width,
        height: this.height
      };

      this.top = 0;
      this.left = 0;
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.isMaximized = true;
    } else {
      if (this.backupPosition) {
        this.top = this.backupPosition.top;
        this.left = this.backupPosition.left;
        this.width = this.backupPosition.width;
        this.height = this.backupPosition.height;
      }
      this.isMaximized = false;
      this.keepModalInsideViewport();
    }
  }

  startDrag(event: MouseEvent) {
    if (this.isMobileView || this.isMaximized) return;

    event.preventDefault();
    this.dragging = true;
    this.dragOffsetX = event.clientX - this.left;
    this.dragOffsetY = event.clientY - this.top;

    document.body.classList.add('floating-modal-dragging');

    const moveListener = this.renderer.listen('document', 'mousemove', (e: MouseEvent) => {
      this.pendingMouseX = e.clientX;
      this.pendingMouseY = e.clientY;

      if (this.animationFrameId === null) {
        this.animationFrameId = requestAnimationFrame(() => {
          this.onDragMove();
          this.animationFrameId = null;
        });
      }
    });

    const upListener = this.renderer.listen('document', 'mouseup', () => {
      this.dragging = false;
      document.body.classList.remove('floating-modal-dragging');

      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      moveListener();
      upListener();
    });
  }

  onDragMove() {
    if (!this.dragging) return;

    const modalEl = this.getModalElement();
    const modalWidth = modalEl ? modalEl.offsetWidth : this.width;
    const modalHeight = modalEl ? modalEl.offsetHeight : this.height;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const rawLeft = this.pendingMouseX - this.dragOffsetX;
    const rawTop = this.pendingMouseY - this.dragOffsetY;

    const maxLeft = Math.max(0, viewportWidth - modalWidth);
    const maxTop = Math.max(0, viewportHeight - modalHeight);

    this.left = this.clamp(rawLeft, 0, maxLeft);
    this.top = this.clamp(rawTop, 0, maxTop);
  }

  startResize(event: MouseEvent) {
    if (this.isMobileView || this.isMaximized) return;

    event.preventDefault();
    event.stopPropagation();
    this.resizing = true;

    document.body.classList.add('floating-modal-dragging');

    const moveListener = this.renderer.listen('document', 'mousemove', (e) => this.onResizeMove(e));
    const upListener = this.renderer.listen('document', 'mouseup', () => {
      this.resizing = false;
      document.body.classList.remove('floating-modal-dragging');
      moveListener();
      upListener();
    });
  }

  onResizeMove(event: MouseEvent) {
    if (!this.resizing) return;

    const modalEl = this.getModalElement();
    if (!modalEl) return;

    const rect = modalEl.getBoundingClientRect();

    const maxWidth = window.innerWidth - rect.left;
    const maxHeight = window.innerHeight - rect.top;

    this.width = this.clamp(event.clientX - rect.left, 320, Math.max(320, maxWidth));
    this.height = this.clamp(event.clientY - rect.top, 240, Math.max(240, maxHeight));
  }

  bringToFront(event: MouseEvent) {
    this.zIndex = this.zIndexManager.getNextZIndex();
  }

  show() {
    this.checkScreen();
    this.visible = true;
    this.animationState = 'open';
    this.zIndex = this.zIndexManager.getNextZIndex();

    if (!this.isMobileView && !this.isMaximized) {
      setTimeout(() => this.keepModalInsideViewport());
    }
  }

  hide() {
    this.webSocketService.disconnectFutureExpiryList();

    if (this.chartId) {
      const chartElement = document.getElementById(this.chartId);
      if (chartElement) {
        while (chartElement.firstChild) {
          chartElement.removeChild(chartElement.firstChild);
        }
      }
    }

    this.animationState = 'close';
    this.visible = false;
    this.isMaximized = false;
    document.body.classList.remove('floating-modal-dragging');
  }
}