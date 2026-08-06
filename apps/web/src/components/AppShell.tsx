import {
  AccountCircleOutlined, ApartmentOutlined, AssessmentOutlined, CampaignOutlined, DashboardOutlined,
  DescriptionOutlined, Diversity3Outlined, HomeOutlined, LogoutOutlined, Menu, MenuBookOutlined, NotificationsNone,
  PeopleAltOutlined, Search, SettingsOutlined, TravelExploreOutlined, WbSunnyOutlined, DarkModeOutlined,
} from '@mui/icons-material';
import {
  AppBar, Avatar, Badge, Box, Divider, Drawer, IconButton, InputBase, List, ListItemButton, ListItemIcon,
  ListItemText, Menu as MuiMenu, MenuItem, Stack, Toolbar, Tooltip, Typography, alpha, useMediaQuery, useTheme,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { useColorMode } from '../providers';
import { logoutSession, type RootState } from '../store';
import { searchApi, type SearchResult } from '../lib/api';
import type { UserRole } from '../types';

const drawerWidth = 268;

const staffRoles: UserRole[] = ['SUPER_ADMIN', 'DEVELOPMENT_OFFICER', 'FIELD_VOLUNTEER'];
const navItems: Array<{ label: string; icon: ReactNode; to: string; roles: UserRole[] }> = [
  { label: 'Overview', icon: <DashboardOutlined />, to: '/dashboard', roles: staffRoles },
  { label: 'Families', icon: <PeopleAltOutlined />, to: '/families', roles: staffRoles },
  { label: 'Scheme eligibility', icon: <TravelExploreOutlined />, to: '/eligibility', roles: [...staffRoles, 'FAMILY'] },
  { label: 'Applications', icon: <DescriptionOutlined />, to: '/applications', roles: staffRoles },
  { label: 'Government schemes', icon: <MenuBookOutlined />, to: '/schemes', roles: ['SUPER_ADMIN', 'DEVELOPMENT_OFFICER'] },
  { label: 'Villages & map', icon: <ApartmentOutlined />, to: '/villages', roles: staffRoles },
  { label: 'Field visits', icon: <TravelExploreOutlined />, to: '/field-visits', roles: ['FIELD_VOLUNTEER'] },
  { label: 'Reports', icon: <AssessmentOutlined />, to: '/reports', roles: ['SUPER_ADMIN', 'DEVELOPMENT_OFFICER'] },
  { label: 'Administration', icon: <SettingsOutlined />, to: '/admin', roles: ['SUPER_ADMIN'] },
  { label: 'My portal', icon: <AccountCircleOutlined />, to: '/portal', roles: ['FAMILY'] },
];

function hrefForSearchResult(result: SearchResult, role: UserRole | null) {
  if (role === 'FAMILY') return result.type === 'scheme' ? '/eligibility' : '/portal';
  if (result.type === 'family') return result.href || `/families/${result.id}`;
  if (result.type === 'scheme') return role === 'FIELD_VOLUNTEER' ? '/eligibility' : '/schemes';
  if (result.type === 'village') return '/villages';
  return '/applications';
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Stack component={Link} to="/" direction="row" alignItems="center" spacing={1.15} sx={{ textDecoration: 'none', color: 'inherit' }}>
      <Box sx={{ width: 38, height: 38, borderRadius: 2.4, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: '#fff', boxShadow: '0 8px 16px rgba(11,110,79,.22)' }}>
        <Diversity3Outlined fontSize="small" />
      </Box>
      {!compact && <Box><Typography fontWeight={850} lineHeight={1.05}>TribalConnect</Typography><Typography variant="caption" color="text.secondary" lineHeight={1}>Welfare portal</Typography></Box>}
    </Stack>
  );
}

