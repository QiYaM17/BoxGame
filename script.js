// --- Game Configuration ---
const GRID_SIZE = 5;
const WINNING_SCORE = 500;
let selectedQueueIndex = null;
let selectedTileIndex = null;
let conn = null;

let myScore = 0;
let opponentScore = 0;
let isMyTurn = false; // Host starts first
let isGameOver = false;

const boardState = Array(GRID_SIZE * GRID_SIZE).fill(null);
let nextQueue = [];
let pendingMatches = []; 

// Fewer, vibrant colors + Rainbow wildcard
const ALLOWED_COLORS = [
  { name: 'Red', code: '#ef4444' },
  { name: 'Blue', code: '#3b82f6' },
  { name: 'Green', code: '#22c55e' },
  { name: 'Yellow', code: '#eab308' }
];

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

    tile.addEventListener('click', () => {
      if (isGameOver) return;
      if (!isMyTurn) {
        alert("Not your turn!");
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

      document.getElementById('submit-turn-btn').disabled = false;
    });

    gridContainer.appendChild(tile);
  }
}

// Render 3 Distinct Featured Shapes in Left Panel using a uniform 3x3 grid
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

// Detect completed featured shapes that include the newly placed block index
function detectCompletedShapes(placedIndex) {
  let foundMatches = [];
  let claimedIndices = new Set();

  activeFeaturedShapes.forEach(shape => {
    shape.orientations.forEach(offsets => {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          let validFit = true;
          let shapeBlocks = [];
          let shapeIndices = [];

          for (let offset of offsets) {
            let tr = r + offset.r;
            let tc = c + offset.c;
            if (tr >= GRID_SIZE || tc >= GRID_SIZE) {
              validFit = false;
              break;
            }
            let idx = tr * GRID_SIZE + tc;
            if (boardState[idx] === null || claimedIndices.has(idx)) {
              validFit = false;
              break;
            }
            shapeBlocks.push(boardState[idx]);
            shapeIndices.push(idx);
          }

          if (validFit && shapeBlocks.length === offsets.length && shapeIndices.includes(placedIndex)) {
            let baseColor = null;
            let isMatch = true;

            for (let block of shapeBlocks) {
              if (!block.isRainbow) {
                if (baseColor === null) {
                  baseColor = block.color;
                } else if (baseColor !== block.color) {
                  isMatch = false;
                  break;
                }
              }
            }

            if (isMatch) {
              let sumValues = shapeBlocks.reduce((acc, b) => acc + b.value, 0);
              let points = sumValues * shapeBlocks.length;
              
              foundMatches.push({
                shapeName: shape.name,
                points: points,
                indices: shapeIndices
              });

              shapeIndices.forEach(idx => claimedIndices.add(idx));
            }
          }
        }
      }
    });
  });

  return foundMatches;
}

function updateScoreboard() {
  document.getElementById('my-score').innerText = myScore;
  document.getElementById('opponent-score').innerText = opponentScore;

  // Check Win Condition (First to 500)
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
  document.getElementById('game-over-title').innerText = message;
  document.getElementById('game-over-desc').innerText = `Final Score — You: ${myScore} | Opponent: ${opponentScore}`;
  document.getElementById('game-over-modal').classList.remove('hidden');
  document.getElementById('submit-turn-btn').disabled = true;
}

function updateTurnUI() {
  if (isGameOver) return;
  const banner = document.getElementById('turn-banner');
  if (isMyTurn) {
    banner.innerText = "Your Turn! Place a block.";
    banner.className = "turn-banner your-turn";
  } else {
    banner.innerText = "Opponent's Turn... Please wait.";
    banner.className = "turn-banner opponent-turn";
  }
}

// Complete turn and send update to peer
function finalizeTurn() {
  selectedQueueIndex = null;
  selectedTileIndex = null;
  document.getElementById('submit-turn-btn').disabled = true;

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
}

// Submit Turn Handler
document.getElementById('submit-turn-btn').addEventListener('click', () => {
  if (isGameOver || !isMyTurn || selectedQueueIndex === null || selectedTileIndex === null) return;

  const chosenBlock = nextQueue[selectedQueueIndex];
  const targetIndex = selectedTileIndex;
  boardState[targetIndex] = chosenBlock;

  // Replenish queue
  nextQueue.splice(selectedQueueIndex, 1);
  nextQueue.push(createNewBlock());

  // Check if pattern completed using final placed block
  pendingMatches = detectCompletedShapes(targetIndex);

  if (pendingMatches.length > 0) {
    showActivationModal(pendingMatches);
  } else {
    finalizeTurn();
  }
});

// Show Pattern Activation Modal
function showActivationModal(matches) {
  const modal = document.getElementById('activation-modal');
  const listContainer = document.getElementById('detected-patterns-list');
  listContainer.innerHTML = '';

  let totalPoints = 0;
  matches.forEach(m => {
    totalPoints += m.points;
    const item = document.createElement('div');
    item.classList.add('detected-item');
    item.innerHTML = `<span>✨ <strong>${m.shapeName}</strong></span><span class="badge-pts">+${m.points} pts</span>`;
    listContainer.appendChild(item);
  });

  document.getElementById('activation-desc').innerText = `You completed ${matches.length} pattern(s) with your placement, worth ${totalPoints} total points! Choose whether to collect points and clear blocks, or keep blocks on the board.`;
  modal.classList.remove('hidden');
}

// Handle "Collect Points & Clear"
document.getElementById('collect-btn').addEventListener('click', () => {
  let earnedPoints = 0;
  let allIndicesToClear = new Set();

  pendingMatches.forEach(m => {
    earnedPoints += m.points;
    m.indices.forEach(idx => allIndicesToClear.add(idx));
  });

  myScore += earnedPoints;

  allIndicesToClear.forEach(idx => {
    const tileEl = document.querySelector(`.main-grid .tile[data-index="${idx}"]`);
    if (tileEl) {
      tileEl.classList.add('clearing-animation');
    }
    boardState[idx] = null;
  });

  setTimeout(() => {
    document.getElementById('activation-modal').classList.add('hidden');
    createMainGrid();
    updateScoreboard();
    if (!isGameOver) {
      finalizeTurn();
    }
  }, 400);
});

// Handle "Keep Blocks (Skip)"
document.getElementById('keep-btn').addEventListener('click', () => {
  document.getElementById('activation-modal').classList.add('hidden');
  updateScoreboard();
  if (!isGameOver) {
    finalizeTurn();
  }
});

function updateMainGame() {
  createMainGrid();
  renderQueue();
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
        updateMainGame();
      }
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