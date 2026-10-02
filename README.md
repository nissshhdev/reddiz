# Reddit Vision Annotator & AI Dataset Builder

A web-based annotation suite designed to source raw image datasets from Reddit communities, annotate them with bounding boxes, tags, and descriptive captions, and instantly export them into production-ready datasets for AI model training.

---

## ✨ Features

- **Subreddit Scraper**: Live-fetches media posts from any public subreddit with sorting (`hot`, `new`, `top`).
- **Annotation Inheritance**: Seamlessly propagates previous image annotations (captions, tags, and bounding box setups) to the next image to streamline repetitive dataset creation.
- **Canvas Bounding Boxes**: Click & drag to draw normalized object detection bounding boxes with multi-class tags.
- **Instant Model-Ready ZIP Export**:
  - **YOLOv8 / YOLOv11**: `labels/*.txt`, `data.yaml`, `classes.txt`.
  - **COCO Format**: `annotations/coco_annotations.json`.
  - **Diffusion / LoRA**: Individual `.txt` prompt captions per image.
  - **Vision-Language**: `dataset.jsonl` for LLaVA / BLIP fine-tuning.
  - **Master Manifest**: `manifest.json` indexing all metadata and original source URLs.
- **Zero-Dependency Core**: Runs directly on Node.js using built-in standard modules and a pure streaming ZIP generator.

---

## 🚀 Quick Start

1. Start the server:
   ```bash
   node server.js
   ```
2. Open your browser:
   ```
   http://localhost:3000
   ```

---

## 📁 Project Structure

```
reddit-annotator/
├── server.js            # Node HTTP server, Reddit scraper, image proxy & export API
├── simple-zip.js        # Pure zero-dependency Deflate ZIP compression library
├── package.json         # Project manifest
├── .gitignore           # Git ignore patterns
└── public/              # Static frontend assets
    ├── index.html       # Application UI structure & modals
    ├── app.css          # Glassmorphism dark-mode design system
    └── app.js           # Client canvas drawing, state manager & inheritance logic
```

---

## ⌨️ Shortcuts

- <kbd>Enter</kbd>: Save & Next image
- <kbd>←</kbd> or <kbd>A</kbd>: Previous image
- <kbd>→</kbd> or <kbd>D</kbd>: Next image
