import React from 'react';
import { sanitizeExternalUrl } from '../../utils/urlSecurity';

interface SafeExternalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string | null;
  children: React.ReactNode;
}

/**
 * Renders an external anchor link strictly for validated HTTP/HTTPS URLs with noopener noreferrer.
 */
export const SafeExternalLink: React.FC<SafeExternalLinkProps> = ({ href, children, ...rest }) => {
  const safeUrl = sanitizeExternalUrl(href);
  if (!safeUrl) {
    return null;
  }

  return (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
};

