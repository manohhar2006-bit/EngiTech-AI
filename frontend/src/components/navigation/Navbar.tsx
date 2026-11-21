import React, { useState, useEffect } from 'react';
import { GitBranch, Github, ArrowRight, Menu, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface NavbarProps {
  currentPath?: string;
  onNavigate?: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath = '/', onNavigate }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Product', path: '/' },
    { label: 'How It Works', path: '#how-it-works' },
    { label: 'WhyGraph', path: '#whygraph' },
    { label: 'History', path: '#history' },
    { label: 'Decision Debt', path: '#decision-debt' },
    { label: 'Docs', path: '/docs' }
  ];

  const handleLinkClick = (path: string) => {
    setMobileMenuOpen(false);
    if (onNavigate) {
      onNavigate(path);
    } else if (path.startsWith('#')) {
      const el = document.querySelector(path);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
          ? 'bg-[#05070C]/85 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl py-3'
          : 'bg-transparent py-5'
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo Identity */}
          <div
            onClick={() => handleLinkClick('/')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-slate-900 p-0.5 shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-300">
              <div className="w-full h-full bg-[#070A12] rounded-[10px] flex items-center justify-center">
                <GitBranch className="w-4 h-4 text-cyan-400 group-hover:rotate-45 transition-transform duration-500" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-lg tracking-wider text-white">
                ENGITRACE
              </span>
              <span className="text-[9px] font-mono text-cyan-400/90 tracking-widest uppercase -mt-1">
                ENGINEERING INTELLIGENCE
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 glass-panel px-4 py-1.5 rounded-full border-slate-800/60">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleLinkClick(link.path)}
                className={`px-3 py-1.5 text-xs font-mono rounded-full transition-all duration-200 cursor-pointer ${currentPath === link.path
                    ? 'text-cyan-400 bg-cyan-500/10 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Right Action CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
              title="GitHub Repository"
            >
              <Github className="w-4 h-4" />
            </a>
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              onClick={() => handleLinkClick('/dashboard')}
            >
              Launch Dashboard
            </Button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav Overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 p-4 glass-panel rounded-2xl border border-slate-800 flex flex-col gap-3 animate-pulse-subtle">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleLinkClick(link.path)}
                className="text-left px-3 py-2 text-sm font-mono text-slate-300 hover:text-cyan-400 hover:bg-slate-800/60 rounded-xl"
              >
                {link.label}
              </button>
            ))}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
              <Button
                variant="primary"
                size="md"
                className="w-full justify-center"
                onClick={() => handleLinkClick('/dashboard')}
              >
                Launch Dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
