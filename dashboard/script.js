const DASHBOARD_ENDPOINT = '/.netlify/functions/get-dashboard-data';
const DASHBOARD_PRESETS_STORAGE_KEY = 'survey-dashboard-presets-v1';
const DASHBOARD_VISIBILITY_STORAGE_KEY = 'survey-dashboard-visibility-v1';

const state = {
  rows: [],
  filteredRows: [],
  charts: [],
  savedPresets: [],
  activeModalFilterKey: null,
  modalPendingValues: [],
  viewFilters: {
    visitType: [],
    gender: [],
    ageGroup: [],
    optIn: [],
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
    questionContains: '',
    answerContains: ''
  },
  panelVisibility: {
    kpis: true,
    breakdownAge: true,
    breakdownVisit: true,
    dataQuality: false,
    charts: true
  }
};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseBoolean(value) {
  const normalized = normalize(value);
  if (['true', 'yes', '1'].includes(normalized)) {
    return true;
  }
  if (['false', 'no', '0'].includes(normalized)) {
    return false;
  }
  return null;
}

function parseAge(dateString) {
  if (!dateString) {
    return null;
  }

  const birthDate = new Date(dateString);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 && age <= 120 ? age : null;
}

function toAgeGroup(age) {
  if (age === null) return 'Unknown';
  if (age < 18) return 'Under 18';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  if (age <= 64) return '55-64';
  return '65+';
}

function getVisitType(row) {
  const answer = normalize(row.step_01_answer_text);
  if (answer === 'first time') return 'first_time';
  if (answer.includes('few times')) return 'few_times';
  if (answer.includes('member')) return 'member';
  return 'other';
}

function getDisplayVisitType(row) {
  if (row._visitType === 'first_time') return 'First time';
  if (row._visitType === 'few_times') return 'Visited a few times';
  if (row._visitType === 'member') return 'Member';
  return 'Other';
}

function getDisplayOptIn(row) {
  if (row._optIn === true) return 'Yes';
  if (row._optIn === false) return 'No';
  return 'Unknown';
}

function extractStepAnswers(row) {
  const answers = [];
  for (let step = 1; step <= 12; step += 1) {
    const slot = String(step).padStart(2, '0');
    const questionText = String(row[`step_${slot}_question_text`] || '').trim();
    const answerText = String(row[`step_${slot}_answer_text`] || '').trim();
    if (!answerText) continue;
    answers.push({ step, questionText, answerText });
  }
  return answers;
}

function enrichRows(rows) {
  return rows.map((row, index) => {
    const rawSubmitted = String(row.submitted_at_utc || '').trim();
    const fallbackDate = new Date(Date.now() - ((rows.length - index) * 86400000));
    const submitted = rawSubmitted ? new Date(rawSubmitted) : fallbackDate;
    const submittedAt = Number.isNaN(submitted.getTime()) ? null : submitted;

    return {
      ...row,
      _age: parseAge(row.date_of_birth),
      _ageGroup: toAgeGroup(parseAge(row.date_of_birth)),
      _visitType: getVisitType(row),
      _gender: normalize(row.gender),
      _optIn: parseBoolean(row.marketing_opt_in),
      _answers: extractStepAnswers(row),
      _submittedAt: submittedAt,
      _submittedIso: submittedAt ? submittedAt.toISOString() : ''
    };
  });
}

