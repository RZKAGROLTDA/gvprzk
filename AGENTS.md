# Project Architecture Rules

- Special Conditions loads date-scoped rows through RLS with ascending-ID keyset pages of at most 1,000; only complete results feed the table, indicators and Excel, preventing truncated totals.
- Special Conditions period, type validation, manual margin parsing and weighted-margin math live in src/lib/specialConditions.ts so their business rules remain independently testable.

- The Regularização PDF uses the official RZK Agro A4 letterhead extracted from the supplied DOCX as a full-page background on every page, preserving visual fidelity and safe content margins.
- App update flow lives only in src/lib/appUpdate.ts: HTML is never precached (NetworkFirst navigations) and reloads happen only after the new version is confirmed reachable, so users never stay stuck on an old shell.
- Validação e Regularização de Máquinas filial selection lives only in src/lib/parkFilialScope.ts and the park/regularization RPCs' p_filial_ids/p_include_sem_filial; the server (equipment_park_scope) is the authority, so the UI never widens scope.
- The two machine panels initialize local selection through useParkFilialSelection and gate data requests until ready; header changes do not reinitialize selection, and explicit scope requests send no legacy active-filial override.
