# 🧪 Water Sort Puzzle Solver

An interactive web application for building and solving Water Sort puzzles.

🚀 Try it live at [water-sort-puzzle-solver.elgoogudiab.com](https://water-sort-puzzle-solver.elgoogudiab.com/).

## ✨ Features

- 🎨 Interactive canvas editor for designing puzzles
- 🎯 Smart color palette with remaining piece tracking
- 🧠 Intelligent solver with step-by-step guidance
- 📊 Clickable solution visualization for each move
- 🎮 Multiple modes: Normal, No Combo, Queue (FIFO)
- 📱 Responsive dark theme across devices

## 🧩 Solving Puzzles
1. Choose a game mode and optional search depth
2. Click "Solve Puzzle" to generate a solution
3. Step through each move to watch the board evolve

## 🎮 Game Modes
- **Normal** – move groups of same-colored balls at once
- **No Combo** – move one ball at a time
- **Queue (FIFO)** – pour from the bottom instead of the top

## 🤝 Contributing
Pull requests are welcome! Open an issue or fork the repository to propose changes.

## 📄 License
MIT

## 📦 Progressive Web App (PWA)

This site now supports installation and basic offline use via a service worker.

- Install: In Chrome/Edge, open the site and use “Install app” from the address bar or menu.
- Offline: The app shell (index and static assets) is cached after first load. Subsequent navigations work offline; network is used when available.

Local testing
- Dev: `npm run dev` (service workers may be limited in dev).
- Production preview: `npm run build && npm run preview` then open the URL shown to test install/offline.
