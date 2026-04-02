/**
 * Stitch Design System Theme Configuration
 * Generated from project: 11872851072079016528 (OpenCode Monolith)
 * Design Strategy: The Technical Atelier
 */

export const stitchTheme = {
  colors: {
    // Primary Colors
    primary: '#2E6CC4',
    primaryContainer: '#2e6cc4',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#ecf0ff',
    primaryT10: '#001b3f',
    primaryT20: '#002f65',
    primaryT30: '#00458e',
    primaryT40: '#165db4',
    primaryT50: '#3b76cf',
    primaryT60: '#5890eb',
    primaryT70: '#7cabff',
    primaryT80: '#abc7ff',
    primaryT90: '#d7e3ff',
    primaryT95: '#ecf0ff',
    primaryT100: '#ffffff',

    // Secondary Colors
    secondary: '#B6CAE3',
    secondaryContainer: '#d0e4fe',
    onSecondary: '#ffffff',
    onSecondaryContainer: '#53667c',
    secondaryT10: '#071d30',
    secondaryT20: '#1e3245',
    secondaryT30: '#35485d',
    secondaryT40: '#4d6076',
    secondaryT50: '#65798f',
    secondaryT60: '#7f93aa',
    secondaryT70: '#99adc5',
    secondaryT80: '#b4c8e1',
    secondaryT90: '#d0e4fe',
    secondaryT95: '#e9f1ff',
    secondaryT100: '#ffffff',

    // Tertiary Colors
    tertiary: '#A85800',
    tertiaryT10: '#2f1400',
    tertiaryT20: '#4e2600',
    tertiaryT30: '#6f3800',
    tertiaryT40: '#924c00',
    tertiaryT50: '#b4620e',
    tertiaryT60: '#d47a2a',
    tertiaryT70: '#f49442',
    tertiaryT80: '#ffb780',
    tertiaryT90: '#ffdcc4',
    tertiaryT95: '#ffede3',
    tertiaryT100: '#ffffff',

    // Neutral Colors
    neutral: '#F2F4F7',
    neutralT0: '#000000',
    neutralT10: '#191c1e',
    neutralT20: '#2d3133',
    neutralT30: '#44474a',
    neutralT40: '#5c5f61',
    neutralT50: '#74777a',
    neutralT60: '#8e9194',
    neutralT70: '#a9abae',
    neutralT80: '#c4c7ca',
    neutralT90: '#e0e3e6',
    neutralT95: '#eff1f4',
    neutralT100: '#ffffff',

    // Surface Colors
    background: '#f7f9fc',
    surface: '#f7f9fc',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f2f4f7',
    surfaceContainer: '#eceef1',
    surfaceContainerHigh: '#e6e8eb',
    surfaceContainerHighest: '#e0e3e6',
    surfaceDim: '#d8dadd',
    surfaceBright: '#f7f9fc',
    surfaceVariant: '#e0e3e6',

    // On Surface Colors
    onBackground: '#191c1e',
    onSurface: '#191c1e',
    onSurfaceVariant: '#424752',

    // Outline Colors
    outline: '#727783',
    outlineVariant: '#c2c6d4',

    // Error Colors
    error: '#ba1a1a',
    errorContainer: '#ffdad6',
    onError: '#ffffff',
    onErrorContainer: '#93000a',

    // Inverse Colors
    inverseSurface: '#2d3133',
    inverseOnSurface: '#eff1f4',
    inversePrimary: '#abc7ff',

    // Fixed Colors
    primaryFixed: '#d7e3ff',
    primaryFixedDim: '#abc7ff',
    onPrimaryFixed: '#001b3f',
    onPrimaryFixedVariant: '#00458e',

    secondaryFixed: '#d0e4fe',
    secondaryFixedDim: '#b4c8e1',
    onSecondaryFixed: '#071d30',
    onSecondaryFixedVariant: '#35485d',

    tertiaryFixed: '#ffdcc4',
    tertiaryFixedDim: '#ffb780',
    onTertiaryFixed: '#2f1400',
    onTertiaryFixedVariant: '#6f3800',

    surfaceTint: '#165db4',
  },

  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

    // Display & Headlines
    headlineSm: {
      fontSize: '1.5rem',
      lineHeight: 1.4,
      letterSpacing: '-0.02em',
      fontWeight: 600,
    },

    // Body Text
    bodyMd: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
      fontWeight: 400,
    },

    // Labels (for table headers, sidebar items)
    labelMd: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
      letterSpacing: '0.05em',
      fontWeight: 500,
      textTransform: 'uppercase' as const,
    },

    labelSm: {
      fontSize: '0.6875rem',
      lineHeight: 1.4,
      letterSpacing: '0.05em',
      fontWeight: 600,
    },
  },

  spacing: {
    1: '0.2rem',   // 3.2px - micro-spacing
    2: '0.4rem',   // 6.4px
    3: '0.6rem',   // 9.6px
    4: '0.9rem',   // 14.4px - sidebar item spacing
    5: '1.2rem',   // 19.2px
    6: '1.6rem',   // 25.6px
    8: '2rem',     // 32px
  },

  borderRadius: {
    sm: '0.25rem',  // 4px - buttons
    md: '0.375rem', // 6px - chips/badges
    lg: '0.5rem',   // 8px
  },

  shadows: {
    // Ghost Shadow for detail drawer
    ghost: '0 12px 40px rgba(7, 29, 48, 0.06)',

    // Focus glow
    focusGlow: '0 0 0 2px rgba(0, 83, 169, 0.1)',
  },
} as const;

export type StitchTheme = typeof stitchTheme;
