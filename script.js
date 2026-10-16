// --- Game Configuration ---
const GRID_SIZE = 5;
let selectedQueueIndex = null;
let selectedTileIndex = null;
let conn = null;

let myScore = 0;
let opponentScore = 0;
let isMyTurn = false; // Host starts first

const boardState = Array(GRID_SIZE * GRID_SIZE).fill(null);
let nextQueue = [];

// Fewer, vibrant colors + Rainbow wildcard
const ALLOWED_COLORS = [
  { name: 'Red', code: '#ef4444' },
  { name: 'Blue', code: '#3b82f6' },
  { name: 'Green', code: '#22c55e' },
  { name: 'Yellow', code: '#eab308' }
];

// Pool of possible featured shapes
const ALL_POSSIBLE_SHAPES = [
  { id: 'sq2x2', offsets: [{r:0, c:0}, {r:0, c:1}, {r:1, c:0}, {r:1, c:1}], name: "2x2 Square" },
  { id: 'lineH3', offsets: [{r:0, c:0}, {r:0, c:1}, {r:0, c:2}], name: "Horizontal Line (3)" },
  { id: 'lineV3', offsets: [{r:0, c:0}, {r:1, c:0}, {r:2, c:0}], name: "Vertical Line (3)" },
  { id: 'lshape', offsets: [{r:0, c:0}, {r:1, c:0}, {r:1, c:1}], name: "L-Shape" },
  { id: 'diag3', offsets: [{r:0, c:0}, {r:1, c:1}, {r:2, c:2}], name: "Diagonal (3)" }
];

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

// Pick 3 random shapes from the pool
function randomizeFeaturedShapes() {
  const shuffled = [...ALL_POSSIBLE_SHAPES].sort(() => 0.5 - Math.random());
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

// Render 3 Featured Shapes in Left Panel
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
        
        const belongs = shape.offsets.some(o => o.r === r && o.c === c);
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
      if (!isMyTurn) return;
      selectedQueueIndex = index;
      renderQueue();
    });

    queueContainer.appendChild(blockEl);
  });
}

// Check for completed featured shapes, compute score, and animate clearing matched tiles
function checkAndClearShapes() {
  let scoredThisCheck = 0;
  let clearedIndices = new Set();

  activeFeaturedShapes.forEach(shape => {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        let validFit = true;
        let shapeBlocks = [];
        let shapeIndices = [];

        for (let offset of shape.offsets) {
          let tr = r + offset.r;
          let tc = c + offset.c;
          if (tr >= GRID_SIZE || tc >= GRID_SIZE) {
            validFit = false;
            break;
          }
          let idx = tr * GRID_SIZE + tc;
          let tile = boardState[idx];
          if (!tile) {
            validFit = false;
            break;
          }
          shapeBlocks.push(tile);
          shapeIndices.push(idx);
        }

        if (validFit && shapeBlocks.length === shape.offsets.length) {
          if (shapeIndices.some(idx => clearedIndices.has(idx))) continue;

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
            scoredThisCheck += sumValues * shapeBlocks.length;
            
            shapeIndices.forEach(idx => clearedIndices.add(idx));
          }
        }
      }
    }
  });

  if (clearedIndices.size > 0) {
    clearedIndices.forEach(idx => {
      const tileEl = document.querySelector(`.main-grid .tile[data-index="${idx}"]`);
      if (tileEl) {
        tileEl.classList.add('clearing-animation');
      }
      boardState[idx] = null;
    });

    setTimeout(() => {
      createMainGrid();
    }, 400);
  }

  return scoredThisCheck;
}

function updateScoreboard() {
  document.getElementById('my-score').innerText = myScore;
  document.getElementById('opponent-score').innerText = opponentScore;
}

function updateTurnUI() {
  const banner = document.getElementById('turn-banner');
  if (isMyTurn) {
    banner.innerText = "Your Turn! Place a block.";
    banner.className = "turn-banner your-turn";
  } else {
    banner.innerText = "Opponent's Turn... Please wait.";
    banner.className = "turn-banner opponent-turn";
  }
}

// Submit Turn Handler
document.getElementById('submit-turn-btn').addEventListener('click', () => {
  if (!isMyTurn || selectedQueueIndex === null || selectedTileIndex === null) return;

  const chosenBlock = nextQueue[selectedQueueIndex];
  const targetIndex = selectedTileIndex;

  boardState[targetIndex] = chosenBlock;

  // Check if placement completes any featured shapes and award points locally
  const pointsEarned = checkAndClearShapes();
  myScore += pointsEarned;

  // Replenish queue
  nextQueue.splice(selectedQueueIndex, 1);
  nextQueue.push(createNewBlock());

  selectedQueueIndex = null;
  selectedTileIndex = null;
  document.getElementById('submit-turn-btn').disabled = true;

  isMyTurn = false;
  updateMainGame();

  // Transmit move & current score to peer
  if (conn && conn.open) {
    conn.send({
      type: 'PLAYER_MOVE',
      index: targetIndex,
      block: chosenBlock,
      senderScore: myScore,
      board: boardState
    });
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
  isMyTurn = true; // Host goes first
  randomizeFeaturedShapes();
  
  // Send initial random shapes to guest
  conn.on('open', () => {
    conn.send({
      type: 'INIT_GAME',
      shapes: activeFeaturedShapes
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
    isMyTurn = false; // Guest goes second
    setupConnectionListeners();
  }
});

function setupConnectionListeners() {
  conn.on('open', () => {
    document.getElementById('status').innerText = 'Connected to Peer!';
    updateMainGame();
  });

  conn.on('data', (data) => {
    if (data.type === 'INIT_GAME') {
      activeFeaturedShapes = data.shapes;
      renderFeaturedShapes();
    } else if (data.type === 'PLAYER_MOVE') {
      boardState[data.index] = data.block;
      
      // Also check shapes on board from opponent's view just in case, and update opponent's score
      checkAndClearShapes();
      opponentScore = data.senderScore;
      
      isMyTurn = true;
      updateMainGame();
    }
  });

  conn.on('close', () => {
    document.getElementById('status').innerText = 'Connection closed.';
    alert('Opponent disconnected.');
  });
}

// Initial Boot (Host will randomize on connection, Guest receives via INIT_GAME)
randomizeFeaturedShapes();
initQueue();
createMainGrid();
updateTurnUI();