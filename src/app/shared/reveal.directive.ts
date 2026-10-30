import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input } from '@angular/core';

/**
 * Fades an element in the first time it scrolls into view.
 *
 * Falls back to showing the element immediately where IntersectionObserver is
 * unavailable; the reduced-motion case is handled in CSS.
 */
@Directive({
  selector: '[appReveal]',
  host: { class: 'u-reveal' },
})
export class RevealDirective implements OnDestroy {
  /**
   * Stagger, in milliseconds, applied as a transition delay.
   * Transformed so the bare `appReveal` attribute (an empty string) means 0.
   */
  readonly appReveal = input(0, {
    transform: (value: number | string): number => {
      const delay = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(delay) ? delay : 0;
    },
  });

  private readonly host = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement as HTMLElement;
      const delay = this.appReveal();

      if (delay > 0) {
        element.style.transitionDelay = `${delay}ms`;
      }

      if (typeof IntersectionObserver === 'undefined') {
        element.classList.add('is-visible');
        return;
      }

      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              element.classList.add('is-visible');
              this.observer?.disconnect();
            }
          }
        },
        { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
      );

      this.observer.observe(element);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
