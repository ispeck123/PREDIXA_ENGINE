import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomecandlesForTestComponent } from './homecandles-for-test.component';

describe('HomecandlesForTestComponent', () => {
  let component: HomecandlesForTestComponent;
  let fixture: ComponentFixture<HomecandlesForTestComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HomecandlesForTestComponent]
    });
    fixture = TestBed.createComponent(HomecandlesForTestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
