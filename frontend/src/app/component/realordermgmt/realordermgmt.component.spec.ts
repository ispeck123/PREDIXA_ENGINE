import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RealordermgmtComponent } from './realordermgmt.component';

describe('RealordermgmtComponent', () => {
  let component: RealordermgmtComponent;
  let fixture: ComponentFixture<RealordermgmtComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RealordermgmtComponent]
    });
    fixture = TestBed.createComponent(RealordermgmtComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
