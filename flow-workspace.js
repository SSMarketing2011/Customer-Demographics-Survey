const STORAGE_KEY = 'customer-receipt-flow-workspace-v1';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.2;

const addNodeButton = document.getElementById('add-node');
const connectModeButton = document.getElementById('connect-mode');
const deleteSelectedButton = document.getElementById('delete-selected');
const clearBoardButton = document.getElementById('clear-board');
const saveLayoutButton = document.getElementById('save-layout');
const loadLayoutButton = document.getElementById('load-layout');
const exportLayoutButton = document.getElementById('export-layout');
const zoomOutButton = document.getElementById('zoom-out');
const zoomResetButton = document.getElementById('zoom-reset');
const zoomInButton = document.getElementById('zoom-in');
const zoomReadout = document.getElementById('zoom-readout');

const workspaceStage = document.getElementById('workspace-stage');
const nodeLayer = document.getElementById('node-layer');
const connectionLayer = document.getElementById('connection-layer');
const statusMessage = document.getElementById('status-message');

const state = {
  nodes: [],
  edges: [],
  nextNodeId: 1,
  zoom: 1,
  viewX: 0,
  viewY: 0,
  connectMode: false,
  connectOriginNodeId: null,
  selectedNodeId: null,
  selectedEdgeId: null
};

