---
name: Clinical Intelligence System
colors:
  surface: '#f5faf8'
  surface-dim: '#d6dbd9'
  surface-bright: '#f5faf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f5f2'
  surface-container: '#eaefed'
  surface-container-high: '#e4e9e7'
  surface-container-highest: '#dee4e1'
  on-surface: '#171d1c'
  on-surface-variant: '#3d4947'
  inverse-surface: '#2c3130'
  inverse-on-surface: '#edf2f0'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#585e6f'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff4'
  on-secondary-container: '#5c6274'
  tertiary: '#924628'
  on-tertiary: '#ffffff'
  tertiary-container: '#b05e3d'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#dce2f6'
  secondary-fixed-dim: '#c0c6da'
  on-secondary-fixed: '#151b2a'
  on-secondary-fixed-variant: '#404757'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb59a'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#773215'
  background: '#f5faf8'
  on-background: '#171d1c'
  surface-variant: '#dee4e1'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin: 24px
---

## Brand & Style

The design system is engineered for the high-stakes environment of pharmaceutical document intelligence. It prioritizes a **clinical, calm, and professional** atmosphere, ensuring that researchers and administrators can navigate complex data sets without cognitive fatigue.

Drawing inspiration from **Corporate/Modern** aesthetics and Material 3 principles, the system utilizes generous whitespace and a disciplined color palette to evoke a sense of precision and trust. The visual language is "invisible" by design—functional, reliable, and highly polished, similar to enterprise-grade administrative consoles. It focuses on clarity of information and the reduction of visual noise to support deep focus during document review.

## Colors

The color strategy uses a **Teal primary** to represent innovation and health, anchored by a **Dark Navy** for structural elements like sidebars to provide a strong sense of hierarchy and grounding.

- **Primary (#0d9488):** Reserved for primary actions, active states, and key brand moments.
- **Secondary/Sidebar (#0b1220):** Used exclusively for high-level navigation containers to contrast against the light content area.
- **Background (#f7f7f9):** A cool, neutral grey that reduces screen glare and separates surface cards.
- **Surface (#ffffff):** The standard canvas for content, cards, and data tables.

Semantic colors for status (Error, Success, Warning) should follow standard accessibility ratios against white surfaces, maintaining a slightly desaturated tone to remain within the "clinical" palette.

## Typography

This design system utilizes **Inter** for all roles due to its exceptional legibility in data-dense SaaS environments. The type scale is optimized for reading long-form clinical reports and scanning complex tables.

- **Headlines:** Use Semi-Bold (600) weights to provide clear section signposting without appearing overly aggressive.
- **Body Text:** The standard size is 14px (`body-md`) to maximize information density while maintaining readability. 16px is used for primary content flows.
- **Labels:** Small caps or increased letter spacing should be applied to `label-md` for metadata and table headers to distinguish them from interactive text.
- **Line Heights:** Generous line heights (1.5x for body) are maintained to ensure ease of scanning during document analysis.

## Layout & Spacing

The layout is built on a strict **8pt grid system**, ensuring mathematical harmony across all components.

- **Grid Model:** A 12-column fluid grid for the main content area.
- **Sidebar:** A fixed-width navigation rail (256px) using the Dark Navy background.
- **Margins & Gutters:** A standard 24px margin is applied to the main viewport, with 24px gutters between major layout containers.
- **Data Density:** For tables and lists, the spacing may collapse to a 4px vertical rhythm to allow for high-density document viewing without excessive scrolling.
- **Breakpoints:**
  - **Desktop:** 1440px+ (12 columns)
  - **Tablet:** 768px - 1439px (8 columns, sidebar collapses to icons)
  - **Mobile:** <768px (4 columns, sidebar becomes a drawer, 16px margins)

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and subtle **Ambient Shadows**, avoiding heavy gradients to maintain a clean, clinical feel.

- **Level 0 (Background):** #f7f7f9. Used for the lowest layer behind cards.
- **Level 1 (Surface):** #ffffff. Main content cards and panels. Use a subtle 1px border (#e2e8f0) instead of a shadow for a "flat-plus" look.
- **Level 2 (Raised):** Used for hover states on cards or navigation items. A soft, diffused shadow: `0px 4px 12px rgba(0, 0, 0, 0.05)`.
- **Level 3 (Overlay):** Modals and dropdowns. A more pronounced shadow to provide clear separation: `0px 12px 32px rgba(0, 0, 0, 0.1)`.

Consistent with Material 3, "Surface Tints" can be used—where the primary color is overlaid at 5% opacity on surfaces to indicate specific functional states.

## Shapes

The shape language is modern and friendly yet remains professional. A **12px (0.75rem)** corner radius is the standard for primary UI containers and cards, providing a softened, contemporary feel that distinguishes it from legacy enterprise software.

- **Standard Components:** 8px radius (Buttons, Input fields).
- **Large Containers:** 12px radius (Cards, Modals, Side Panels).
- **Small Elements:** 4px radius (Checkboxes, Tags).
- **Selection Indicators:** Pill-shaped (fully rounded) for high-contrast active states in navigation.

## Components

### Buttons
- **Primary:** Filled Teal (#0d9488) with White text. 8px radius.
- **Secondary:** Outlined with 1px border in Teal. 
- **Tertiary:** Text-only, Teal, used for low-emphasis actions.

### Input Fields
- **Style:** Outlined Material 3 style. 
- **Border:** 1px (#d1d5db), changing to 2px Teal on focus.
- **Labels:** Persistent floating labels or top-aligned labels in `label-md`.

### Cards
- **Construction:** White surface, 1px grey border, 12px radius. 
- **Header:** Optional subtle bottom-border to separate title from content.

### Tables & Data
- **Header:** #f9fafb background, Semi-bold 12px text, uppercase.
- **Rows:** 48px minimum height, subtle dividers (#f3f4f6), no vertical lines.
- **Hover:** Light grey (#f7f7f9) row highlight.

### Chips & Tags
- **Status Tags:** Soft background tints of the semantic color (e.g., Light Green background with Dark Green text) with a pill-shaped radius for high scannability in document lists.

### Sidebar Navigation
- **Background:** #0b1220.
- **Active State:** A "pill" highlight behind the icon/text using a semi-transparent primary teal or a solid teal vertical bar at the edge.