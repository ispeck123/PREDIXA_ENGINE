import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChartAnalyticsComponent } from './chart-analytics.component';

describe('ChartAnalyticsComponent', () => {
  let component: ChartAnalyticsComponent;
  let fixture: ComponentFixture<ChartAnalyticsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ChartAnalyticsComponent]
    });
    fixture = TestBed.createComponent(ChartAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
