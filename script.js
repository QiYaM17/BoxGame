// --- Game Configuration ---
const GRID_SIZE = 5;
const WINNING_SCORE = 500;
let selectedQueueIndex = null;
let selectedTileIndex = null;
let conn = null;

let myScore = 0;
let opponentScore = 0;
let isMyTurn = false;
let hasPlacedBlockThisTurn = false;
let isGameOver = false;

// Undo State Tracking
let lastPlacedInfo = null; // { index, block, queueIndex }

// Manual Tile Selection Claim Mode
let isClaimMode = false;
let selectedClaimIndices = [];

const boardState = Array(GRID_SIZE * GRID_SIZE).fill(null);
let nextQueue = [];

// Fewer, vibrant colors + Rainbow wildcard
const ALLOWED_COLORS = [
  { name: 'Red', code: '#ef4444' },
  { name: 'Blue', code: '#3b82f6' },
  { name: 'Green', code: '#22c55e' },
  { name: 'Yellow', code: '#eab308' }
];

// Web Audio API Sound Synthesizer
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;

  if (type === 'click') {
    osc.frequency.setValueAtTime(300, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'place') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.1);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.12);
  } else if (type === 'undo') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'claim') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'win') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(554.37, now + 0.1);
    osc.frequency.setValueAtTime(659.25, now + 0.2);
    osc.frequency.setValueAtTime(880, now + 0.3);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.start(now);
    osc.stop(now + 0.6);
  }
}

// Helper to normalize offset coordinates
function normalizeOffsets(offsets) {
  let minR = Math.min(...offsets.map(o => o.r));
  let minC = Math.min(...offsets.map(o => o.c));
  let normalized = offsets.map(o => ({ r: o.r - minR, c: o.c - minC }));
  normalized.sort((a, b) => a.r - b.r || a.c - b.c);
  return normalized;
}

// Helper to generate all unique rotations for any shape
function getRotations(baseOffsets) {
  let orientations = [];
  let current = baseOffsets;
  
  for (let i = 0; i < 4; i++) {
    current = current.map(o => ({ r: o.c, c: -o.r }));
    let norm = normalizeOffsets(current);
    
    if (!orientations.some(existing => JSON.stringify(existing) === JSON.stringify(norm))) {
      orientations.push(norm);
    }
  }
  return orientations;
}

// Raw Unique Base Shapes Pool
const RAW_SHAPES = [
  { id: 'sq2x2', base: [{r:0, c:0}, {r:0, c:1}, {r:1, c:0}, {r:1, c:1}], name: "2x2 Square" },
  { id: 'line3', base: [{r:0, c:0}, {r:0, c:1}, {r:0, c:2}], name: "Line of 3" },
  { id: 'lshape', base: [{r:0, c:0}, {r:1, c:0}, {r:1, c:1}], name: "L-Shape" },
  { id: 'diag3', base: [{r:0, c:0}, {r:1, c:1}, {r:2, c:2}], name: "Diagonal" },
  { id: 'tshape', base: [{r:0, c:0}, {r:0, c:1}, {r:0, c:2}, {r:1, c:1}], name: "T-Shape" }
];

const FEATURED_POOL = RAW_SHAPES.map(shape => ({
  id: shape.id,
  name: shape.name,
  previewOffsets: shape.base,
  orientations: getRotations(shape.base)
}));

let activeFeaturedShapes = [];

// Initialize Peer ID
function generateNumericId(length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
}

const peer = new Peer(generateNumericId(6));

peer.on('open', (id) => {
  document.getElementById('my-id').innerText = id;
});

// Pick 3 distinct random shape types from the pool
function randomizeFeaturedShapes() {
  const shuffled = [...FEATURED_POOL].sort(() => 0.5 - Math.random());
  activeFeaturedShapes = shuffled.slice(0, 3);
  renderFeaturedShapes();
}

// Random Block Generator (Points 1-10, 15% chance for Rainbow wildcard)
function createNewBlock() {
  const isRainbow = Math.random() < 0.15;
  const pointValue = Math.floor(Math.random() * 10) + 1;
  
  return {
    color: isRainbow ? 'rainbow' : ALLOWED_COLORS[Math.floor(Math.random() * ALLOWED_COLORS.length)].code,
    value: pointValue,
    isRainbow: isRainbow
  };
}