function countBy(rows, valueGetter, fallbackLabel = 'Unknown') {
  return rows.reduce((acc, row) => {
    const key = valueGetter(row) || fallbackLabel;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function toPercent(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function destroyCharts() {
  state.charts.forEach((chart) => chart.destroy());
  state.charts = [];
}

function makeChartColor(index, alpha = 1) {
  const palette = [
    `rgba(0, 58, 112, ${alpha})`,
    `rgba(181, 52, 59, ${alpha})`,
    `rgba(35, 107, 72, ${alpha})`,
    `rgba(208, 124, 37, ${alpha})`,
    `rgba(82, 96, 121, ${alpha})`,
    `rgba(95, 63, 176, ${alpha})`
  ];
  return palette[index % palette.length];
}

function renderBreakdown(targetId, counts) {
  const root = document.getElementById(targetId);
  if (!root) return;

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    root.innerHTML = '<p>No data yet.</p>';
    return;
  }

  root.innerHTML = `
    <div class="breakdown-list">
      ${entries.map(([label, count]) => `<div class="breakdown-item"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>`).join('')}
    </div>
  `;
}

function renderKpis(rows) {
  const total = rows.length;
  const firstTime = rows.filter((row) => row._visitType === 'first_time').length;
  const returning = Math.max(total - firstTime, 0);
  const female = rows.filter((row) => row._gender === 'female').length;
  const firstTimeFemale = rows.filter((row) => row._visitType === 'first_time' && row._gender === 'female').length;
  const optInYes = rows.filter((row) => row._optIn === true).length;
  const optInRate = toPercent(optInYes, total);

  const isFemaleSpecificFilter = state.viewFilters.gender.length > 0 && state.viewFilters.gender.every((value) => value === 'female');

  const root = document.getElementById('kpi-grid');
  if (!root) return;

  const cards = [
    `<article class="kpi-card"><p class="kpi-label">Total submissions</p><p class="kpi-value">${total}</p></article>`,
    `<article class="kpi-card"><p class="kpi-label">First-time customers</p><p class="kpi-value">${firstTime}</p></article>`,
    `<article class="kpi-card"><p class="kpi-label">Returning customers</p><p class="kpi-value">${returning}</p></article>`,
    `<article class="kpi-card"><p class="kpi-label">Email opt-in rate</p><p class="kpi-value">${optInRate}%</p></article>`
  ];

  if (isFemaleSpecificFilter) {
    cards.push(`<article class="kpi-card"><p class="kpi-label">Female submissions</p><p class="kpi-value">${female}</p></article>`);
    cards.push(`<article class="kpi-card"><p class="kpi-label">First-time female customers</p><p class="kpi-value">${firstTimeFemale}</p></article>`);
  }

  root.innerHTML = cards.join('');
}

function renderDataQuality(rows) {
  const missingDob = rows.filter((row) => !String(row.date_of_birth || '').trim()).length;
  const missingGender = rows.filter((row) => !String(row.gender || '').trim() || normalize(row.gender) === 'prefer not to say').length;
  const missingEmail = rows.filter((row) => !String(row.email || '').trim()).length;
  const missingStepOne = rows.filter((row) => !String(row.step_01_answer_text || '').trim()).length;

  renderBreakdown('data-quality-breakdown', {
    'Missing date of birth': missingDob,
    'Missing or undisclosed gender': missingGender,
    'Missing email': missingEmail,
    'Missing step 1 answer': missingStepOne
  });
}

function isCustomDatePresetSelected() {
  return state.viewFilters.datePreset === 'custom';
}

function updateCustomDateVisibility() {
  const customRange = document.getElementById('custom-date-range-fields');
  if (!customRange) return;
  customRange.hidden = !isCustomDatePresetSelected();

  if (customRange.hidden) {
    const dateFromInput = document.getElementById('view-date-from');
    const dateToInput = document.getElementById('view-date-to');
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';
    state.viewFilters.dateFrom = '';
    state.viewFilters.dateTo = '';
  }
}

function renderTrendChart(rows) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('trend-line-chart');
  if (!canvas) return;

  const dateCounts = countBy(rows.filter((row) => row._submittedIso), (row) => row._submittedIso.slice(0, 10));
  const labels = Object.keys(dateCounts).sort();
  const values = labels.map((label) => dateCounts[label]);

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Submissions',
        data: values,
        borderColor: 'rgba(0, 58, 112, 0.9)',
        backgroundColor: 'rgba(0, 58, 112, 0.14)',
        fill: true,
        tension: 0.25,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { legend: { display: false } }
    }
  });

  state.charts.push(chart);
}

