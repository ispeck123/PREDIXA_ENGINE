import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { NgxSpinnerService } from 'ngx-spinner';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-user-subscription',
  templateUrl: './user-subscription.component.html',
  styleUrls: ['./user-subscription.component.css']
})
export class UserSubscriptionComponent implements OnInit {

  candles: { color: string; height: number, wickHeight: number }[] = [];
  showmsg: any;
  colorInterval: any;
  Role: any;
  UserName: any;
  showCreateUserModal = false;
  isAdmin: boolean = false;
  countryList = [
    { code: 'us', name: 'United States', selected: false },
    { code: 'uk', name: 'United Kingdom', selected: false },
  ];
  allUsers: any;
  allSubscriptionPlan: any;
  AssignPlanForm: FormGroup;
  CreateUser: FormGroup;
  submitted = false;
  AccessedCountry: any;
  countries: any;
  selectedUserId: number | null = null;
  selectedCountryIds: number[] = [];
  AllUsersSubscriptionslist:any;
  AllUsersSubscriptions:any;
  countryAccessData:any;
  selectedPlanName :any;

  selectedCountries: string[] = [];
  constructor(private apiService: ApiService, private router: Router, private spinner: NgxSpinnerService, private toastr: ToastrService) { }


  private buildForm() {
    this.AssignPlanForm = new FormGroup({
      user_id: new FormControl('', [Validators.required]),
      plan_id: new FormControl('', [Validators.required]),
      start_date: new FormControl('', [Validators.required]),
      end_date: new FormControl('', [Validators.required])
    });
    this.AssignPlanForm.get('user_id')?.valueChanges.subscribe(userId => {
    this.fetchUserSubscription(userId);
  });

    // this.ReqCheckOutForm= new FormGroup({
    //   date: new FormControl('', [Validators.required]),
    //   reason: new FormControl('', [Validators.required])
    // });

  }
  private buildForms() {
    this.CreateUser = new FormGroup({
      user_name: new FormControl('', [Validators.required]),
      password: new FormControl('', [Validators.required]),
    confirmPassword: new FormControl('', [Validators.required]),
    });
    this.CreateUser.setValidators(this.passwordMatchValidator); // Set the custom validator for password match

  }
  ngOnInit(): void {
    this.getCountry()
    this.Role = localStorage.getItem('role');
    if (this.Role == "admin") {
      this.isAdmin = true;
    }
    else {
      this.isAdmin = false;
    }
    this.UserName = localStorage.getItem('UserName');
    this.buildForm();
    this.buildForms();
    this.getAllUsers();
    this.getAllSubscriptions();
    this.getAllUsersSubscriptionslist();
  }

  get f() { return this.AssignPlanForm.controls; }
  get f1() { return this.CreateUser.controls; }


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

  sysmgmt() {
    this.router.navigate(['system-management']);
  }

  alerts(){
    this.router.navigate(['alerts']);
  }

  news() {
    this.router.navigate(['news']);
  }

  available_trades() {
    this.router.navigate(['trades']);
  }


  updateSelectedCountries() {
    this.selectedCountryIds = this.countries
      .filter((country: { selected: any; }) => country.selected)
      .map((country: { country_id: any; }) => country.country_id);
  }

