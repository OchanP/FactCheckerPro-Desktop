# FactChecker Pro Education: build plan

Source documents: `enterprise.zip` (Enterprise Education recommendations, Education Phased Product Roadmap, 30 months).

Core loop: Teach, Assign, Investigate, Explain, Assess, Improve.

## Decisions taken

| Question | Decision |
|---|---|
| Relationship to current desktop app | New Education edition inside this folder. The classic hub (Claim Check, FactNews, FactPlay, Election Watch, Podcasts) stays as the student toolbox, opened from the Education app. |
| First build | Release 1, Classroom Beta (roadmap Phase 2 core). |
| Data | Existing Railway backend and Postgres. New `/api/edu` routes and self-creating `edu_*` tables. No separate server. |
| Sign in | Existing email accounts. A person picks a role (teacher or student), students join classes with an invite code. School SSO (Entra ID, Google Workspace) and LMS links come with Release 3. |
| Web extension and mobile app | Untouched for now. Later they feed the same `/api/edu` classes. |

## Release 1 scope (built)

Teacher side: class creation and invite codes, student roster, assignments (article, website, image, video, claim), deadlines, AI-use rules, submission review with rubric scores and feedback, class progress, CSV report export, reuse of an assignment.

Student side: join with code, assignment list, Investigation Workspace (claims, evidence with source details, confidence, conclusion category, reasoning, AI-use disclosure, draft and submit), optional "compare with FactChecker Pro analysis" only after submitting, five curriculum modules with knowledge checks and reflection, competency profile, badges.

Competencies (four, as in the roadmap): Source evaluation, Claim verification, Evidence gathering, AI-content recognition.

Conclusion categories: Supported, Partially supported, Misleading, Disputed, Unsupported, Unverifiable.

Privacy and accessibility foundation: role based access (a teacher only sees their own classes), data minimisation, per class retention setting with automatic purge, student data export and deletion, keyboard navigation, visible focus, text size control, high contrast option, status never shown by colour alone.

## Design rules taken from the documents

1. Measure the reasoning process, not only the verdict. Evidence gathering and reasoning count even when the conclusion is wrong.
2. Explain every assessment: each automatic score lists the reasons behind it. Scores are advisory and never set a grade.
3. Student agency: the system analysis stays hidden until the student has submitted their own conclusion.
4. No student surveillance: teachers see only their own classes, no browsing history is collected, reports show assignment work only.
5. Features that raise engagement but not learning rank lower, so gamification is limited to badges tied to demonstrated competency.

## Mapping to the roadmap

| Roadmap item | Status |
|---|---|
| Phase 2 Teacher dashboard, student workspace, five modules, competency profile, badges, privacy and accessibility | Built |
| Phase 3 Institution structure and admin portal (units, members, roles, seats, audit log, reports) | Built |
| Phase 3 Institution domain join (verified by DNS TXT record) | Built, replaces SSO for now |
| Phase 3 Custom curriculum builder, marketplace, pre and post assessment | Built |
| Phase 3 Group assignments, teaching assistants, roster import, gradebook CSV | Built |
| Phase 3 Google Classroom connector (connect, import course and roster, publish assignment, send draft grades) | Built and tested against a fake Google. Needs the Google client id and secret, see `EDU_CONNECTORS_SETUP.md` in the server repo. |
| Phase 3 Teams, Canvas, Moodle, Blackboard, LTI | Not built yet. Same connector shape in `server/routes/eduPro/connectors.js`. Each needs its own registration. |
| Phase 3 Entra ID and Google SSO | Not built. Needs tenant and OAuth registrations. |
| Phase 4 Evidence boards (personal, shared, class and team boards), peer review, citation assistant, credibility score | Built |
| Phase 4 Research Mode (studies, consent, groups, scenarios, pre and post, pseudonymised export) | Built |
| Phase 5 Trends (privacy safe), credentials and public verification, API keys and read only partner API | Built |
| Phase 5 Localisation | Dutch and English built. More languages need a new dictionary and server overlay. |
| Parent or guardian role | Not built |

Roles: teacher, student, journalist, researcher. Institution roles: institution admin, faculty admin, research admin, teacher, teaching assistant, student, external researcher.

## Languages

English and Dutch. The server answers in the language of the `?lang=nl|en` query (reference data, modules, badges, citations, exports, certificates, reports). The desktop app translates its own text from `edu-nl.js` and the language can be changed in the sidebar. The default follows the browser language. To add a language, add a server overlay like `server/data/eduModulesNl.js` and a dictionary file.

## Tests

`npm run test:edu` in the server folder starts a throwaway Postgres and runs `tests/edu/itest.js` (Release 1) and `tests/edu/itest2.js` (phases 3 to 5). It needs `npm install` once so `embedded-postgres` is present.

## Where things live

- Server: `server/routes/edu.js`, `server/data/eduModules.js`, mounted at `/api/edu` in `server/index.js`.
- Desktop: `src/renderer/edu/` (edu.html, edu.css, edu-*.js), window handling in `src/main/windows.js`, file save in `src/main/ipc.js`.