function initQueue() {
  nextQueue = [createNewBlock(), createNewBlock(), createNewBlock()];
  renderQueue();
}

// Render Main Shared 5x5 Grid
function createMainGrid() {
  const gridContainer = document.getElementById('grid');
  gridContainer.style.setProperty('--grid-size', GRID_SIZE);
  gridContainer.innerHTML = '';

  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const tile = document.createElement('div');
    tile.classList.add('tile');
    tile.dataset.index = i;

    if (boardState[i]) {
      const block = boardState[i];
      if (block.isRainbow) {
        tile.classList.add('rainbow-tile');
      } else {
        tile.style.backgroundColor = block.color;
      }
      tile.textContent = block.value;
    }

    // Highlight selected claim tiles in claim mode
    if (isClaimMode && selectedClaimIndices.includes(i)) {
      tile.classList.add('claim-selected');
    }

    tile.addEventListener('click', () => {
      if (isGameOver) return;
      
      // Prevent clicking or selecting tiles when it is not your turn
      if (!isMyTurn) {
        alert("Not your turn!");
        return;
      }

      playSound('click');

      // MODE 1: Manual Tile Selection for Pattern Claiming
      if (isClaimMode) {
        if (boardState[i] === null) {
          alert("Cannot select empty tiles for pattern claiming.");
          return;
        }
        const idxInList = selectedClaimIndices.indexOf(i);
        if (idxInList > -1) {
          selectedClaimIndices.splice(idxInList, 1);
        } else {
          selectedClaimIndices.push(i);
        }
        updateClaimVerifyBar();
        createMainGrid();
        return;
      }

      // MODE 2: Placing a new block during your turn (Max 1 block per turn)
      if (hasPlacedBlockThisTurn) {
        alert("You already placed 1 block this turn! You can undo, claim patterns, or End Turn.");
        return;
      }
      if (boardState[i] !== null) {
        alert("This tile is already occupied!");
        return;
      }
      if (selectedQueueIndex === null) {
        alert('Please select a block from your Next Blocks queue first!');
        return;
      }

      document.querySelectorAll('.main-grid .tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      selectedTileIndex = i;

      // Place block and record for undo
      const chosenBlock = nextQueue[selectedQueueIndex];
      boardState[selectedTileIndex] = chosenBlock;
      hasPlacedBlockThisTurn = true;

      lastPlacedInfo = {
        index: selectedTileIndex,
        block: chosenBlock,
        queueIndex: selectedQueueIndex
      };

      // Replenish queue immediately
      nextQueue.splice(selectedQueueIndex, 1);
      nextQueue.push(createNewBlock());

      selectedQueueIndex = null;
      selectedTileIndex = null;
      playSound('place');

      createMainGrid();
      renderQueue();
      document.getElementById('end-turn-btn').disabled = false;
      document.getElementById('undo-btn').disabled = false;
    });

    gridContainer.appendChild(tile);
  }
}

// Toggle Claim Mode on/off (Restricted to player's turn)
document.getElementById('toggle-claim-mode-btn').addEventListener('click', () => {
  if (isGameOver) return;
  
  if (!isMyTurn) {
    alert("You can only select and claim patterns during your turn!");
    return;
  }

  playSound('click');
  isClaimMode = !isClaimMode;
  selectedClaimIndices = [];

  const claimBtn = document.getElementById('toggle-claim-mode-btn');
  const verifyBar = document.getElementById('claim-verify-bar');

  if (isClaimMode) {
    claimBtn.innerText = "Cancel Pattern Mode";
    claimBtn.classList.add('active');
    verifyBar.classList.remove('hidden');
    document.getElementById('turn-banner').innerText = "Select Pattern: Tap the tiles on the board that form a featured shape.";
    document.getElementById('turn-banner').className = "turn-banner your-turn";
  } else {
    claimBtn.innerText = "Select Pattern";
    claimBtn.classList.remove('active');
    verifyBar.classList.add('hidden');
    updateTurnUI();
  }
  createMainGrid();
});

