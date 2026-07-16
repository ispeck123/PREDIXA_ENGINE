import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutoOrderListComponent } from './auto-order-list.component';

describe('AutoOrderListComponent', () => {
  let component: AutoOrderListComponent;
  let fixture: ComponentFixture<AutoOrderListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AutoOrderListComponent]
    });
    fixture = TestBed.createComponent(AutoOrderListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
