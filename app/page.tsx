import AmbientBackground from '@/components/landing/AmbientBackground';
import Navbar from '@/components/layout/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import PrinciplesRibbon from '@/components/landing/hero/PrinciplesRibbon';
import FilmSection from '@/components/landing/film/FilmSection';
import StatsSection from '@/components/landing/StatsSection';
import FeatureShowcase from '@/components/landing/FeatureShowcase';
import ShareableCards from '@/components/landing/ShareableCards';
import PublicExplorer from '@/components/landing/PublicExplorer';
import NewsletterSection from '@/components/landing/NewsletterSection';
import ClosingCta from '@/components/landing/ClosingCta';
import Footer from '@/components/layout/Footer';
import { getPublicStats } from '@/lib/server/publicStats';

// Static page, regenerated at most every 15 minutes (matches PUBLIC_STATS_REVALIDATE).
export const revalidate = 900;

/*
 * The landing page, in order: the hero (headline, Policy Guide search, the
 * Capitol and the example receipt), a ribbon of sources and principles, the
 * film of how it works (#how-it-works, from the Capitol to your kitchen
 * table), then live stats, features, shareable cards, the explorer preview,
 * the newsletter, and the closing call to action where the page dips into
 * night before the footer.
 */
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
          <PrinciplesRibbon stateBills={stateBills} />
          <FilmSection stateBills={stateBills} />
          <StatsSection stats={stats} stateBills={stateBills} />
          <FeatureShowcase stateBills={stateBills} />
          <ShareableCards />
          <PublicExplorer />
          <NewsletterSection />
          <ClosingCta stateBills={stateBills} />
        </main>
        <Footer />
      </div>
    </div>
  );
}