document.getElementById('cancel-claim-btn').addEventListener('click', () => {
  playSound('click');
  isClaimMode = false;
  selectedClaimIndices = [];
  document.getElementById('toggle-claim-mode-btn').innerText = "Select Pattern";
  document.getElementById('toggle-claim-mode-btn').classList.remove('active');
  document.getElementById('claim-verify-bar').classList.add('hidden');
  updateTurnUI();
  createMainGrid();
});

function updateClaimVerifyBar() {
  const count = selectedClaimIndices.length;
  document.getElementById('claim-status-text').innerText = `Selected ${count} tile(s)`;
}

// Verify Selected Tiles Against Active Featured Shapes
document.getElementById('verify-claim-btn').addEventListener('click', () => {
  if (!isMyTurn) {
    alert("Not your turn!");
    return;
  }

  if (selectedClaimIndices.length === 0) {
    alert("Please select tiles on the board first.");
    return;
  }

  // Convert selected indices into relative coordinate offsets
  let coords = selectedClaimIndices.map(idx => ({
    r: Math.floor(idx / GRID_SIZE),
    c: idx % GRID_SIZE,
    idx: idx,
    block: boardState[idx]
  }));

  let minR = Math.min(...coords.map(o => o.r));
  let minC = Math.min(...coords.map(o => o.c));
  let userOffsets = coords.map(o => ({ r: o.r - minR, c: o.c - minC }));
  userOffsets.sort((a, b) => a.r - b.r || a.c - b.c);

  let matchedShape = null;

  // Check if userOffsets match any active featured shape orientation
  for (let shape of activeFeaturedShapes) {
    for (let orientation of shape.orientations) {
      if (orientation.length !== userOffsets.length) continue;
      let matches = true;
      for (let i = 0; i < orientation.length; i++) {
        if (orientation[i].r !== userOffsets[i].r || orientation[i].c !== userOffsets[i].c) {
          matches = false;
          break;
        }
      }
      if (matches) {
        matchedShape = shape;
        break;
      }
    }
    if (matchedShape) break;
  }

  if (!matchedShape) {
    alert("Selected pattern does not match any active featured shape!");
    return;
  }

  // Validate color matching rules (respecting Rainbow wildcard)
  let blocks = coords.map(o => o.block);
  let baseColor = null;
  let isColorMatch = true;

  for (let block of blocks) {
    if (!block.isRainbow) {
      if (baseColor === null) {
        baseColor = block.color;
      } else if (baseColor !== block.color) {
        isColorMatch = false;
        break;
      }
    }
  }

  if (!isColorMatch) {
    alert("Color mismatch! Blocks must share the same color or use Rainbow wildcards.");
    return;
  }

  // Success! Calculate points: (Sum of block values) * count
  let sumValues = blocks.reduce((acc, b) => acc + b.value, 0);
  let pointsEarned = sumValues * blocks.length;

  myScore += pointsEarned;
  playSound('claim');

  // Clear tiles
  selectedClaimIndices.forEach(idx => {
    const tileEl = document.querySelector(`.main-grid .tile[data-index="${idx}"]`);
    if (tileEl) {
      tileEl.classList.add('clearing-animation');
    }
    boardState[idx] = null;
  });

  // Reset Claim Mode
  isClaimMode = false;
  selectedClaimIndices = [];
  document.getElementById('toggle-claim-mode-btn').innerText = "Select Pattern";
  document.getElementById('toggle-claim-mode-btn').classList.remove('active');
  document.getElementById('claim-verify-bar').classList.add('hidden');

  setTimeout(() => {
    createMainGrid();
    updateScoreboard();
    updateTurnUI();
  }, 400);

  if (conn && conn.open) {
    conn.send({
      type: 'PLAYER_CLAIM',
      senderScore: myScore,
      board: boardState
    });
  }
});

