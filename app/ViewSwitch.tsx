"use client";

import { useEffect, useState, type ReactNode } from "react";
import LiveLab from "./LiveLab";

// The Products host and dev-dot.li load the bundle as a single document, so
// the Live Lab is a view of the root page, not a route of its own. The hash
// keeps it linkable; LiveLab mounts only while shown, so its Celerity and
// wallet connections are not opened by visitors who stay on the overview.
const LAB_HASH = "#lab";
// The title the Live Lab had when it was the root page.
const LAB_TITLE = "Industrial · Live monitoring";

export function ViewSwitch({ overview }: { overview: ReactNode }) {
  const [showLab, setShowLab] = useState(false);

  useEffect(() => {
    const sync = () => setShowLab(window.location.hash === LAB_HASH);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!showLab) return;
    window.scrollTo(0, 0);
    const overviewTitle = document.title;
    document.title = LAB_TITLE;
    return () => {
      document.title = overviewTitle;
    };
  }, [showLab]);

  if (!showLab) return overview;

  return (
    <>
      <nav className="labBar" aria-label="Back to overview">
        <a href="#">← Overview</a>
      </nav>
      <LiveLab />
    </>
  );
}
