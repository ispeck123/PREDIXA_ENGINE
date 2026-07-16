import {
  Component,
  HostListener,
  OnDestroy
} from '@angular/core';

import {
  NavigationEnd,
  NavigationStart,
  Router
} from '@angular/router';

import {
  filter,
  Subscription
} from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnDestroy {

  title = 'fin_product';

  showLayout = true;

  private readonly hideOn: string[] = [
    '/',
    '/login',
    '/landing',
    '/feature'
  ];

  private readonly subscriptions = new Subscription();

  constructor(private router: Router) {

    /*
     * Your existing code remains here.
     * It controls header/sidebar visibility.
     */
    this.subscriptions.add(
      this.router.events
        .pipe(
          filter(
            (event): event is NavigationEnd =>
              event instanceof NavigationEnd
          )
        )
        .subscribe(event => {
          const url =
            event.urlAfterRedirects.split('?')[0];

          this.showLayout =
            !this.hideOn.includes(url);
        })
    );

    /*
     * Global modal cleanup before route navigation.
     */
    this.subscriptions.add(
      this.router.events
        .pipe(
          filter(
            (event): event is NavigationStart =>
              event instanceof NavigationStart
          )
        )
        .subscribe(() => {
          this.cleanupGlobalModalState();
        })
    );
  }

  /*
   * Handles browser Back and Forward buttons.
   */
  @HostListener('window:popstate')
  onBrowserBackOrForward(): void {
    this.cleanupGlobalModalState();

    /*
     * Cleanup again after browser history handling completes.
     */
    window.setTimeout(() => {
      this.cleanupGlobalModalState();
    }, 100);
  }

  private cleanupGlobalModalState(): void {

    /*
     * Hide any modal that Bootstrap did not close properly.
     */
    document
      .querySelectorAll<HTMLElement>(
        '.modal.show, ' +
        '.modal[aria-modal="true"], ' +
        '.modal[style*="display: block"]'
      )
      .forEach(modal => {
        modal.classList.remove('show');

        modal.style.display = 'none';

        modal.setAttribute(
          'aria-hidden',
          'true'
        );

        modal.removeAttribute(
          'aria-modal'
        );
      });

    /*
     * Remove the dimmed Bootstrap backdrop.
     */
    document
      .querySelectorAll(
        '.modal-backdrop, .offcanvas-backdrop'
      )
      .forEach(backdrop => {
        backdrop.remove();
      });

    /*
     * Restore page scrolling and clicking.
     */
    document.body.classList.remove(
      'modal-open',
      'offcanvas-open'
    );

    document.documentElement.classList.remove(
      'modal-open'
    );

    document.body.style.removeProperty(
      'overflow'
    );

    document.body.style.removeProperty(
      'padding-right'
    );

    document.body.style.removeProperty(
      'position'
    );

    document.documentElement.style.removeProperty(
      'overflow'
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.cleanupGlobalModalState();
  }
}