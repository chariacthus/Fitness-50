import { ViewTransition } from "react";

/**
 * Templates re-mount on every navigation, so each page change runs a soft
 * blur-and-rise transition (see "Page transitions" in globals.css).
 * Browsers without the View Transitions API simply switch pages instantly.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
