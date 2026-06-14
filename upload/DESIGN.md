---
name: FlashBite
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf2'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4ff'
  surface-container: '#e5efff'
  surface-container-high: '#dbe9ff'
  surface-container-highest: '#d4e4fa'
  on-surface: '#0d1c2d'
  on-surface-variant: '#40484d'
  inverse-surface: '#233143'
  inverse-on-surface: '#e9f1ff'
  outline: '#70787d'
  outline-variant: '#bfc8cd'
  surface-tint: '#0d6683'
  primary: '#0d6683'
  on-primary: '#ffffff'
  primary-container: '#89cff0'
  on-primary-container: '#005974'
  inverse-primary: '#8ad0f1'
  secondary: '#4e6073'
  on-secondary: '#ffffff'
  secondary-container: '#cfe2f9'
  on-secondary-container: '#526478'
  tertiary: '#5a5f62'
  on-tertiary: '#ffffff'
  tertiary-container: '#c2c6ca'
  on-tertiary-container: '#4e5356'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#bee9ff'
  primary-fixed-dim: '#8ad0f1'
  on-primary-fixed: '#001f2a'
  on-primary-fixed-variant: '#004d65'
  secondary-fixed: '#d1e4fb'
  secondary-fixed-dim: '#b5c8df'
  on-secondary-fixed: '#091d2e'
  on-secondary-fixed-variant: '#36485b'
  tertiary-fixed: '#dfe3e7'
  tertiary-fixed-dim: '#c3c7cb'
  on-tertiary-fixed: '#171c1f'
  on-tertiary-fixed-variant: '#42474b'
  background: '#f8f9ff'
  on-background: '#0d1c2d'
  surface-variant: '#d4e4fa'
typography:
  display-lg:
    fontFamily: Nunito Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Nunito Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Nunito Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Nunito Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Nunito Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Nunito Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Nunito Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Nunito Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 16px
  label-sm:
    fontFamily: Nunito Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 20px
  gutter: 16px
---

## Brand & Style

The design system centers on the "Tempting Trust" narrative, balancing the urgency of flash deals with the reliability of a high-end food delivery service. The visual language is optimized for quick decision-making and appetizing presentation.

The style is **Corporate / Modern** with a focus on high-clarity e-commerce patterns. It avoids visual clutter and complex effects like glassmorphism, opting instead for a "fresh and clean" aesthetic that prioritizes food photography. The emotional response should be one of immediate craving backed by a sense of professional security.

## Colors

The palette is anchored by a refreshing **Soft Baby Blue**, chosen to evoke cleanliness and trust. This is contrasted against **Dark Slate Grey** for high-legibility typography.

- **Primary**: Used for key actions, progress indicators, and active states.
- **Secondary**: Reserved for primary text and grounding elements.
- **Tertiary/Surface**: Soft, cool greys used to differentiate card backgrounds from the pure white canvas.
- **Urgency Accents**: While not in the primary palette, use a soft coral or muted orange sparingly for "Ending Soon" timers to maintain the "Tempting" aspect without appearing aggressive.

## Typography

This design system utilizes **Nunito Sans** for its friendly, rounded terminals that mirror the approachable nature of the brand. 

- **Headlines**: Use heavy weights (700-800) to create a strong visual hierarchy against food imagery. 
- **Urgency**: Use `label-md` for price tags and countdown timers to ensure they are distinct from descriptive body text.
- **Legibility**: Line heights are generous to ensure the app remains easy to navigate while on the move.

## Layout & Spacing

The layout follows a **fluid grid** model optimized for mobile-first consumption. 

- **Margins**: A consistent 20px side margin ensures content doesn't feel cramped on modern edge-to-edge displays.
- **Rhythm**: An 8px base unit drives all spacing. 
- **Card Layouts**: In the "Flash Deal" feed, items should use a single-column layout to maximize the "appetizing" impact of food photography, or a two-column masonry grid for smaller "side-bite" offers.
- **Stacking**: Use `lg` (24px) spacing between distinct content sections and `md` (16px) for elements within a single logical group.

## Elevation & Depth

Hierarchy is established through soft, natural shadows rather than heavy borders or overlays.

- **Shadow-SM**: Used for subtle interactive elements like chips or small cards. (0px 2px 4px rgba(44, 62, 80, 0.08)).
- **Shadow-MD**: The standard for deal cards and navigation bars, creating a clear lift from the background. (0px 4px 12px rgba(44, 62, 80, 0.12)).
- **Shadow-LG**: Reserved for modals and bottom sheets to focus user attention. (0px 8px 24px rgba(44, 62, 80, 0.16)).

Avoid dark or saturated shadows; ensure the shadow color is a very low-opacity version of the Dark Slate Grey text color to maintain a cohesive, clean look.

## Shapes

The design system employs a "Soft-Rounded" geometry to reinforce the friendly and approachable brand personality.

- **Cards**: 16px radius creates a modern, nested appearance for deal containers.
- **Buttons**: 12px radius provides a distinct interactive shape that feels "clickable."
- **Modals/Bottom Sheets**: 24px top-radius for a soft, "nested" sheet effect that slides up from the bottom of the screen.
- **Images**: All food photography must inherit the container's 16px radius to maintain the cohesive visual language.

## Components

### Buttons
- **Primary**: Uses a linear gradient from Baby Blue (#89CFF0) to a lighter blue. Apply a 10% white overlay (linear-gradient(to bottom, rgba(255,255,255,0.2), transparent)) to create a subtle glossy, high-quality finish.
- **Secondary**: Outlined in Baby Blue with a 1.5px stroke and transparent background.

### Cards
- Food deal cards must feature a prominent image. Use a 16px border radius. Information (Price, Time Left, Distance) should be overlaid using high-contrast labels at the bottom of the image or in a clean white area below it.

### Input Fields
- Soft grey backgrounds (#F1F5F9) with no border until focused. On focus, apply a 2px Baby Blue border.

### Chips & Tags
- Used for food categories (e.g., "Vegan," "Spicy"). Use `rounded-pill` (fully rounded sides) with light pastel backgrounds related to the category, or a simple light blue tint.

### Iconography
- Use **Outline-style** icons with a 2px stroke weight. All corners in the icons must be rounded (round caps and joins) to match the typography and shape language.

### Animations
- All transitions use a **Spring** physics model: `Stiffness: 300, Damping: 25`. This creates a playful, "bouncy" feel when opening a deal or clicking a button, reinforcing the "Flash" energy of the app.