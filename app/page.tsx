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
import { getPublicStats } from '@/lib/server/publicStats';

// Static page, regenerated at most every 15 minutes (matches PUBLIC_STATS_REVALIDATE).
export const revalidate = 900;

export default async function LandingPage() {
  const stats = await getPublicStats();
  // State bills are only fetched when Open States is configured; the page
  // claims state coverage only then.
  const stateBills = Boolean(process.env.OPENSTATES_API_KEY);

  return (
    <div className="relative min-h-screen">
      <AmbientBackground animated />
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1}>
          <HeroSection stateBills={stateBills} />
          <MarqueeStrip />
          <HowItWorks stateBills={stateBills} />
          <StatsSection stats={stats} stateBills={stateBills} />
          <FeatureShowcase stateBills={stateBills} />
          <ShareableCards />
          <PublicExplorer />
          <NewsletterSection />
        </main>
        <Footer />
      </div>
    </div>
  );
}
