import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/legal.css';
import privacyHtml from './content/privacy.html?raw';
import termsHtml from './content/terms.html?raw';
import cookieHtml from './content/cookie.html?raw';
import dataProcessingHtml from './content/dataProcessing.html?raw';

/**
 * Legal pages (privacy/terms/cookie/data-processing) as React routes — ported from
 * the vanilla src/pages/*.html. Content is rendered VERBATIM (exact POPIA wording);
 * the chrome (nav + footer) is React with Router links. Scoped via `.legal-page`.
 */
// In-content cross-links use the old vanilla .html filenames — point them at the React routes.
const fixLegalLinks = (html: string) => html
  .replace(/href="privacy-policy\.html"/g, 'href="/privacy"')
  .replace(/href="terms-of-service\.html"/g, 'href="/terms"')
  .replace(/href="cookie-policy\.html"/g, 'href="/cookies"')
  .replace(/href="data-processing\.html"/g, 'href="/data-processing"');

const LegalShell: React.FC<{ html: string; title: string }> = ({ html, title }) => {
  useEffect(() => { const prev = document.title; document.title = `${title} | Sentinel Football Hub`; return () => { document.title = prev; }; }, [title]);
  return (
    <div className="legal-page">
      <nav className="nav">
        <div className="container" style={{ maxWidth: 'var(--max-w)' }}>
          <Link to="/" className="nav-logo"><span className="nav-logo-icon"><i className="fas fa-futbol" /></span> Sentinel Football Hub</Link>
          <Link to="/" className="nav-back"><i className="fas fa-arrow-left" /> Back to home</Link>
        </div>
      </nav>
      <div dangerouslySetInnerHTML={{ __html: fixLegalLinks(html) }} />
      <footer className="legal-footer">
        <div className="container">
          <p>© 2026 Sentinel SportsTech (Pty) Ltd. All rights reserved. Registered in South Africa.</p>
          <p>POPIA Responsible Party &amp; Information Officer registered with the SA Information Regulator.</p>
          <div className="footer-links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/cookies">Cookie Policy</Link>
            <Link to="/data-processing">Data Processing</Link>
            <Link to="/">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const PrivacyPolicyPage: React.FC = () => <LegalShell html={privacyHtml} title="Privacy Policy" />;
export const TermsOfServicePage: React.FC = () => <LegalShell html={termsHtml} title="Terms of Service" />;
export const CookiePolicyPage: React.FC = () => <LegalShell html={cookieHtml} title="Cookie Policy" />;
export const DataProcessingPage: React.FC = () => <LegalShell html={dataProcessingHtml} title="Data Processing" />;