function renderCharts(rows) {
  if (typeof Chart === 'undefined') return;

  destroyCharts();

  const genderNote = document.getElementById('gender-chart-note');
  if (genderNote) genderNote.textContent = '';

  const genderCounts = countBy(rows, (row) => row.gender || 'Unknown');
  const genderLabels = ['Female', 'Male', 'Non-binary', 'Prefer not to say', 'Unknown'].filter((label) => (genderCounts[label] || 0) > 0);
  const genderValues = genderLabels.map((label) => genderCounts[label] || 0);
  const genderPercents = genderValues.map((value) => toPercent(value, rows.length));

  const genderCanvas = document.getElementById('gender-pie-chart');
  if (genderCanvas && genderLabels.length) {
    state.charts.push(new Chart(genderCanvas, {
      type: 'pie',
      data: {
        labels: genderLabels,
        datasets: [{
          data: genderValues,
          backgroundColor: genderLabels.map((_, index) => makeChartColor(index, 0.85)),
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label(context) {
                const index = context.dataIndex;
                return `${context.label}: ${genderPercents[index]}% (${genderValues[index] || 0})`;
              }
            }
          }
        }
      }
    }));
  }

  const ageLabels = ['Under 18', '18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown'];
  const ageCounts = countBy(rows, (row) => row._ageGroup);
  const ageValues = ageLabels.map((label) => ageCounts[label] || 0);
  const agePercents = ageValues.map((value) => toPercent(value, rows.length));
  const usePercentMode = false;

  const ageCanvas = document.getElementById('age-bar-chart');
  if (ageCanvas) {
    state.charts.push(new Chart(ageCanvas, {
      type: 'bar',
      data: {
        labels: ageLabels,
        datasets: [{
          label: 'Submission count',
          data: ageValues,
          backgroundColor: ageLabels.map((_, index) => makeChartColor(index, 0.75)),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return String(value);
              }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const idx = context.dataIndex;
                return `${ageValues[idx]} (${agePercents[idx]}%)`;
              }
            }
          }
        }
      }
    }));
  }

  const visitOrder = ['First time', 'Visited a few times', 'Member', 'Other'];
  const visitCounts = countBy(rows, (row) => getDisplayVisitType(row));
  const visitValues = visitOrder.map((label) => visitCounts[label] || 0);
  const visitPercents = visitValues.map((value) => toPercent(value, rows.length));

  const visitCanvas = document.getElementById('visit-doughnut-chart');
  if (visitCanvas) {
    state.charts.push(new Chart(visitCanvas, {
      type: 'doughnut',
      data: {
        labels: visitOrder,
        datasets: [{
          data: visitValues,
          backgroundColor: visitOrder.map((_, index) => makeChartColor(index, 0.82)),
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label(context) {
                const i = context.dataIndex;
                return `${context.label}: ${visitPercents[i]}% (${visitValues[i] || 0})`;
              }
            }
          }
        }
      }
    }));
  }

  renderTrendChart(rows);
}

