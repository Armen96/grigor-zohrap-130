/**
 * Central project content.
 *
 * Every dimension and area below is copied from the Revision 06 plan sheet
 * (public/docs/revision-06-plans.pdf, 4 Nov 2026), which is the source of
 * truth. Revision 06 shortens Revision 05 from 17.00 m to 14.70 m deep so the
 * footprint stays under the 40% site-coverage limit. Do not add a figure that is not
 * on that sheet. Where a value comes
 * from another document, `source` says which.
 */

export interface Fact {
  readonly label: string;
  readonly value: string;
  /** Short qualifier shown under the label, e.g. "clear" or "gross". */
  readonly detail?: string;
}

export interface FactGroup {
  readonly title: string;
  readonly facts: readonly Fact[];
}

export interface DesignNote {
  readonly title: string;
  readonly body: string;
  /** Set when the note is not stated on the plan sheet itself. */
  readonly source?: string;
}

export interface PlanSheet {
  readonly id: string;
  readonly title: string;
  readonly caption: string;
  /** Full-resolution render, used in the zoom viewer. */
  readonly image: string;
  /** Smaller render for the inline preview. */
  readonly preview: string;
  readonly width: number;
  readonly height: number;
  readonly pdf: string;
}

export interface ProjectDocument {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  /** File type and size as shown to the reader, e.g. "PDF · 75 KB". */
  readonly meta: string;
}

/**
 * A contact channel is rendered only when its value is non-null.
 * Leaving a value null hides the button entirely rather than emitting a
 * dead link.
 */
export interface ContactConfig {
  /** E.164, e.g. '+37477123456'. */
  readonly phone: string | null;
  /** Digits only, no '+', e.g. '37477123456'. */
  readonly whatsapp: string | null;
  /** Username without '@', or a phone number in '+374…' form. */
  readonly telegram: string | null;
  readonly email: string | null;
}

