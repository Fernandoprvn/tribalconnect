import { ArrowBack, SearchOffOutlined } from '@mui/icons-material';
import { Box, Button, Paper, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}><Paper variant="outlined" sx={{ p: 5, textAlign: 'center', maxWidth: 480 }}><SearchOffOutlined color="primary" sx={{ fontSize: 54 }} /><Typography variant="h3" sx={{ mt: 1.2 }}>Page not found</Typography><Typography color="text.secondary" sx={{ mt: .8 }}>The page you were looking for has moved or is not available.</Typography><Button component={Link} to="/" startIcon={<ArrowBack />} variant="contained" sx={{ mt: 2.4 }}>Return to portal</Button></Paper></Box>;
}
