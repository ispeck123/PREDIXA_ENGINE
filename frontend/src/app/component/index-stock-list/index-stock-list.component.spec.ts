import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IndexStockListComponent } from './index-stock-list.component';

describe('IndexStockListComponent', () => {
  let component: IndexStockListComponent;
  let fixture: ComponentFixture<IndexStockListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [IndexStockListComponent]
    });
    fixture = TestBed.createComponent(IndexStockListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