// Undo Placement Handler
document.getElementById('undo-btn').addEventListener('click', () => {
  if (!isMyTurn || !hasPlacedBlockThisTurn || !lastPlacedInfo || isGameOver) return;
  playSound('undo');

  // Remove block from board
  boardState[lastPlacedInfo.index] = null;

  // Put block back into queue at original index
  nextQueue.pop(); // remove newly generated random block
  nextQueue.splice(lastPlacedInfo.queueIndex, 0, lastPlacedInfo.block);

  hasPlacedBlockThisTurn = false;
  lastPlacedInfo = null;

  document.getElementById('end-turn-btn').disabled = true;
  document.getElementById('undo-btn').disabled = true;

  createMainGrid();
  renderQueue();
  updateTurnUI();
});

// Render 3 Distinct Featured Shapes in Left Panel
function renderFeaturedShapes() {
  const container = document.getElementById('featured-shapes-container');
  container.innerHTML = '';

  activeFeaturedShapes.forEach(shape => {
    const box = document.createElement('div');
    box.classList.add('shape-preview-box');
    
    const title = document.createElement('div');
    title.classList.add('shape-title');
    title.innerText = shape.name;
    box.appendChild(title);

    const miniGrid = document.createElement('div');
    miniGrid.classList.add('mini-grid');
    miniGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const miniTile = document.createElement('div');
        miniTile.classList.add('mini-tile');
        
        const belongs = shape.previewOffsets.some(o => o.r === r && o.c === c);
        if (belongs) {
          miniTile.style.backgroundColor = '#4f46e5';
        }
        miniGrid.appendChild(miniTile);
      }
    }
    box.appendChild(miniGrid);
    container.appendChild(box);
  });
}

// Render Next 3 Blocks Queue
function renderQueue() {
  const queueContainer = document.getElementById('next-queue');
  queueContainer.innerHTML = '';

  nextQueue.forEach((block, index) => {
    const blockEl = document.createElement('div');
    blockEl.classList.add('queue-block');
    if (selectedQueueIndex === index) {
      blockEl.classList.add('selected');
    }
    
    if (block.isRainbow) {
      blockEl.classList.add('rainbow-tile');
    } else {
      blockEl.style.backgroundColor = block.color;
    }

    blockEl.innerHTML = `<span class="queue-code">${block.value} pts</span><span class="queue-label">#${index + 1}</span>`;

    blockEl.addEventListener('click', () => {
      if (isGameOver || !isMyTurn) return;
      if (hasPlacedBlockThisTurn) {
        alert("You already placed your block this turn! Undo first if you want to switch blocks.");
        return;
      }
      playSound('click');
      selectedQueueIndex = index;
      renderQueue();
    });

    queueContainer.appendChild(blockEl);
  });
}

// Render Opponent's Queue Preview
function renderOpponentQueue(queueData) {
  const previewContainer = document.getElementById('opponent-queue-preview');
  if (!previewContainer || !queueData) return;
  previewContainer.innerHTML = '';

  queueData.forEach(block => {
    const miniEl = document.createElement('div');
    miniEl.classList.add('mini-queue-item');
    if (block.isRainbow) {
      miniEl.classList.add('rainbow-tile');
      miniEl.innerText = block.value;
    } else {
      miniEl.style.backgroundColor = block.color;
      miniEl.innerText = block.value;
    }
    previewContainer.appendChild(miniEl);
  });
}

function updateScoreboard() {
  document.getElementById('my-score').innerText = myScore;
  document.getElementById('opponent-score').innerText = opponentScore;

  if (!isGameOver) {
    if (myScore >= WINNING_SCORE) {
      triggerGameOver("You Won the Match!");
    } else if (opponentScore >= WINNING_SCORE) {
      triggerGameOver("Opponent Won the Match!");
    }
  }
}

function triggerGameOver(message) {
  isGameOver = true;
  playSound('win');
  document.getElementById('game-over-title').innerText = message;
  document.getElementById('game-over-desc').innerText = `Final Score — You: ${myScore} | Opponent: ${opponentScore}`;
  document.getElementById('game-over-modal').classList.remove('hidden');
  document.getElementById('end-turn-btn').disabled = true;
  document.getElementById('undo-btn').disabled = true;
}

