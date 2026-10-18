'use client';

import Link, { type LinkProps } from 'next/link';
import { useCallback, type ComponentPropsWithRef, type ReactNode, type Ref } from 'react';
import { useMagnetic } from '@/lib/hooks/useMagnetic';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'ghost' | 'secondary' | 'gold' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  fullWidth?: boolean;
  /** Decorative icon (hidden from screen readers). */
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
  /**
   * Leans toward a mouse pointer on hover. On by default for primary buttons;
   * never on touch screens, under reduced motion, or while disabled.
   */
  magnetic?: boolean;
}

type NativeButtonProps = CommonProps &
  Omit<ComponentPropsWithRef<'button'>, keyof CommonProps> & { href?: undefined };

type LinkButtonProps = CommonProps &
  Omit<ComponentPropsWithRef<'a'>, keyof CommonProps | 'href'> &
  Pick<LinkProps, 'prefetch' | 'replace' | 'scroll'> & {
    /** Renders a next/link styled as a button, instead of nesting <Link><button>. */
    href: LinkProps['href'];
    /** A disabled link renders as inert text-styled-as-button, not a link. */
    disabled?: boolean;
  };

export type ButtonProps = NativeButtonProps | LinkButtonProps;

// md and lg are at least 44px tall (comfortable touch targets) even when a
// caller trims the padding.
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'min-h-11 px-6 py-3 text-sm',
  lg: 'min-h-12 px-8 py-4 text-base',
};

// A text link has no box, only the type size.
const linkSizeClasses: Record<ButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-sm',
  lg: 'text-base',
};

/** Resting look, then the hover look (left off while disabled). */
const variantClasses: Record<ButtonVariant, [string, string]> = {
  // Violet light: .shimmer-btn paints the fill, the inner highlight and the
  // sheen. White on the fill is 5.1:1 (AA) in both themes.
  primary: [
    'shimmer-btn bg-primary-fill text-white relative overflow-hidden',
    'hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_14px_34px_-12px_rgb(var(--c-violet)/0.85)]',
  ],
  // Ink on paper by day; a light pane with night ink in the dark theme.
  secondary: [
    'bg-ink text-canvas border border-transparent shadow-[0_10px_24px_-14px_rgb(var(--c-ink)/0.6)] dark:shadow-none',
    'hover:bg-ink/90',
  ],
  // A hairline outline on a veil of paper. No backdrop blur: inside a glass
  // pane or the navbar (each its own backdrop root) a nested blur samples an
  // empty backdrop and paints a dark pill in the dark theme. A ghost button
  // that floats straight over a 3D scene can add backdrop-blur-sm itself.
  ghost: [
    'border border-fg/15 bg-raised/60 text-ink [@media(prefers-reduced-transparency:reduce)]:bg-raised',
    'hover:border-primary/40 hover:bg-raised',
  ],
  // Archive gold, for official-record actions only.
  gold: ['bg-gold/10 border border-gold/30 text-gold', 'hover:bg-gold/15 hover:border-gold/45'],
  link: [
    'rounded-md text-primary-300 underline-offset-4 decoration-primary/40',
    'hover:text-ink hover:underline',
  ],
};

// How far the magnetic pull reaches, in px, by size: a hint of life, not a wobble.
const pullBySize: Record<ButtonSize, number> = { sm: 3, md: 5, lg: 6 };

/** Hands one DOM node to the magnetic ref and to the caller's ref. */
function useMergedRef<T>(own: { current: T | null }, theirs: Ref<T> | undefined) {
  return useCallback(
    (node: T | null) => {
      own.current = node;
      if (typeof theirs === 'function') {
        const cleanup = theirs(node);
        // React 19 calls a returned cleanup instead of calling the ref with null.
        return typeof cleanup === 'function'
          ? () => {
              own.current = null;
              cleanup();
            }
          : undefined;
      }
      if (theirs) (theirs as { current: T | null }).current = node;
    },
    [own, theirs]
  );
}

/**
 * The app's button. Pass `href` to render a next/link with identical styling.
 * Native button/anchor props (aria-*, onClick, form, target, rel, ref…) pass through.
 *
 *   primary    violet light, the one main action in a view
 *   secondary  solid ink, a strong alternative
 *   ghost      hairline outline, everyday actions
 *   gold       archive gold, official-record actions only
 *   link       a violet text link
 */
export default function Button(props: ButtonProps) {
  const {
    children,
    variant = 'primary',
    size = 'md',
    className,
    fullWidth = false,
    icon,
    iconPosition = 'start',
    disabled = false,
    magnetic,
    ref: forwardedRef,
    ...rest
  } = props;

  const pull = (magnetic ?? variant === 'primary') && !disabled && variant !== 'link' ? pullBySize[size] : 0;
  const magneticRef = useMagnetic<HTMLElement>(pull);
  const ref = useMergedRef<HTMLElement>(magneticRef, forwardedRef as Ref<HTMLElement> | undefined);

  const [look, hoverLook] = variantClasses[variant];
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-body font-medium cursor-pointer select-none',
    // `translate` carries the magnetic pull; `transform` the press.
    'transition-[color,background-color,border-color,box-shadow,text-decoration-color,transform,translate,opacity] duration-200 ease-civic',
    variant === 'link' ? linkSizeClasses[size] : sizeClasses[size],
    look,
    !disabled && hoverLook,
    // CSS press feedback; skipped under reduced motion.
    !disabled && variant !== 'link' && 'motion-safe:active:scale-[0.98]',
    fullWidth && 'w-full',
    disabled && 'opacity-50 cursor-not-allowed',
    className
  );

  const content = (
    <>
      {icon && iconPosition === 'start' && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
      {children}
      {icon && iconPosition === 'end' && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
    </>
  );

  if (rest.href !== undefined) {
    const { href, prefetch, replace, scroll, ...anchorProps } = rest as Omit<LinkButtonProps, keyof CommonProps | 'disabled' | 'ref'>;
    if (disabled) {
      // No href: not focusable, not followable, announced as a disabled link.
      return (
        <a
          {...anchorProps}
          ref={ref}
          onClick={undefined}
          target={undefined}
          rel={undefined}
          download={undefined}
          role="link"
          aria-disabled="true"
          className={classes}
        >
          {content}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} replace={replace} scroll={scroll} {...anchorProps} ref={ref} className={classes}>
        {content}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = rest as Omit<NativeButtonProps, keyof CommonProps | 'disabled' | 'ref'>;
  return (
    <button type={type} disabled={disabled} {...buttonProps} ref={ref} className={classes}>
      {content}
    </button>
  );
}
