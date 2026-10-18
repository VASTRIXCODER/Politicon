import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LabClient from './LabClient';

// Visual QA for the 3D stage and kit. Never indexed, never linked, and gone
// on the production deployment (it stays in dev, previews and CI builds).
export const metadata: Metadata = {
  title: 'Lab',
  description: 'Internal visual QA for the Politicon 3D stage.',
  robots: { index: false, follow: false },
};

export default function LabPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <LabClient />;
}
