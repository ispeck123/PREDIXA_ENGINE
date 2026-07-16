import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit {

  NewsData: any;
  candles: { color: string; height: number, wickHeight: number }[] = [];
  showmsg: any;
  colorInterval: any;
  Role: any;
  UserName: any;
  isAdmin: boolean = false;
  currentPage: number = 1;
  pageSize: number = 10;
  allUsers: any;
  CreateUser: FormGroup;
  submitted = false;
  showCreateUserModal = false;
  showPassword = false;
  showConfirmPassword = false;

  constructor(private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService) { }

  private buildForms() {
    this.CreateUser = new FormGroup({
      user_name: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required]),
      confirmPassword: new FormControl('', [Validators.required]),
    });
    this.CreateUser.setValidators(this.passwordMatchValidator); // Set the custom validator for password match

  }
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
    this.getAllUsers();
    this.buildForms();
  }
  get f1() { return this.CreateUser.controls; }

  togglePasswordVisibility(field: string) {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else if (field === 'confirmPassword') {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
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

  alerts() {
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

  available_trades() {
    this.router.navigate(['trades']);
  }

  GetNews() {
    this.showmsg = "Fetching Latest News";
    this.spinner.show();
    this.apiService.getNewsService().subscribe(
      (data) => {
        this.spinner.hide();
        this.NewsData = data.response.news;
        this.NewsData = data.response.news.sort((a: { published: string | number | Date; }, b: { published: string | number | Date; }) => {
          return new Date(b.published).getTime() - new Date(a.published).getTime();
        });

        console.log(this.NewsData);
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

  getAllUsers() {
    this.apiService.getAllUsersService().subscribe(resp => {
      if (resp.msg == "success") {
        this.allUsers = resp.response;
        console.log("this.allUsers", this.allUsers);
      }
      else {
        console.log(resp);
      }
    });
  }
  passwordMatchValidator(form: AbstractControl) {
    const passwordControl = form.get('password');
    const confirmPasswordControl = form.get('confirmPassword');

    if (!passwordControl || !confirmPasswordControl) return null;

    const password = passwordControl.value;
    const confirmPassword = confirmPasswordControl.value;

    if (password !== confirmPassword) {
      confirmPasswordControl.setErrors({ ...(confirmPasswordControl.errors || {}), passwordMismatch: true });
    } else {
      const errors = confirmPasswordControl.errors;
      if (errors) {
        delete errors['passwordMismatch'];
        if (Object.keys(errors).length === 0) {
          confirmPasswordControl.setErrors(null);
        } else {
          confirmPasswordControl.setErrors(errors);
        }
      }
    }
    return null;
  }

  createusers() {
    this.submitted = true;
    this.CreateUser.markAllAsTouched();
    if (this.CreateUser.invalid) {
      return;
    }
    else {
      this.spinner.show();
      let obj = this.CreateUser.value;
      console.log("object", obj);
      this.apiService.createuserService(obj).subscribe(resp => {
        if (resp.msg == "success") {
          this.getAllUsers();
          this.spinner.hide();
          console.log("createUser", resp);
          this.toastr.success(resp.response);
          this.CreateUser.reset();
          location.reload();
        }
        else {
          if (resp.msg = "failed") {
            this.toastr.error(resp.response);
          }
          this.spinner.hide();
          console.log(resp);
        }
      });
    }

  }
  openCreateUserModal() {
    this.showCreateUserModal = true;
  }
  closeCreateUserModal() {
    this.showCreateUserModal = false;
    this.CreateUser.reset();
    this.submitted = false;
  }
  editUser(user: any) {

    console.log("Edit user:", user);
    // open edit modal or navigate to edit page
  }
  deleteUser(user_id: number) {
    if (confirm("Are you sure you want to delete this user?")) {
      console.log("Deleting user ID:", user_id);

      this.apiService.deleteUser(user_id).subscribe({
        next: (res: any) => {
          console.log("API Response:", res);

          if (res.msg === "success") {
            alert(res.response);
            this.getAllUsers();

          } else {
            alert(`Failed: ${res.response}`);
          }
        },
        error: (err) => {
          console.error("Error deleting user:", err);
          alert("Failed to delete user — API call error");
        }
      });
    }
  }


}