function setStatus(message) {
  statusMessage.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function worldToScreen(x, y) {
  return {
    x: (x - state.viewX) * state.zoom,
    y: (y - state.viewY) * state.zoom
  };
}

function screenToWorld(x, y) {
  return {
    x: state.viewX + x / state.zoom,
    y: state.viewY + y / state.zoom
  };
}

function updateGridBackground() {
  const gridSize = 26 * state.zoom;
  workspaceStage.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  workspaceStage.style.backgroundPosition = `${-state.viewX * state.zoom}px ${-state.viewY * state.zoom}px`;
}

function setZoom(nextZoom, focusClientX, focusClientY, persist = true) {
  const oldZoom = state.zoom;
  const newZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const rect = workspaceStage.getBoundingClientRect();

  const focusX = typeof focusClientX === 'number' ? focusClientX - rect.left : rect.width / 2;
  const focusY = typeof focusClientY === 'number' ? focusClientY - rect.top : rect.height / 2;

  const focusWorldX = state.viewX + focusX / oldZoom;
  const focusWorldY = state.viewY + focusY / oldZoom;

  state.zoom = newZoom;
  state.viewX = focusWorldX - focusX / state.zoom;
  state.viewY = focusWorldY - focusY / state.zoom;

  zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
  render();

  if (persist) {
    autosave();
  }
}

function createNode(x, y, text = 'New question or idea') {
  const id = `node-${state.nextNodeId}`;
  state.nextNodeId += 1;

  const node = {
    id,
    title: `Box ${id.replace('node-', '')}`,
    text,
    x,
    y,
    width: 260,
    height: 140
  };

  state.nodes.push(node);
  state.selectedNodeId = node.id;
  state.selectedEdgeId = null;
  render();
  autosave();
  setStatus('Added a new box. Drag any box by its body or header to move it.');
}

function duplicateNode(nodeId) {
  const sourceNode = state.nodes.find((node) => node.id === nodeId);
  if (!sourceNode) {
    setStatus('Could not find the box to duplicate.');
    return;
  }

  const id = `node-${state.nextNodeId}`;
  state.nextNodeId += 1;

  const duplicate = {
    id,
    title: `Box ${id.replace('node-', '')}`,
    text: sourceNode.text,
    x: sourceNode.x + 48,
    y: sourceNode.y + 48,
    width: sourceNode.width,
    height: sourceNode.height
  };

  state.nodes.push(duplicate);
  state.selectedNodeId = duplicate.id;
  state.selectedEdgeId = null;
  render();
  autosave();
  setStatus('Duplicated selected box.');
}

function createEdge(fromNodeId, toNodeId) {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
    return false;
  }

  const duplicate = state.edges.some((edge) => edge.from === fromNodeId && edge.to === toNodeId);
  if (duplicate) {
    return false;
  }

  const id = `edge-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  state.edges.push({ id, from: fromNodeId, to: toNodeId });
  state.selectedEdgeId = id;
  state.selectedNodeId = null;
  autosave();
  return true;
}

function removeConnectionBetween(nodeAId, nodeBId) {
  const before = state.edges.length;

  state.edges = state.edges.filter((edge) => {
    const forward = edge.from === nodeAId && edge.to === nodeBId;
    const reverse = edge.from === nodeBId && edge.to === nodeAId;
    return !(forward || reverse);
  });

  const removed = before - state.edges.length;
  if (removed > 0) {
    state.selectedEdgeId = null;
    autosave();
  }

  return removed;
}

function deleteSelected() {
  if (state.selectedNodeId) {
    const nodeId = state.selectedNodeId;
    state.nodes = state.nodes.filter((node) => node.id !== nodeId);
    state.edges = state.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
    state.selectedNodeId = null;

    if (state.connectOriginNodeId === nodeId) {
      state.connectOriginNodeId = null;
    }

    render();
    autosave();
    setStatus('Deleted selected box and related connections.');
    return;
  }

  if (state.selectedEdgeId) {
    state.edges = state.edges.filter((edge) => edge.id !== state.selectedEdgeId);
    state.selectedEdgeId = null;
    render();
    autosave();
    setStatus('Deleted selected connection.');
    return;
  }

  setStatus('Nothing selected to delete.');
}

function setConnectMode(isOn) {
  state.connectMode = isOn;
  connectModeButton.classList.toggle('is-active', isOn);
  connectModeButton.setAttribute('aria-pressed', String(isOn));
  connectModeButton.textContent = `Connect Mode: ${isOn ? 'On' : 'Off'}`;

  if (!isOn) {
    state.connectOriginNodeId = null;
    render();
  }

  setStatus(
    isOn
      ? 'Connect mode is on. Click one box, then another box to create or remove a connection.'
      : 'Connect mode is off. Drag to move boxes.'
  );
}

function getNodeCenter(node) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  };
}

function getNodeAnchor(node, side) {
  if (side === 'left') {
    return { x: node.x, y: node.y + node.height / 2 };
  }
  if (side === 'right') {
    return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
  if (side === 'top') {
    return { x: node.x + node.width / 2, y: node.y };
  }

  return { x: node.x + node.width / 2, y: node.y + node.height };
}

function buildPath(fromNode, toNode) {
  const fromCenter = getNodeCenter(fromNode);
  const toCenter = getNodeCenter(toNode);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const from = getNodeAnchor(fromNode, dx >= 0 ? 'right' : 'left');
    const to = getNodeAnchor(toNode, dx >= 0 ? 'left' : 'right');
    const spread = Math.max(90, Math.abs(dx) * 0.4);
    const c1x = from.x + (dx >= 0 ? spread : -spread);
    const c2x = to.x - (dx >= 0 ? spread : -spread);

    const pFrom = worldToScreen(from.x, from.y);
    const pTo = worldToScreen(to.x, to.y);
    const pC1 = worldToScreen(c1x, from.y);
    const pC2 = worldToScreen(c2x, to.y);

    return `M ${pFrom.x} ${pFrom.y} C ${pC1.x} ${pC1.y}, ${pC2.x} ${pC2.y}, ${pTo.x} ${pTo.y}`;
  }

  const from = getNodeAnchor(fromNode, dy >= 0 ? 'bottom' : 'top');
  const to = getNodeAnchor(toNode, dy >= 0 ? 'top' : 'bottom');
  const spread = Math.max(90, Math.abs(dy) * 0.38);
  const c1y = from.y + (dy >= 0 ? spread : -spread);
  const c2y = to.y - (dy >= 0 ? spread : -spread);

  const pFrom = worldToScreen(from.x, from.y);
  const pTo = worldToScreen(to.x, to.y);
  const pC1 = worldToScreen(from.x, c1y);
  const pC2 = worldToScreen(to.x, c2y);

  return `M ${pFrom.x} ${pFrom.y} C ${pC1.x} ${pC1.y}, ${pC2.x} ${pC2.y}, ${pTo.x} ${pTo.y}`;
}

function startDragNode(event, node) {
  const startX = event.clientX;
  const startY = event.clientY;
  const originX = node.x;
  const originY = node.y;

  document.body.classList.add('is-dragging');

  function onMouseMove(moveEvent) {
    const dx = (moveEvent.clientX - startX) / state.zoom;
    const dy = (moveEvent.clientY - startY) / state.zoom;
    node.x = originX + dx;
    node.y = originY + dy;
    render();
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    document.body.classList.remove('is-dragging');
    autosave();
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function handleConnectClick(nodeId) {
  if (!state.connectOriginNodeId) {
    state.connectOriginNodeId = nodeId;
    render();
    setStatus('Connection start selected. Click a second box.');
    return;
  }

  if (state.connectOriginNodeId === nodeId) {
    state.connectOriginNodeId = null;
    render();
    setStatus('Connection start cleared.');
    return;
  }

  const removed = removeConnectionBetween(state.connectOriginNodeId, nodeId);
  if (removed > 0) {
    state.connectOriginNodeId = null;
    render();
    setStatus('Connection removed between selected boxes.');
    return;
  }

  const created = createEdge(state.connectOriginNodeId, nodeId);
  state.connectOriginNodeId = null;
  render();
  setStatus(created ? 'Connection created.' : 'Connection could not be created.');
}

function syncNodeSizeFromElement(node, element) {
  node.width = clamp(element.offsetWidth, 190, 460);
  node.height = clamp(element.offsetHeight, 120, 420);
}

function createNodeElement(node) {
  const element = document.createElement('article');
  element.className = 'flow-node';
  element.dataset.nodeId = node.id;

  const screen = worldToScreen(node.x, node.y);
  element.style.left = '0px';
  element.style.top = '0px';
  element.style.width = `${node.width}px`;
  element.style.minHeight = `${node.height}px`;
  element.style.transformOrigin = 'top left';
  element.style.transform = `translate(${screen.x}px, ${screen.y}px) scale(${state.zoom})`;

  if (state.selectedNodeId === node.id) {
    element.classList.add('is-selected');
  }

  if (state.connectOriginNodeId === node.id) {
    element.classList.add('is-connect-origin');
  }

  element.innerHTML = `
    <div class="node-head">
      <span class="node-id">${node.title}</span>
      <span class="node-actions">
        <button class="mini-btn" type="button" data-action="duplicate-node">Duplicate</button>
        <button class="mini-btn" type="button" data-action="start-link">Link</button>
      </span>
    </div>
    <textarea class="node-text" spellcheck="false">${node.text}</textarea>
  `;

  const textArea = element.querySelector('.node-text');
  const duplicateButton = element.querySelector('[data-action="duplicate-node"]');
  const linkButton = element.querySelector('[data-action="start-link"]');

  element.addEventListener('mousedown', (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    state.selectedNodeId = node.id;
    state.selectedEdgeId = null;

    if (state.connectMode) {
      if (!event.target.closest('textarea') && !event.target.closest('button')) {
        event.preventDefault();
        handleConnectClick(node.id);
      }
      render();
      return;
    }

    if (!event.target.closest('textarea') && !event.target.closest('button')) {
      event.preventDefault();
      startDragNode(event, node);
    }

    render();
  });

  duplicateButton.addEventListener('click', (event) => {
    event.stopPropagation();
    duplicateNode(node.id);
  });

  duplicateButton.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  linkButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setConnectMode(true);
    handleConnectClick(node.id);
  });

  linkButton.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  textArea.addEventListener('input', () => {
    node.text = textArea.value;
    autosave();
  });

  textArea.addEventListener('blur', () => {
    syncNodeSizeFromElement(node, element);
    autosave();
    render();
  });

  textArea.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  return element;
}

function renderNodes() {
  nodeLayer.innerHTML = '';
  state.nodes.forEach((node) => {
    nodeLayer.appendChild(createNodeElement(node));
  });
}

function renderConnections() {
  const viewportRect = workspaceStage.getBoundingClientRect();
  const width = Math.max(1, Math.floor(viewportRect.width));
  const height = Math.max(1, Math.floor(viewportRect.height));

  connectionLayer.setAttribute('width', String(width));
  connectionLayer.setAttribute('height', String(height));
  connectionLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const defs = connectionLayer.querySelector('defs');
  connectionLayer.innerHTML = '';
  connectionLayer.appendChild(defs);

  state.edges.forEach((edge) => {
    const fromNode = state.nodes.find((node) => node.id === edge.from);
    const toNode = state.nodes.find((node) => node.id === edge.to);

    if (!fromNode || !toNode) {
      return;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', buildPath(fromNode, toNode));
    path.dataset.edgeId = edge.id;

    if (state.selectedEdgeId === edge.id) {
      path.classList.add('is-selected');
    }

    path.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      state.selectedEdgeId = edge.id;
      state.selectedNodeId = null;
      render();
      setStatus('Connection selected. Use Delete Selected to remove it.');
    });

    connectionLayer.appendChild(path);
  });
}

function render() {
  updateGridBackground();
  renderNodes();
  renderConnections();
}

function autosave() {
  const payload = {
    nodes: state.nodes,
    edges: state.edges,
    nextNodeId: state.nextNodeId,
    zoom: state.zoom,
    viewX: state.viewX,
    viewY: state.viewY
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function saveNow() {
  autosave();
  setStatus('Saved workspace layout to local storage.');
}

function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    setStatus('No saved layout found yet.');
    return false;
  }

  try {
    const payload = JSON.parse(raw);
    state.nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    state.edges = Array.isArray(payload.edges) ? payload.edges : [];
    state.nextNodeId = Number.isInteger(payload.nextNodeId) ? payload.nextNodeId : 1;
    state.zoom = typeof payload.zoom === 'number' ? clamp(payload.zoom, MIN_ZOOM, MAX_ZOOM) : 1;
    state.viewX = typeof payload.viewX === 'number' ? payload.viewX : 0;
    state.viewY = typeof payload.viewY === 'number' ? payload.viewY : 0;
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.connectOriginNodeId = null;
    zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
    render();
    setStatus('Loaded saved workspace layout.');
    return true;
  } catch (error) {
    setStatus('Saved layout was invalid and could not be loaded.');
    return false;
  }
}

function exportLayout() {
  const payload = {
    exportedAt: new Date().toISOString(),
    nodes: state.nodes,
    edges: state.edges,
    zoom: state.zoom,
    viewX: state.viewX,
    viewY: state.viewY
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'flow-workspace-layout.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus('Exported current workspace as JSON.');
}

function clearBoard() {
  const confirmed = window.confirm('Clear all boxes and connections from the workspace?');
  if (!confirmed) {
    return;
  }

  state.nodes = [];
  state.edges = [];
  state.nextNodeId = 1;
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.connectOriginNodeId = null;
  render();
  autosave();
  setStatus('Cleared workspace.');
}

function initializeWorkspace() {
  const loaded = loadFromStorage();
  if (loaded) {
    return;
  }

  createNode(180, 140, 'Start here: What is the first survey question?');
  createNode(700, 180, 'Answer path A');
  createNode(700, 420, 'Answer path B');
  createNode(700, 660, 'Answer path C');
  createEdge(state.nodes[0].id, state.nodes[1].id);
  createEdge(state.nodes[0].id, state.nodes[2].id);
  createEdge(state.nodes[0].id, state.nodes[3].id);
  autosave();
  setStatus('Created a starter map. Drag background to pan. Double-click to add boxes.');
}

workspaceStage.addEventListener('dblclick', (event) => {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }

  if (event.target.closest('.flow-node')) {
    return;
  }

  const rect = workspaceStage.getBoundingClientRect();
  const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
  createNode(world.x - 130, world.y - 70);
});

workspaceStage.addEventListener('mousedown', (event) => {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }

  if (event.target.closest('.flow-node') || event.target.closest('path')) {
    return;
  }

  event.preventDefault();

  state.selectedNodeId = null;
  state.selectedEdgeId = null;

  if (state.connectMode) {
    state.connectOriginNodeId = null;
  }

  render();

  const startX = event.clientX;
  const startY = event.clientY;
  const originViewX = state.viewX;
  const originViewY = state.viewY;

  workspaceStage.classList.add('is-panning');

  function onMouseMove(moveEvent) {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    state.viewX = originViewX - dx / state.zoom;
    state.viewY = originViewY - dy / state.zoom;
    render();
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    workspaceStage.classList.remove('is-panning');
    autosave();
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

addNodeButton.addEventListener('click', () => {
  const rect = workspaceStage.getBoundingClientRect();
  const world = screenToWorld(rect.width / 2, rect.height / 2);
  createNode(world.x - 130, world.y - 70);
});

connectModeButton.addEventListener('click', () => {
  setConnectMode(!state.connectMode);
});

deleteSelectedButton.addEventListener('click', deleteSelected);
clearBoardButton.addEventListener('click', clearBoard);
saveLayoutButton.addEventListener('click', saveNow);
loadLayoutButton.addEventListener('click', loadFromStorage);
exportLayoutButton.addEventListener('click', exportLayout);

zoomOutButton.addEventListener('click', () => {
  setZoom(state.zoom - 0.1);
  setStatus(`Zoom set to ${Math.round(state.zoom * 100)}%.`);
});

zoomResetButton.addEventListener('click', () => {
  setZoom(1);
  setStatus('Zoom reset to 100%.');
});

zoomInButton.addEventListener('click', () => {
  setZoom(state.zoom + 0.1);
  setStatus(`Zoom set to ${Math.round(state.zoom * 100)}%.`);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
      return;
    }

    event.preventDefault();
    deleteSelected();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveNow();
  }

  if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
    event.preventDefault();
    setZoom(state.zoom + 0.1);
    setStatus(`Zoom set to ${Math.round(state.zoom * 100)}%.`);
  }

  if ((event.ctrlKey || event.metaKey) && event.key === '-') {
    event.preventDefault();
    setZoom(state.zoom - 0.1);
    setStatus(`Zoom set to ${Math.round(state.zoom * 100)}%.`);
  }
});

initializeWorkspace();
zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
render();
