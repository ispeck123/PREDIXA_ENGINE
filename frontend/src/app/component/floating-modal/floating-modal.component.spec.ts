import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FloatingModalComponent } from './floating-modal.component';

describe('FloatingModalComponent', () => {
  let component: FloatingModalComponent;
  let fixture: ComponentFixture<FloatingModalComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FloatingModalComponent]
    });
    fixture = TestBed.createComponent(FloatingModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
