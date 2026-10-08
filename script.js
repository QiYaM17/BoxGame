// --- Grid Configuration ---
const GRID_SIZE = 5; // Changes to 5x5 (25 tiles total)
let selectedTileIndex = null;
let conn = null;

// Initialize Peer with random numeric ID
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

// Render the N x N Grid
function createGrid(size) {
  const gridContainer = document.getElementById('grid');
  gridContainer.style.setProperty('--grid-size', size);
  gridContainer.innerHTML = '';

  const totalTiles = size * size;
  for (let i = 0; i < totalTiles; i++) {
    const tile = document.createElement('div');
    tile.classList.add('tile');
    tile.dataset.index = i+1;

    // Click handler for selecting a tile
    tile.addEventListener('click', () => {
      document.querySelectorAll('.tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      selectedTileIndex = i;
    });

    gridContainer.appendChild(tile);
  }
}

// Predefined palette of allowed colors
const ALLOWED_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899'  // Pink
];

// Helper function to select a random color from the predefined list
function getRandomColor() {
  const randomIndex = Math.floor(Math.random() * ALLOWED_COLORS.length);
  return ALLOWED_COLORS[randomIndex];
}

function generateTileCode() {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
}

// Update a tile's data locally
function updateTileData(index, color, code) {
  const tiles = document.querySelectorAll('.tile');
  if (tiles[index]) {
    tiles[index].style.backgroundColor = color;
    tiles[index].textContent = code;
  }
}

// Handle Connections
peer.on('connection', (incomingConn) => {
  conn = incomingConn;
  setupConnection();
});

document.getElementById('connect-btn').addEventListener('click', () => {
  const targetId = document.getElementById('peer-id-input').value;
  if (targetId) {
    conn = peer.connect(targetId);
    setupConnection();
  }
});

function setupConnection() {
  conn.on('open', () => {
    document.getElementById('status').innerText = 'Status: Connected to peer!';
    document.getElementById('send-btn').disabled = false;
  });

  // Receive color updates from the remote peer
  conn.on('data', (data) => {
    if (data.type === 'TILE_UPDATE') {
      updateTileData(data.index, data.color, data.code);
    }
  });

  conn.on('close', () => {
    document.getElementById('status').innerText = 'Status: Connection closed.';
    document.getElementById('send-btn').disabled = true;
  });
}

// Send selected tile update to remote peer
document.getElementById('send-btn').addEventListener('click', () => {
  if (selectedTileIndex === null) {
    alert('Please click on a tile first!');
    return;
  }

  const randomColor = getRandomColor();
  const tileCode = generateTileCode();

  updateTileData(selectedTileIndex, randomColor, tileCode);

  // Transmit update to remote peer
  if (conn && conn.open) {
    conn.send({
      type: 'TILE_UPDATE',
      index: selectedTileIndex,
      color: randomColor,
      code: tileCode
    });
  }
});

// Build grid on launch
createGrid(GRID_SIZE);