  trackByCode(index: number, item: any): string {
    return item.code;
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

  getAllSubscriptions() {
    this.apiService.getAllSubscriptionsService().subscribe(resp => {
      if (resp.msg == "success") {
        this.allSubscriptionPlan = resp.response;
        console.log("this.allSubscriptionPlan", this.allSubscriptionPlan);
      }
      else {
        console.log(resp);
      }
    });
  }

  OnSubmitofAssignPlan() {
    this.submitted = true;
    this.AssignPlanForm.markAllAsTouched();
    if (this.AssignPlanForm.invalid) {
      return;
    }
    else {
      this.spinner.show();
      let obj = this.AssignPlanForm.value;
      console.log("object", obj);
      this.apiService.OnSubmitofAssignPlanService(obj).subscribe(resp => {
        if (resp.msg == "success") {
          this.spinner.hide();
          console.log("OnSubmitofAssignPlan", resp);
          this.toastr.success(resp.response.message);
          
               this.getAllUsersSubscriptionslist();
               this.AssignPlanForm.reset();
        }
        else {
          if (resp.status_code = 404) {
            this.toastr.error(resp.detail)
          }
          this.spinner.hide();
          console.log(resp);
        }
      });
    }
  }

  getCountry() {
    this.apiService.getCountry().subscribe((data) => {
      console.log("COUNTRY", data);
      this.countries = data.response;
    });
  }
onUserChange(event: any) {
  const selectedUserId = event.target.value;
  if (selectedUserId) {
    this.apiService.getUserSubscription(selectedUserId).subscribe((res: any) => {
      if (res.msg === 'success' && res.response && res.response.length > 0) {
        const data = res.response[0];
        this.selectedPlanName = data.plan_name; // Show current plan name

        this.AssignPlanForm.patchValue({
          plan_id: data.plan_id,
          start_date: data.start_date,
          end_date: data.end_date
        });
      } else {
        this.selectedPlanName = '';
        this.AssignPlanForm.patchValue({
          plan_id: '',
          start_date: '',
          end_date: ''
        });
      }
    }, err => {
      this.selectedPlanName = '';
      this.AssignPlanForm.patchValue({
        plan_id: '',
        start_date: '',
        end_date: ''
      });
    });
  }
}

  changeUser(userid: any) {
    this.selectedUserId = Number(userid);
  }

  submitData() {
    this.spinner.show()
    const payload = {
      user_id: this.selectedUserId,
      country_ids: this.selectedCountryIds,
      granted_by: localStorage.getItem('UserName') || ''
    };
    console.log('Payload:', payload);
    this.apiService.setCountryAccessService(payload).subscribe(resp => {
      if (resp.msg == "success") {
        this.toastr.success(resp.response.message)
        this.spinner.hide();
        this.getAllUsersSubscriptionslist();
      
      }
      else {
        this.spinner.hide();
        this.toastr.error("Failed !")
      }
    })
  }


fetchUserSubscription(userId: number) {
  if (userId) {
    this.apiService.getUserSubscription(userId).subscribe((res: any) => {
      if (res.msg === 'success' && res.response?.length > 0) {
        const data = res.response[0];
        this.AssignPlanForm.patchValue({
          plan_id: data.plan_id,
          start_date: data.start_date,
          end_date: data.end_date
        });
      } else {
        this.AssignPlanForm.patchValue({
          plan_id: '',
          start_date: '',
          end_date: ''
        });
      }
    }, err => {
      this.AssignPlanForm.patchValue({
        plan_id: '',
        start_date: '',
        end_date: ''
      });
    });
  }
}
  getAllUsersSubscriptionslist() {
    this.apiService.getAllUsersSubscriptionslistService().subscribe(resp => {
      if (resp.msg == "success") {
        console.log("getAllUsersSubscriptionslist", resp);
        this.AllUsersSubscriptionslist=resp.response;
      // ✅ Extract all subscription_ids into an array if needed
      this.AllUsersSubscriptions = this.AllUsersSubscriptionslist.map((sub: any) => sub.subscription_id);
      console.log("Subscription IDs:", this.AllUsersSubscriptions);

         // Loop through the list and fetch country access for each user
      this.AllUsersSubscriptionslist.forEach((user: any) => {
        this.getUserCountryAccess(user);
      });
      }
      else {
        console.log(resp);
      }
    }
    )
  }
updateSubscriptionStatus(item: any, status: boolean) {
  const subscriptionId = item.subscription_id; 

  this.apiService.updatePlanStatus(subscriptionId, status).subscribe(
    (resp: any) => {
      if (resp.msg === 'success') {
        item.is_active = status;  
        this.toastr.success(`Plan ${status ? 'activated' : 'deactivated'} successfully`);
      } else {
        this.toastr.error('Update failed');
      }
    },
    error => {
      console.error('API error', error);
      this.toastr.error('Server error occurred');
    }
  );
}


  getUserCountryAccess(user:any) {
    this.apiService.getUserCountryAccessService(user.user_id).subscribe(resp => {  
      if (resp.msg === "success" && Array.isArray(resp.response)) {
        const countryNames = resp.response.map((c: any) => c.country_name);
        user.country_name = countryNames.join(', ');
      }
      else {
        console.log(resp);
      }
    }
    )
  }


openCreateUserModal() {
  // this.showCreateUserModal = true;
    this.router.navigate(['/user-management']);
}

closeCreateUserModal() {
  this.showCreateUserModal = false;
}
createusers(){
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
        this.toastr.success(resp.response.message);
        this.CreateUser.reset();
        location.reload();
      }
      else {
        if (resp.status_code = 404) {
          this.toastr.error(resp.detail)
        }
        this.spinner.hide();
        console.log(resp);
      }
    });
  }

}

changeUsers(userId: string): void {
  if (!userId) return;

  this.selectedUserId = Number(userId);
    this.countries.forEach((country: { selected: boolean; }) => (country.selected = false));
  this.selectedCountryIds = [];

  this.apiService.getUserCountryAccessService(this.selectedUserId).subscribe(
    (res) => {
      if (res.msg === 'success' && Array.isArray(res.response)) {
        const selectedCountryIds = res.response.map((c: any) => c.country_id);

        // Update the countries checkboxes
        this.countries.forEach((country: any) => {
          country.selected = selectedCountryIds.includes(country.country_id);
        });

        // Update the selectedCountryIds array
        this.selectedCountryIds = selectedCountryIds;
      } else {
        console.error('Unexpected response:', res);
      }
    },
    (error) => {
      console.error('Failed to load countries for user', error);
    }
  );
}
toggleCountrySelection(country: any): void {
  country.selected = !country.selected;

  if (country.selected) {
    this.selectedCountryIds.push(country.country_id);
  } else {
    this.selectedCountryIds = this.selectedCountryIds.filter(
      (id) => id !== country.country_id
    );
  }
}
}


// this.apiService.getCountryAccessService(userid).subscribe(resp => {
//   if (resp.msg == "success") {
//     this.AccessedCountry = resp.response;
//   }
//   else {
//     console.log("Access country Failed !");
//   }
// }
// )