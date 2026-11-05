/**
 * Plot boundary.
 *
 * The real plot is not rectangular: the right boundary angles inward toward
 * the garden. The width was tape-measured on 31 Oct 2026 (10.80 m at the
 * street, 10.00 m at the rear wall). Revision 06 cuts the building to 14.70 m
 * deep so its footprint stays within `coverageLimit` of the registered area. The full boundary still awaits a survey, so `outline` is null and
 * the site shows the footprint with a "pending survey" note.
 *
 * When the survey arrives, fill in `outline` (and set `survey` to 'surveyed');
 * no component needs to change.
 */

/**
 * A boundary corner in metres, in the same frame as the plans and 3D model:
 * x runs left → right as seen from the street, starting at the left boundary
 * of the building; z runs from the street line (0) toward the garden.
 */
export interface PlotVertex {
  readonly x: number;
  readonly z: number;
}

export interface PlotConfig {
  readonly survey: 'pending' | 'surveyed';
  /** Boundary corners in order, either direction. Null until surveyed. */
  readonly outline: readonly PlotVertex[] | null;
  /**
   * The building footprint (Revision 06): full plot width at the street line,
   * narrowing on the right to `rearWidth` at the rear wall.
   */
  readonly footprint: {
    readonly frontWidth: number;
    readonly rearWidth: number;
    readonly depth: number;
  };
  /** Registered area from the ownership certificate: 0.038505 ha. */
  readonly registeredAreaM2: number;
  readonly cadastralCode: string;
  /** Share of the plot that may be built on (0.4 = 40%). */
  readonly coverageLimit: number;
  readonly pendingNote: string;
}

export const PLOT: PlotConfig = {
  survey: 'pending',
  outline: null,
  footprint: { frontWidth: 10.8, rearWidth: 10, depth: 14.7 },
  registeredAreaM2: 385.05,
  cadastralCode: '01-001-0306-0048',
  coverageLimit: 0.4,
  pendingNote:
    'Widths tape-measured on 31 Oct 2026: 10.80 m at the street, 10.00 m at the rear wall, with ' +
    'the right boundary angling inward. The full plot boundary is pending survey.',
};
