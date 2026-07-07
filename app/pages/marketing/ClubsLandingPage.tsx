import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html from './content/clubs.html?raw';
import css from './content/clubs.css?raw';
import { rewriteMarketingLinks, useMarketingPage } from './marketingShared';

/** Public "For Clubs" landing page (/landing/clubs). */
const content = rewriteMarketingLinks(html);

export const ClubsLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useMarketingPage(ref, css, navigate, 'For Clubs | Sentinel Football Hub');
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: content }} />;
};
