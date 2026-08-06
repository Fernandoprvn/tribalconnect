import { createTheme, responsiveFontSizes } from '@mui/material/styles';

const brand = {
  forest: '#0B6E4F',
  leaf: '#2E8B57',
  gold: '#F4B400',
  ink: '#173229',
  muted: '#61736C',
  paper: '#FFFFFF',
  mist: '#F8FAFC',
};

export const createTribalTheme = (mode: 'light' | 'dark') => responsiveFontSizes(createTheme({
  palette: {
    mode,
    primary: { main: brand.forest, dark: '#075239', light: '#E1F2E9', contrastText: '#fff' },
    secondary: { main: brand.leaf, light: '#D8F0E1', dark: '#1B643C' },
    warning: { main: brand.gold, dark: '#B97900' },
    background: mode === 'light'
      ? { default: brand.mist, paper: brand.paper }
      : { default: '#11211B', paper: '#173229' },
    text: mode === 'light'
      ? { primary: brand.ink, secondary: brand.muted }
      : { primary: '#F0F8F4', secondary: '#B8C9C1' },
    divider: mode === 'light' ? '#E2EDE8' : 'rgba(255,255,255,.12)',
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.04em' },
    h2: { fontWeight: 800, letterSpacing: '-0.035em' },
    h3: { fontWeight: 800, letterSpacing: '-0.02em' },
    h4: { fontWeight: 800, letterSpacing: '-0.015em' },
    h5: { fontWeight: 750 },
    button: { fontWeight: 750, textTransform: 'none' },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '::selection': { backgroundColor: '#B8DFC8', color: brand.ink },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 12, boxShadow: 'none', minHeight: 42 },
        contained: { boxShadow: '0 8px 20px rgba(11,110,79,.18)' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: mode === 'light' ? '#E2EDE8' : 'rgba(255,255,255,.12)' },
      },
    },
    MuiCard: {
      styleOverrides: { root: { boxShadow: mode === 'light' ? '0 8px 28px rgba(17, 60, 43, .06)' : 'none' } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 700 } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 800, color: mode === 'light' ? brand.muted : '#B8C9C1' } } },
  },
}));
