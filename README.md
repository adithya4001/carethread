# CareThread release

Live demo: https://adithya4001.github.io/carethread/

Clone this repository, use Node 24+, then run `npm start` or `npm test`. `bootstrap.mjs` safely expands the complete [source package](carethread-source.zip) into `.carethread/` before running. There are no package dependencies to install. The public frontend is also readable directly in app.js, care.js, store.js and style.css. backend.mjs is a readable copy of the server implementation. All source files, model code, tests and documentation are inside the ZIP.

GitHub Pages hosts the browser-local synthetic demonstration. The account backend is included but requires separate hosting. No real clinicians, hospitals, medical AI, bookings or ambulance dispatch are connected.

---

# CareThread

**Your care, connected.** A patient workspace that keeps symptoms, reports, clinician review, follow-up and care arrangements in one continuous thread.

Live synthetic demonstration: https://adithya4001.github.io/carethread/

Source: https://github.com/adithya4001/carethread

## What is actually deployed

The public GitHub Pages site is a **browser-local synthetic demonstration**, not a healthcare service. It uses localStorage for episode metadata and IndexedDB for original attachment files. The demo role selector lets one reviewer experience patient, clinician and clinic-desk workflows on the same browser. It is not authentication or a connection to a real clinician.

The repository also contains a separately runnable Node.js + SQLite backend for real multi-user account/permission workflows. This backend is **not hosted by GitHub Pages**. It must be deployed separately before connected accounts can be used. No real hospitals, clinicians, diagnostic AI or ambulance services are integrated. All provider names, credentials, availability and organisations are fictional fixtures.

Use synthetic information only in the public demo. This project has not been clinically validated.

## The complete demonstration journey

1. Open an episode using a patient-reported concern, start date and symptom description. Keep a persistent patient ID across episodes.
2. Add structured check-ins, original reports and voice/video recordings with a written summary. The app does not pretend to transcribe or interpret recordings.
3. Choose a fictional clinician by care category and confirm consent before sharing the episode.
4. Switch the demo role to Clinician. Review the current revision and original reports, write a specific care plan, and explicitly confirm review before approval.
5. Return to Patient. Request a consultation while review is pending, or request tests/transport after a current plan is approved.
6. Switch to Clinic desk. Acknowledge the request, then record a separate provider confirmation reference. A sent request is never labelled a confirmed booking or ambulance dispatch.
7. Add worsening symptoms or a new report. The old approval becomes historical, and a new review is required.
8. Request recovery review, then archive the episode as the assigned clinician. History and patient ID remain available. Patients can reopen the episode.

No medical advice, diagnosis, prescription or autonomous treatment is generated. Care conversation is guided intake and shared messaging. Real care plans would need an authorised clinician and a properly operated healthcare service.

## Digital twin component

The Digital twin lab retains the original Type 2 diabetes forecasting model. Static EHR and dynamic CGM/wearable data enter a working ridge-regression model. It predicts twelve glucose values at five-minute intervals, with an empirical validation-residual band. Frozen prediction replay compares the forecast to unseen future readings.

The fever workspace is a care-coordination scenario, **not a fever prediction model**. The glucose lab has its own fictional patients and does not interpret the patient's fever inputs.

Synthetic benchmark, 30 held-out patients and 8,160 overlapping windows:

| Metric | Result |
| --- | --- |
| Overall model MAE | 7.529 mg/dL |
| Persistence baseline MAE | 9.442 mg/dL |
| Sensor-only ablation MAE | 7.795 mg/dL |
| 60-minute model MAE | 12.267 mg/dL |
| Pointwise empirical band coverage | 80.38% |
| Spike-warning precision / recall | 80.82% / 17.15% |
| True warnings / false warnings / missed windows | 59 / 14 / 285 |

The model misses many future spikes, especially before unknown meals begin. These results describe a custom simulator, not clinical accuracy. Demo cases are selected from the test cohort to illustrate different patterns. No future readings enter model inference. Exact results are in `dist/lab/metrics.json`.

## Run the connected backend locally

Requirements: Node.js 24 or newer. No npm package installation or API key is needed.

```text
npm start
```

Open http://localhost:4175. The server binds to 127.0.0.1 by default. Create a patient account with a 12–128 character password. Staff accounts require an operator-issued invitation.

