const demographicFields = [
  {
    id: 'fullName',
    label: 'Full name',
    type: 'text',
    placeholder: 'Enter your full name'
  },
  {
    id: 'dateOfBirth',
    label: 'Date of birth',
    type: 'date'
  },
  {
    id: 'gender',
    label: 'Gender',
    type: 'select',
    placeholder: 'Select gender',
    options: ['Female', 'Male', 'Non-binary', 'Prefer not to say']
  },
  {
    id: 'familyStatus',
    label: 'Family status',
    type: 'select',
    placeholder: 'Select family status',
    options: ['Single', 'Married', 'Partnered', 'With children', 'Single parent', 'Empty nester', 'Prefer not to say']
  },
  {
    id: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'Enter your email address',
    helper: 'Email is required to receive the promotional offering upon completing this survey.'
  }
];

const FLOW_WORKSPACE_STORAGE_KEY = 'customer-receipt-flow-workspace-v1';
const VIRTUAL_ADDITIONAL_INFO_QUESTION_ID = '__virtual_additional_info__';
const FLOW_TEST_MODE = false;
const SURVEY_SUBMISSION_FUNCTION_PATH = '/.netlify/functions/submit-survey';
const MAX_EXPORT_STEPS = 12;

const copyRefinements = {
  'have you visited us before?': 'Have you visited us before?',
  'first time': 'First time',
  "i've been here a few times": "I've visited a few times",
  "i'm a member": 'I am a member',
  'what made you visit us today?': 'What brought you in today?',
  "i'm interested in self defense and training": 'I am interested in self-defense and training',
  'just for fun': 'Recreation and fun',
  "i'm a regular shooter but first time at shoot smart": 'I am a regular shooter, but this is my first time at Shoot Smart',
  'what is your primary driver for visiting us?': 'What is your main reason for visiting us?',
  'regular firearms practice for self defense': 'Regular firearms practice for self-defense',
  "i'm a recreational and hobby shooter": 'Recreational or hobby shooting',
  'retail and merchandise': 'Retail and merchandise',
  "i'm looking for guided training.": 'Guided training',
  'what was your primary driver for becoming a member?': 'What was your main reason for becoming a member?',
  'i visit the range several times a month.': 'I visit the range several times per month',
  'i appreciate the customer service i receive.': 'I value the customer service I receive',
  'i wanted retail and training discounts.': 'I wanted access to retail and training discounts',
  'what made you choose shoot smart?': 'What made you choose Shoot Smart?',
  'i saw great reviews online.': 'I saw strong online reviews',
  'i was recommended or brought here by a friend.': 'I was referred by a friend',
  'it was closest to where i live.': 'It is the closest location to me',
  'i saw us online and liked the services and pricing.': 'I found you online and liked the services and pricing',
  'what is the primary thing that\'s  going to keep you coming back?': 'What is the main reason you would return?',
  'what is the primary thing that\'s going to keep you coming back?': 'What is the main reason you would return?',
  'i like the range and what it offers.': 'I like the range and what it offers',
  'the customer service.': 'Customer service',
  'the retail and merchandise that\'s offered.': 'Retail and merchandise selection',
  'i want to continue receiving guided training.': 'I want to continue guided training',
  "i'm not planning or won't be able to come back.": 'I do not plan to return',
  "what's the primary reason you haven't signed-up for a membership with us?": 'What is the main reason you have not signed up for a membership?',
  'the prices are too high.': 'Pricing is too high',
  "i don't see enough value in the what's offered.": 'I do not see enough value in the membership',
  'no real reason.': 'No specific reason',
  "what would improve your membership experience with us?": 'What would improve your membership experience?',
  'exclusive events and training.': 'More exclusive events and training',
  'additional discounts and offers.': 'Additional discounts and offers',
  "i'm satisfied with what my membership brings me.": 'I am satisfied with my membership benefits',
  'what about your membership beenfits you the least?': 'Which membership benefit is least valuable to you?',
  'training credits.': 'Training credits',
  'retail merchandise discounts.': 'Retail merchandise discounts',
  'free firearm rental.': 'Free firearm rental',
  "why won't you be coming back?": 'What is the main reason you would not return?',
  "i don't live in the area.": 'I do not live in the area',
  'i had a negative experience.': 'I had a negative experience',
  "i'm not interested in firearms, it was just a one time visit.": 'This was a one-time visit; I am not currently interested in firearms',
  'would you like a member of our team to reach out to you regarding your experience?': 'Would you like a team member to follow up about your experience?',
  'would you like a member of our team to reach out to you to answer any questions?': 'Would you like a team member to reach out and answer any questions?',
  'yes.': 'Yes',
  'no.': 'No',
  'new question or idea': 'Additional feedback',
  'other': 'Other',
  'other.': 'Other'
};

