import {
  Briefcase, DollarSign, FileText, GraduationCap, Heart, Home, PiggyBank, Shield, Zap,
  type LucideIcon,
} from 'lucide-react';

// Category icons (the same set as the advisor's quick prompts). They are
// decorative: render them aria-hidden next to the category label. Kept out of
// lib/utils so pages that never show a category don't bundle the icons.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  taxes: DollarSign,
  tax: DollarSign,
  housing: Home,
  healthcare: Heart,
  health: Heart,
  education: GraduationCap,
  employment: Briefcase,
  energy: Zap,
  retirement: PiggyBank,
  'social security': Shield,
};

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category.toLowerCase()] ?? FileText;
}
