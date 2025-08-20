import { Helmet } from 'react-helmet-async';

export const SecurityHeaders = () => {
  return (
    <Helmet>
      {/* Content Security Policy */}
      <meta 
        httpEquiv="Content-Security-Policy" 
        content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://wuvbrkbhunifudaewhng.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://wuvbrkbhunifudaewhng.supabase.co wss://wuvbrkbhunifudaewhng.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none';" 
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