function getDateRangeBounds(filters) {
  const now = new Date();
  const preset = String(filters.datePreset || 'all');

  if (['7', '30', '90'].includes(preset)) {
    const days = Number(preset);
    const start = new Date(now);
    start.setDate(now.getDate() - days + 1);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (preset === 'custom') {
    const start = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
    const end = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`) : null;
    return {
      start: start && !Number.isNaN(start.getTime()) ? start : null,
      end: end && !Number.isNaN(end.getTime()) ? end : null
    };
  }

  return { start: null, end: null };
}

function matchesMultiSelect(filterValues, value) {
  if (!Array.isArray(filterValues) || !filterValues.length) return true;
  return filterValues.includes(value);
}

function matchesViewFilters(row, filters) {
  if (!matchesMultiSelect(filters.visitType, row._visitType)) return false;
  if (!matchesMultiSelect(filters.gender, row._gender || 'unknown')) return false;
  if (!matchesMultiSelect(filters.ageGroup, row._ageGroup)) return false;

  const optInValue = row._optIn === true ? 'true' : row._optIn === false ? 'false' : 'unknown';
  if (!matchesMultiSelect(filters.optIn, optInValue)) return false;

  const bounds = getDateRangeBounds(filters);
  if ((bounds.start || bounds.end) && !row._submittedAt) return false;
  if (bounds.start && row._submittedAt && row._submittedAt < bounds.start) return false;
  if (bounds.end && row._submittedAt && row._submittedAt > bounds.end) return false;

  const questionNeedle = normalize(filters.questionContains);
  const answerNeedle = normalize(filters.answerContains);
  if (questionNeedle || answerNeedle) {
    const hasMatch = row._answers.some((entry) => {
      const questionMatches = !questionNeedle || normalize(entry.questionText).includes(questionNeedle);
      const answerMatches = !answerNeedle || normalize(entry.answerText).includes(answerNeedle);
      return questionMatches && answerMatches;
    });

    if (!hasMatch) return false;
  }

  return true;
}

function getFilteredRows(rows, filters) {
  return rows.filter((row) => matchesViewFilters(row, filters));
}


function updateViewFilterSummary(filteredCount, totalCount) {
  const summary = document.getElementById('view-filter-summary');
  if (!summary) return;
  summary.textContent = filteredCount === totalCount
    ? `Showing all ${totalCount} submissions.`
    : `Showing ${filteredCount} of ${totalCount} submissions after filters.`;
}

function renderDashboard(rows) {
  if (state.panelVisibility.kpis !== false) {
    renderKpis(rows);
  }

  if (state.panelVisibility.breakdownAge !== false) {
    renderBreakdown('age-breakdown', countBy(rows, (row) => row._ageGroup));
  }
  if (state.panelVisibility.breakdownVisit !== false) {
    renderBreakdown('visit-breakdown', countBy(rows, (row) => getDisplayVisitType(row)));
  }
  if (state.panelVisibility.dataQuality !== false) {
    renderDataQuality(rows);
  }

  if (state.panelVisibility.charts !== false) {
    renderCharts(rows);
  } else {
    destroyCharts();
  }

  applyPanelVisibility();
}

function applyViewFilters() {
  state.filteredRows = getFilteredRows(state.rows, state.viewFilters);
  renderDashboard(state.filteredRows);
  updateViewFilterSummary(state.filteredRows.length, state.rows.length);
}

function getViewFilterOptionData() {
  const genderLabelMap = {
    female: 'Female',
    male: 'Male',
    'non-binary': 'Non-binary',
    'prefer not to say': 'Prefer not to say',
    unknown: 'Unknown'
  };
  const visitLabelMap = {
    first_time: 'First time',
    few_times: 'Visited a few times',
    member: 'Member',
    other: 'Other'
  };

  const ageOrder = ['Under 18', '18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Unknown'];
  const ageCounts = countBy(state.rows, (row) => row._ageGroup);
  const ageOptions = ageOrder.filter((label) => (ageCounts[label] || 0) > 0).map((label) => ({ value: label, label, count: ageCounts[label] || 0 }));

  const genderOrder = ['female', 'male', 'non-binary', 'prefer not to say', 'unknown'];
  const genderCounts = countBy(state.rows, (row) => row._gender || 'unknown');
  const genderOptions = genderOrder.filter((value) => (genderCounts[value] || 0) > 0).map((value) => ({ value, label: genderLabelMap[value] || value, count: genderCounts[value] || 0 }));

  const visitOrder = ['first_time', 'few_times', 'member', 'other'];
  const visitCounts = countBy(state.rows, (row) => row._visitType || 'other');
  const visitOptions = visitOrder.filter((value) => (visitCounts[value] || 0) > 0).map((value) => ({ value, label: visitLabelMap[value] || value, count: visitCounts[value] || 0 }));

  const optInOrder = ['true', 'false', 'unknown'];
  const optInCounts = countBy(state.rows, (row) => (row._optIn === true ? 'true' : row._optIn === false ? 'false' : 'unknown'));
  const optInOptions = optInOrder.filter((value) => (optInCounts[value] || 0) > 0).map((value) => ({ value, label: value === 'true' ? 'Yes' : value === 'false' ? 'No' : 'Unknown', count: optInCounts[value] || 0 }));

  return { ageOptions, genderOptions, visitOptions, optInOptions };
}

function updateViewFilterSelectionSummaries() {
  const summaryMap = [
    { id: 'view-visit-summary', values: state.viewFilters.visitType },
    { id: 'view-gender-summary', values: state.viewFilters.gender },
    { id: 'view-age-summary', values: state.viewFilters.ageGroup },
    { id: 'view-optin-summary', values: state.viewFilters.optIn }
  ];

  summaryMap.forEach((entry) => {
    const node = document.getElementById(entry.id);
    if (!node) return;
    node.textContent = entry.values.length ? `${entry.values.length} selected` : 'Any';
  });
}

function renderViewFilterOptions() {
  updateViewFilterSelectionSummaries();
}

function getFilterFieldMeta(filterKey) {
  const optionData = getViewFilterOptionData();
  if (filterKey === 'visitType') return { title: 'Visit type', options: optionData.visitOptions };
  if (filterKey === 'gender') return { title: 'Gender', options: optionData.genderOptions };
  if (filterKey === 'ageGroup') return { title: 'Age group', options: optionData.ageOptions };
  if (filterKey === 'optIn') return { title: 'Email opt-in', options: optionData.optInOptions };
  return { title: 'Filter options', options: [] };
}

function renderFilterModalOptions() {
  const modalTitle = document.getElementById('filter-modal-title');
  const optionsRoot = document.getElementById('filter-modal-options');
  if (!modalTitle || !optionsRoot) return;

  const meta = getFilterFieldMeta(state.activeModalFilterKey);
  modalTitle.textContent = meta.title;

  if (!meta.options.length) {
    optionsRoot.innerHTML = '<p class="panel-copy">No values available for this field.</p>';
    return;
  }

  const selected = new Set(state.modalPendingValues);
  optionsRoot.innerHTML = meta.options
    .map((option) => {
      const checked = selected.has(option.value) ? 'checked' : '';
      return `
        <label class="checkbox-pill">
          <input type="checkbox" data-modal-filter-value="${escapeHtml(option.value)}" ${checked} />
          <span>${escapeHtml(option.label)} (${option.count})</span>
        </label>
      `;
    })
    .join('');

  optionsRoot.querySelectorAll('input[data-modal-filter-value]').forEach((input) => {
    input.addEventListener('change', () => {
      state.modalPendingValues = Array.from(optionsRoot.querySelectorAll('input[data-modal-filter-value]:checked'))
        .map((item) => String(item.dataset.modalFilterValue || ''));
    });
  });
}

function openFilterModal(filterKey) {
  const modal = document.getElementById('filter-modal');
  if (!modal) return;

  state.activeModalFilterKey = filterKey;
  state.modalPendingValues = [...(state.viewFilters[filterKey] || [])];
  renderFilterModalOptions();
  modal.hidden = false;
}

function closeFilterModal() {
  const modal = document.getElementById('filter-modal');
  if (!modal) return;

  modal.hidden = true;
  state.activeModalFilterKey = null;
  state.modalPendingValues = [];
}

function readViewFiltersFromForm(form) {
  return {
    visitType: [...state.viewFilters.visitType],
    gender: [...state.viewFilters.gender],
    ageGroup: [...state.viewFilters.ageGroup],
    optIn: [...state.viewFilters.optIn],
    datePreset: String(form.querySelector('select[name="datePreset"]')?.value || 'all'),
    dateFrom: String(form.querySelector('input[name="dateFrom"]')?.value || '').trim(),
    dateTo: String(form.querySelector('input[name="dateTo"]')?.value || '').trim(),
    questionContains: String(form.querySelector('input[name="questionContains"]')?.value || '').trim(),
    answerContains: String(form.querySelector('input[name="answerContains"]')?.value || '').trim()
  };
}

function syncViewFilterFormControls() {
  const form = document.getElementById('view-filter-form');
  if (!form) return;

  const mappings = [
    ['select[name="datePreset"]', state.viewFilters.datePreset],
    ['input[name="dateFrom"]', state.viewFilters.dateFrom],
    ['input[name="dateTo"]', state.viewFilters.dateTo],
    ['input[name="questionContains"]', state.viewFilters.questionContains],
    ['input[name="answerContains"]', state.viewFilters.answerContains]
  ];

  mappings.forEach(([selector, value]) => {
    const node = form.querySelector(selector);
    if (node) node.value = value;
  });

  updateCustomDateVisibility();
}

function resetViewFilters() {
  state.viewFilters = {
    visitType: [],
    gender: [],
    ageGroup: [],
    optIn: [],
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
    questionContains: '',
    answerContains: ''
  };
}

function bindDatePresetControl() {
  const presetSelect = document.getElementById('view-date-preset');
  if (!presetSelect) return;

  presetSelect.addEventListener('change', () => {
    state.viewFilters.datePreset = String(presetSelect.value || 'all');
    updateCustomDateVisibility();
  });
}

function loadSavedPresets() {
  try {
    const raw = localStorage.getItem(DASHBOARD_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedPresets() {
  localStorage.setItem(DASHBOARD_PRESETS_STORAGE_KEY, JSON.stringify(state.savedPresets));
}

function loadPanelVisibility() {
  try {
    const raw = localStorage.getItem(DASHBOARD_VISIBILITY_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    state.panelVisibility = {
      ...state.panelVisibility,
      ...parsed
    };
  } catch {
    // Ignore invalid localStorage values.
  }
}

function persistPanelVisibility() {
  localStorage.setItem(DASHBOARD_VISIBILITY_STORAGE_KEY, JSON.stringify(state.panelVisibility));
}

function applyPanelVisibility() {
  document.querySelectorAll('[data-panel-key]').forEach((node) => {
    const panelKey = String(node.getAttribute('data-panel-key') || '');
    if (!panelKey) return;

    const isVisible = state.panelVisibility[panelKey] !== false;
    node.classList.toggle('panel-hidden', !isVisible);
  });
}

function syncPanelVisibilityInputs() {
  document.querySelectorAll('[data-toggle-panel]').forEach((input) => {
    const panelKey = String(input.getAttribute('data-toggle-panel') || '');
    if (!panelKey) return;
    input.checked = state.panelVisibility[panelKey] !== false;
  });
}

function bindPanelVisibilityControls() {
  document.querySelectorAll('[data-toggle-panel]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      const panelKey = String(target.getAttribute('data-toggle-panel') || '');
      if (!panelKey) return;

      state.panelVisibility[panelKey] = target.checked;
      persistPanelVisibility();
      applyPanelVisibility();

      if (panelKey === 'charts') {
        applyViewFilters();
      }
    });
  });
}

function renderPresetOptions() {
  const select = document.getElementById('preset-select');
  if (!select) return;

  if (!state.savedPresets.length) {
    select.innerHTML = '<option value="">No saved views</option>';
    return;
  }

  select.innerHTML = state.savedPresets
    .map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`)
    .join('');
}

function saveCurrentPreset() {
  const input = document.getElementById('preset-name-input');
  if (!input) return;

  const name = String(input.value || '').trim();
  if (!name) return;

  state.savedPresets.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    filters: { ...state.viewFilters }
  });

  input.value = '';
  persistSavedPresets();
  renderPresetOptions();
}

