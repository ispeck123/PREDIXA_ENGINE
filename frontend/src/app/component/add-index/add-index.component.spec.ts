import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddIndexComponent } from './add-index.component';

describe('AddIndexComponent', () => {
  let component: AddIndexComponent;
  let fixture: ComponentFixture<AddIndexComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [AddIndexComponent]
    });
    fixture = TestBed.createComponent(AddIndexComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