function updateTurnUI() {
  if (isGameOver) return;
  const banner = document.getElementById('turn-banner');
  if (isMyTurn) {
    banner.innerText = "Your Turn! Place 1 block or claim patterns.";
    banner.className = "turn-banner your-turn";
  } else {
    banner.innerText = "Opponent's Turn... Please wait.";
    banner.className = "turn-banner opponent-turn";
    // Force exit claim mode if active when turn ends
    if (isClaimMode) {
      isClaimMode = false;
      selectedClaimIndices = [];
      document.getElementById('toggle-claim-mode-btn').innerText = "Select Pattern";
      document.getElementById('toggle-claim-mode-btn').classList.remove('active');
      document.getElementById('claim-verify-bar').classList.add('hidden');
    }
  }
}

// End Turn Handler
document.getElementById('end-turn-btn').addEventListener('click', () => {
  if (isGameOver || !isMyTurn) return;
  playSound('click');

  hasPlacedBlockThisTurn = false;
  lastPlacedInfo = null;
  selectedQueueIndex = null;
  selectedTileIndex = null;
  isClaimMode = false;
  selectedClaimIndices = [];

  document.getElementById('end-turn-btn').disabled = true;
  document.getElementById('undo-btn').disabled = true;
  document.getElementById('claim-verify-bar').classList.add('hidden');
  document.getElementById('toggle-claim-mode-btn').innerText = "Select Pattern";
  document.getElementById('toggle-claim-mode-btn').classList.remove('active');

  isMyTurn = false;
  updateMainGame();

  if (conn && conn.open) {
    conn.send({
      type: 'PLAYER_MOVE',
      senderScore: myScore,
      board: boardState,
      queue: nextQueue
    });
  }
});

function updateMainGame() {
  createMainGrid();
  renderQueue();
  renderFeaturedShapes();
  updateScoreboard();
  updateTurnUI();
}

// PeerJS Connection Management
peer.on('connection', (incomingConn) => {
  conn = incomingConn;
  isMyTurn = true;
  randomizeFeaturedShapes();
  
  conn.on('open', () => {
    conn.send({
      type: 'INIT_GAME',
      shapes: activeFeaturedShapes,
      queue: nextQueue
    });
    document.getElementById('status').innerText = 'Connected to Peer!';
    updateMainGame();
  });

  setupConnectionListeners();
});

document.getElementById('connect-btn').addEventListener('click', () => {
  const targetId = document.getElementById('peer-id-input').value;
  if (targetId) {
    conn = peer.connect(targetId);
    isMyTurn = false;
    setupConnectionListeners();
  }
});

function setupConnectionListeners() {
  conn.on('open', () => {
    document.getElementById('status').innerText = 'Connected to Peer!';
    conn.send({
      type: 'SYNC_QUEUE',
      queue: nextQueue
    });
    updateMainGame();
  });

  conn.on('data', (data) => {
    if (data.type === 'INIT_GAME') {
      activeFeaturedShapes = data.shapes;
      renderFeaturedShapes();
      if (data.queue) renderOpponentQueue(data.queue);
    } else if (data.type === 'SYNC_QUEUE') {
      if (data.queue) renderOpponentQueue(data.queue);
    } else if (data.type === 'PLAYER_MOVE') {
      boardState.splice(0, boardState.length, ...data.board);
      opponentScore = data.senderScore;
      if (data.queue) renderOpponentQueue(data.queue);
      
      updateScoreboard();
      if (!isGameOver) {
        isMyTurn = true;
        hasPlacedBlockThisTurn = false;
        lastPlacedInfo = null;
        updateMainGame();
      }
    } else if (data.type === 'PLAYER_CLAIM') {
      boardState.splice(0, boardState.length, ...data.board);
      opponentScore = data.senderScore;
      updateMainGame();
    }
  });

  conn.on('close', () => {
    document.getElementById('status').innerText = 'Connection closed.';
    alert('Opponent disconnected.');
  });
}

// Initial Boot
randomizeFeaturedShapes();
initQueue();
createMainGrid();
updateTurnUI();