/**
 * Plot boundary.
 *
 * The real plot is not rectangular: the right boundary angles inward toward
 * the garden. Survey dimensions are pending, so `outline` is null and the site
 * shows only the rectangular building footprint with a "pending survey" note.
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
  /** The building footprint drawn inside the plot (Revision 04). */
  readonly footprint: { readonly width: number; readonly depth: number };
  /** Registered area from the ownership certificate: 0.038505 ha. */
  readonly registeredAreaM2: number;
  readonly cadastralCode: string;
  readonly pendingNote: string;
}

export const PLOT: PlotConfig = {
  survey: 'pending',
  outline: null,
  footprint: { width: 9, depth: 17 },
  registeredAreaM2: 385.05,
  cadastralCode: '01-001-0306-0048',
  pendingNote:
    'Boundary pending survey. The right boundary angles inward toward the garden; until the ' +
    'survey arrives, only the rectangular 9.00 × 17.00 m building footprint is shown.',
};
