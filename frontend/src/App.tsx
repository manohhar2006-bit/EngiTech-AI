import React, { useState, useEffect } from 'react';
import { Home } from './pages/Home/Home';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Repository } from './pages/Repository/Repository';
import { WhyGraphPage } from './pages/WhyGraph/WhyGraphPage';
import { DecisionDebtPage } from './pages/DecisionDebt/DecisionDebtPage';
import { DocsPage } from './pages/Docs/DocsPage';
import { AIAssistantPage } from './pages/AIAssistant/AIAssistantPage';
import { AIInvestigationProvider } from './context/AIInvestigationContext';


/**
 * Normalizes legacy routes and redirects them to their integrated Engineering Graph destination.
 * Preserves query parameters (such as ?repo=...) while routing to the appropriate view.
 */
const getLegacyRedirect = (rawPath: string, search: string = ''): string | null => {
  let pathOnly = rawPath;
  let explicitQuery = search;

  if (pathOnly.includes('?')) {
    const parts = pathOnly.split('?');
    pathOnly = parts[0];
    if (!explicitQuery && parts[1]) {
      explicitQuery = `?${parts[1]}`;
    }
  }

  if (!pathOnly.startsWith('/')) {
    pathOnly = `/${pathOnly}`;
  }

  let targetView: string | null = null;
  if (pathOnly === '/dependencies' || pathOnly.startsWith('/dependencies/')) {
    targetView = 'dependencies';
  } else if (pathOnly === '/decisions' || pathOnly.startsWith('/decisions/')) {
    targetView = 'decisions';
  } else if (pathOnly === '/timeline' || pathOnly.startsWith('/timeline/')) {
    targetView = 'git_graph';
  }

  if (!targetView) return null;

  const params = new URLSearchParams(explicitQuery);
  if (!params.has('view')) {
    params.set('view', targetView);
  }
  const queryStr = params.toString();
  return `/whygraph${queryStr ? `?${queryStr}` : ''}`;
};

export function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const rawPath = window.location.pathname || '/';
    // Legacy URL handling: Gracefully redirect /dependencies, /decisions, /timeline
    const redirectUrl = getLegacyRedirect(rawPath, window.location.search);
    if (redirectUrl) {
      window.history.replaceState({}, '', redirectUrl);
      return redirectUrl;
    }
    return `${rawPath}${window.location.search}`;
  });

  useEffect(() => {
    const handlePopState = () => {
      const rawPath = window.location.pathname || '/';
      // Graceful popstate redirect for legacy bookmarks in browser history stack
      const redirectUrl = getLegacyRedirect(rawPath, window.location.search);
      if (redirectUrl) {
        window.history.replaceState({}, '', redirectUrl);
        setCurrentRoute(redirectUrl);
        return;
      }
      setCurrentRoute(`${rawPath}${window.location.search}`);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (path.startsWith('#')) return;
    let targetPath = path.startsWith('/') ? path : `/${path}`;

    // Intercept legacy navigation and redirect to integrated Engineering Graph
    const redirectUrl = getLegacyRedirect(targetPath);
    if (redirectUrl) {
      targetPath = redirectUrl;
    }

    window.history.pushState({}, '', targetPath);
    setCurrentRoute(targetPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Extract pathname from currentRoute for matching (strip query params if any)
  const routePath = currentRoute.split('?')[0] || '/';

  const renderContent = () => {
    switch (routePath) {
      case '/dashboard':
        return <Dashboard currentRoute={currentRoute} onNavigate={navigate} />;
      case '/repository':
        return <Repository currentRoute={currentRoute} onNavigate={navigate} />;
      case '/whygraph':
        return <WhyGraphPage currentRoute={currentRoute} onNavigate={navigate} />;
      case '/decision-debt':
        return <DecisionDebtPage currentRoute={currentRoute} onNavigate={navigate} />;
      case '/ai-assistant':
        return <AIAssistantPage currentRoute={currentRoute} onNavigate={navigate} />;
      case '/docs':
        return <DocsPage currentRoute={currentRoute} onNavigate={navigate} />;
      case '/dependencies':
      case '/decisions':
      case '/timeline': {
        // Safety fallback: if a legacy route somehow reaches switch, replace and render WhyGraphPage
        const fallbackRedirect = getLegacyRedirect(routePath, window.location.search) || '/whygraph?view=git_graph';
        window.history.replaceState({}, '', fallbackRedirect);
        return <WhyGraphPage currentRoute={fallbackRedirect} onNavigate={navigate} />;
      }
      case '/':
      default:
        return <Home onNavigate={navigate} />;
    }
  };

  return (
    <AIInvestigationProvider>
      {renderContent()}
    </AIInvestigationProvider>
  );
}

export default App;
