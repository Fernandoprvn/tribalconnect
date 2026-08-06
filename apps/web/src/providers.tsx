import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, createContext, useContext } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import { createTribalTheme } from './theme';

type ColorMode = 'light' | 'dark';
const ColorModeContext = createContext({ mode: 'light' as ColorMode, toggle: () => undefined });
export const useColorMode = () => useContext(ColorModeContext);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(() => (window.localStorage.getItem('tribalconnect-theme') as ColorMode) || 'light');
  const theme = useMemo(() => createTribalTheme(mode), [mode]);
  const value = useMemo(() => ({
    mode,
    toggle: () => setMode((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      window.localStorage.setItem('tribalconnect-theme', next);
      return next;
    }),
  }), [mode]);
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ColorModeContext.Provider value={value}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </ColorModeContext.Provider>
      </QueryClientProvider>
    </Provider>
  );
}
