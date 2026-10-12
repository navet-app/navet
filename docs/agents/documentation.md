# Documentation policy

Write current guidance for a new reader; explain the lasting behavior, current UI labels and
concrete workflow. Update affected setup, capabilities, architecture or troubleshooting when a
change alters them. A code change alone does not require documentation.

- Revise the existing explanation coherently. Delete obsolete concepts, examples, warnings and
  cross-references; keep history in changelogs, issues, PRs and Git.
- State provider/deployment differences in their owning guides. Link shared rules rather than
  maintaining parallel specifications.
- Distinguish current implementation, stable imports and target ownership. Code verifies present
  behavior; the root authority order determines intended direction.
- Keep task entrypoints self-contained for ordinary work. Open deeper contracts only when the
  task changes them. Include technical detail only when it helps the reader decide or act.

## Drift audit

1. Identify the document's role: current guidance, open roadmap or historical record. Remove
   completed plans after lasting contracts and remaining acceptance gates have an owner.
2. Check claims against the exact current owner, callers, command definitions and workflows.
   Use rendered or real-runtime evidence for behavior that source checks cannot establish.
   Record what remains unverified; previous prose and plans are not proof.
3. Resolve contradictions using root `AGENTS.md` authority. Correct stale descriptions without
   changing product intent. Escalate product/foundational conflicts to the maintainer; neither
   code nor a documentation cleanup authorizes a new direction.
4. Give each rule one owner. Replace duplicate explanations with precise links; retain unique
   privacy, compatibility, approval and evidence boundaries.
   Keep agent entrypoints brief and ordinary tasks self-contained; route exceptional detail
   through task-specific links. Remove task narratives, repeated checklists and superseded
   guidance from touched sections instead of appending another explanation.
5. Check inbound references, paths and commands after moves/removals. Build affected public docs
   and review the surrounding text for coherence. Recheck volatile operational status for the
   current task instead of preserving dated readiness claims in permanent instructions.

Ask: would this information be included if the guide were written from scratch today?
If not, remove it. Audit touched guidance during delivery; a wider audit uses the same process
within its requested scope. Historical evidence remains searchable in Git and linked records.
