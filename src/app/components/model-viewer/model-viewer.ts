import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { HouseScene } from './house-scene';
import { EXTERIOR_VIEWS, INITIAL_VIEW, INTERIOR_VIEWS, ViewName } from './model-views';

type Status = 'loading' | 'ready' | 'unsupported';

/**
 * Hosts the three.js concept model. The scene module (and three itself) is
 * imported only after the first browser render: prerendering runs in Node,
 * which has no WebGL, and keeping three out of the initial bundle lets the
 * rest of the page paint first.
 */
@Component({
  selector: 'app-model-viewer',
  templateUrl: './model-viewer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelViewer {
  protected readonly exteriorViews = EXTERIOR_VIEWS;
  protected readonly interiorViews = INTERIOR_VIEWS;

  protected readonly status = signal<Status>('loading');
  protected readonly activeView = signal<ViewName>(INITIAL_VIEW);
  protected readonly showLabels = signal(false);
  protected readonly showNeighbours = signal(true);
  protected readonly evening = signal(false);

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly labelLayer = viewChild.required<ElementRef<HTMLElement>>('labelLayer');
  private scene: HouseScene | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    let destroyed = false;

    destroyRef.onDestroy(() => {
      destroyed = true;
      this.scene?.dispose();
      this.scene = null;
    });

    afterNextRender(async () => {
      try {
        const { createHouseScene } = await import('./house-scene');
        // The component may have been torn down while the chunk loaded.
        if (destroyed) {
          return;
        }
        this.scene = createHouseScene(this.stage().nativeElement, this.labelLayer().nativeElement);
        this.status.set('ready');
      } catch (error) {
        console.error('3D model could not start', error);
        this.status.set('unsupported');
      }
    });
  }

  protected goTo(view: ViewName): void {
    this.activeView.set(view);
    this.scene?.goTo(view);
  }

  protected toggleLabels(): void {
    this.showLabels.update((on) => !on);
    this.scene?.setLabels(this.showLabels());
  }

  protected toggleNeighbours(): void {
    this.showNeighbours.update((on) => !on);
    this.scene?.setNeighbours(this.showNeighbours());
  }

  protected toggleEvening(): void {
    this.evening.update((on) => !on);
    this.scene?.setEvening(this.evening());
  }
}
