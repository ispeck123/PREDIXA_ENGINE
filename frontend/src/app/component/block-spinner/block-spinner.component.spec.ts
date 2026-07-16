import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlockSpinnerComponent } from './block-spinner.component';

describe('BlockSpinnerComponent', () => {
  let component: BlockSpinnerComponent;
  let fixture: ComponentFixture<BlockSpinnerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [BlockSpinnerComponent]
    });
    fixture = TestBed.createComponent(BlockSpinnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
