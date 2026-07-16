import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-feature',
  templateUrl: './feature.component.html',
  styleUrls: ['./feature.component.css']
})
export class FeatureComponent {

  constructor( private router: Router){}


  landingPage()
  {
      this.router.navigate(['landing']);
  }

}
