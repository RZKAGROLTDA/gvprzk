import { Helmet } from 'react-helmet-async';

export const SecurityHeaders = () => {
  return (
    <Helmet>
      {/* Enhanced Content Security Policy - Phase 4 Security Enhancement */}
      <meta 
        httpEquiv="Content-Security-Policy" 
        content="default-src 'self'; script-src 'self' https://wuvbrkbhunifudaewhng.supabase.co; style-src 'self' 'unsafe-inline' blob:; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://wuvbrkbhunifudaewhng.supabase.co wss://wuvbrkbhunifudaewhng.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests; report-uri /api/csp-report;" 
      />
      
      {/* X-Frame-Options removed to allow iframe loading in Lovable */}
      
      {/* X-Content-Type-Options */}
      <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
      
      {/* Referrer Policy */}
      <meta name="referrer" content="strict-origin-when-cross-origin" />
      
      {/* Permissions Policy */}
      <meta 
        httpEquiv="Permissions-Policy" 
        content="camera=(), microphone=(), geolocation=(self), payment=()" 
      />
      
      {/* X-XSS-Protection */}
      <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
    </Helmet>
  );
};