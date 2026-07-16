import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SystemManagementComponent } from './system-management.component';

describe('SystemManagementComponent', () => {
  let component: SystemManagementComponent;
  let fixture: ComponentFixture<SystemManagementComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SystemManagementComponent]
    });
    fixture = TestBed.createComponent(SystemManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
