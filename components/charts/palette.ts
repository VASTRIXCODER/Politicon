// Chart colours (match the Politicon design system). Kept apart from
// Charts.tsx so pages can use them without pulling in recharts.

export const CHART = {
  primary: '#7B61FF',
  secondary: '#00D4FF',
  gold: '#F5C842',
  emerald: '#10B981',
  red: '#EF4444',
  grid: 'rgba(255,255,255,0.06)',
  axis: '#8B87A8',
};

export const CATEGORY_COLOR: Record<string, string> = {
  taxes: '#7B61FF',
  housing: '#F5C842',
  healthcare: '#00D4FF',
  employment: '#8B5CF6',
  retirement: '#EC4899',
  education: '#10B981',
  energy: '#F97316',
  other: '#6B7280',
};

const PALETTE = ['#7B61FF', '#00D4FF', '#F5C842', '#10B981', '#EC4899', '#F97316', '#8B5CF6', '#06B6D4', '#FB7185', '#A3E635'];
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length];
