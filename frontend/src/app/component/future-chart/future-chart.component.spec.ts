import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FutureChartComponent } from './future-chart.component';

describe('FutureChartComponent', () => {
  let component: FutureChartComponent;
  let fixture: ComponentFixture<FutureChartComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FutureChartComponent]
    });
    fixture = TestBed.createComponent(FutureChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
