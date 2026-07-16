import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotificationPopupComponent } from './notification-popup.component';

describe('NotificationPopupComponent', () => {
  let component: NotificationPopupComponent;
  let fixture: ComponentFixture<NotificationPopupComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [NotificationPopupComponent]
    });
    fixture = TestBed.createComponent(NotificationPopupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
