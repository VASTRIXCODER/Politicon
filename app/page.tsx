import AmbientBackground from '@/components/landing/AmbientBackground';
import Navbar from '@/components/layout/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import MarqueeStrip from '@/components/landing/MarqueeStrip';
import HowItWorks from '@/components/landing/HowItWorks';
import StatsSection from '@/components/landing/StatsSection';
import FeatureShowcase from '@/components/landing/FeatureShowcase';
import ShareableCards from '@/components/landing/ShareableCards';
import PublicExplorer from '@/components/landing/PublicExplorer';
import NewsletterSection from '@/components/landing/NewsletterSection';
import Footer from '@/components/layout/Footer';
import { getMemberCount } from '@/components/landing/memberCount';

// Static page, regenerated at most every 10 minutes (matches the member-count cache).
export const revalidate = 600;

export default async function LandingPage() {
  const memberCount = await getMemberCount();

  return (
    <div className="relative min-h-screen">
      <AmbientBackground animated />
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1}>
          <HeroSection />
          <MarqueeStrip />
          <HowItWorks />
          <StatsSection memberCount={memberCount} />
          <FeatureShowcase />
          <ShareableCards />
          <PublicExplorer />
          <NewsletterSection />
        </main>
        <Footer />
      </div>
    </div>
  );
}
