# Project Architecture Rules

- The Regularização PDF uses the official RZK Agro A4 letterhead extracted from the supplied DOCX as a full-page background on every page, preserving visual fidelity and safe content margins.
- App update flow lives only in src/lib/appUpdate.ts: HTML is never precached (NetworkFirst navigations) and reloads happen only after the new version is confirmed reachable, so users never stay stuck on an old shell.
