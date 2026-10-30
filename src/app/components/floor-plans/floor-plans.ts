import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { PROJECT, PlanSheet } from '../../project.config';
import { RevealDirective } from '../../shared/reveal.directive';

/** Zoom levels relative to the sheet fitted to the screen. */
const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;

@Component({
  selector: 'app-floor-plans',
  templateUrl: './floor-plans.html',
  imports: [RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloorPlans {
  protected readonly sheets = PROJECT.planSheets;

  /** Index of the sheet open in the viewer, or null when closed. */
  protected readonly openIndex = signal<number | null>(null);
  protected readonly current = computed<PlanSheet | null>(() => {
    const index = this.openIndex();
    return index === null ? null : this.sheets[index];
  });

  private readonly zoomIndex = signal(0);
  protected readonly zoom = computed(() => ZOOM_STEPS[this.zoomIndex()]);
  protected readonly canZoomIn = computed(() => this.zoomIndex() < ZOOM_STEPS.length - 1);
  protected readonly canZoomOut = computed(() => this.zoomIndex() > 0);

  /**
   * Width of the sheet when fitted to the viewport, measured once per opening.
   * Zoomed widths are multiples of it, so 2× always means twice the fit size.
   */
  private fitWidth = 0;
  protected readonly imageWidth = computed(() =>
    this.zoom() === 1 || !this.fitWidth ? null : `${Math.round(this.fitWidth * this.zoom())}px`,
  );

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly image = viewChild<ElementRef<HTMLImageElement>>('image');
  private lastFocused: HTMLElement | null = null;
  private drag: { x: number; y: number; left: number; top: number } | null = null;

  protected open(index: number): void {
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.fitWidth = 0;
    this.zoomIndex.set(0);
    this.openIndex.set(index);
    document.body.style.overflow = 'hidden';
    // Wait for the dialog to render before moving focus into it.
    queueMicrotask(() => this.dialog()?.nativeElement.focus());
  }

  protected close(): void {
    this.openIndex.set(null);
    document.body.style.overflow = '';
    this.lastFocused?.focus();
    this.lastFocused = null;
  }

  protected zoomIn(): void {
    this.setZoom(this.zoomIndex() + 1);
  }

  protected zoomOut(): void {
    this.setZoom(this.zoomIndex() - 1);
  }

  protected fit(): void {
    this.setZoom(0);
  }

  protected toggleZoom(): void {
    this.setZoom(this.zoomIndex() === 0 ? 2 : 0);
  }

  /** Changes zoom while keeping the point at the centre of the viewport in place. */
  private setZoom(index: number): void {
    const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index));
    const viewport = this.viewport()?.nativeElement;
    const image = this.image()?.nativeElement;
    if (!viewport || !image || next === this.zoomIndex()) {
      return;
    }

    if (!this.fitWidth) {
      this.fitWidth = image.clientWidth;
    }

    const centreX = (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
    const centreY = (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;

    this.zoomIndex.set(next);

    requestAnimationFrame(() => {
      viewport.scrollLeft = centreX * viewport.scrollWidth - viewport.clientWidth / 2;
      viewport.scrollTop = centreY * viewport.scrollHeight - viewport.clientHeight / 2;
    });
  }

  /** Mouse drag pans the zoomed sheet; touch and trackpads scroll natively. */
  protected onPointerDown(event: PointerEvent): void {
    const viewport = this.viewport()?.nativeElement;
    if (event.pointerType !== 'mouse' || this.zoomIndex() === 0 || !viewport) {
      return;
    }
    event.preventDefault();
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    const viewport = this.viewport()?.nativeElement;
    if (!this.drag || !viewport) {
      return;
    }
    viewport.scrollLeft = this.drag.left - (event.clientX - this.drag.x);
    viewport.scrollTop = this.drag.top - (event.clientY - this.drag.y);
  }

  protected onPointerUp(): void {
    this.drag = null;
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (this.openIndex() === null) {
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case '+':
      case '=':
        event.preventDefault();
        this.zoomIn();
        break;
      case '-':
        event.preventDefault();
        this.zoomOut();
        break;
      case '0':
        event.preventDefault();
        this.fit();
        break;
    }
  }
}
