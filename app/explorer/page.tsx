import { Metadata } from 'next';
import ExplorerClient from './ExplorerClient';

export const metadata: Metadata = {
  title: 'Public Impact Explorer — Politicon',
  description: 'Explore the average financial impact of top US policies across income brackets and states. No login required.',
};

export default function ExplorerPage() {
  return <ExplorerClient />;
}
