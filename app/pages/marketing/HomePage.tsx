import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import homeHtmlRaw from './content/home.html?raw';
import homeCss from './content/home.css?raw';
import { rewriteMarketingLinks, useMarketingPage } from './marketingShared';

/** Public marketing homepage (the `/` route at cutover) — verbatim markup + scoped CSS + wired behaviours. */
const html = rewriteMarketingLinks(homeHtmlRaw);

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useMarketingPage(ref, homeCss, navigate, 'Sentinel Football Hub — Built for SA Football');
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
};
