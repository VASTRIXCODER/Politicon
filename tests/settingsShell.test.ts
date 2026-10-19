import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The account forms only reach Supabase and the router when used; these
// tests look at what they render and at the rules behind them.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/sound', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/sound')>()), playCue: vi.fn() }));

const { playCue } = await import('@/lib/sound');
const { default: Experience, Switch, setSoundEffects } = await import('@/app/settings/_components/Experience');
const { default: AccountSection } = await import('@/app/settings/_components/AccountSection');
const { default: AccountDeleteDialog } = await import('@/app/settings/_components/AccountDeleteDialog');
const { PasswordStrengthMeter } = await import('@/app/settings/_components/AccountPassword');
const { default: SettingsNav } = await import('@/app/settings/_components/SettingsNav');
const { SettingsSection } = await import('@/app/settings/_components/SettingsSection');
const model = await import('@/app/settings/_components/settingsModel');

/** Visible text of an HTML fragment, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The text inside the element with this id. */
function textOfId(html: string, id: string): string {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`<(\\w+)[^>]*\\bid="${esc}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? text(m[2]) : '';
}

/** Every opening tag carrying `attr="value"`. */
const tagsWith = (html: string, attr: string, value: string) =>
  [...html.matchAll(new RegExp(`<[^>]*\\b${attr}="${value}"[^>]*>`, 'g'))].map((m) => m[0]);

const attrOf = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

const ACCOUNT = { email: 'avery@example.test', firstName: 'Avery', hasPassword: true };
const noop = () => {};

describe('settings sections and nav', () => {
  it('runs Profile, Experience, Account, in that order', () => {
    expect(model.SETTINGS_SECTIONS.map((s) => s.id)).toEqual(['profile', 'experience', 'account']);
    expect(model.SETTINGS_SECTIONS.map((s) => s.label)).toEqual(['Profile', 'Experience', 'Account']);
    expect(model.isSettingsSection('account')).toBe(true);
    expect(model.isSettingsSection('security')).toBe(false);
    expect(model.isSettingsSection('')).toBe(false);
  });

  it('renders one labelled nav of jump links, the first section current before scrolling', () => {
    const html = renderToString(h(SettingsNav));
    expect(html.match(/<nav\b/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Settings sections"');
    const links = [...html.matchAll(/<a\b[^>]*href="#([a-z]+)"[^>]*>/g)];
    expect(links.map((m) => m[1])).toEqual(['profile', 'experience', 'account']);
    expect(links.map((m) => attrOf(m[0], 'aria-current'))).toEqual(['location', undefined, undefined]);
    // The phones' thumb is decoration, hidden from assistive tech.
    expect(html.match(/<li\b/g)).toHaveLength(4);
    expect(html.match(/<li aria-hidden="true"/g)).toHaveLength(1);
    // Unnumbered: the profile's four sections carry the page's only 01–04.
    expect(text(html)).not.toMatch(/\b0\d\b/);
  });

  it('marks the current section in forced colours too, and fits its labels whole under 360px', () => {
    const html = renderToString(h(SettingsNav));
    // The thumb's fill and the lamp disappear in forced colours: the current label is underlined there.
    const underlined = [...html.matchAll(/<span class="[^"]*forced-colors:underline[^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(underlined).toEqual(['Profile']);
    for (const link of html.match(/<a\b[^>]*>/g) ?? []) expect(link).toContain('max-[359px]:px-1.5');
  });

  it('frames a section as its anchor, named by an h2 that the nav can focus', () => {
    const html = renderToString(
      h(SettingsSection, { id: 'experience', title: 'Your experience', lede: 'How it looks.', children: h('p', null, 'body') })
    );
    expect(html).toMatch(/^<section id="experience" aria-labelledby="settings-experience-title"/);
    expect(html).toMatch(/<h2\b[^>]*>[\s\S]*id="settings-experience-title" tabindex="-1"/);
    expect(textOfId(html, 'settings-experience-title')).toBe('Your experience');
    // The eyebrow names it as the nav does.
    expect(text(html)).toMatch(/^Experience Your experience How it looks\. body$/);
  });
});

describe('settings notices', () => {
  it('knows the notices email links land with', () => {
    expect(model.noticeFor('?notice=link_invalid')).toEqual({ message: 'That link is invalid or has expired. You’re still signed in.', type: 'error' });
    expect(model.noticeFor('?notice=email_change_pending')?.type).toBe('success');
  });

  it('ignores anything else', () => {
    for (const q of ['', '?notice=', '?notice=nope', '?notice=toString', '?notice=__proto__', '?other=link_invalid']) {
      expect(model.noticeFor(q), q).toBeNull();
    }
  });
});

describe('Experience', () => {
  const html = renderToString(h(Experience));

  it('offers the theme and visual effects as named radio groups', () => {
    expect(html).toContain('role="radiogroup" aria-label="Theme"');
    const [effects] = tagsWith(html, 'aria-labelledby', 'settings-effects');
    expect(effects).toContain('role="radiogroup"');
    expect(textOfId(html, 'settings-effects')).toBe('Visual effects');
    for (const label of ['Light', 'Dark', 'System', 'Full', 'Reduced', 'Off']) expect(text(html)).toContain(label);
  });

  it('makes pause motion and sound effects real switches, named and described by their rows, off on the server', () => {
    const switches = tagsWith(html, 'role', 'switch');
    expect(switches).toHaveLength(2);
    const names = switches.map((s) => textOfId(html, attrOf(s, 'aria-labelledby')!));
    expect(names).toEqual(['Pause motion', 'Sound effects']);
    for (const s of switches) {
      expect(attrOf(s, 'aria-checked')).toBe('false');
      expect(attrOf(s, 'type')).toBe('button');
      // A plain-English sentence says what each does.
      expect(textOfId(html, attrOf(s, 'aria-describedby')!).length).toBeGreaterThan(40);
    }
  });

  it('keeps the reading mode choice, saved to the account', () => {
    expect(text(html)).toContain('Simple Mode');
    expect(text(html)).toContain('Expert Mode');
    expect(text(html)).toContain('Reading mode is saved automatically and synced across devices');
    // The server render reads Expert (the provider's default).
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>[\s\S]*?Expert Mode/);
  });

  it('states every preference in plain English', () => {
    for (const title of ['Theme', 'Visual effects', 'Pause motion', 'Sound effects', 'Reading mode']) {
      expect(html).toMatch(new RegExp(`<h3 id="[^"]+"[^>]*>${title}</h3><p id="[^"]+"[^>]*>[^<]{30,}`));
    }
  });
});

describe('the switch', () => {
  it('flips on press and says its state in aria-checked', () => {
    const onChange = vi.fn();
    const off = Switch({ checked: false, onCheckedChange: onChange, labelledBy: 'x' });
    off.props.onClick();
    expect(onChange).toHaveBeenCalledWith(true);
    const on = Switch({ checked: true, onCheckedChange: onChange, labelledBy: 'x' });
    on.props.onClick();
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(renderToString(on)).toContain('aria-checked="true"');
  });

  it('keeps its state visible in forced colours, which drop the track’s light and the thumb’s fill', () => {
    const off = renderToString(Switch({ checked: false, onCheckedChange: noop, labelledBy: 'x' }));
    const on = renderToString(Switch({ checked: true, onCheckedChange: noop, labelledBy: 'x' }));
    expect(off).toContain('forced-colors:bg-[color:CanvasText]');
    expect(on).toContain('forced-colors:bg-[color:Highlight]');
    expect(on).toContain('forced-colors:bg-[color:HighlightText]');
  });

  it('chimes once when sound is turned on, and stays silent turning it off', () => {
    const setOn = vi.fn();
    vi.mocked(playCue).mockClear();
    setSoundEffects(true, setOn);
    expect(setOn).toHaveBeenCalledWith(true);
    expect(playCue).toHaveBeenCalledTimes(1);
    expect(playCue).toHaveBeenCalledWith('chime');
    setSoundEffects(false, setOn);
    expect(setOn).toHaveBeenLastCalledWith(false);
    expect(playCue).toHaveBeenCalledTimes(1);
  });
});

describe('Account', () => {
  const html = renderToString(h(AccountSection, { account: ACCOUNT, onNameSaved: noop, notify: noop }));

  it('keeps every form and label', () => {
    for (const label of [
      'Personal information', 'First name', 'Save name',
      'Email address', 'New email address', 'Change email',
      'Change password', 'Current password', 'New password', 'Confirm new password', 'Update password',
      'Sessions', 'Sign out all other devices',
      'Your data', 'Download my data (JSON)', 'How we use your data',
      'Delete account',
    ]) {
      expect(text(html), label).toContain(label);
    }
    expect(text(html)).toContain('Currently avery@example.test');
  });

  it('labels every field', () => {
    const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
    expect(inputs.length).toBe(5);
    for (const input of inputs) {
      const id = attrOf(input, 'id')!;
      expect(html, id).toContain(`for="${id}"`);
    }
  });

  it('keeps its busy buttons focusable: nothing on the server render is disabled but the unchanged forms’ submits', () => {
    // A save in flight reads aria-disabled (a disabled button would drop keyboard focus);
    // "Save name", "Change email" and "Update password" wait, disabled, until there's something to send.
    const disabled = [...html.matchAll(/<button\b[^>]*\sdisabled=""[^>]*>[\s\S]*?<\/button>/g)].map((m) => text(m[0]));
    expect(disabled).toEqual(['Save name', 'Change email', 'Update password']);
  });

  it('downloads the data export from the export route', () => {
    expect(html).toMatch(/<a href="\/api\/account\/export" download=""/);
  });

  it('asks for no current password on accounts without one', () => {
    const oauth = renderToString(h(AccountSection, { account: { ...ACCOUNT, hasPassword: false }, onNameSaved: noop, notify: noop }));
    expect(text(oauth)).not.toContain('Current password');
    expect(text(oauth)).toContain('New password');
  });

  it('keeps the delete confirmation out of the page until asked for', () => {
    expect(html).not.toContain('<dialog');
    expect(text(html)).not.toContain('Type DELETE to confirm');
    expect(html).toMatch(/aria-haspopup="dialog"[^>]*>[\s\S]*?Delete account/);
  });
});

describe('deleting the account', () => {
  it('confirms in a danger dialog with the typed safety catch', () => {
    const html = renderToString(h(AccountDeleteDialog, { open: false, hasPassword: true, onClose: noop }));
    expect(html).toContain('role="alertdialog"');
    expect(text(html)).toContain('Delete your account?');
    expect(text(html)).toContain('This cannot be undone.');
    expect(text(html)).toContain('Type DELETE to confirm');
    expect(text(html)).toContain('Your password');
    expect(text(html)).toContain('Permanently delete my account');
    expect(html).toMatch(/<input[^>]*type="password"[^>]*autocomplete="current-password"/i);
  });

  it('asks provider-only accounts for the typed confirmation alone', () => {
    const html = renderToString(h(AccountDeleteDialog, { open: false, hasPassword: false, onClose: noop }));
    expect(text(html)).toContain('Type DELETE to confirm');
    expect(text(html)).not.toContain('Your password');
  });

  it('needs DELETE exactly, then the password', () => {
    expect(model.deleteProblem({ confirm: '', password: '', hasPassword: true })).toBe('Type DELETE to confirm');
    expect(model.deleteProblem({ confirm: 'delete', password: 'pw', hasPassword: true })).toBe('Type DELETE to confirm');
    expect(model.deleteProblem({ confirm: 'DELETE ', password: 'pw', hasPassword: true })).toBe('Type DELETE to confirm');
    expect(model.deleteProblem({ confirm: 'DELETE', password: '', hasPassword: true })).toBe('Enter your password to confirm');
    expect(model.deleteProblem({ confirm: 'DELETE', password: 'pw', hasPassword: true })).toBeNull();
    expect(model.deleteProblem({ confirm: 'DELETE', password: '', hasPassword: false })).toBeNull();
  });

  it('clears only this app’s keys from the browser afterwards', () => {
    const store: Record<string, unknown> = { politicon_reading_mode: 'simple', 'politicon:onboarding-draft:u1': '{}', 'pc-theme': 'dark' };
    const storage = Object.assign(Object.create(null), store, {}) as Record<string, unknown>;
    Object.defineProperty(storage, 'removeItem', { value: (k: string) => void delete storage[k], enumerable: false });
    model.clearLocalData(storage as Parameters<typeof model.clearLocalData>[0]);
    expect(Object.keys(storage)).toEqual(['pc-theme']);
  });
});

describe('the password form', () => {
  it('checks length, match and the current password, in that order', () => {
    const base = { current: 'old-password', next: 'Longenough1!', confirm: 'Longenough1!', hasPassword: true };
    expect(model.passwordChangeProblem({ ...base, next: 'short', confirm: 'short' })).toBe('Password must be at least 8 characters');
    expect(model.passwordChangeProblem({ ...base, confirm: 'Longenough1?' })).toBe('Passwords do not match');
    expect(model.passwordChangeProblem({ ...base, current: '' })).toBe('Enter your current password');
    expect(model.passwordChangeProblem({ ...base, current: '', hasPassword: false })).toBeNull();
    expect(model.passwordChangeProblem(base)).toBeNull();
  });

  it('reads strength from four plain checks', () => {
    expect(model.passwordStrength('abc')).toMatchObject({ score: 0, label: 'Weak' });
    expect(model.passwordStrength('abcdefgh')).toMatchObject({ score: 1, label: 'Weak' });
    expect(model.passwordStrength('Abcdefgh')).toMatchObject({ score: 2, label: 'Fair' });
    expect(model.passwordStrength('Abcdefg1')).toMatchObject({ score: 3, label: 'Good' });
    expect(model.passwordStrength('Abcdef1!')).toMatchObject({ score: 4, label: 'Strong' });
    expect(model.passwordStrength('x').checks.map((c) => c.label)).toEqual(['8+ characters', 'Uppercase letter', 'Number', 'Special character']);
  });

  it('says the strength in words and each check to screen readers', () => {
    expect(renderToString(h(PasswordStrengthMeter, { id: 'm', password: '' }))).toBe('');
    const html = renderToString(h(PasswordStrengthMeter, { id: 'm', password: 'Abcdefg1' }));
    expect(html).toMatch(/^<div id="m"/);
    expect(text(html)).toContain('Password strength: Good');
    expect(text(html)).toMatch(/Has\s*:\s*8\+ characters/);
    expect(text(html)).toMatch(/Missing\s*:\s*Special character/);
  });
});

describe('the account helpers', () => {
  it('draws initials from the name, else the email', () => {
    expect(model.initialsFor('avery', 'x@y.z')).toBe('AV');
    expect(model.initialsFor('', 'sam@example.test')).toBe('SA');
  });

  it('checks an email address loosely', () => {
    expect(model.isValidEmail(' new@example.test ')).toBe(true);
    for (const bad of ['', 'new', 'new@', 'new@example', 'a b@example.test']) expect(model.isValidEmail(bad), bad).toBe(false);
  });
});

describe('the settings first load', () => {
  // Settings is the largest signed-in page; motion/react must only arrive with the delete dialog.
  const dir = join(process.cwd(), 'app/settings');
  const files = [
    join(dir, 'page.tsx'),
    join(dir, 'layout.tsx'),
    ...readdirSync(join(dir, '_components')).map((f) => join(dir, '_components', f)),
  ];

  it('leaves motion/react to the lazily loaded delete dialog', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const usesMotion = /from ['"](motion\/react|@\/components\/providers\/MotionProvider)['"]/.test(src);
      expect(usesMotion, file).toBe(file.endsWith('AccountDeleteDialog.tsx'));
    }
    const trigger = readFileSync(join(dir, '_components/AccountDelete.tsx'), 'utf8');
    expect(trigger).toMatch(/dynamic\(loadDialog, \{ ssr: false/);
    expect(trigger).toMatch(/import\('\.\/AccountDeleteDialog'\)/);
    for (const file of files) {
      if (file.endsWith('AccountDelete.tsx')) continue;
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/from ['"]\.\/AccountDeleteDialog['"]/);
    }
  });
});
