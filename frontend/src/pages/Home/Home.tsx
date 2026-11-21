import React from 'react';
import { Navbar } from '../../components/navigation/Navbar';
import { HeroSection } from '../../components/sections/HeroSection';
import { ProblemSection } from '../../components/sections/ProblemSection';
import { HowItWorksSection } from '../../components/sections/HowItWorksSection';
import { TimeMachineSection } from '../../components/sections/TimeMachineSection';
import { AskWhySection } from '../../components/sections/AskWhySection';
import { DecisionDebtSection } from '../../components/sections/DecisionDebtSection';
import { FinalCtaSection } from '../../components/sections/FinalCtaSection';
import { Footer } from '../../components/sections/Footer';

interface HomeProps {
  onNavigate: (route: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#05070C] text-slate-100 selection:bg-cyan-500/20 selection:text-cyan-200">
      <Navbar currentPath="/" onNavigate={onNavigate} />

      <main>
        <HeroSection
          onExploreClick={() => onNavigate('/dashboard')}
          onDemoClick={() => {
            const el = document.querySelector('#whygraph');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        <ProblemSection />

        <HowItWorksSection />

        <TimeMachineSection onExploreGitGraph={() => onNavigate('/whygraph?view=git_graph')} />

        <AskWhySection />

        <DecisionDebtSection />

        <FinalCtaSection onLaunchClick={() => onNavigate('/dashboard')} />
      </main>

      <Footer />
    </div>
  );
};
