import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html from './content/players.html?raw';
import css from './content/players.css?raw';
import { rewriteMarketingLinks, useMarketingPage } from './marketingShared';

/** Public "For Players" landing page (/landing/players). */
const content = rewriteMarketingLinks(html);

export const PlayersLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useMarketingPage(ref, css, navigate, 'For Players | Sentinel Football Hub');
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: content }} />;
};