function applySelectedPreset() {
  const select = document.getElementById('preset-select');
  if (!select) return;

  const selectedId = String(select.value || '');
  const preset = state.savedPresets.find((item) => item.id === selectedId);
  if (!preset) return;

  state.viewFilters = { ...state.viewFilters, ...preset.filters };
  renderViewFilterOptions();
  syncViewFilterFormControls();
  applyViewFilters();
}

function deleteSelectedPreset() {
  const select = document.getElementById('preset-select');
  if (!select) return;

  const selectedId = String(select.value || '');
  if (!selectedId) return;

  state.savedPresets = state.savedPresets.filter((preset) => preset.id !== selectedId);
  persistSavedPresets();
  renderPresetOptions();
}


function bindFilterModal() {
  document.querySelectorAll('.filter-launch').forEach((button) => {
    button.addEventListener('click', () => {
      openFilterModal(button.dataset.filterKey);
    });
  });

  const modal = document.getElementById('filter-modal');
  const close = document.getElementById('filter-modal-close');
  const clear = document.getElementById('filter-modal-clear');
  const save = document.getElementById('filter-modal-save');

  modal?.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.closeFilterModal === 'true') {
      closeFilterModal();
    }
  });

  close?.addEventListener('click', closeFilterModal);
  clear?.addEventListener('click', () => {
    state.modalPendingValues = [];
    renderFilterModalOptions();
  });
  save?.addEventListener('click', () => {
    if (!state.activeModalFilterKey) return;
    state.viewFilters[state.activeModalFilterKey] = [...state.modalPendingValues];
    renderViewFilterOptions();
    applyViewFilters();
    closeFilterModal();
  });
}