export function AppShell() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [open, setOpen] = useState(!mobile);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const session = useSelector((state: RootState) => state.session);
  const { mode, toggle } = useColorMode();

  const closeDrawer = () => mobile && setOpen(false);
  const searchTerm = query.trim();
  const search = useQuery({
    queryKey: ['global-search', searchTerm],
    queryFn: () => searchApi.global(searchTerm),
    enabled: searchTerm.length > 1,
    staleTime: 30_000,
  });
  const results = search.data ?? [];
  const visibleNavItems = navItems.filter((item) => session.role !== null && item.roles.includes(session.role));
  const sideContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent={open || mobile ? 'space-between' : 'center'} sx={{ px: .8, py: 1.1 }}>
        {(open || mobile) && <Brand />}
        <Tooltip title={open ? 'Close navigation' : 'Open navigation'}><IconButton aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen((current) => !current)}><Menu /></IconButton></Tooltip>
      </Stack>
      {(open || mobile) && <>
      <Box sx={{ mt: 3.5, px: 1.1 }}><Typography variant="overline" color="text.secondary" fontWeight={800} letterSpacing={1.1}>Workspace</Typography></Box>
      <List sx={{ mt: .75, px: .3 }} disablePadding>
        {visibleNavItems.map((item) => (
          <ListItemButton key={item.to} component={NavLink} to={item.to} onClick={closeDrawer} sx={{ mb: .45, borderRadius: 2.5, color: 'text.secondary', '&.active': { bgcolor: alpha(theme.palette.primary.main, .11), color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}>
            <ListItemIcon sx={{ minWidth: 39, color: 'inherit' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700, fontSize: '.9rem' }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: 'auto', p: 1.75, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, .06), border: `1px solid ${alpha(theme.palette.primary.main, .1)}` }}>
        <Stack direction="row" spacing={1} alignItems="center"><CampaignOutlined color="primary" fontSize="small" /><Typography variant="body2" fontWeight={800}>Need field support?</Typography></Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: .6, lineHeight: 1.45 }}>Helpline is available 9 AM–6 PM on working days.</Typography>
        <Typography variant="caption" color="primary.main" fontWeight={800} display="block" sx={{ mt: 1 }}>1800 425 6150</Typography>
      </Box>
      </>}
      {!open && !mobile && <List sx={{ mt: 2.5, px: .6 }} disablePadding>
        {visibleNavItems.map((item) => (
          <Tooltip key={item.to} title={item.label} placement="right">
            <ListItemButton component={NavLink} to={item.to} sx={{ minHeight: 46, mb: .55, justifyContent: 'center', borderRadius: 2.5, color: 'text.secondary', '&.active': { bgcolor: alpha(theme.palette.primary.main, .11), color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}>
              <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>{item.icon}</ListItemIcon>
            </ListItemButton>
          </Tooltip>
        ))}
      </List>}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant={mobile ? 'temporary' : 'permanent'}
        open={open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          // A permanent drawer's paper is fixed-positioned, so reserve its
          // width on desktop instead of allowing the main view to sit beneath it.
          width: { lg: open ? drawerWidth : 68 },
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: { lg: open ? drawerWidth : 68 }, borderRight: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper', boxSizing: 'border-box', overflowX: 'hidden' },
        }}
      >
        {sideContent}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(14px)', bgcolor: alpha(theme.palette.background.default, .86), borderBottom: `1px solid ${theme.palette.divider}`, zIndex: theme.zIndex.drawer - 1 }}>
          <Toolbar sx={{ minHeight: '70px !important', gap: { xs: 1, sm: 2 } }}>
            {mobile && !open && <Tooltip title="Open navigation"><IconButton aria-label="Open navigation" onClick={() => setOpen(true)}><Menu /></IconButton></Tooltip>}
            <Box sx={{ position: 'relative', width: { xs: 'auto', sm: 330, md: 410 }, flexGrow: { xs: 1, sm: 0 } }}>
              <Stack direction="row" alignItems="center" spacing={.8} sx={{ px: 1.5, borderRadius: 2.5, bgcolor: alpha(theme.palette.text.primary, .045), border: `1px solid ${alpha(theme.palette.text.primary, .06)}`, minHeight: 40 }}>
                <Search fontSize="small" color="action" />
                <InputBase value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search families, schemes, villages..." inputProps={{ 'aria-label': 'Search families, schemes, villages and applications' }} sx={{ flex: 1, fontSize: '.875rem' }} />
              </Stack>
              {searchTerm.length > 1 && <Box sx={{ position: 'absolute', top: 46, width: '100%', zIndex: 4, bgcolor: 'background.paper', boxShadow: '0 12px 28px rgba(20,50,40,.15)', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5, overflow: 'hidden' }}>
                {search.isLoading && <Typography variant="body2" color="text.secondary" sx={{ p: 1.35 }}>Searching the portal…</Typography>}
                {search.isError && <Typography variant="body2" color="error.main" sx={{ p: 1.35 }}>Search is unavailable. Please try again.</Typography>}
                {!search.isLoading && !search.isError && results.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 1.35 }}>No matching families, schemes, villages or applications.</Typography>}
                {results.map((result) => <Box component="button" type="button" key={`${result.type}-${result.id}`} onClick={() => { navigate(hrefForSearchResult(result, session.role)); setQuery(''); }} sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1.2, cursor: 'pointer', border: 0, color: 'text.primary', bgcolor: 'transparent', font: 'inherit', '&:hover, &:focus-visible': { bgcolor: alpha(theme.palette.primary.main, .06), outline: 'none' } }}><Typography variant="body2" fontWeight={800}>{result.title}</Typography><Typography variant="caption" color="text.secondary">{result.subtitle || result.type}</Typography></Box>)}
              </Box>}
            </Box>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: .35 }}>
              <Tooltip title={mode === 'light' ? 'Use dark mode' : 'Use light mode'}><IconButton onClick={toggle} aria-label="Toggle colour mode">{mode === 'light' ? <DarkModeOutlined fontSize="small" /> : <WbSunnyOutlined fontSize="small" />}</IconButton></Tooltip>
              <Tooltip title="Notifications"><IconButton component={Link} to="/notifications" aria-label="Open notifications"><Badge color="warning" variant="dot" overlap="circular"><NotificationsNone /></Badge></IconButton></Tooltip>
              <IconButton onClick={(event) => setProfileAnchor(event.currentTarget)} aria-label="Open account menu" sx={{ ml: .25, p: 0 }}><Avatar sx={{ width: 35, height: 35, bgcolor: 'secondary.main', fontSize: '.78rem', fontWeight: 800 }}>{session.name ? session.name.split(' ').map((part) => part[0]).join('').slice(0, 2) : 'TC'}</Avatar></IconButton>
            </Box>
            <MuiMenu anchorEl={profileAnchor} open={Boolean(profileAnchor)} onClose={() => setProfileAnchor(null)} transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
              <Box sx={{ px: 2, py: 1.25, minWidth: 210 }}><Typography fontWeight={800}>{session.name || 'TribalConnect user'}</Typography><Typography variant="caption" color="text.secondary">{session.role?.replaceAll('_', ' ').toLowerCase() || 'guest'}</Typography></Box>
              <Divider />
              <MenuItem onClick={() => { navigate('/settings'); setProfileAnchor(null); }}><ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon>Account settings</MenuItem>
              <MenuItem onClick={() => { setProfileAnchor(null); void logoutSession().finally(() => navigate('/login', { replace: true })); }}><ListItemIcon><LogoutOutlined fontSize="small" /></ListItemIcon>Sign out</MenuItem>
            </MuiMenu>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: { xs: 2, sm: 3, lg: 4 }, maxWidth: 1680, mx: 'auto' }}><Outlet /></Box>
      </Box>
    </Box>
  );
}

export function PublicTopBar() {
  return (
    <Box component="header" sx={{ py: 2, px: { xs: 2, sm: 4, md: 6 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1440, mx: 'auto' }}>
      <Brand />
      <Stack direction="row" spacing={{ xs: .5, sm: 1 }} alignItems="center">
        <Tooltip title="Home"><IconButton component={Link} to="/" aria-label="Home"><HomeOutlined fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Login"><IconButton component={Link} to="/login" aria-label="Login"><AccountCircleOutlined fontSize="small" /></IconButton></Tooltip>
      </Stack>
    </Box>
  );
}
