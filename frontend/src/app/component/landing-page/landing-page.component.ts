import { Component, OnInit,AfterViewInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';
import { FirebaseMessagingService } from 'src/app/services/firebase-messaging.service.service';
import { IdleTimeoutService } from 'src/app/services/idle-timeout.service';

import * as THREE from 'three';

@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.css']
})
export class LandingPageComponent implements OnInit {

  email:any="";
  password:any=""; 
  @ViewChild('globeCanvas', { static: true }) globeCanvas!: ElementRef;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  globe!: THREE.Mesh;
  whiteDots!: THREE.Points;
   showPassword: boolean = false;
    hidePassword: boolean = true;


  constructor(private fcmService :FirebaseMessagingService,private idleTimeout: IdleTimeoutService,private router: Router,private spinner: NgxSpinnerService,private toastr: ToastrService,private apiService:ApiService) { }

  ngOnInit(): void {
   
  }

  @HostListener('document:keydown.enter', ['$event'])
    onEnter(e: KeyboardEvent) {
      e.preventDefault();
      this.submit();
    }


  // submit() {
  //   this.spinner.show();
  //   if (this.email != "" && this.password != "") {
  //     let obj = {
  //       user_name: this.email,
  //       password: this.password
  //     }
  //     this.apiService.login(obj).subscribe((res: any) => {
  //       console.log("OnLOginSUbmit",res);
    
  //      if(res.msg=="success")
  //      {
  //       console.log("TOKEN",res.response.token);
  //       this.toastr.success("Login Successful !");
  //       localStorage.setItem('role', res.response.user_role);
  //       localStorage.setItem('UserName', res.response.user_name);
  //       localStorage.setItem('UserId', res.response.user_id);
  //       localStorage.setItem('token', res.response.token);
  //       this.idleTimeout.startTimer();
  //       this.router.navigate(['dashboard']);
  //       this.spinner.hide();
  //      }
  //      else if(res.msg=="failed")
  //      {
  //       this.toastr.error(res.response);
  //       this.spinner.hide();
  //      }
  //     })



  //   }
  //   else {
  //     this.spinner.hide();
  //     alert("Please enter email and password");
  //   }

  // }

  // new code//

  submit() {
    this.spinner.show();
    alert()
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
          });

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

}
