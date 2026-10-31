import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PLOT, PlotVertex } from '../../plot.config';
import { PROJECT } from '../../project.config';
import { RevealDirective } from '../../shared/reveal.directive';

/** Drawing margin around the plot, in metres. */
const PAD = 3;

/**
 * Draws the plot from PLOT. With no surveyed outline it shows the building
 * footprint alone and says the boundary is pending; once `outline` is filled
 * in, the boundary polygon is drawn around the footprint.
 */
@Component({
  selector: 'app-plot',
  templateUrl: './plot.html',
  imports: [RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Plot {
  protected readonly plot = PLOT;
  protected readonly project = PROJECT;
  protected readonly pending = PLOT.survey === 'pending' || PLOT.outline === null;

  private readonly footprint: readonly PlotVertex[] = [
    { x: 0, z: 0 },
    { x: PLOT.footprint.frontWidth, z: 0 },
    { x: PLOT.footprint.rearWidth, z: PLOT.footprint.depth },
    { x: 0, z: PLOT.footprint.depth },
  ];

  private readonly bounds = (() => {
    const all = [...this.footprint, ...(PLOT.outline ?? [])];
    const xs = all.map((p) => p.x);
    const zs = all.map((p) => p.z);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  })();

  /** Street at the bottom, garden at the top, as on the plan sheets. */
  protected readonly viewBox = [
    this.bounds.minX - PAD,
    -PAD,
    this.bounds.maxX - this.bounds.minX + PAD * 2,
    this.bounds.maxZ - this.bounds.minZ + PAD * 2,
  ].join(' ');

  protected readonly footprintPoints = this.toPoints(this.footprint);
  protected readonly outlinePoints = PLOT.outline ? this.toPoints(PLOT.outline) : null;

  protected readonly width = PLOT.footprint.frontWidth;
  protected readonly rearWidth = PLOT.footprint.rearWidth;
  protected readonly depth = PLOT.footprint.depth;
  /** SVG y of the street line (z = 0). */
  protected readonly streetY = this.bounds.maxZ;
  protected readonly widthLabel = `${PLOT.footprint.frontWidth.toFixed(2)} m`;
  protected readonly rearWidthLabel = `${PLOT.footprint.rearWidth.toFixed(2)} m`;
  /** Dashed "pending survey" frame drawn just outside the footprint. */
  protected readonly pendingFramePoints = this.toPoints([
    { x: -0.6, z: -0.6 },
    { x: PLOT.footprint.frontWidth + 0.6, z: -0.6 },
    { x: PLOT.footprint.rearWidth + 0.6, z: PLOT.footprint.depth + 1.2 },
    { x: -0.6, z: PLOT.footprint.depth + 1.2 },
  ]);
  protected readonly depthLabel = `${PLOT.footprint.depth.toFixed(2)} m`;

  private toPoints(vertices: readonly PlotVertex[]): string {
    return vertices.map((p) => `${p.x},${this.bounds.maxZ - p.z}`).join(' ');
  }
}
