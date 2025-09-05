# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Water Sort Puzzle Solver is a dual-platform application with both web-based TypeScript and Python prototype implementations for building and solving Water Sort puzzles.

## Development Commands

**Web Application (TypeScript/Vite):**
- `npm run dev` - Start development server
- `npm run build` - Build for production (runs TypeScript compiler then Vite build)  
- `npm run preview` - Preview production build locally
- `npm run type-check` - Run TypeScript type checking without emitting files
- `npm run serve` - Simple HTTP server using Python (port 8000)
- `npm run json_input_test <puzzle.json>` - TypeScript CLI solver (equivalent to Python json_identifier.py)

**Python Prototype:**
- No specific build system - run individual Python files directly
- Main entry point: `cd python_prototype && python json_identifier.py input.json`

**Comparing Implementations:**
- Both implementations can process the same JSON puzzle files
- Example: `npm run json_input_test python_prototype/input.json` vs `cd python_prototype && python json_identifier.py input.json`

## Architecture

### Web Application Structure
The TypeScript application follows a modular architecture:

- `src/ts/app.ts` - Main application entry point and UI controller
- `src/ts/types.ts` - Core type definitions (NodeType, GameMode, Color, GameState)
- `src/ts/game.ts` - Game logic and state management
- `src/ts/solver.ts` - Puzzle solving algorithms
- `src/ts/canvas-editor.ts` - Interactive puzzle editor
- `src/ts/visualization.ts` - Game state and solution visualization

### Python Prototype Structure
The Python implementation serves as the reference solver:

- `python_prototype/game.py` - Core game classes (GameNode, GameOperation, Game)
- `python_prototype/solver.py` - Search algorithms with priority queue and heuristics
- `python_prototype/solver_runner.py` - Main solver execution
- `python_prototype/json_identifier.py` - JSON puzzle format handling
- `python_prototype/excel_identifier.py` - Excel puzzle format support

### Game Logic Architecture
Both implementations share similar core concepts:

- **GameNode**: Represents individual puzzle pieces with types (UNKNOWN, KNOWN, EMPTY)
- **Game**: Manages game state, operations, and win conditions
- **SearchState**: Wraps game states for pathfinding with heuristics
- **Game Modes**: Normal (group moves), No Combo (single ball), Queue (FIFO pouring)
- **Unknown Node Handling**: Special logic for puzzles with hidden/unknown pieces

### PWA Support
The web application includes Progressive Web App features:
- Service worker registration in app.ts:286-292
- Offline caching for static assets
- Installable as native app

## Key Implementation Notes

- The TypeScript implementation is a port of the Python prototype
- Both use priority queue-based search with custom heuristics
- Canvas editor allows interactive puzzle creation and editing
- Solution visualization provides step-by-step move playback
- JSON format used for puzzle import/export between implementations
- For any algorithm upgrade and optimization, first do it in python prototype, and after further testing by the user, port it to ts implementation.
