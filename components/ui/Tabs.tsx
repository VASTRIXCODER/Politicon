'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/*
 * WAI-ARIA tabs (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/):
 *
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabList label="Analysis sections">
 *       <Tab value="overview">Overview</Tab>
 *       <Tab value="charts">Charts</Tab>
 *     </TabList>
 *     <TabPanel value="overview">…</TabPanel>
 *     <TabPanel value="charts">…</TabPanel>
 *   </Tabs>
 *
 * Only the selected tab is in the Tab order (roving tabindex). Arrow keys move
 * between tabs, Home/End jump to the ends, and by default moving also selects.
 */

interface TabsContextValue {
  baseId: string;
  value: string | undefined;
  select: (_value: string) => void;
  activation: 'automatic' | 'manual';
  orientation: 'horizontal' | 'vertical';
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  return ctx;
}

const slug = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_');
/** DOM id of a tab button, e.g. to move focus to it (`<Tabs id>` + the tab's value). */
export const tabId = (baseId: string, value: string) => `${baseId}-tab-${slug(value)}`;
const panelId = (baseId: string, value: string) => `${baseId}-panel-${slug(value)}`;

export interface TabsProps<T extends string> {
  children: ReactNode;
  /** Selected tab (controlled). Pass this or `defaultValue`. */
  value?: T;
  /** Initially selected tab (uncontrolled). */
  defaultValue?: T;
  onValueChange?: (_value: T) => void;
  /** 'automatic' (default) selects on arrow keys; 'manual' moves focus and waits for Enter/Space. */
  activation?: 'automatic' | 'manual';
  orientation?: 'horizontal' | 'vertical';
  /** Prefix for generated tab/panel ids. Defaults to a React useId. */
  id?: string;
  className?: string;
}

export function Tabs<T extends string>({
  children,
  value,
  defaultValue,
  onValueChange,
  activation = 'automatic',
  orientation = 'horizontal',
  id,
  className,
}: TabsProps<T>) {
  const autoId = useId();
  const [inner, setInner] = useState<T | undefined>(defaultValue);
  const current = value !== undefined ? value : inner;

  const select = useCallback(
    (next: string) => {
      if (value === undefined) setInner(next as T);
      onValueChange?.(next as T);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ baseId: id ?? autoId, value: current, select, activation, orientation }}>
      {className ? <div className={className}>{children}</div> : children}
    </TabsContext.Provider>
  );
}

export interface TabListProps {
  children: ReactNode;
  /** Accessible name for the tab list. Use this or `labelledBy`. */
  label?: string;
  /** id of a visible heading that names the tab list. */
  labelledBy?: string;
  className?: string;
}

export function TabList({ children, label, labelledBy, className }: TabListProps) {
  const { activation, orientation, select } = useTabs('TabList');
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = ref.current;
    if (!list) return;
    const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;

    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    let next: number;
    if (e.key === prevKey) next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === nextKey) next = (index + 1) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;

    e.preventDefault();
    const target = tabs[next];
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const v = target.dataset.value;
    if (activation === 'automatic' && v !== undefined) select(v);
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      className={cn(
        orientation === 'horizontal'
          ? 'flex items-center gap-1 overflow-x-auto scrollbar-hide max-w-full'
          : 'flex flex-col gap-1',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface TabProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  /** Decorative icon shown before the label. */
  icon?: ReactNode;
  /** Classes for every state. Style the selected state with `aria-selected:` variants. */
  className?: string;
}

export function Tab({ value, children, disabled, icon, className }: TabProps) {
  const { baseId, value: current, select } = useTabs('Tab');
  const selected = current === value;

  return (
    <button
      type="button"
      role="tab"
      id={tabId(baseId, value)}
      aria-selected={selected}
      // Unselected panels aren't mounted (unless forceMount), so only point at one that exists.
      aria-controls={selected ? panelId(baseId, value) : undefined}
      // Roving tabindex; if nothing is selected yet, every tab stays reachable.
      tabIndex={selected || current === undefined ? 0 : -1}
      disabled={disabled}
      data-value={value}
      data-state={selected ? 'active' : 'inactive'}
      onClick={() => select(value)}
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-colors',
        'text-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50',
        'aria-selected:bg-primary/15 aria-selected:text-primary-300',
        className
      )}
    >
      {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}

export interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
  /** Keep the panel mounted (hidden) when not selected, e.g. to preserve chart state. */
  forceMount?: boolean;
}

export function TabPanel({ value, children, className, forceMount = false }: TabPanelProps) {
  const { baseId, value: current } = useTabs('TabPanel');
  const selected = current === value;
  if (!selected && !forceMount) return null;

  return (
    <div
      role="tabpanel"
      id={panelId(baseId, value)}
      aria-labelledby={tabId(baseId, value)}
      tabIndex={0}
      hidden={!selected}
      className={cn('rounded-2xl', className)}
    >
      {children}
    </div>
  );
}
