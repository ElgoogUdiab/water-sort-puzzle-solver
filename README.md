# 🧪 Water Sort Puzzle Solver

An interactive web application for creating and solving Water Sort puzzles with a visual editor and step-by-step solution visualization.

## ✨ Features

- **🎨 Interactive Canvas Editor**: Paint directly on the grid to create puzzles
- **🎯 Smart Color Palette**: Automatic color management with remaining piece tracking
- **🧠 Intelligent Solver**: TypeScript implementation matching the Python algorithm exactly
- **📊 Solution Visualization**: Click on solution steps to see board states
- **🎮 Multiple Game Modes**: Normal, No-combo, Queue (FIFO) modes
- **📱 Responsive Design**: Modern dark theme that works on all devices

## 🚀 Quick Start

### Using Vite (Recommended)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** to `http://localhost:3000`

### Using Python HTTP Server

```bash
npm run serve
# Opens http://localhost:8000/src/
```

## 🛠️ Development

### Project Structure

```
src/
├── index.html          # Main HTML file
├── css/
│   └── style.css       # All styles
└── ts/
    ├── app.ts          # Main application
    ├── game.ts         # Game logic (port of game.py)
    ├── solver.ts       # Solver algorithm (port of solver.py)
    ├── canvas-editor.ts # Canvas-based editor
    └── visualization.ts # Game visualization
```

### Available Scripts

- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run serve` - Start Python HTTP server

## 🎮 How to Use

### Creating Puzzles

1. **Adjust board size**: Set columns and height
2. **Select colors**: Click color swatches in the palette
3. **Paint**: Left-click to paint, right-click to erase
4. **Manage colors**: Each swatch shows remaining pieces
5. **Quick actions**: Use the Reset button

### Solving Puzzles

1. **Configure settings**: Choose game mode, undo count, search depth
2. **Solve**: Click "🚀 Solve Puzzle"
3. **View solution**: Click any step to see the board state
4. **Debug mode**: Enable for detailed search information

### Game Modes

- **Normal**: Move multiple balls of same color (combo moves)
- **No Combo**: Move only one ball at a time  
- **Queue (FIFO)**: Move balls from bottom instead of top

## 🎯 Color Palette

The application uses a carefully selected 12-color palette extracted from Excel:
- Orange, Red, Blue, Pink, Teal, Light Blue
- Gray, Purple, Green, Brown, Dark Green, Yellow

## 🔧 Technical Details

- **Pure TypeScript**: No external dependencies for game logic
- **ES6 Modules**: Modern modular architecture
- **Canvas Rendering**: Smooth 60fps painting experience
- **1:1 Python Port**: Identical algorithm to the original Python solver
- **Event-Driven**: Reactive UI updates
- **Branded Color Type**: Hex colors wrapped in a `Color` class for type safety

## 📝 Algorithm

The solver uses A* search with game-specific heuristics:
- **State representation**: Groups of colored balls with positions
- **Heuristic**: Minimize segments and maximize completed groups
- **Optimization**: Visited state caching and pruning

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - feel free to use in your own projects!

---

**Enjoy solving puzzles!** 🎉