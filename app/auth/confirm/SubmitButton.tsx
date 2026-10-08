'use client';

import { useFormStatus } from 'react-dom';
import Button from '@/components/ui/Button';

/** Disabled while the form's action runs, so a double click can't spend the link twice. */
export default function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" fullWidth size="lg" disabled={pending}>
      {pending ? 'One moment…' : children}
    </Button>
  );
}
