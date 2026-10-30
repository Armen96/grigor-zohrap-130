/**
 * Camera presets offered by the 3D viewer. Kept apart from the scene module so
 * the toolbar can render without pulling three.js into the initial bundle.
 */
export type ViewName =
  | 'front'
  | 'aerial'
  | 'rear'
  | 'terrace'
  | 'upper'
  | 'ground'
  | 'living'
  | 'kitchen'
  | 'bedroom'
  | 'lobby'
  | 'garage';

export interface ViewOption {
  readonly id: ViewName;
  readonly label: string;
}

export const EXTERIOR_VIEWS: readonly ViewOption[] = [
  { id: 'front', label: 'Street view' },
  { id: 'aerial', label: 'Aerial' },
  { id: 'rear', label: 'Garden side' },
  { id: 'terrace', label: 'On the terrace' },
];

export const INTERIOR_VIEWS: readonly ViewOption[] = [
  { id: 'upper', label: 'Upper floor plan' },
  { id: 'ground', label: 'Ground floor plan' },
  { id: 'living', label: 'Living' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'lobby', label: 'Lobby' },
  { id: 'garage', label: 'Garage + stair' },
];

export const INITIAL_VIEW: ViewName = 'front';
