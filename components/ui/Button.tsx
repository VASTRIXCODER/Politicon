import Link, { type LinkProps } from 'next/link';
import type { ComponentPropsWithRef, ReactNode } from 'react';
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

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
};

const variantClasses: Record<ButtonVariant, string> = {
  // bg-primary-fill (#6A4FF0) keeps white text at AA; .shimmer-btn layers the gradient on it.
  primary: 'bg-primary-fill text-white font-medium shimmer-btn relative overflow-hidden',
  ghost: 'border border-white/10 text-text-primary bg-white/3 hover:bg-white/[0.07] hover:border-primary/40',
  secondary: 'bg-secondary/10 border border-secondary/30 text-secondary hover:bg-secondary/20',
  gold: 'bg-gold/10 border border-gold/30 text-gold hover:bg-gold/20',
  link: 'px-0 py-0 rounded-md text-primary-300 hover:text-text-primary underline-offset-4 hover:underline',
};

/**
 * The app's button. Pass `href` to render a next/link with identical styling.
 * Native button/anchor props (aria-*, onClick, form, target, rel…) pass through.
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
    ...rest
  } = props;

  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-body font-medium transition-all duration-200 ease-out cursor-pointer select-none',
    sizeClasses[size],
    variantClasses[variant],
    // CSS press feedback instead of a JS spring; skipped under reduced motion.
    !disabled && variant !== 'link' && 'motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97]',
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
    const { href, prefetch, replace, scroll, ...anchorProps } = rest as Omit<LinkButtonProps, keyof CommonProps | 'disabled'>;
    if (disabled) {
      // No href: not focusable, not followable, announced as a disabled link.
      return (
        <a
          {...anchorProps}
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
      <Link href={href} prefetch={prefetch} replace={replace} scroll={scroll} {...anchorProps} className={classes}>
        {content}
      </Link>
    );
  }

  const { type = 'button', ...buttonProps } = rest as Omit<NativeButtonProps, keyof CommonProps | 'disabled'>;
  return (
    <button type={type} disabled={disabled} {...buttonProps} className={classes}>
      {content}
    </button>
  );
}
