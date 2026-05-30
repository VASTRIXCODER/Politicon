import AmbientBackground from '@/components/landing/AmbientBackground';
import Navbar from '@/components/layout/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import MarqueeStrip from '@/components/landing/MarqueeStrip';
import HowItWorks from '@/components/landing/HowItWorks';
import StatsSection from '@/components/landing/StatsSection';
import FeatureShowcase from '@/components/landing/FeatureShowcase';
import ShareableCards from '@/components/landing/ShareableCards';
import PublicExplorer from '@/components/landing/PublicExplorer';
import SocialProof from '@/components/landing/SocialProof';
import NewsletterSection from '@/components/landing/NewsletterSection';
import Footer from '@/components/layout/Footer';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main>
          <HeroSection />
          <MarqueeStrip />
          <HowItWorks />
          <StatsSection />
          <FeatureShowcase />
          <ShareableCards />
          <PublicExplorer />
          <SocialProof />
          <NewsletterSection />
        </main>
        <Footer />
      </div>
    </div>
  );
}
