import { isAuthorizedUser, signIn, signOutUser, watchAuth, watchTlx, writeTlx } from './firebase-sync.js?v=20261006-0001';

(() => {
  'use strict';
  const STORAGE_KEY = 'tlx-maintenance-v2';
  const today = new Date();
  const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const fmtKm = value => new Intl.NumberFormat('en-CA').format(Math.round(value));
  const fmtMoney = value => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
  const fmtDate = (value, options = { year: 'numeric', month: 'short', day: 'numeric' }) =>
    new Intl.DateTimeFormat('en-CA', options).format(new Date(`${value}T12:00:00`));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const monthDiff = (from, to) => {
    const a = new Date(`${from}T12:00:00`);
    const b = new Date(`${to}T12:00:00`);
    return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  };
  const byDateDesc = (a, b) => b.date.localeCompare(a.date);

  const seed = {
    vehicle: { year: 2020, make: 'Acura', model: 'TLX A-Spec', drivetrain: 'FWD', engine: '2.4 L four-cylinder', inServiceDate: '2020-01-01' },
    odometer: { km: 85000, date: '2026-10-06' },
    records: [
      { id: 'tlx-2026-10-filters', date: '2026-10-01', km: 85000, items: ['Cabin air filter', 'Engine air filter'], shop: '', cost: null, notes: 'Completed in October 2026. Date and odometer are approximate pending the final reading.' },
      { id: 'tlx-2025-10-cabin', date: '2025-10-01', km: null, items: ['Cabin air filter'], shop: '', cost: null, notes: 'Month recorded in source workbook; exact day and odometer were not provided.' },
      { id: 'tlx-2025-06-brakes', date: '2025-06-01', km: 65505, items: ['Brake service', 'Brake fluid'], shop: '', cost: null, notes: 'Month recorded in source workbook; exact day was not provided.' },
      { id: 'tlx-2024-10-service', date: '2024-10-01', km: null, items: ['Cabin air filter', 'Engine air filter', 'Brake service'], shop: '', cost: null, notes: 'Month recorded in source workbook; exact day and odometer were not provided.' },
      { id: 'tlx-2023-12-brakes', date: '2023-12-01', km: null, items: ['Brake service'], shop: '', cost: null, notes: 'Month recorded in source workbook; exact day and odometer were not provided.' },
      { id: 'tlx-2023-11-filters', date: '2023-11-01', km: 40000, items: ['Cabin air filter', 'Engine air filter'], shop: '', cost: null, notes: 'Month recorded in source workbook; exact day was not provided.' }
    ],
    planned: [],
    activityNotes: {
      beltreplace: 'Estimated cost from workbook: $300.',
      pcv: 'Estimated cost from workbook: $256.87.'
    },
    ignoredTaskIds: [],
    schedules: [
      { id: 'oil', name: 'Engine oil & filter', category: 'Routine', km: 8000, months: 12, firstKm: 8000, firstMonths: 12, match: ['Engine oil & filter', 'Oil change'], basis: 'Workbook schedule', toyota: 'Every 8,000 km or 12 months' },
      { id: 'tires', name: 'Tire rotation & inspection', category: 'Chassis', km: 8000, months: null, firstKm: 8000, match: ['Tire rotation', 'Tire inspection', 'New tires installed'], basis: 'Workbook schedule', toyota: 'Rotate every 8,000 km; replace below 2/32 in tread' },
      { id: 'alignment', name: 'Alignment check', category: 'Chassis', km: null, months: 12, firstMonths: 12, match: ['Alignment check', 'Wheel alignment'], basis: 'Workbook schedule', toyota: 'Annually or if uneven tire wear occurs' },
      { id: 'suspension', name: 'Suspension & steering check', category: 'Chassis', km: 48000, months: null, firstKm: 48000, match: ['Suspension & steering check', 'Suspension & steering inspection'], basis: 'Workbook schedule', toyota: 'Inspect every 48,000 km' },
      { id: 'shocks', name: 'Shocks & struts', category: 'Chassis', km: 48000, months: null, firstKm: 48000, match: ['Shocks & struts', 'Shocks and struts'], basis: 'Workbook schedule', toyota: 'Inspect every 48,000 km; replace as needed' },
      { id: 'cabin', name: 'Cabin air filter', category: 'Filters', km: 24000, months: 24, firstKm: 24000, firstMonths: 24, match: ['Cabin air filter', 'Cabin Filter'], basis: 'Workbook schedule', toyota: 'Every 24,000 km or 2 years' },
      { id: 'air', name: 'Engine air filter', category: 'Filters', km: 32000, months: 24, firstKm: 32000, firstMonths: 24, match: ['Engine air filter', 'Engine Filter'], basis: 'Workbook schedule', toyota: 'Every 32,000 km or 2 years' },
      { id: 'brakefluid', name: 'Brake fluid', category: 'Brakes', km: null, months: 36, firstMonths: 36, match: ['Brake fluid'], basis: 'Workbook and Acura guide', toyota: 'Every 3 years, regardless of mileage' },
      { id: 'brakeinspect', name: 'Brake system inspection', category: 'Brakes', km: 8000, months: null, firstKm: 8000, match: ['Brake service', 'Brake system inspection'], basis: 'Workbook schedule', toyota: 'Every 8,000 km' },
      { id: 'brakewear', name: 'Brake pads & rotors', category: 'Brakes', km: 8000, months: null, firstKm: 8000, match: ['Brake service', 'Brake pads', 'Brake rotors', 'Brake pads & rotors'], basis: 'Workbook schedule', toyota: 'Inspect every 8,000 km; replace as needed' },
      { id: 'battery', name: 'Battery', category: 'Electrical', km: null, months: 60, firstMonths: 60, match: ['Battery replaced', 'Battery test', 'Battery'], basis: 'Workbook schedule', toyota: 'Check every service; replace every 4–6 years' },
      { id: 'belt', name: 'Drive belt (serpentine belt)', category: 'Engine', km: 96000, months: null, firstKm: 96000, match: ['Drive belt inspection', 'Drive belt (serpentine belt)', 'Serpentine belt'], basis: 'Workbook schedule', toyota: 'Inspect every 96,000 km; replace if worn' },
      { id: 'beltreplace', name: 'Serpentine belt replacement', category: 'Engine', km: 120000, months: 84, firstKm: 120000, firstMonths: 84, match: ['Serpentine belt replacement', 'Replace serpentine belt'], basis: 'Owner workbook', toyota: 'Every 7–10 years or 120,000–200,000 km' },
      { id: 'coolant', name: 'Engine coolant', category: 'Engine', km: 80000, months: 60, firstKm: 160000, firstMonths: 120, match: ['Engine coolant'], basis: 'Workbook schedule', toyota: 'First at 160,000 km or 10 years; then every 80,000 km or 5 years' },
      { id: 'plugs', name: 'Spark plugs', category: 'Engine', km: 160000, months: null, firstKm: 160000, match: ['Spark plugs'], basis: 'Workbook schedule', toyota: 'Every 160,000 km' },
      { id: 'pcv', name: 'PCV valve', category: 'Engine', km: null, months: null, conditionOnly: true, match: ['PCV valve', 'PCV valve replacement', 'Replace PCV valve'], basis: 'Owner workbook', toyota: 'Inspect during routine service; replace if faulty' },
      { id: 'exhaust', name: 'Exhaust system check', category: 'Engine', km: 48000, months: null, firstKm: 48000, match: ['Exhaust system check', 'Exhaust inspection'], basis: 'Workbook schedule', toyota: 'Every 48,000 km' },
      { id: 'atf', name: 'Automatic transmission fluid', category: 'Transmission', km: 96000, months: null, firstKm: 96000, match: ['Automatic transmission fluid', 'Transmission fluid'], basis: 'Workbook schedule', toyota: 'Inspect every 96,000 km; service every 48,000 km under severe conditions' },
      { id: 'washer', name: 'Windshield washer fluid', category: 'Routine', km: null, months: 1, firstMonths: 1, match: ['Windshield washer fluid'], basis: 'Workbook schedule', toyota: 'Check monthly and refill as needed' }
    ]
  };

  function reconcilePlanned(records, planned) {
    return planned.map(plan => {
      const cutoff = new Date(`${plan.date}T12:00:00`);
      cutoff.setDate(cutoff.getDate() - 45);
      const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
      const remainingItems = plan.items.filter(plannedItem => {
        const schedule = seed.schedules.find(item => item.match.includes(plannedItem));
        if (!schedule) return true;
        return !records.some(record => record.date >= cutoffIso && record.items.some(item => schedule.match.includes(item)));
      });
      return { ...plan, items: remainingItems };
    }).filter(plan => plan.items.length);
  }

  function normalize(incoming) {
    const records = Array.isArray(incoming?.records) ? incoming.records : [];
    return {
      ...clone(seed),
      ...incoming,
      odometer: incoming?.odometer || clone(seed.odometer),
      records,
      schedules: clone(seed.schedules),
      planned: reconcilePlanned(records, incoming?.planned || []),
      activityNotes: incoming?.activityNotes || {},
      ignoredTaskIds: incoming?.ignoredTaskIds || []
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : normalize(seed);
    } catch { return clone(seed); }
  }
  let state = load();
  let currentUser = null;
  let cloudReady = false;
  let cloudWriteTimer = null;
  let stopGarageWatch = null;

  const cloudState = () => ({
    vehicle: state.vehicle,
    odometer: state.odometer,
    records: state.records,
    planned: state.planned,
    activityNotes: state.activityNotes,
    ignoredTaskIds: state.ignoredTaskIds
  });

  const saveLocal = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const setSyncStatus = (label, kind = 'working') => {
    const status = document.querySelector('#syncStatus');
    if (!status) return;
    status.textContent = label;
    status.dataset.kind = kind;
  };
  const save = () => {
    saveLocal();
    if (!currentUser || !cloudReady) return;
    setSyncStatus('Saving…');
    clearTimeout(cloudWriteTimer);
    cloudWriteTimer = setTimeout(async () => {
      try {
        await writeTlx(cloudState());
        setSyncStatus('Saved online', 'saved');
      } catch (error) {
        console.error(error);
        setSyncStatus('Could not sync', 'error');
        toast('Could not save online. Check your connection and Firestore rules.');
      }
    }, 350);
  };
  saveLocal();

  document.body.innerHTML = `
    <section class="auth-gate" id="authGate">
      <form class="auth-card" id="loginForm">
        <div class="auth-mark" aria-hidden="true">CG</div>
        <div class="eyebrow">The Chiang Garage</div>
        <h1>Sign in to your garage</h1>
        <p>Your maintenance history is encrypted in transit and synchronized through Firebase.</p>
        <div class="field"><label for="loginEmail">Email</label><input id="loginEmail" type="email" autocomplete="username" required></div>
        <div class="field"><label for="loginPassword">Password</label><input id="loginPassword" type="password" autocomplete="current-password" required></div>
        <div class="auth-error" id="loginError" role="alert"></div>
        <button class="btn primary auth-submit" type="submit">Sign in</button>
      </form>
    </section>
    <main class="shell" id="appShell" hidden>
      <header class="topbar">
        <div class="identity"><div class="mark" aria-hidden="true"><svg viewBox="0 0 64 40" fill="none"><path d="M9 27h46l-5-15H20L9 27Z" fill="#F3A447"/><path d="M19 12 27 3h18l5 9" stroke="#F5F2EA" stroke-width="4" stroke-linejoin="round"/><circle cx="20" cy="29" r="7" fill="#172232" stroke="#F5F2EA" stroke-width="4"/><circle cx="46" cy="29" r="7" fill="#172232" stroke="#F5F2EA" stroke-width="4"/></svg></div><div><div class="eyebrow">Personal service record</div><h1>2020 Acura TLX A-Spec</h1></div></div>
        <div class="topbar-meta"><span class="sync-status" id="syncStatus">Connecting…</span><span class="account-email" id="accountEmail"></span><button class="signout-btn" id="signOut" type="button">Sign out</button><a class="back-link" href="index.html">All vehicles</a><div class="date" id="today"></div></div>
      </header>
      <section id="overview">
        <div class="grid"><section class="stack"><article class="card odometer"><img class="vehicle-image" src="assets/white-2020-acura-tlx-aspec.png" alt="White 2020 Acura TLX A-Spec"><div class="odo-head"><div><div class="odo-label">Current odometer</div><div class="odo-reading"><strong id="odometerValue"></strong><span>km</span></div><div class="odo-note">FWD · 2.4 L four-cylinder · updated <span id="odometerDate"></span></div></div><button class="edit-odo" id="editOdometer">Update reading</button></div><div class="meters"><div class="meter"><b id="attentionCount"></b><span>need attention</span></div><div class="meter"><b id="nextDistance"></b><span>km to next item</span></div><div class="meter"><b id="recordCount"></b><span>service events</span></div></div></article>
        <article class="card section"><div class="section-head"><div><h2>What’s next</h2><p>Based on your mileage, dates and saved service records.</p></div><a class="link-btn" href="#maintenance-history">Complete history</a></div><div class="task-list" id="taskList"></div><div class="ignored-controls" id="ignoredControls"></div><div class="source-note"><b>Schedule basis:</b> your workbook and Acura’s Maintenance Minder guidance. The earliest time or distance limit wins.</div></article></section>
        <aside class="card history"><div class="section-head"><div><h2>Recent history</h2><p>Latest completed work from your records.</p></div><a class="link-btn" href="#maintenance-history">Full table</a></div><div class="timeline" id="timeline"></div></aside></div>
      </section>
      <section class="page-section" id="maintenance-history"><div class="toolbar"><div class="page-title"><h2>Complete maintenance history</h2><p>Grouped by vehicle system, with Acura guidance and the two latest matching service actions.</p></div><button class="primary-action" id="addRecord">Log service</button></div><div class="activity-history" id="activityHistory"></div></section>
      <section class="page-section support-strip"><div><h2>Data & sources</h2><p>Your updates are saved online and synchronized across signed-in devices.</p></div><div class="data-actions"><button class="btn primary" id="exportData">Export backup</button><label class="btn" for="importData">Import backup</label><input class="file-input" id="importData" type="file" accept="application/json,.json"><button class="btn danger" id="resetData">Reset maintenance data</button></div><div class="source-links compact"><a class="source-link" href="https://www.acura.ca/en/service-parts/maintenance-schedules" target="_blank" rel="noreferrer">Acura Canada maintenance schedules</a><a class="source-link" href="https://owners.acura.com/utility/download?path=/static/pdfs/2020/TLX/2020_TLX_Maintenance_Minder.pdf" target="_blank" rel="noreferrer">2020 TLX Maintenance Minder guide</a></div></section>
    </main>
    <dialog id="odometerDialog"><form method="dialog" class="modal" id="odometerForm"><h2>Update odometer</h2><p>This reading drives the distance-based reminders.</p><div class="field"><label for="odometerInput">Odometer (km)</label><input id="odometerInput" type="number" min="0" step="1" required inputmode="numeric"></div><div class="field"><label for="odometerDateInput">Reading date</label><input id="odometerDateInput" type="date" required></div><div class="modal-actions"><button class="btn" type="button" id="cancelOdometer">Cancel</button><button class="btn primary" value="save">Save reading</button></div></form></dialog>
    <dialog id="recordDialog"><form method="dialog" class="modal" id="recordForm"><h2 id="recordDialogTitle">Log service</h2><p>Save the date and odometer reading for completed maintenance.</p><div class="form-grid"><div class="field"><label for="recordDate">Service date</label><input id="recordDate" type="date" required></div><div class="field"><label for="recordKm">Odometer (km)</label><input id="recordKm" type="number" min="0" step="1" inputmode="numeric" required></div><div class="field wide"><label>Work completed</label><div class="checks" id="itemChecks"></div></div><div class="field wide"><label for="customItem">Other item</label><input id="customItem" type="text" placeholder="e.g. Wiper blades"></div><div class="field"><label for="recordShop">Shop</label><input id="recordShop" type="text" placeholder="Optional"></div><div class="field"><label for="recordCost">Cost (CAD)</label><input id="recordCost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Optional"></div><div class="field wide"><label for="recordNotes">Notes</label><textarea id="recordNotes" placeholder="Parts used, observations, follow-up…"></textarea></div></div><div class="modal-actions"><button class="btn" type="button" id="cancelRecord">Cancel</button><button class="btn primary" value="save">Save service</button></div></form></dialog>
    <dialog id="confirmDialog"><form method="dialog" class="modal"><h2 id="confirmTitle"></h2><p id="confirmText"></p><div class="modal-actions"><button class="btn" value="cancel">Cancel</button><button class="btn danger" value="confirm">Confirm</button></div></form></dialog>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  const loginForm = document.querySelector('#loginForm');
  const loginError = document.querySelector('#loginError');
  const authGate = document.querySelector('#authGate');
  const appShell = document.querySelector('#appShell');

  function friendlyAuthError(error) {
    const code = error?.code || '';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'That email or password is not correct.';
    if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
    if (code.includes('network-request-failed')) return 'Firebase could not be reached. Check your internet connection.';
    return 'Sign-in could not be completed. Check the account and try again.';
  }

  async function startCloudSync() {
    setSyncStatus('Loading online data…');
    stopGarageWatch?.();
    stopGarageWatch = watchTlx(
      async data => {
        const onlineState = normalize(data);
        if (!onlineState.records.length && state.records.length) {
          cloudReady = true;
          setSyncStatus('Moving saved history online…');
          try {
            await writeTlx(cloudState());
            setSyncStatus('Saved online', 'saved');
          } catch (error) {
            console.error(error);
            setSyncStatus('Could not sync', 'error');
          }
          return;
        }
        state = onlineState;
        cloudReady = true;
        saveLocal();
        render();
        setSyncStatus('Saved online', 'saved');
      },
      async () => {
        try {
          setSyncStatus(state.records.length ? 'Moving saved history online…' : 'Creating online garage…');
          await writeTlx(cloudState());
          cloudReady = true;
          setSyncStatus('Saved online', 'saved');
        } catch (error) {
          console.error(error);
          setSyncStatus('Setup required', 'error');
          toast('Firestore could not be created. Check the database and security rules.');
        }
      },
      error => {
        console.error(error);
        setSyncStatus('Could not sync', 'error');
        toast('Firestore access was denied. Check the security rules.');
      }
    );
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    loginError.textContent = '';
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      await signIn(document.querySelector('#loginEmail').value.trim(), document.querySelector('#loginPassword').value);
      document.querySelector('#loginPassword').value = '';
    } catch (error) {
      loginError.textContent = friendlyAuthError(error);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });

  document.querySelector('#signOut').addEventListener('click', () => signOutUser());

  const handleAuthChange = async user => {
    if (!user) {
      currentUser = null;
      cloudReady = false;
      stopGarageWatch?.();
      stopGarageWatch = null;
      authGate.hidden = false;
      appShell.hidden = true;
      return;
    }
    if (!isAuthorizedUser(user)) {
      loginError.textContent = 'This account does not have access to The Chiang Garage.';
      await signOutUser();
      return;
    }
    currentUser = user;
    authGate.hidden = true;
    appShell.hidden = false;
    document.querySelector('#accountEmail').textContent = user.email || '';
    render();
    startCloudSync();
  };

  const localQaMode = new URLSearchParams(location.search).get('qa') === '1'
    && ['127.0.0.1', 'localhost'].includes(location.hostname);
  if (localQaMode) {
    setTimeout(() => {
      authGate.hidden = true;
      appShell.hidden = false;
      document.querySelector('#accountEmail').textContent = 'Local responsive preview';
      setSyncStatus('Preview mode', 'saved');
      render();
    }, 0);
  } else {
    watchAuth(handleAuthChange);
  }

  const historyFor = schedule => [...state.records].filter(record => record.items.some(item => schedule.match.includes(item))).sort(byDateDesc);
  const latestFor = schedule => historyFor(schedule)[0] || null;
  const plannedFor = schedule => [...state.planned].filter(record => record.date >= isoToday && record.items.some(item => schedule.match.includes(item))).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const scheduleGroups = [
    { name: 'Brakes', note: 'Friction components, inspections and hydraulic fluid', ids: ['brakefluid', 'brakeinspect', 'brakewear'] },
    { name: 'Electrical', note: 'Starting and charging system', ids: ['battery'] },
    { name: 'Engine, ignition & cooling', note: 'Engine reliability, emissions and temperature control', ids: ['belt', 'beltreplace', 'coolant', 'exhaust', 'pcv', 'plugs'] },
    { name: 'Filters & cabin air', note: 'Airflow for the engine and cabin', ids: ['cabin', 'air'] },
    { name: 'Routine service', note: 'Regular fluid checks and lubrication', ids: ['oil', 'washer'] },
    { name: 'Tires, suspension & steering', note: 'Road contact, alignment and chassis', ids: ['alignment', 'shocks', 'suspension', 'tires'] },
    { name: 'Transmission', note: 'Eight-speed dual-clutch transmission', ids: ['atf'] }
  ];
  function statusFor(schedule) {
    const last = latestFor(schedule);
    const planned = plannedFor(schedule);
    if (planned) return { kind: 'planned', label: `Planned ${fmtDate(planned.date, { month: 'short', year: 'numeric' })}`, detail: 'Already listed in your workbook', last };
    if (schedule.conditionOnly) return { kind: 'ok', label: 'Condition based', detail: 'Inspect during routine service', last };
    const kmLeft = last
      ? (schedule.km && last.km != null ? last.km + schedule.km - state.odometer.km : null)
      : ((schedule.firstKm ?? schedule.km) ? (schedule.firstKm ?? schedule.km) - state.odometer.km : null);
    const baselineDate = state.vehicle.inServiceDate || `${state.vehicle.year}-01-01`;
    const monthsLeft = last
      ? (schedule.months ? schedule.months - monthDiff(last.date, isoToday) : null)
      : ((schedule.firstMonths ?? schedule.months) ? (schedule.firstMonths ?? schedule.months) - monthDiff(baselineDate, isoToday) : null);
    if (!last && kmLeft == null && monthsLeft == null) return { kind: 'overdue', label: 'No record', detail: 'Add the last service date and odometer', last: null };
    if ((kmLeft != null && kmLeft <= 0) || (monthsLeft != null && monthsLeft <= 0)) {
      const reasons = [];
      if (kmLeft != null && kmLeft <= 0) reasons.push(`${fmtKm(Math.abs(kmLeft))} km past`);
      if (monthsLeft != null && monthsLeft <= 0) reasons.push(`${Math.abs(monthsLeft)} mo past`);
      return { kind: 'overdue', label: 'Due now', detail: reasons.join(' · '), last };
    }
    const soon = (kmLeft != null && kmLeft <= 3000) || (monthsLeft != null && monthsLeft <= 2);
    const left = [];
    if (kmLeft != null) left.push(`${fmtKm(kmLeft)} km`);
    if (monthsLeft != null) left.push(`${monthsLeft} mo`);
    return { kind: soon ? 'soon' : 'ok', label: soon ? 'Coming up' : 'On track', detail: `in ${left.join(' or ')}`, last };
  }
  const ranked = () => state.schedules.map(schedule => ({ ...schedule, status: statusFor(schedule) })).sort((a, b) => ({ overdue: 0, soon: 1, planned: 2, ok: 3 }[a.status.kind] - ({ overdue: 0, soon: 1, planned: 2, ok: 3 }[b.status.kind]) || a.name.localeCompare(b.name)));
  function intervalText(schedule) {
    const parts = [];
    if (schedule.km) parts.push(`Every ${fmtKm(schedule.km)} km`);
    if (schedule.months) {
      const time = schedule.months < 12 ? `${schedule.months} months` : schedule.months === 12 ? 'year' : schedule.months % 12 === 0 ? `${schedule.months / 12} years` : `${schedule.months} months`;
      parts.push(`every ${time}`);
    }
    return parts.join(' or ');
  }
  function addMonths(date, months) {
    const value = new Date(`${date}T12:00:00`);
    value.setMonth(value.getMonth() + months);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  function nextTarget(schedule) {
    const last = latestFor(schedule);
    const planned = plannedFor(schedule);
    if (planned) return { main: fmtDate(planned.date), sub: 'Planned in your workbook' };
    const dueDate = last
      ? (schedule.months ? addMonths(last.date, schedule.months) : null)
      : ((schedule.firstMonths ?? schedule.months) ? addMonths(state.vehicle.inServiceDate || `${state.vehicle.year}-01-01`, schedule.firstMonths ?? schedule.months) : null);
    const dueKm = last
      ? (schedule.km && last.km != null ? last.km + schedule.km : null)
      : (schedule.firstKm ?? schedule.km ?? null);
    if (dueDate) return { main: fmtDate(dueDate), sub: dueKm != null ? `or ${fmtKm(dueKm)} km` : 'Time based' };
    if (dueKm != null) return { main: `${fmtKm(dueKm)} km`, sub: 'Mileage based' };
    return { main: 'Inspection based', sub: 'No fixed next date' };
  }
  function approximateNextText(schedule) {
    const last = latestFor(schedule);
    const planned = plannedFor(schedule);
    if (planned) return `Next approx.: ${fmtDate(planned.date)}`;
    const dueDate = last
      ? (schedule.months ? addMonths(last.date, schedule.months) : null)
      : ((schedule.firstMonths ?? schedule.months) ? addMonths(state.vehicle.inServiceDate || `${state.vehicle.year}-01-01`, schedule.firstMonths ?? schedule.months) : null);
    const dueKm = last
      ? (schedule.km && last.km != null ? last.km + schedule.km : null)
      : (schedule.firstKm ?? schedule.km ?? null);
    if (dueDate) return `Next approx.: ${fmtDate(dueDate)}${dueKm != null ? ` · or ${fmtKm(dueKm)} km` : ''}`;
    if (dueKm != null) {
      const estimatedMonths = Math.max(0, Math.round(((dueKm - state.odometer.km) / 16000) * 12));
      return `Next approx.: ${fmtDate(addMonths(isoToday, estimatedMonths))} · around ${fmtKm(dueKm)} km`;
    }
    return 'Next approx.: based on inspection condition';
  }
  function toast(message) {
    const element = document.querySelector('#toast');
    element.textContent = message; element.classList.add('show'); clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove('show'), 2400);
  }
  function serviceCell(record, schedule) {
    if (!record) return '<span class="no-record">No matching record</span>';
    const actions = record.items.filter(item => schedule.match.includes(item));
    const details = [];
    details.push(record.km != null ? `${fmtKm(record.km)} km` : 'Odometer not recorded');
    if (record.shop) details.push(record.shop);
    if (record.cost != null) details.push(fmtMoney(record.cost));
    return `<b>${esc(actions.join(', ') || schedule.name)}</b><small>${fmtDate(record.date)} · ${esc(details.join(' · '))}</small>`;
  }
  function render() {
    document.querySelector('#today').textContent = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(today);
    document.querySelector('#odometerValue').textContent = fmtKm(state.odometer.km);
    document.querySelector('#odometerDate').textContent = state.odometer.date === isoToday ? 'today' : fmtDate(state.odometer.date);
    const schedule = ranked();
    const visibleSchedule = schedule.filter(item => !state.ignoredTaskIds.includes(item.id));
    const attention = visibleSchedule.filter(item => ['overdue', 'soon'].includes(item.status.kind));
    const positive = visibleSchedule.map(item => item.km && item.status.last?.km != null ? item.status.last.km + item.km - state.odometer.km : null).filter(value => value > 0);
    document.querySelector('#attentionCount').textContent = attention.length;
    document.querySelector('#nextDistance').textContent = positive.length ? fmtKm(Math.min(...positive)) : '—';
    document.querySelector('#recordCount').textContent = state.records.length;
    document.querySelector('#taskList').innerHTML = visibleSchedule.length
      ? visibleSchedule.slice(0, 6).map(item => `<div class="task ${item.status.kind}"><span class="task-bar"></span><div><div class="task-title">${esc(item.name)}</div><div class="task-detail">${esc(item.status.detail)}</div></div><span class="badge">${esc(item.status.label)}</span><div class="task-actions"><button class="update-task" type="button" data-complete="${esc(item.id)}" aria-label="Update ${esc(item.name)}">Update</button><button class="ignore-task" type="button" data-ignore="${esc(item.id)}" aria-label="Ignore ${esc(item.name)}">Ignore</button></div></div>`).join('')
      : '<div class="empty">No upcoming items are showing. You can restore ignored activities below.</div>';
    document.querySelector('#ignoredControls').innerHTML = state.ignoredTaskIds.length
      ? `<span>${state.ignoredTaskIds.length} ignored ${state.ignoredTaskIds.length === 1 ? 'activity' : 'activities'}</span><button type="button" data-restore-ignored>Restore ignored</button>`
      : '';
    const recent = [...state.records].filter(record => record.date <= isoToday).sort(byDateDesc).slice(0, 7);
    document.querySelector('#timeline').innerHTML = recent.map(record => `<article class="event"><div class="event-date">${fmtDate(record.date)}${record.km ? ` · ${fmtKm(record.km)} km` : ''}</div><h3>${record.items.length === 1 ? esc(record.items[0]) : `${record.items.length} services completed`}</h3>${record.notes ? `<p>${esc(record.notes)}</p>` : ''}<div class="event-items">${record.items.map(item => `<span class="chip">${esc(item)}</span>`).join('')}</div></article>`).join('');
    document.querySelector('#activityHistory').innerHTML = scheduleGroups.map(group => {
      const items = group.ids.map(id => schedule.find(item => item.id === id)).filter(Boolean);
      const rows = items.map(item => {
        const history = historyFor(item);
        const last = history[0] || null;
        const previous = history[1] || null;
        return `<div class="activity-row ${item.status.kind}"><div class="activity-name" data-label="Maintenance activity">${esc(item.name)}<span class="badge">${esc(item.status.label)}</span></div><div class="activity-cell" data-label="Suggested interval"><b>${esc(item.toyota)}</b><small>${esc(approximateNextText(item))}</small></div><div class="activity-cell" data-label="Latest action">${serviceCell(last, item)}</div><div class="activity-cell" data-label="Previous action">${serviceCell(previous, item)}</div><div class="activity-cell note-cell" data-label="Notes"><textarea class="activity-note" data-note-id="${esc(item.id)}" aria-label="Notes for ${esc(item.name)}" placeholder="Add context…">${esc(state.activityNotes[item.id] || '')}</textarea></div><button class="complete-btn" data-complete="${esc(item.id)}">Log activity</button></div>`;
      }).join('');
      return `<section class="card activity-group"><header class="activity-group-head"><h3>${esc(group.name)}</h3><span>${esc(group.note)}</span></header><div class="activity-table"><div class="activity-row activity-row-head"><div>Maintenance activity</div><div>Suggested interval</div><div>Latest action</div><div>Previous action</div><div>Notes</div><div></div></div>${rows}</div></section>`;
    }).join('');
  }

  const odometerDialog = document.querySelector('#odometerDialog');
  document.querySelector('#editOdometer').addEventListener('click', () => { document.querySelector('#odometerInput').value = state.odometer.km; document.querySelector('#odometerDateInput').value = state.odometer.date || isoToday; odometerDialog.showModal(); });
  document.querySelector('#cancelOdometer').addEventListener('click', () => odometerDialog.close());
  document.querySelector('#odometerForm').addEventListener('submit', event => { event.preventDefault(); state.odometer = { km: Number(document.querySelector('#odometerInput').value), date: document.querySelector('#odometerDateInput').value }; save(); odometerDialog.close(); render(); toast('Odometer updated'); });

  const recordDialog = document.querySelector('#recordDialog');
  let editingId = null;
  function openRecord(preselect, existing) {
    editingId = existing?.id || null;
    document.querySelector('#recordDialogTitle').textContent = existing ? 'Update service record' : preselect ? `Update ${preselect}` : 'Log service';
    const names = [...new Set(state.schedules.map(item => item.match[0]))];
    document.querySelector('#itemChecks').innerHTML = names.map(name => `<label class="check"><input type="checkbox" name="serviceItem" value="${esc(name)}" ${(existing?.items.includes(name) || preselect === name) ? 'checked' : ''}><span>${esc(name)}</span></label>`).join('');
    document.querySelector('#recordDate').value = existing?.date || isoToday;
    document.querySelector('#recordKm').value = existing?.km ?? state.odometer.km;
    document.querySelector('#customItem').value = existing ? existing.items.filter(item => !names.includes(item)).join(', ') : '';
    document.querySelector('#recordShop').value = existing?.shop || '';
    document.querySelector('#recordCost').value = existing?.cost ?? '';
    document.querySelector('#recordNotes').value = existing?.notes || '';
    recordDialog.showModal();
    recordDialog.scrollTop = 0;
  }
  document.querySelector('#addRecord').addEventListener('click', () => openRecord());
  document.querySelector('#cancelRecord').addEventListener('click', () => recordDialog.close());
  document.querySelector('#recordForm').addEventListener('submit', event => {
    event.preventDefault();
    const items = [...document.querySelectorAll('input[name="serviceItem"]:checked')].map(input => input.value);
    const custom = document.querySelector('#customItem').value.split(',').map(value => value.trim()).filter(Boolean);
    items.push(...custom);
    if (!items.length) { toast('Choose or enter at least one service item'); return; }
    const cost = document.querySelector('#recordCost').value;
    const record = { id: editingId || `r${Date.now()}`, date: document.querySelector('#recordDate').value, km: Number(document.querySelector('#recordKm').value), items, shop: document.querySelector('#recordShop').value.trim(), cost: cost === '' ? null : Number(cost), notes: document.querySelector('#recordNotes').value.trim() };
    if (editingId) state.records = state.records.map(item => item.id === editingId ? record : item); else state.records.push(record);
    state.planned = reconcilePlanned(state.records, state.planned);
    save(); recordDialog.close(); render(); toast(editingId ? 'Service record updated' : 'Service added to history');
  });

  document.addEventListener('click', event => {
    const ignore = event.target.closest('[data-ignore]');
    if (ignore) {
      state.ignoredTaskIds = [...new Set([...state.ignoredTaskIds, ignore.dataset.ignore])];
      save(); render(); toast('Activity ignored in What’s next');
      return;
    }
    const restoreIgnored = event.target.closest('[data-restore-ignored]');
    if (restoreIgnored) {
      state.ignoredTaskIds = [];
      save(); render(); toast('Ignored activities restored');
      return;
    }
    const complete = event.target.closest('[data-complete]'); if (complete) { const item = state.schedules.find(schedule => schedule.id === complete.dataset.complete); openRecord(item?.match[0]); }
    const edit = event.target.closest('.edit-record'); if (edit) openRecord(null, state.records.find(record => record.id === edit.dataset.id));
  });
  document.addEventListener('change', event => {
    const note = event.target.closest('.activity-note');
    if (!note) return;
    state.activityNotes[note.dataset.noteId] = note.value.trim();
    save();
    toast('Note saved');
  });

  document.querySelector('#exportData').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `tlx-maintenance-backup-${isoToday}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('Backup exported'); });
  document.querySelector('#importData').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { const incoming = JSON.parse(await file.text()); if (!incoming.odometer || !Array.isArray(incoming.records)) throw new Error(); state = normalize(incoming); save(); render(); toast('Backup restored and queued for online sync'); } catch { toast('That file is not a valid TLX backup'); } finally { event.target.value = ''; } });
  document.querySelector('#resetData').addEventListener('click', () => { const dialog = document.querySelector('#confirmDialog'); document.querySelector('#confirmTitle').textContent = 'Reset all maintenance data?'; document.querySelector('#confirmText').textContent = 'The online service history, odometer and notes will be cleared. Export a backup first if needed.'; dialog.showModal(); dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') { state = normalize(seed); save(); render(); toast('Maintenance data reset'); } }, { once: true }); });

  if (document.modelContext?.registerTool) {
    try {
      document.modelContext.registerTool({ name: 'update_tlx_odometer', title: 'Update TLX odometer', description: 'Update the current odometer and refresh maintenance reminders.', inputSchema: { type: 'object', properties: { km: { type: 'number', minimum: 0 }, date: { type: 'string' } }, required: ['km'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ km, date }) => { if (!Number.isFinite(km) || km < 0) throw new Error('Odometer must be zero or greater.'); if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD.'); state.odometer = { km: Math.round(km), date: date || isoToday }; save(); render(); return { odometer: state.odometer }; } });
      document.modelContext.registerTool({ name: 'read_tlx_maintenance_status', title: 'Read TLX maintenance status', description: 'Read the current odometer and maintenance reminders.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ odometer: state.odometer, items: ranked().map(item => ({ name: item.name, status: item.status.label, detail: item.status.detail })) }) });
    } catch { /* Browsers without WebMCP simply use the visible interface. */ }
  }
  render();
})();