Default database: `data/carethread.sqlite`. This directory is ignored by Git. Passwords are salted and scrypt-hashed; sessions use random tokens stored as hashes and HttpOnly, SameSite=Strict cookies. HTTPS cookies are Secure when APP_ORIGIN is HTTPS. API writes require a matching Origin and JSON content type.

The client detects the same-origin backend. If it is available, it offers real account sign-in. If no backend exists, it visibly opens the synthetic local demonstration. A connected signed-out user can deliberately choose the demo.

## Staff provisioning

Set `STAFF_INVITES` as a server-side JSON object using unique, private invitation strings as keys. Values identify an approved role and its directory mapping. Example structure, **not a usable production secret**:

```json
{
  "REPLACE_WITH_PRIVATE_DOCTOR_INVITE": {"role":"doctor","providerId":"general"},
  "REPLACE_WITH_PRIVATE_CLINIC_INVITE": {"role":"clinic","clinicId":"willow"}
}
```

Supported fixture clinician IDs: general, endo, cardio. Clinic IDs: willow, northstar. Keep invitations out of public source and browser code. Registration without an invitation always creates a patient role. Before an actual pilot, replace the fictional directory and verify clinician identity/credentials through an operator process. This code does not perform that verification.

## Permissions and data boundaries

- Patients access only their own episodes and attachments.
- Clinicians access only consented episodes assigned to their directory ID.
- Clinic accounts receive logistics details, not clinical reports, symptoms or full messages.
- Withdrawing consent removes clinician/clinic access and cancels pending coordination requests.
- Approval is tied to a recorded revision. New reports or worsening/new symptoms require reassessment.
- Attachments are limited to 5 MB each, 12 per episode and 30 MB per backend account. Supported PDF, JPEG, PNG, plain text, and specified audio/video formats only.
- The backend records action types and file accesses in an audit table without copying report content into audit messages.

This is a research backend, not a production clinical system. Email verification, password reset, multi-factor authentication, invitation expiry/revocation, malware scanning, encrypted backups, account deletion/export administration and disaster recovery are not implemented. These and clinical/regulatory reviews are needed before processing genuine health data. SQLite itself is not encrypted by this application.

## Tests and reproducibility

```text
npm test
npm run build
```

Tests cover consent, actor permissions, stale approvals, worsening updates, provider-confirmation transitions, recovery history, cross-account isolation, report access, origin validation, staff invitations, logout, Python/JavaScript forecast parity and no future leakage. The HTTP integration test uses an in-memory SQLite database and loopback only.

For the forecasting benchmark:

```text
python -m pip install -r model/requirements.txt
python model/train.py
npm run build
```

Original synthetic generator seed: 20261018. Patient-disjoint split: 80 train, 20 validation, 30 test. Training-only standardization. Validation residuals define pointwise empirical 10th/90th-percentile bands. Overlapping windows are not independent clinical events.

## Deployment

GitHub Pages publishes the committed `docs/` folder on main. `npm run build` copies the static `dist/` tree to that folder. The Pages site has no server, secrets or shared database.

A backend deployment requires a Node 24 service with persistent disk. `render.yaml` is a deployment blueprint for a paid persistent-disk service; **it has not been provisioned, purchased or deployed**. You may use another suitable Node host. Set APP_ORIGIN to the exact HTTPS origin, DB_PATH to persistent storage, HOST to 0.0.0.0 on the hosted service, and configure private STAFF_INVITES. Do not use ephemeral storage for persistent accounts. Serve the UI and API from the same origin. No hosting credentials are included.

## Submission material

- Current architecture and operational limits: `project/ARCHITECTURE.md`.
- Demonstration walkthrough: `project/DEMO.md`.
- Remaining owner details and submission checks: `project/SUBMISSION.md`.
- Original glucose-lab architecture and presentation PDFs: `dist/lab/docs/`.
- MIT license: `LICENSE`.

Team name, college/incubator, member eligibility and final video URL have not been supplied. They must be added before submitting. The public repository and live demo do not by themselves constitute a hackathon submission. A real minimum 20-minute demonstration video still needs to be recorded and linked. No Unstop entry has been submitted.

Event: https://unstop.com/hackathons/digital-twin-challenge-2026-happiest-health-1757873

CGM range reference: https://www.niddk.nih.gov/health-information/professionals/diabetes-discoveries-practice/clinical-targets-for-continuous-glucose-monitoring-data
