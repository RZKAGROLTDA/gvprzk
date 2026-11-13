# Project Architecture Rules

- Route imports retry transport failures only and remain inside an ErrorBoundary; module recovery uses appUpdate's verified reload so unavailable deployments never blank the app or discard offline work.

- Bulk activity PDFs use RLS-scoped keyset task listing and revalidate each activity before strict hydration through generateReportPDF; generators return their existing PDF as a Blob only for ZIP export, leaving individual downloads unchanged.

- Base JD visibility uses useJdAdminAccess with the server has_role check, not the legacy profile role; multi-role administrators must retain access and import authorization stays server-side.

- Special Conditions loads date-scoped rows through RLS with ascending-ID keyset pages of at most 1,000; only complete results feed the table, indicators and Excel, preventing truncated totals.
- Special Conditions period, type validation, manual margin parsing and weighted-margin math live in src/lib/specialConditions.ts so their business rules remain independently testable.
- Special Conditions Excel row mapping lives in src/lib/specialConditionExcel.ts and is shared by the screen export and file-readability validation, keeping validation faithful to the shipped mapping.

- The Regularização PDF uses the official RZK Agro A4 letterhead extracted from the supplied DOCX as a full-page background on every page, preserving visual fidelity and safe content margins.
- App update flow lives only in src/lib/appUpdate.ts: HTML is never precached (NetworkFirst navigations), reloads happen only after the new version is confirmed reachable, retries are spaced and capped per build, and route changes apply a detected update only when no work is pending, so users never stay stuck on an old shell nor loop.
- Validação e Regularização de Máquinas filial selection lives only in src/lib/parkFilialScope.ts and the park/regularization RPCs' p_filial_ids/p_include_sem_filial; the server (equipment_park_scope) is the authority, so the UI never widens scope.
- The two machine panels initialize local selection through useParkFilialSelection and gate data requests until ready; header changes do not reinitialize selection, and explicit scope requests send no legacy active-filial override.
- Situação JD (v3) is computed live inside jd_audit_status_of from all checklists (first by start_date,id per normalized chassis = ok, later = duplicado); it stays internal so report RPCs enforce visibility, and legacy JD base/import tables are kept untouched.
- Projeção reads and writes only through SECURITY DEFINER RPCs (tables have no client grants); its consolidation and Excel-import rules live in src/lib/projection.ts and the panel totals only the selected week (rowsForWeek), never summing weeks or borrowing another week.
- Projection table metrics use the shared projection helper; consolidated week-over-week variation compares matched branches with prior entries to avoid treating first entries as growth.
- Weekly projection money inputs use NumericFormat for caret-aware BRL formatting and keep ungrouped decimal strings until strict conversion at save, avoiding cents-shifting masks.
- Projeção full access is decided only by projection_is_admin() on the server, mirrored by hasProjectionFullAccess in src/lib/projection.ts, so UI and database grant by role identically.
