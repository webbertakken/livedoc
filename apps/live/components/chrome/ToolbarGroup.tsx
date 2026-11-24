import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { TOOLBAR_CARD, TOOLBAR_DIVIDER } from './toolbar-surface';

// Inside a group, a shared control (ChromeControls, the account control, Start Tour) takes the group's flat
// button rather than the look it has elsewhere (the Explorer's bars), so a control never has to be told where it is.
const InToolbarGroup = createContext(false);
export function useInToolbarGroup(): boolean {
  return useContext(InToolbarGroup);
}

// The one container every editor toolbar is drawn in (docs/specs/004-interface-design/toolbar-group.md): the Palette
// strip, Draw's dock and every group on the editor's two lines. The palette strip's surface, every child centred on
// the cross axis. Given a label it is a named `toolbar`; the strip and the dock keep their own roles.
export function ToolbarGroup({
  label,
  className = '',
  children,
  ...rest
}: ComponentProps<'div'> & { label?: string }) {
  return (
    <div
      role={label ? 'toolbar' : undefined}
      aria-label={label}
      {...rest}
      className={`${TOOLBAR_CARD} ${className}`.trim()}
    >
      <InToolbarGroup.Provider value>{children}</InToolbarGroup.Provider>
    </div>
  );
}

// The divider's hairline, drawn before a part that follows a part which drew something. By CSS, so a part whose
// controls render nothing (`empty:hidden`) leaves no doubled or dangling divider behind.
export const AFTER_A_PART =
  '[[data-toolbar-part]:not(:empty)~&]:before:mx-0.5 [[data-toolbar-part]:not(:empty)~&]:before:h-chip [[data-toolbar-part]:not(:empty)~&]:before:w-px [[data-toolbar-part]:not(:empty)~&]:before:shrink-0 [[data-toolbar-part]:not(:empty)~&]:before:bg-slate-200 dark:[[data-toolbar-part]:not(:empty)~&]:before:bg-slate-700';

/** A part's classes, for a part a component draws itself (the tools group's cluster strips). */
export const TOOLBAR_PART = `flex items-center gap-0.5 empty:hidden ${AFTER_A_PART}`;

// A run of controls inside a group; a divider parts it from the run before.
export function ToolbarPart({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-toolbar-part="" className={`${TOOLBAR_PART} ${className}`.trim()}>
      {children}
    </div>
  );
}

// The 1px rule, the chip step tall, between parts, 2px either side.
export function ToolbarDivider(props: Record<`data-${string}`, string>) {
  return <span data-toolbar-divider="" {...props} aria-hidden className={TOOLBAR_DIVIDER} />;
}
