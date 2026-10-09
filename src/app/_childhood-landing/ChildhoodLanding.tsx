import "./childhood-landing.css";

import { Header } from "./components/Header";
import { HeroSection } from "./components/HeroSection";
import { AboutSection } from "./components/AboutSection";
import { GoalsSection } from "./components/GoalsSection";
import { JourneySection } from "./components/JourneySection";
import { EligibilitySection } from "./components/EligibilitySection";
import { PrizesSection } from "./components/PrizesSection";
import { PatronageSection } from "./components/PatronageSection";
import { PartnersSection } from "./components/PartnersSection";
import { CTASection } from "./components/CTASection";
import { Footer } from "./components/Footer";

// `childhood-landing` scopes the identity's colour tokens and typeface to this
// page (childhood-landing.css), so the dashboards keep their own palette.
const ChildhoodLanding = () => {
  return (
    <div className="childhood-landing min-h-screen bg-gradient-hero">
      <Header />
      <main>
        <HeroSection />
        <AboutSection />
        <GoalsSection />
        <JourneySection />
        <EligibilitySection />
        <PrizesSection />
        <PatronageSection />
        <PartnersSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default ChildhoodLanding;
