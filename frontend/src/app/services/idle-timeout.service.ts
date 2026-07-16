// idle-timeout.service.ts
import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root'
})
export class IdleTimeoutService {
  private logoutTimer: any;
  private countdownInterval: any;

  sessionTimeLeft: number = 0; // in seconds

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private ngZone: NgZone
  ) {
    // Restore countdown if there’s a saved end time in localStorage
    const savedEndTime = localStorage.getItem('sessionEndTime');
    if (savedEndTime) {
      const remainingMs = parseInt(savedEndTime, 10) - Date.now();
      if (remainingMs > 0) {
        this.startTimer(remainingMs);
      } else {
        this.logout();
      }
    }
  }

  startTimer(durationMs: number =  7200000) { // default 120 min
    clearTimeout(this.logoutTimer);
    clearInterval(this.countdownInterval);

    // Save the session end time in localStorage
    const endTime = Date.now() + durationMs;
    localStorage.setItem('sessionEndTime', endTime.toString());

    this.sessionTimeLeft = Math.floor(durationMs / 1000); // convert to seconds

    // Countdown interval
    this.countdownInterval = setInterval(() => {
      this.sessionTimeLeft--;
      if (this.sessionTimeLeft <= 0) {
        clearInterval(this.countdownInterval);
      }
    }, 1000);

    // Logout timer
    this.logoutTimer = setTimeout(() => {
      this.logout();
    }, durationMs);
  }

  logout() {
    clearInterval(this.countdownInterval);
    clearTimeout(this.logoutTimer);
    localStorage.removeItem('sessionEndTime'); // remove saved end time
    localStorage.clear();

    this.ngZone.run(() => {
      this.router.navigate(['landing']);
    });
    this.toastr.error('Session expired!');
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.sessionTimeLeft / 60);
    const seconds = this.sessionTimeLeft % 60;
    return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
  }
}
