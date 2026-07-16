import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-block-spinner',
  templateUrl: './block-spinner.component.html',
  styleUrls: ['./block-spinner.component.css']
})
export class BlockSpinnerComponent {
  @Input() loading = false;
  @Input() label = 'Searching...';
}
