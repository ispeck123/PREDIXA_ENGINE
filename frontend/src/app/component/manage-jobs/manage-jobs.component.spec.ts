import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageJobsComponent } from './manage-jobs.component';

describe('ManageJobsComponent', () => {
  let component: ManageJobsComponent;
  let fixture: ComponentFixture<ManageJobsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ManageJobsComponent]
    });
    fixture = TestBed.createComponent(ManageJobsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