const state = {
  phase: 'intake',
  profile: {
    fullName: '',
    dateOfBirth: '',
    gender: '',
    familyStatus: '',
    email: '',
    marketingOptIn: false
  },
  history: [],
  currentQuestionId: null,
  terminalAnswerId: null,
  additionalInfo: '',
  otherResponses: {},
  draftSelection: {
    questionId: null,
    answerId: null,
    otherText: ''
  },
  submission: {
    id: null,
    status: 'idle',
    error: ''
  },
  flow: null,
  rootQuestionId: null,
  maxQuestionDepth: 1
};

const surveyContent = document.getElementById('survey-content');
const progressBar = document.getElementById('progress-bar');
const flowMap = document.getElementById('flow-map');
const designPreview = document.getElementById('design-preview');
const testRestartButton = document.getElementById('test-restart-button');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeCopyKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function refineCopy(value) {
  const normalized = normalizeCopyKey(value);
  return copyRefinements[normalized] || String(value || '').trim();
}

function getDisplayNodeText(node) {
  return refineCopy(node?.text || '');
}

function randomItem(items) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }

  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function loadWorkspaceFlow() {
  try {
    const raw = localStorage.getItem(FLOW_WORKSPACE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildGraph(layout) {
  if (!layout || !Array.isArray(layout.nodes) || !Array.isArray(layout.edges)) {
    return null;
  }

  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const incoming = new Map();

  layout.edges.forEach((edge) => {
    if (!outgoing.has(edge.from)) {
      outgoing.set(edge.from, []);
    }

    outgoing.get(edge.from).push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  });

  const rootNode = layout.nodes.find((node) => !incoming.has(node.id)) || layout.nodes[0] || null;

  return {
    nodes,
    outgoing,
    incoming,
    rootQuestionId: rootNode?.id || null
  };
}

function getNode(nodeId) {
  return state.flow?.nodes.get(nodeId) || null;
}

function getOutgoingIds(nodeId) {
  return state.flow?.outgoing.get(nodeId) || [];
}

function isOtherLabel(label) {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[.?!]/g, '');

  return normalized === 'other';
}

function isOtherAnswer(answerId) {
  const answer = getNode(answerId);
  return isOtherLabel(answer?.text);
}

function isYesLabel(label) {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[.?!]/g, '');

  return normalized === 'yes';
}

function isTeamReachoutQuestion(questionNode) {
  const normalized = normalizeCopyKey(questionNode?.text || '');
  return (
    normalized.includes('would you like a team member to reach out')
    || normalized.includes('would you like a member of our team to reach out')
  );
}

function getDisplayAnswerText(questionId, answerId, optionIndex) {
  const question = getNode(questionId);
  const answer = getNode(answerId);
  const normalizedAnswer = normalizeCopyKey(answer?.text || '');

  if (isTeamReachoutQuestion(question) && normalizedAnswer === 'new question or idea') {
    return optionIndex === 0 ? 'Yes' : 'No';
  }

  return getDisplayNodeText(answer);
}

function generateSubmissionId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `survey-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSubmissionId() {
  if (!state.submission.id) {
    state.submission.id = generateSubmissionId();
  }

  return state.submission.id;
}

function isLocalPreview() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname);
}

function buildRouteSummary() {
  return state.history
    .map((entry, index) => {
      const question = getNode(entry.questionId);
      const answerIndex = getOutgoingIds(entry.questionId).findIndex((id) => id === entry.answerId);
      const answerLabel = getDisplayAnswerText(entry.questionId, entry.answerId, answerIndex);
      const otherText = state.otherResponses[entry.questionId]
        ? ` (Other: ${state.otherResponses[entry.questionId]})`
        : '';

      return `Step ${index + 1}: ${getDisplayNodeText(question) || 'Question'} -> ${answerLabel || 'Answer'}${otherText}`;
    })
    .join(' | ');
}

function buildSurveyPayload() {
  const finalAnswer = getNode(state.terminalAnswerId);
  const payload = {
    submission_id: getSubmissionId(),
    submitted_at_utc: new Date().toISOString(),
    survey_status: state.phase === 'complete' ? 'complete' : 'partial',
    full_name: state.profile.fullName,
    date_of_birth: state.profile.dateOfBirth,
    gender: state.profile.gender,
    family_status: state.profile.familyStatus,
    email: state.profile.email,
    marketing_opt_in: state.profile.marketingOptIn,
    additional_info: state.additionalInfo,
    route_summary: buildRouteSummary(),
    final_answer_id: state.terminalAnswerId || '',
    final_answer_text: getDisplayNodeText(finalAnswer) || ''
  };

  for (let index = 0; index < MAX_EXPORT_STEPS; index += 1) {
    const entry = state.history[index];
    const question = entry ? getNode(entry.questionId) : null;
    const answerIndex = entry ? getOutgoingIds(entry.questionId).findIndex((id) => id === entry.answerId) : -1;
    const slot = String(index + 1).padStart(2, '0');

    payload[`step_${slot}_question_id`] = entry?.questionId || '';
    payload[`step_${slot}_question_text`] = question ? getDisplayNodeText(question) : '';
    payload[`step_${slot}_answer_id`] = entry?.answerId || '';
    payload[`step_${slot}_answer_text`] = entry ? getDisplayAnswerText(entry.questionId, entry.answerId, answerIndex) : '';
    payload[`step_${slot}_other_text`] = entry ? state.otherResponses[entry.questionId] || '' : '';
  }

  return payload;
}

function getSubmissionMetaLabel() {
  if (FLOW_TEST_MODE) {
    return 'Test mode active';
  }

  switch (state.submission.status) {
    case 'submitting':
      return 'Saving to Google Sheets';
    case 'success':
      return 'Saved to Google Sheets';
    case 'duplicate':
      return 'Already on file';
    case 'error':
      return 'Google Sheets save failed';
    default:
      return isLocalPreview() ? 'Netlify connection pending' : 'Ready to save';
  }
}

function getSubmissionStatusMarkup() {
  if (FLOW_TEST_MODE) {
    return '';
  }

  if (state.submission.status === 'success') {
    return '<p class="submission-note submission-note--success">Your responses were saved and are ready for your Google Sheets workflow.</p>';
  }

  if (state.submission.status === 'duplicate') {
    return '<p class="submission-note">A response for this email address is already on file, so this submission was not saved again.</p>';
  }

  if (state.submission.status === 'submitting') {
    return '<p class="submission-note">Saving your responses to the survey database now.</p>';
  }

  if (state.submission.status === 'error') {
    return `
      <div class="submission-feedback submission-feedback--error">
        <p class="submission-note submission-note--error">We could not send this response to Google Sheets yet. ${escapeHtml(state.submission.error || 'Please try again.')}</p>
        <button class="secondary-button" id="retry-submit-button" type="button">Retry save</button>
      </div>
    `;
  }

  if (isLocalPreview()) {
    return '<p class="submission-note">Local preview is running without Netlify Functions. Data will start saving once this site is deployed on Netlify.</p>';
  }

  return '<p class="submission-note">Your response will be saved to Google Sheets automatically.</p>';
}

async function submitSurveyResponse(forceRetry = false) {
  if (FLOW_TEST_MODE || isLocalPreview()) {
    return;
  }

  if (state.submission.status === 'submitting') {
    return;
  }

  if (state.submission.status === 'success' && !forceRetry) {
    return;
  }

  state.submission.status = 'submitting';
  state.submission.error = '';

  if (state.phase === 'complete') {
    renderResult();
  }

  try {
    const response = await fetch(SURVEY_SUBMISSION_FUNCTION_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildSurveyPayload())
    });

    if (!response.ok) {
      let errorPayload = null;

      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = null;
      }

      if (response.status === 409 && errorPayload?.code === 'DUPLICATE_EMAIL') {
        state.submission.status = 'duplicate';
        state.submission.error = '';

        if (state.phase === 'complete') {
          renderResult();
        }

        return;
      }

      throw new Error(errorPayload?.error || 'The server returned an unexpected response.');
    }

    state.submission.status = 'success';
    state.submission.error = '';
  } catch (error) {
    state.submission.status = 'error';
    state.submission.error = error instanceof Error ? error.message : 'Unable to save this response right now.';
  }

  if (state.phase === 'complete') {
    renderResult();
  }
}

function countMaxQuestionDepth(questionId, path = new Set(), memo = new Map()) {
  if (!questionId) {
    return 0;
  }

  if (memo.has(questionId)) {
    return memo.get(questionId);
  }

  if (path.has(questionId)) {
    return 0;
  }

  path.add(questionId);

  const answerIds = getOutgoingIds(questionId);
  let longest = 1;

  answerIds.forEach((answerId) => {
    const nextQuestionId = getOutgoingIds(answerId)[0];
    const branchDepth = nextQuestionId ? 1 + countMaxQuestionDepth(nextQuestionId, new Set(path), memo) : 1;
    longest = Math.max(longest, branchDepth);
  });

  memo.set(questionId, longest);
  return longest;
}

function getCurrentStepNumber() {
  if (state.phase === 'intake') {
    return 1;
  }

  return Math.min(state.history.length + 2, getTotalStepCount());
}

function getTotalStepCount() {
  return Math.max(2, state.maxQuestionDepth + 1);
}

function updateProgress() {
  if (state.phase === 'complete') {
    progressBar.style.width = '100%';
    return;
  }

  const totalSteps = getTotalStepCount();
  const currentStep = getCurrentStepNumber();
  const progress = Math.min(100, (currentStep / totalSteps) * 100);
  progressBar.style.width = `${progress}%`;
}

function buildFlowNode(title, meta, variant = 'neutral') {
  return `
    <article class="flow-node flow-node--${variant}">
      <div class="flow-node-kicker">${escapeHtml(meta)}</div>
      <h3>${escapeHtml(refineCopy(title))}</h3>
    </article>
  `;
}

function buildFlowQuestionBlock(questionId, depth = 0, maxDepth = 2, path = new Set()) {
  const question = getNode(questionId);

  if (!question) {
    return '';
  }

  if (depth > maxDepth || path.has(questionId)) {
    return `
      <div class="flow-question-block">
        ${buildFlowNode(question.text, `Question ${depth + 1}`, 'question')}
        <div class="flow-result-node">Loop or deeper route continues in the live survey</div>
      </div>
    `;
  }

  const nextPath = new Set(path);
  nextPath.add(questionId);
  const answerIds = getOutgoingIds(questionId);

  return `
    <div class="flow-question-block">
      ${buildFlowNode(question.text, `Question ${depth + 1}`, depth === 0 ? 'root' : 'question')}
      <div class="flow-answer-row" style="--answer-columns: ${Math.max(answerIds.length, 1)};">
        ${answerIds
          .map((answerId) => {
            const answerNode = getNode(answerId);
            if (!answerNode) {
              return '';
            }

            const nextQuestionId = getOutgoingIds(answerId)[0] || null;
            const nextQuestion = nextQuestionId ? getNode(nextQuestionId) : null;
            const childBlock = nextQuestionId ? buildFlowQuestionBlock(nextQuestionId, depth + 1, maxDepth, nextPath) : '';

            return `
              <div class="flow-answer-column">
                <div class="flow-answer-node">
                  <div class="flow-answer-label">${escapeHtml(getDisplayNodeText(answerNode))}</div>
                  <div class="flow-answer-subtext">${nextQuestion ? escapeHtml(getDisplayNodeText(nextQuestion)) : 'This route ends here.'}</div>
                </div>
                ${childBlock ? '<div class="flow-answer-connector"></div>' : ''}
                ${childBlock}
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderFlowMap() {
  if (!flowMap) {
    return;
  }

  if (!state.flow || !state.rootQuestionId) {
    flowMap.innerHTML = `
      <div class="flow-map-note">Open the flow workspace and save a layout first so the survey can mirror it here.</div>
    `;
    return;
  }

  const rootQuestion = getNode(state.rootQuestionId);
  const rootAnswerIds = getOutgoingIds(state.rootQuestionId);

  flowMap.innerHTML = `
    <section class="flow-root">
      ${buildFlowNode(rootQuestion.text, 'Question 1', 'root')}
      <div class="flow-root-line"></div>
      <div class="flow-branches">
        ${rootAnswerIds
          .map((answerId) => {
            const answerNode = getNode(answerId);
            if (!answerNode) {
              return '';
            }

            const nextQuestionId = getOutgoingIds(answerId)[0] || null;
            const nextQuestion = nextQuestionId ? getNode(nextQuestionId) : null;

            return `
              <section class="flow-branch">
                <div class="flow-branch-head">
                  <div class="flow-branch-badge">${escapeHtml(getDisplayNodeText(answerNode))}</div>
                  <div class="flow-branch-label">${nextQuestion ? escapeHtml(getDisplayNodeText(nextQuestion)) : 'Route ends here'}</div>
                </div>
                <p class="flow-branch-copy">This branch follows the flow tree you saved in the workspace.</p>
                <div class="flow-branch-line"></div>
                <div class="flow-branch-stack">
                  ${nextQuestionId ? buildFlowQuestionBlock(nextQuestionId, 0, 2) : '<div class="flow-result-node">End of this route</div>'}
                </div>
              </section>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function buildDesignDemographicPage() {
  return `
    <article class="design-page">
      <div class="design-page-kicker">Page 1</div>
      <h3 class="design-page-title">Demographic intake</h3>
      <ul class="design-option-list">
        ${demographicFields
          .map((field) => `<li class="design-option-item"><span class="design-option-label">${escapeHtml(field.label)}</span><span class="design-option-next">${escapeHtml(field.helper || 'Required field in design preview')}</span></li>`)
          .join('')}
      </ul>
    </article>
  `;
}

function buildDesignQuestionPage(questionId, pageNumber, highlightedAnswerId = null) {
  const question = getNode(questionId);
  if (!question) {
    return '';
  }

  const answerIds = getOutgoingIds(questionId);

  return `
    <article class="design-page">
      <div class="design-page-kicker">Page ${pageNumber}</div>
      <h3 class="design-page-title">${escapeHtml(getDisplayNodeText(question))}</h3>
      <ul class="design-option-list">
        ${answerIds
          .map((answerId, optionIndex) => {
            const answerNode = getNode(answerId);
            if (!answerNode) {
              return '';
            }

            const nextQuestionId = getOutgoingIds(answerId)[0] || null;
            const nextQuestion = nextQuestionId ? getNode(nextQuestionId) : null;
            const itemClass = highlightedAnswerId === answerId ? 'design-option-item is-branch' : 'design-option-item';

            return `
              <li class="${itemClass}">
                <span class="design-option-label">${escapeHtml(getDisplayAnswerText(questionId, answerId, optionIndex))}</span>
              </li>
            `;
          })
          .join('')}
      </ul>
    </article>
  `;
}

function buildDesignAdditionalInfoPage(pageNumber) {
  return `
    <article class="design-page">
      <div class="design-page-kicker">Page ${pageNumber}</div>
      <h3 class="design-page-title">Please share any additional details</h3>
      <ul class="design-option-list">
        <li class="design-option-item">
          <span class="design-option-label">Open text field</span>
        </li>
      </ul>
    </article>
  `;
}

function buildDesignCompletionPage(pageNumber) {
  return `
    <article class="design-page">
      <div class="design-page-kicker">Page ${pageNumber}</div>
      <h3 class="design-page-title">Thank you for completing the survey</h3>
      <ul class="design-option-list">
        <li class="design-option-item">
          <span class="design-option-label">Your promotional offer will be sent to the email address you provided.</span>
        </li>
        <li class="design-option-item">
          <span class="design-option-label">Please allow up to 24 hours for processing.</span>
        </li>
        <li class="design-option-item">
          <span class="design-option-label">If you do not see the email, please check your spam or junk folder.</span>
        </li>
      </ul>
    </article>
  `;
}

function collectBranchQuestionIds(rootAnswerId, maxQuestions = 20) {
  const ordered = [];
  const seen = new Set();

  function walk(questionId) {
    if (!questionId || seen.has(questionId) || ordered.length >= maxQuestions) {
      return;
    }

    seen.add(questionId);
    ordered.push(questionId);

    getOutgoingIds(questionId).forEach((answerId) => {
      const nextQuestionId = getOutgoingIds(answerId)[0] || null;
      walk(nextQuestionId);
    });
  }

  const firstQuestionId = getOutgoingIds(rootAnswerId)[0] || null;
  walk(firstQuestionId);
  return ordered;
}

function renderDesignPreview(activeRootAnswerId = null) {
  if (!designPreview) {
    return;
  }

  if (!state.flow || !state.rootQuestionId) {
    designPreview.innerHTML = '<div class="flow-map-note">Open the flow workspace and save your layout, then refresh to preview stacked pages by branch.</div>';
    return;
  }

  const rootAnswerIds = getOutgoingIds(state.rootQuestionId)
    .filter((answerId) => Boolean(getNode(answerId)))
    .slice(0, 3);

  if (!rootAnswerIds.length) {
    designPreview.innerHTML = '<div class="flow-map-note">Question 1 has no branch answers yet. Add and connect them in the flow workspace.</div>';
    return;
  }

  const selectedRootAnswerId = rootAnswerIds.includes(activeRootAnswerId) ? activeRootAnswerId : rootAnswerIds[0];
  const selectedBranchQuestions = collectBranchQuestionIds(selectedRootAnswerId);
  const rootPageHtml = buildDesignQuestionPage(state.rootQuestionId, 2, selectedRootAnswerId);
  const branchPagesHtml = selectedBranchQuestions
    .map((questionId, index) => buildDesignQuestionPage(questionId, index + 3))
    .join('');
  const hasAdditionalInfoStep = selectedBranchQuestions.some((questionId) => isTeamReachoutQuestion(getNode(questionId)));
  const completionPageNumber = 3 + selectedBranchQuestions.length + (hasAdditionalInfoStep ? 1 : 0);

  designPreview.innerHTML = `
    <div class="design-tabs" role="tablist" aria-label="Main survey branches">
      ${rootAnswerIds
        .map((answerId) => {
          const answerNode = getNode(answerId);
          const isActive = answerId === selectedRootAnswerId;
          return `<button class="design-tab ${isActive ? 'is-active' : ''}" data-root-answer-id="${answerId}" role="tab" aria-selected="${String(isActive)}" type="button">${escapeHtml(getDisplayNodeText(answerNode) || 'Branch')}</button>`;
        })
        .join('')}
    </div>
    <div class="design-stack">
      ${buildDesignDemographicPage()}
      ${rootPageHtml}
      ${branchPagesHtml}
      ${hasAdditionalInfoStep ? buildDesignAdditionalInfoPage(3 + selectedBranchQuestions.length) : ''}
      ${buildDesignCompletionPage(completionPageNumber)}
    </div>
  `;

  designPreview.querySelectorAll('.design-tab').forEach((button) => {
    button.addEventListener('click', () => {
      renderDesignPreview(button.dataset.rootAnswerId);
    });
  });
}

function buildDemographicField(field) {
  const requiredAttr = FLOW_TEST_MODE ? '' : 'required';

  if (field.type === 'select') {
    return `
      <label class="intake-field ${field.id === 'fullName' || field.id === 'email' ? 'intake-field--wide' : ''}">
        <span class="intake-label">${field.label}</span>
        <select class="intake-control" name="${field.id}" ${requiredAttr}>
          <option value="">${field.placeholder}</option>
          ${field.options.map((option) => `<option value="${option}">${option}</option>`).join('')}
        </select>
        ${field.helper ? `<span class="intake-helper">${field.helper}</span>` : ''}
      </label>
    `;
  }

  if (field.id === 'email') {
    const marketingChecked = state.profile.marketingOptIn ? 'checked' : '';

    return `
      <div class="intake-field intake-field--wide">
        <label>
          <span class="intake-label">${field.label}</span>
          <input class="intake-control" type="${field.type}" name="${field.id}" value="${state.profile[field.id]}" placeholder="${field.placeholder || ''}" ${requiredAttr} />
          ${field.helper ? `<span class="intake-helper">${field.helper}</span>` : ''}
        </label>
        <label class="intake-check" for="marketing-opt-in">
          <input id="marketing-opt-in" name="marketingOptIn" type="checkbox" ${marketingChecked} />
          <span>I&apos;d like to receive occasional email updates, promotions, and special offers (optional).</span>
        </label>
      </div>
    `;
  }

  return `
    <label class="intake-field ${field.id === 'fullName' || field.id === 'email' ? 'intake-field--wide' : ''}">
      <span class="intake-label">${field.label}</span>
      <input class="intake-control" type="${field.type}" name="${field.id}" value="${state.profile[field.id]}" placeholder="${field.placeholder || ''}" ${requiredAttr} />
      ${field.helper ? `<span class="intake-helper">${field.helper}</span>` : ''}
    </label>
  `;
}

function renderDemographicIntro() {
  state.phase = 'intake';
  updateProgress();

  surveyContent.innerHTML = `
    <h2 class="question-title">Tell us a little about yourself first</h2>
    <p class="question-copy">We collect this standard marketing information before the survey begins so we can understand who completed the feedback.</p>
    <form id="intake-form" class="intake-form" novalidate>
      <div class="intake-grid">
        ${demographicFields.map((field) => buildDemographicField(field)).join('')}
      </div>
      <div class="action-row">
        <button class="secondary-button" type="submit">Continue to Question 1</button>
      </div>
    </form>
  `;

  document.getElementById('intake-form').addEventListener('submit', handleDemographicSubmit);
}

function handleDemographicSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const nextProfile = {};

  demographicFields.forEach((field) => {
    nextProfile[field.id] = String(formData.get(field.id) || '').trim();
  });

  nextProfile.marketingOptIn = formData.get('marketingOptIn') === 'on';

  const isComplete = demographicFields.every((field) => nextProfile[field.id]);

  if (!isComplete && !FLOW_TEST_MODE) {
    form.reportValidity();
    return;
  }

  if (FLOW_TEST_MODE) {
    demographicFields.forEach((field) => {
      if (!nextProfile[field.id]) {
        if (field.type === 'email') {
          nextProfile[field.id] = 'test@example.com';
        } else if (field.type === 'date') {
          nextProfile[field.id] = '1990-01-01';
        } else if (field.type === 'select') {
          nextProfile[field.id] = field.options?.[0] || 'Not provided';
        } else {
          nextProfile[field.id] = 'Test User';
        }
      }
    });
  }

  state.profile = nextProfile;
  state.phase = 'survey';
  state.history = []; 
  state.currentQuestionId = state.rootQuestionId;
  state.terminalAnswerId = null;
  renderQuestion();
}

function getSelectedAnswerId(questionId) {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const entry = state.history[index];
    if (entry.questionId === questionId) {
      return entry.answerId;
    }
  }

  return null;
}

function renderQuestion() {
  if (state.phase === 'intake') {
    renderDemographicIntro();
    return;
  }

  if (state.phase === 'complete') {
    renderResult();
    return;
  }

  if (state.currentQuestionId === VIRTUAL_ADDITIONAL_INFO_QUESTION_ID) {
    updateProgress();

    surveyContent.innerHTML = `
      <h2 class="question-title">Please share any additional details</h2>
      <p class="question-copy">If you would like a team member to follow up, tell us what would be most helpful.</p>
      <div class="intake-field" id="additional-info-block">
        <label class="intake-label" for="additional-info-input">Additional information</label>
        <input class="intake-control" id="additional-info-input" type="text" value="${escapeHtml(state.additionalInfo)}" placeholder="Type your details" required />
      </div>
      <div class="action-row">
        <button class="secondary-button" id="additional-info-continue-button" type="button">Continue</button>
        ${FLOW_TEST_MODE ? '<button class="secondary-button" id="additional-info-auto-button" type="button">Continue</button>' : ''}
      </div>
      <div class="nav-row">
        <button class="back-button" id="back-button" type="button">← Back</button>
      </div>
    `;

    const additionalInput = document.getElementById('additional-info-input');
    const continueButton = document.getElementById('additional-info-continue-button');

    additionalInput.addEventListener('input', () => {
      state.additionalInfo = additionalInput.value;
    });

    continueButton.addEventListener('click', () => {
      const value = additionalInput.value.trim();
      if (!value) {
        additionalInput.reportValidity();
        additionalInput.focus();
        return;
      }

      state.additionalInfo = value;
      state.phase = 'complete';
      renderResult();
    });

    if (FLOW_TEST_MODE) {
      document.getElementById('additional-info-auto-button').addEventListener('click', () => {
        state.additionalInfo = state.additionalInfo || 'Auto-generated test details';
        state.phase = 'complete';
        renderResult();
      });
    }

    document.getElementById('back-button').addEventListener('click', goBack);
    return;
  }

  const question = getNode(state.currentQuestionId);

  if (!question) {
    surveyContent.innerHTML = `
      <div class="eyebrow">Survey unavailable</div>
      <h2 class="question-title">We could not load the saved flow tree.</h2>
      <p class="question-copy">Open the flow workspace, save the layout, and refresh this page so the survey can use your structure.</p>
    `;
    return;
  }

  const answerIds = getOutgoingIds(question.id);

  if (!answerIds.length) {
    state.phase = 'complete';
    renderResult();
    return;
  }

  const selectedAnswerId =
    state.draftSelection.questionId === question.id
      ? state.draftSelection.answerId
      : getSelectedAnswerId(question.id);
  const showOtherInput = Boolean(selectedAnswerId && isOtherAnswer(selectedAnswerId));
  const specifiedValue =
    state.draftSelection.questionId === question.id
      ? state.draftSelection.otherText
      : state.otherResponses[question.id] || '';

  updateProgress();

  surveyContent.innerHTML = `
    <h2 class="question-title">${escapeHtml(getDisplayNodeText(question))}</h2>
    <p class="question-copy">Choose the answer that matches your experience.</p>
    <div class="answer-grid">
      ${answerIds
        .map((answerId, optionIndex) => {
          const answerNode = getNode(answerId);
          if (!answerNode) {
            return '';
          }

          return `
            <button class="answer-button ${selectedAnswerId === answerId ? 'selected' : ''}" data-answer-id="${answerId}" type="button">
              <span class="answer-label">${escapeHtml(getDisplayAnswerText(question.id, answerId, optionIndex))}</span>
            </button>
          `;
        })
        .join('')}
    </div>
    ${
      showOtherInput
        ? `
          <div class="intake-field" id="other-detail-block">
            <label class="intake-label" for="other-detail-input">Please specify</label>
            <input class="intake-control" id="other-detail-input" type="text" value="${escapeHtml(specifiedValue)}" placeholder="Please specify" required />
          </div>
          <div class="action-row">
            <button class="secondary-button" id="other-continue-button" type="button">Continue</button>
          </div>
        `
        : ''
    }
    <div class="nav-row">
      <button class="back-button" id="back-button" type="button">← Back</button>
    </div>
    ${FLOW_TEST_MODE ? '<div class="action-row"><button class="secondary-button" id="auto-continue-button" type="button">Continue</button></div>' : ''}
  `;

  document.querySelectorAll('.answer-button').forEach((button) => {
    button.addEventListener('click', () => handleAnswerSelect(button.dataset.answerId));
  });

  if (showOtherInput) {
    const otherInput = document.getElementById('other-detail-input');
    const continueButton = document.getElementById('other-continue-button');

    otherInput.addEventListener('input', () => {
      state.draftSelection.otherText = otherInput.value;
    });

    continueButton.addEventListener('click', () => {
      const value = otherInput.value.trim();
      if (!value) {
        otherInput.reportValidity();
        otherInput.focus();
        return;
      }

      commitAnswer(selectedAnswerId, value);
    });
  }

  document.getElementById('back-button').addEventListener('click', goBack);

  if (FLOW_TEST_MODE) {
    document.getElementById('auto-continue-button').addEventListener('click', autoAdvanceCurrentQuestion);
  }
}

function autoAdvanceCurrentQuestion() {
  const questionId = state.currentQuestionId;
  const answerIds = getOutgoingIds(questionId);

  if (!answerIds.length) {
    state.phase = 'complete';
    renderResult();
    return;
  }

  const answerId = randomItem(answerIds);
  if (!answerId) {
    return;
  }

  if (isOtherAnswer(answerId)) {
    commitAnswer(answerId, 'Auto-generated other response');
    return;
  }

  commitAnswer(answerId, null);
}

function handleAnswerSelect(answerId) {
  if (isOtherAnswer(answerId)) {
    state.draftSelection = {
      questionId: state.currentQuestionId,
      answerId,
      otherText: state.otherResponses[state.currentQuestionId] || ''
    };
    renderQuestion();
    return;
  }

  state.draftSelection = {
    questionId: null,
    answerId: null,
    otherText: ''
  };

  commitAnswer(answerId, null);
}

function commitAnswer(answerId, otherText) {
  const questionId = state.currentQuestionId;
  const existingIndex = state.history.findLastIndex((entry) => entry.questionId === questionId);

  if (existingIndex >= 0) {
    state.history = state.history.slice(0, existingIndex);
  }

  state.history.push({
    questionId,
    answerId
  });

  if (isOtherAnswer(answerId)) {
    state.otherResponses[questionId] = otherText || '';
  } else {
    delete state.otherResponses[questionId];
  }

  state.terminalAnswerId = answerId;

  const questionNode = getNode(questionId);
  const displayAnswer = getDisplayAnswerText(
    questionId,
    answerId,
    getOutgoingIds(questionId).findIndex((id) => id === answerId)
  );
  const nextQuestionId = getOutgoingIds(answerId)[0] || null;

  if (isTeamReachoutQuestion(questionNode) && isYesLabel(displayAnswer)) {
    state.currentQuestionId = VIRTUAL_ADDITIONAL_INFO_QUESTION_ID;
    renderQuestion();
    return;
  }

  if (!nextQuestionId) {
    state.currentQuestionId = null;
    state.phase = 'complete';
    renderResult();
    return;
  }

  state.currentQuestionId = nextQuestionId;
  renderQuestion();
}

function goBack() {
  if (state.phase === 'intake') {
    return;
  }

  if (state.currentQuestionId === VIRTUAL_ADDITIONAL_INFO_QUESTION_ID) {
    state.currentQuestionId = state.history[state.history.length - 1]?.questionId || state.rootQuestionId;
    renderQuestion();
    return;
  }

  if (!state.history.length) {
    state.phase = 'intake';
    state.currentQuestionId = null;
    state.terminalAnswerId = null;
    renderDemographicIntro();
    return;
  }

  state.history.pop();
  const previousEntry = state.history[state.history.length - 1];

  if (!previousEntry) {
    state.phase = 'intake';
    state.currentQuestionId = null;
    state.terminalAnswerId = null;
    renderDemographicIntro();
    return;
  }

  state.currentQuestionId = previousEntry.questionId;
  state.draftSelection = {
    questionId: null,
    answerId: null,
    otherText: ''
  };
  renderQuestion();
}

function renderSummaryChips() {
  const profileChips = demographicFields.map((field) => {
    return `<span class="summary-chip"><strong>${field.label}</strong><span>${escapeHtml(state.profile[field.id] || 'No answer')}</span></span>`;
  });

  const routeChips = state.history.map((entry, index) => {
    const question = getNode(entry.questionId);
    const answerIndex = getOutgoingIds(entry.questionId).findIndex((id) => id === entry.answerId);
    const answerLabel = getDisplayAnswerText(entry.questionId, entry.answerId, answerIndex);
    const specified = state.otherResponses[entry.questionId]
      ? ` (Please specify: ${escapeHtml(state.otherResponses[entry.questionId])})`
      : '';
    return `<span class="summary-chip"><strong>Step ${index + 1}</strong><span>${escapeHtml(getDisplayNodeText(question) || 'Question')} → ${escapeHtml(answerLabel || 'Answer')}${specified}</span></span>`;
  });

  const additionalInfoChip = state.additionalInfo
    ? `<span class="summary-chip"><strong>Additional information</strong><span>${escapeHtml(state.additionalInfo)}</span></span>`
    : '';

  return [...profileChips, ...routeChips, additionalInfoChip].join('');
}

function renderResult() {
  updateProgress();
  progressBar.style.width = '100%';

  const finalAnswer = getNode(state.terminalAnswerId);

  surveyContent.innerHTML = `
    <div class="eyebrow">Survey complete</div>
    <h2 class="result-title">Thank you for completing the survey</h2>
    <p class="result-copy">Your promotional offer will be sent to the email address you provided. Please allow up to 24 hours for processing, and check your spam or junk folder if you do not see it.</p>

    <div class="result-panel">
      <div class="result-meta">
        <span class="meta-pill">Survey completed</span>
        <span class="meta-pill">${escapeHtml(getSubmissionMetaLabel())}</span>
      </div>
      <p class="result-copy">${finalAnswer ? `Final response recorded: ${escapeHtml(getDisplayNodeText(finalAnswer))}` : 'Your responses have been recorded.'}</p>
      ${getSubmissionStatusMarkup()}
    </div>

    <div class="summary-grid">
      ${renderSummaryChips()}
    </div>

  `;

  const retryButton = document.getElementById('retry-submit-button');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      submitSurveyResponse(true);
    });
  }

  if (!FLOW_TEST_MODE && !isLocalPreview() && state.submission.status === 'idle') {
    submitSurveyResponse();
  }

}

function restartSurvey() {
  state.phase = 'intake';
  state.history = [];
  state.currentQuestionId = null;
  state.terminalAnswerId = null;
  state.additionalInfo = '';
  state.otherResponses = {};
  state.draftSelection = {
    questionId: null,
    answerId: null,
    otherText: ''
  };
  state.submission = {
    id: null,
    status: 'idle',
    error: ''
  };
  state.profile = {
    fullName: '',
    dateOfBirth: '',
    gender: '',
    familyStatus: '',
    email: '',
    marketingOptIn: false
  };

  renderDemographicIntro();
}

if (testRestartButton) {
  if (FLOW_TEST_MODE) {
    testRestartButton.addEventListener('click', () => {
      restartSurvey();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } else {
    testRestartButton.hidden = true;
  }
}

function initializeFlowState() {
  const layout = loadWorkspaceFlow();

  if (!layout) {
    state.flow = null;
    state.rootQuestionId = null;
    state.maxQuestionDepth = 1;
    return;
  }

  state.flow = buildGraph(layout);
  state.rootQuestionId = state.flow?.rootQuestionId || null;
  state.maxQuestionDepth = Math.max(1, countMaxQuestionDepth(state.rootQuestionId));
}

initializeFlowState();
renderFlowMap();
renderDesignPreview();
renderDemographicIntro();
