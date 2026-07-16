import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BucketOrdersComponent } from './bucket-orders.component';

describe('BucketOrdersComponent', () => {
  let component: BucketOrdersComponent;
  let fixture: ComponentFixture<BucketOrdersComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [BucketOrdersComponent]
    });
    fixture = TestBed.createComponent(BucketOrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
