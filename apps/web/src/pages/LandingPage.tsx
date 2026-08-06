import {
  ArrowForward, CheckCircleOutline, Diversity3Outlined, EmojiEventsOutlined, HealthAndSafetyOutlined,
  HomeWorkOutlined, KeyboardArrowDown, MenuBookOutlined, PeopleAltOutlined, PhoneOutlined, SchoolOutlined,
  SolarPowerOutlined, VolunteerActivismOutlined,
} from '@mui/icons-material';
import {
  Accordion, AccordionDetails, AccordionSummary, Avatar, Box, Button, Card, CardContent, Chip, Container,
  Divider, Grid, Link as MuiLink, Paper, Stack, Typography, alpha, useTheme,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { PublicTopBar } from '../components/AppShell';

const programs = [
  { icon: <HomeWorkOutlined />, title: 'Safe homes', text: 'Housing support for families without a permanent home.', color: '#0B6E4F' },
  { icon: <SchoolOutlined />, title: 'Learning access', text: 'Scholarships and school continuity for every child.', color: '#1F7A8C' },
  { icon: <HealthAndSafetyOutlined />, title: 'Health assurance', text: 'Easy access to cashless care and health services.', color: '#B4475A' },
  { icon: <SolarPowerOutlined />, title: 'Sustainable livelihoods', text: 'Solar, livestock and farm-based income support.', color: '#D97706' },
];

const faqs = [
  ['Who can register a family?', 'A family head, an authorised field volunteer, or an officer from a Rural Development Center can begin registration. The family profile is reviewed before schemes are recommended.'],
  ['Is Aadhaar information kept safe?', 'Yes. Aadhaar is masked in the portal and used only for permitted identity verification workflows. Do not share OTPs with anyone.'],
  ['How do I know if a scheme was approved?', 'You will receive an SMS, WhatsApp or in-app message. You can also sign in with your mobile number to track each application.'],
  ['Can a family apply to more than one scheme?', 'Yes. The eligibility check shows every relevant scheme. An officer will help avoid duplicate benefits and collect the required documents.'],
];

function FolkArt() {
  return (
    <Box aria-hidden="true" sx={{ position: 'relative', width: '100%', height: { xs: 300, md: 430 }, isolation: 'isolate' }}>
      <Box sx={{ position: 'absolute', inset: { xs: 0, md: '8% 2% 0 5%' }, borderRadius: '46% 54% 38% 62% / 50% 39% 61% 50%', bgcolor: alpha('#F4B400', .95), transform: 'rotate(-7deg)', boxShadow: 'inset 0 0 0 13px rgba(255,255,255,.16)' }} />
      <Box sx={{ position: 'absolute', width: '58%', height: '72%', left: '14%', bottom: 0, bgcolor: '#173229', borderRadius: '52% 48% 21% 20% / 45% 44% 20% 18%', clipPath: 'polygon(0 100%, 9% 54%, 21% 38%, 30% 53%, 42% 12%, 55% 51%, 70% 30%, 83% 54%, 100% 100%)', opacity: .98 }} />
      <Box sx={{ position: 'absolute', width: '44%', height: '57%', right: '3%', bottom: '1%', borderRadius: '50% 50% 5% 5%', bgcolor: '#0B6E4F', clipPath: 'polygon(47% 0%, 54% 0%, 59% 32%, 76% 42%, 83% 100%, 16% 100%, 24% 42%, 42% 32%)' }} />
      <Box sx={{ position: 'absolute', width: 103, height: 103, right: { xs: 10, md: 45 }, top: { xs: 10, md: 5 }, display: 'grid', placeItems: 'center', bgcolor: '#fff', color: '#0B6E4F', borderRadius: '50%', border: '8px solid rgba(255,255,255,.28)', boxShadow: '0 18px 36px rgba(0,0,0,.18)' }}>
        <Diversity3Outlined sx={{ fontSize: 54 }} />
      </Box>
      <Box sx={{ position: 'absolute', left: { xs: 12, md: 0 }, top: '26%', p: 1.65, borderRadius: 3, bgcolor: 'rgba(255,255,255,.94)', boxShadow: '0 18px 32px rgba(10,65,43,.18)' }}>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>Families connected</Typography>
        <Typography variant="h5" color="primary.main">12,480+</Typography>
      </Box>
      <Box sx={{ position: 'absolute', right: { xs: 0, md: 0 }, bottom: { xs: 5, md: 18 }, p: 1.65, borderRadius: 3, bgcolor: 'rgba(255,255,255,.94)', boxShadow: '0 18px 32px rgba(10,65,43,.18)' }}>
        <Typography variant="caption" color="text.secondary" fontWeight={800}>Welfare pathways</Typography>
        <Typography variant="h5" color="primary.main">18 active schemes</Typography>
      </Box>
    </Box>
  );
}

export default function LandingPage() {
  const theme = useTheme();
  return (
    <Box sx={{ overflow: 'hidden' }}>
      <PublicTopBar />
      <Box component="main">
        <Box className="hero-grid-pattern" sx={{ bgcolor: '#0B6E4F', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', width: 550, height: 550, borderRadius: '50%', bgcolor: alpha('#F4B400', .11), right: '-10%', top: '-45%' }} />
          <Container maxWidth="lg" sx={{ py: { xs: 7, md: 11 }, position: 'relative' }}>
            <Grid container spacing={{ xs: 4, md: 7 }} alignItems="center">
              <Grid size={{ xs: 12, md: 6 }}>
                <Chip label="Rural Development & Tribal Welfare" sx={{ color: '#FDF7E7', bgcolor: alpha('#fff', .13), fontWeight: 800, mb: 2.25 }} />
                <Typography component="h1" variant="h1" sx={{ fontSize: { xs: '2.8rem', sm: '3.75rem', lg: '4.45rem' }, lineHeight: .98, maxWidth: 620 }}>
                  Welfare that reaches every home.
                </Typography>
                <Typography sx={{ mt: 2.35, maxWidth: 575, color: alpha('#fff', .84), fontSize: { xs: '1rem', md: '1.12rem' }, lineHeight: 1.65 }}>
                  TribalConnect helps Rural Development Centers register families, find the right government support, and follow each benefit with clarity and dignity.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 3.5 }}>
                  <Button component={Link} to="/onboarding" variant="contained" size="large" endIcon={<ArrowForward />} sx={{ bgcolor: '#F4B400', color: '#173229', '&:hover': { bgcolor: '#FFD449' } }}>Register a family</Button>
                  <Button component={Link} to="/eligibility" variant="outlined" size="large" sx={{ color: '#fff', borderColor: alpha('#fff', .65), '&:hover': { borderColor: '#fff', bgcolor: alpha('#fff', .08) } }}>Check eligibility</Button>
                </Stack>
                <Stack direction="row" spacing={2.5} flexWrap="wrap" sx={{ mt: 4.4, rowGap: 1.2 }}>
                  {['No-cost assistance', 'Tamil & English support', 'Track every step'].map((label) => <Stack key={label} direction="row" alignItems="center" spacing={.65}><CheckCircleOutline sx={{ fontSize: 18, color: '#F4B400' }} /><Typography variant="body2" fontWeight={700}>{label}</Typography></Stack>)}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}><FolkArt /></Grid>
            </Grid>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
          <Grid container spacing={4.5} alignItems="center">
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography variant="overline" color="primary.main" fontWeight={850} letterSpacing={1.2}>Our purpose</Typography>
              <Typography variant="h2" sx={{ mt: .7, fontSize: { xs: '2rem', md: '2.75rem' } }}>A trusted bridge between families and public services.</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography color="text.secondary" lineHeight={1.78}>The Rural Development Center brings registration, document support, field verification and scheme applications into one clear journey. Families can visit their nearest center, or receive help from a trained volunteer in their village.</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.25} sx={{ mt: 3 }}>
                {[["42", "villages covered"], ["91%", "families with a verified profile"], ["24h", "average first response"]].map(([value, label]) => <Box key={label}><Typography variant="h4" color="primary.main">{value}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography></Box>)}
              </Stack>
            </Grid>
          </Grid>
        </Container>

        <Box sx={{ bgcolor: alpha(theme.palette.primary.main, .045), py: { xs: 7, md: 10 } }}>
          <Container maxWidth="lg">
            <Stack alignItems={{ md: 'center' }} textAlign={{ md: 'center' }} sx={{ mb: 4.5 }}>
              <Typography variant="overline" color="primary.main" fontWeight={850} letterSpacing={1.2}>Government welfare programs</Typography>
              <Typography variant="h2" sx={{ mt: .7, fontSize: { xs: '2rem', md: '2.75rem' } }}>Support designed around real needs.</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 650 }}>Every profile is checked against current eligibility rules, so families can focus on support they are likely to receive.</Typography>
            </Stack>
            <Grid container spacing={2.2}>
              {programs.map((program) => <Grid key={program.title} size={{ xs: 12, sm: 6, md: 3 }}><Card variant="outlined" sx={{ height: '100%', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 16px 28px rgba(17,60,43,.1)' }, transition: '.2s' }}><CardContent sx={{ p: 2.5 }}><Box sx={{ display: 'grid', placeItems: 'center', width: 48, height: 48, bgcolor: alpha(program.color, .12), color: program.color, borderRadius: 2.6 }}>{program.icon}</Box><Typography variant="h6" sx={{ mt: 2 }}>{program.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75, lineHeight: 1.6 }}>{program.text}</Typography></CardContent></Card></Grid>)}
            </Grid>
            <Box textAlign="center" sx={{ mt: 3.5 }}><Button component={Link} to="/schemes" endIcon={<ArrowForward />}>Explore all active schemes</Button></Box>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: { xs: 7, md: 10 } }}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, height: '100%', bgcolor: '#173229', color: '#fff', overflow: 'hidden', position: 'relative' }}>
                <Box sx={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', border: '45px solid rgba(244,180,0,.18)', right: -85, top: -105 }} />
                <EmojiEventsOutlined sx={{ color: '#F4B400', fontSize: 34 }} />
                <Typography variant="h3" sx={{ mt: 1.4, maxWidth: 570 }}>“The officer explained each document in Tamil. Now my daughter has her scholarship letter.”</Typography>
                <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mt: 3, position: 'relative' }}><Avatar sx={{ bgcolor: '#F4B400', color: '#173229', fontWeight: 800 }}>SM</Avatar><Box><Typography fontWeight={800}>Selvi M.</Typography><Typography variant="body2" sx={{ color: alpha('#fff', .66) }}>Kadar community · Sethumadai</Typography></Box></Stack>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={2.1}>
                <Paper variant="outlined" sx={{ p: 2.4 }}><Stack direction="row" spacing={1.6} alignItems="center"><Box sx={{ bgcolor: '#E1F2E9', color: '#0B6E4F', width: 45, height: 45, borderRadius: 2.4, display: 'grid', placeItems: 'center' }}><VolunteerActivismOutlined /></Box><Box><Typography variant="h5">Doorstep support</Typography><Typography variant="body2" color="text.secondary">Volunteers can register families even when connectivity is limited.</Typography></Box></Stack></Paper>
                <Paper variant="outlined" sx={{ p: 2.4 }}><Stack direction="row" spacing={1.6} alignItems="center"><Box sx={{ bgcolor: '#FFF3D6', color: '#AC7200', width: 45, height: 45, borderRadius: 2.4, display: 'grid', placeItems: 'center' }}><PeopleAltOutlined /></Box><Box><Typography variant="h5">Clear follow-up</Typography><Typography variant="body2" color="text.secondary">Receive updates on visits, documents and approvals in one place.</Typography></Box></Stack></Paper>
              </Stack>
            </Grid>
          </Grid>
        </Container>

        <Box sx={{ bgcolor: alpha(theme.palette.secondary.main, .07), py: { xs: 7, md: 9 } }}>
          <Container maxWidth="lg"><Grid container spacing={4}><Grid size={{ xs: 12, md: 5 }}><Typography variant="overline" color="primary.main" fontWeight={850} letterSpacing={1.2}>Helpful answers</Typography><Typography variant="h2" sx={{ mt: .6, fontSize: { xs: '2rem', md: '2.65rem' } }}>Simple guidance, whenever you need it.</Typography><Typography color="text.secondary" sx={{ mt: 1.3, lineHeight: 1.7 }}>For help in your village, call the welfare support line or visit your nearest Rural Development Center.</Typography><Button component="a" href="tel:18004256150" variant="outlined" startIcon={<PhoneOutlined />} sx={{ mt: 2.4 }}>Call 1800 425 6150</Button></Grid><Grid size={{ xs: 12, md: 7 }}>{faqs.map(([question, answer]) => <Accordion key={question} disableGutters elevation={0} sx={{ borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: 'transparent', '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<KeyboardArrowDown />}><Typography fontWeight={800}>{question}</Typography></AccordionSummary><AccordionDetails><Typography color="text.secondary" lineHeight={1.65}>{answer}</Typography></AccordionDetails></Accordion>)}</Grid></Grid></Container>
        </Box>
      </Box>
      <Box component="footer" sx={{ bgcolor: '#173229', color: alpha('#fff', .85), py: 4 }}><Container maxWidth="lg"><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ sm: 'center' }}><Box><Typography fontWeight={850} color="#fff">TribalConnect</Typography><Typography variant="body2" sx={{ mt: .4 }}>Rural Development & Tribal Welfare Portal</Typography></Box><Stack direction="row" spacing={2.5} flexWrap="wrap"><MuiLink component={Link} to="/login" color="inherit" underline="hover" variant="body2">Login</MuiLink><MuiLink component={Link} to="/eligibility" color="inherit" underline="hover" variant="body2">Check eligibility</MuiLink><MuiLink href="tel:18004256150" color="inherit" underline="hover" variant="body2">Help line</MuiLink></Stack></Stack><Divider sx={{ borderColor: alpha('#fff', .15), my: 2.5 }} /><Typography variant="caption" sx={{ color: alpha('#fff', .58) }}>© 2026 TribalConnect. Built for inclusive public service delivery.</Typography></Container></Box>
    </Box>
  );
}