export const PROJECT = {
  name: 'ZOHRAP 130',
  title: 'House over storage',
  revision: 'Revision 06',
  revisionDate: '4 Nov 2026',
  address: 'G. Zohrap St. 130, Ajapnyak, Yerevan',

  summary:
    'A new building replacing the old one on the plot: storage and a ' +
    'private garage on the ground floor; above it the house, with living and kitchen on the ' +
    'street terrace and bedrooms toward the garden. ' +
    'Concept only; dimensions in metres.',

  factGroups: [
    {
      title: 'Overall',
      facts: [
        {
          label: 'Footprint',
          value: '10.80 / 10.00 × 14.70 m',
          detail: 'street / rear width; right side angles in',
        },
        { label: 'Gross footprint', value: '152.9 m²', detail: '39.7% of the plot; limit 40%' },
        {
          label: 'Windows',
          value: 'Front and rear only',
          detail: 'side walls are blind; roof lights',
        },
      ],
    },
    {
      title: 'Ground floor',
      facts: [
        {
          label: 'Storage',
          value: '≈ 91 m²',
          detail: 'clear; front wing 4.47 m wide, rear storage 5.45 m deep',
        },
        {
          label: 'WC',
          value: '1.35 × 1.55 m',
          detail: 'rear-left corner of the garage; door from the rear storage',
        },
        {
          label: 'Private garage',
          value: '5.10 × 8.50 m',
          detail:
            'clear, widening to 5.56 m at the street; two cars side by side (2 × 2.20 × 4.70); 4.80 m door with a pass door; free space behind',
        },
        {
          label: 'L-stair',
          value: 'open to the garage',
          detail: 'inside the garage, up the right wall, turns left at a landing',
        },
      ],
    },
    {
      title: 'Upper floor',
      facts: [
        { label: 'Enclosed house', value: '131.4 m²', detail: 'gross' },
        {
          label: 'Front terrace',
          value: '21.5 m²',
          detail: 'gross; 10.80 → 10.69 × 2.00 m',
        },
        { label: 'Upper floor total', value: '152.9 m²', detail: '131.4 + 21.5, gross' },
      ],
    },
    {
      title: 'Rooms',
      facts: [
        {
          label: 'Living + kitchen / dining',
          value: '≈ 41 m²',
          detail: 'across the front; living 4.30 m deep',
        },
        { label: 'Bedrooms (2)', value: '≈ 15.0 m² each', detail: '4.05 × 3.70 m clear' },
        {
          label: 'Bath',
          value: '2.70 × 3.80 m',
          detail: 'tub, shower, washing machine; roof light',
        },
        { label: 'Corridor', value: '2.35 m', detail: 'clear width; the stair door opens onto it' },
        { label: 'Hall', value: '1.35 m', detail: 'clear' },
        { label: 'Passage to garden', value: '1.00–1.20 m', detail: 'clear' },
      ],
    },
  ] as readonly FactGroup[],

  /** Plan sheet notes: gross areas include walls; terrace before railings/curbs. */
  areaNote: 'Gross areas include walls. Terrace area is before railings and curbs.',

  designNotes: [
    {
      title: 'Blind side walls',
      body:
        'Both side walls are party walls with the neighbours and have no windows. Windows sit on ' +
        'the street and garden sides only.',
    },
    {
      title: 'Skylights',
      body:
        'Stair, bath, hall and dining area get roof lights, since side windows are not ' +
        'possible.',
      source: 'Illustrated floor plans and 3D model',
    },
    {
      title: 'Home route through the garage, behind a stair door',
      body:
        'Garage (pass door in the garage door) → L-stair (inside the garage, turns left) → stair ' +
        'door → corridor → living and kitchen at the front; bedrooms through the hall. No ' +
        'access to the house through the storage.',
    },
    {
      title: 'Provisional garden stair',
      body:
        'A 1.00–1.20 m passage beside the bedrooms leads to the garden door. The external stair ' +
        'down to the garden is reserved only. It is not usable until levels, an external ' +
        'landing or stair, and boundary clearances are verified.',
    },
  ] as readonly DesignNote[],

  /** Rev 05 "Design basis / read before using this sketch", verbatim in substance. */
  toVerify: [
    'Coverage: only 40% of the land may be built on. 40% of 385.05 m² (ownership certificate) = 154.0 m². At 14.70 m deep the footprint is 152.9 m² (39.7%); Revision 05 at 17.00 m was 176.8 m² (45.9%).',
    'Confirm with the municipality which area counts (ground footprint, or also the 2.00 m terrace over the garage) and whether a surveyed area replaces 385.05 m².',
    'Width check at the rear wall: 0.30 + 4.05 + 0.15 + 4.05 + 0.15 + 1.00 + 0.30 = 10.00 m. At the street: 0.30 + 4.47 + 0.15 + 5.56 + 0.30 = 10.80 m. Garage 5.10 m clear at its rear wall, 8.50 m deep; car spaces 2 × 2.20 = 4.40 m; 2.40 m between the WC and the stair.',
    'The new enclosure is conceptual: verify roof, structural support, headroom, ventilation and fire separation from the garage and storage.',
    'Tape measurement only: which boundary angles, boundary clearances and planning approval must be confirmed against the cadastral survey.',
  ] as readonly string[],

  planSheets: [
    {
      id: 'revision-06',
      title: 'Revision 06 plan sheet',
      caption: 'Source of truth for every dimension and area. Front at bottom, garden at top.',
      image: '/images/plans/revision-06.webp',
      preview: '/images/plans/revision-06-1200.webp',
      width: 2400,
      height: 1920,
      pdf: '/docs/revision-06-plans.pdf',
    },
    {
      id: 'illustrated',
      title: 'Illustrated floor plans',
      caption:
        'Top-down render of the Revision 06 model, 14.70 m deep for the 40% limit, with an area schedule. Furniture and finishes are illustrative.',
      image: '/images/plans/floor-plans-illustrated.webp',
      preview: '/images/plans/floor-plans-illustrated-1200.webp',
      width: 3000,
      height: 1890,
      pdf: '/docs/floor-plans-illustrated.pdf',
    },
  ] as readonly PlanSheet[],

  documents: [
    {
      title: 'Revision 06 plan sheet',
      description:
        'Both floors at 14.70 m deep for the 40% coverage limit, area check and design basis. 4 Nov 2026.',
      href: '/docs/revision-06-plans.pdf',
      meta: 'PDF · 183 KB',
    },
    {
      title: 'Illustrated floor plans',
      description: 'Furnished plan render with area schedule and design notes.',
      href: '/docs/floor-plans-illustrated.pdf',
      meta: 'PDF · 2.1 MB',
    },
    {
      title: '3D concept model',
      description: 'The model above as a single standalone page. Needs an internet connection.',
      href: '/docs/house-over-warehouse-3d.html',
      meta: 'HTML · 56 KB',
    },
    {
      title: 'Ownership certificate',
      description:
        'State registration of rights, 30 Aug 2022, cadastral code 01-001-0306-0048. In Armenian.',
      href: '/docs/ownership-certificate.pdf',
      meta: 'PDF · 0.8 MB',
    },
    {
      title: 'Site map',
      description: 'The plot highlighted in green among the neighbouring buildings.',
      href: '/images/site-map.png',
      meta: 'PNG · 64 KB',
    },
  ] as readonly ProjectDocument[],

  contact: {
    phone: '+37498512371',
    whatsapp: '37498512371',
    telegram: '+37498512371',
    email: 'barsegyan96armen@gmail.com',
  } as ContactConfig,

  whatsappMessage:
    'Hello, I am reviewing the House over storage concept (Revision 06) for G. Zohrap 130.',

  emailSubject: 'House over storage, Revision 06',

  year: 2026,
} as const;

/** True when at least one contact channel is configured. */
export const HAS_CONTACT =
  PROJECT.contact.phone !== null ||
  PROJECT.contact.whatsapp !== null ||
  PROJECT.contact.telegram !== null ||
  PROJECT.contact.email !== null;