function bindViewFilterForm() {
  const form = document.getElementById('view-filter-form');
  const clearButton = document.getElementById('clear-view-filters');
  if (!form || !clearButton) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.viewFilters = readViewFiltersFromForm(form);
    applyViewFilters();
  });

  clearButton.addEventListener('click', () => {
    form.reset();
    resetViewFilters();
    renderViewFilterOptions();
    syncViewFilterFormControls();
    applyViewFilters();
  });
}

function bindPresetControls() {
  document.getElementById('save-preset-button')?.addEventListener('click', saveCurrentPreset);
  document.getElementById('apply-preset-button')?.addEventListener('click', applySelectedPreset);
  document.getElementById('delete-preset-button')?.addEventListener('click', deleteSelectedPreset);
}

async function fetchDashboardData() {
  const token = sessionStorage.getItem('dashboardAccessToken') || '';
  const response = await fetch(DASHBOARD_ENDPOINT, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (response.status === 401) {
    sessionStorage.removeItem('dashboardAccessToken');
    const promptedToken = window.prompt('Dashboard token:', '');
    if (!promptedToken) {
      throw new Error('Dashboard access token required.');
    }
    sessionStorage.setItem('dashboardAccessToken', promptedToken);
    return fetchDashboardData();
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load dashboard data.');
  }

  return payload.entries || [];
}

async function initializeDashboard() {
  const loadStatus = document.getElementById('load-status');

  state.savedPresets = loadSavedPresets();
  loadPanelVisibility();
  renderPresetOptions();
  syncPanelVisibilityInputs();
  applyPanelVisibility();
  bindPresetControls();
  bindDatePresetControl();
  bindPanelVisibilityControls();

  try {
    const entries = await fetchDashboardData();
    state.rows = enrichRows(entries);

    renderViewFilterOptions();
    syncViewFilterFormControls();
    applyViewFilters();
    bindFilterModal();
    bindViewFilterForm();

    loadStatus.textContent = `Loaded ${state.rows.length} submissions.`;
  } catch (error) {
    loadStatus.classList.add('error');
    loadStatus.textContent = error instanceof Error ? error.message : 'Unable to load dashboard data.';
  }
}

initializeDashboard();
