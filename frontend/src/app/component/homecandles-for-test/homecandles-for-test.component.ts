
import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { FirebaseMessagingService } from 'src/app/services/firebase-messaging.service.service';
import { IdleTimeoutService } from 'src/app/services/idle-timeout.service';

import * as THREE from 'three';



@Component({
  selector: 'app-homecandles-for-test',
  templateUrl: './homecandles-for-test.component.html',
  styleUrls: ['./homecandles-for-test.component.css']
})



export class HomecandlesForTestComponent implements OnInit {

  showLogin = false;
  showRegister = false;

  openLogin() { this.showLogin = true; }
  closeLogin() { this.showLogin = false; }

  openRegister() { this.showRegister = true; }
  closeRegister() { this.showRegister = false; }

  email: any = "";
  password: any = "";
  @ViewChild('globeCanvas', { static: true }) globeCanvas!: ElementRef;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  globe!: THREE.Mesh;
  whiteDots!: THREE.Points;
  showPassword: boolean = false;
  hidePassword: boolean = true;
  showLegals = false;
  showResponsibiity = false;


  constructor(private idleTimeout: IdleTimeoutService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService, private apiService: ApiService, private fcmService: FirebaseMessagingService) {
  }

  ngOnInit(): void {

  }

  @HostListener('document:keydown.enter', ['$event'])
      onEnter(e: KeyboardEvent | Event) {
        const event = e as KeyboardEvent; 
        event.preventDefault();
        this.submit();
      }
  

  submit() {
    this.spinner.show();

    if (this.email !== "" && this.password !== "") {
      const obj = {
        user_name: this.email,
        password: this.password
      };

      this.apiService.login(obj).subscribe((res: any) => {
        if (res.msg === "success") {
          this.toastr.success('Login Successful');
          localStorage.setItem('role', res.response.user_role);
          localStorage.setItem('UserName', res.response.user_name);
          localStorage.setItem('UserId', res.response.user_id);
          localStorage.setItem('token', res.response.token);


          // ✅ FCM integration
          this.fcmService.requestPermissionAndToken();
          this.fcmService.listenForMessages(payload => {
            console.log('Notification received:', payload);
            // Optionally: show toast or update UI
          });


          // this.notificationService.requestPermission(res.response.user_id);

          this.router.navigate(['dashboard']);
        } else {
          this.toastr.error('Login Failed');
        }
        this.spinner.hide();
      });

    } else {
      this.spinner.hide();
      alert("Please enter email and password");
    }
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  features()
  {
    this.router.navigate(['feature']);
  }

  scrollToPricing() {
  const el = document.getElementById('pricing');
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
}

closeLegals()
{
  this.showLegals = false;
  document.body.classList.add('no-scroll');
}


openLegals()
{
  this.showLegals = true;
  document.body.classList.add('no-scroll');
}

openResponsibility()
{
  this.showResponsibiity = true;
  document.body.classList.add('no-scroll');
}

closeResponsibility()
{
  this.showResponsibiity = false;
  document.body.classList.add('no-scroll');
}


}


