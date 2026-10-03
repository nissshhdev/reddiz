# REDDIZ — Vision Dataset Builder & Reddit Annotator

A lightweight, zero-dependency annotation tool I built to pull image feeds directly from Reddit (including NSFW and multi-subreddit searches), crop them to 9:16 vertical preview framing, annotate them quickly, and export clean training datasets for computer vision models, LoRAs, and vision-language models.

I made this because manual dataset scraping, cropping, and repetitive labeling is usually tedious. REDDIZ streamlines the process with auto-propagating prompts, fast keyboard shortcuts, and built-in ZIP generation without needing external Python libraries or complex setup.

---

## What It Does

- **Multi-Subreddit Fetching**: Enter single or multiple subreddits separated by commas or spaces (e.g. `cats, streetphotography` or NSFW subreddits like `IndianInstaBaddies, Naughty_Navels`).
- **NSFW & Rate-Limit Handling**: Uses age-verification session headers and exponential backoff retry logic to bypass Reddit's aggressive 429 throttling and hotlink blocks.
- **9:16 Center Crop Viewport**: Automatically previews and crops images from the center into a modern 9:16 aspect ratio.
- **Vertical Gallery Strip**: A scrollable vertical carousel on the left that lets you flick through thumbnails with the up and down arrow keys.
- **Fast Annotation Flow**:
  - Prompt/caption and tags carry over to the next image automatically so you don't re-type identical tokens.
  - Bounding boxes start clean on each new image.
  - One-click `× CLEAR` buttons for caption text and bounding boxes.
  - `⊘ IGNORE` option (or hit `X` / `Delete`) to exclude bad or irrelevant images from the final export.
- **Direct Multi-Format Export**:
  - **YOLOv8 / YOLOv11**: Normalized `labels/*.txt`, `classes.txt`, and `data.yaml`.
  - **COCO JSON**: Industry-standard `coco_annotations.json`.
  - **Stable Diffusion / Flux / LoRA**: Individual `.txt` prompt files paired alongside each image.
  - **Vision-Language (VLM)**: `dataset.jsonl` formatted for multimodal fine-tuning.

---

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| **`↓` (Down Arrow)** / **`→`** / **`D`** | Next image |
| **`↑` (Up Arrow)** / **`←`** / **`A`** | Previous image |
| **`Enter`** | Save current annotation and advance |
| **`X`** or **`Delete`** | Ignore image and advance |
| **`Enter`** *(in tag input)* | Add tag token |

---

## Quick Setup

Make sure you have Node.js installed (v16+ recommended). No `npm install` needed—everything runs on native standard Node modules.

1. **Clone the repo:**
   ```bash
   git clone <your-repo-url>
   cd RedditDataTrainer
   ```

2. **Start the server:**
   ```bash
   node server.js
   ```

3. **Open the browser:**
   ```
   http://localhost:3000
   ```

Type any subreddit into the search bar at the top, select your sort preference (`NEW`, `HOT`, `TOP`), hit **FETCH MEDIA**, and start annotating.

---

## Project Structure

```
RedditDataTrainer/
├── server.js          # Native HTTP server, Reddit RSS parser, image proxy & ZIP packager
├── simple-zip.js      # Zero-dependency streaming Deflate ZIP generator (Node zlib)
├── gemini.js          # Google Gemini Vision integration
├── openai.js          # OpenAI GPT-4o Vision integration
├── claude.js          # Anthropic Claude 3.5 Sonnet Vision integration
├── groq.js            # Groq Llama 3.2 Vision integration
├── huggingface.js     # Hugging Face Inference API integration
├── vercel.json        # Vercel serverless deployment config
├── package.json       # Project manifest
├── README.md          # Project documentation
└── public/
    ├── index.html     # Editorial 3-column UI layout
    ├── app.css        # Modern typography & brutalist styling
    ├── app.js         # Canvas bounding boxes, state inheritance, and hotkeys
    └── favicon.svg    # App icon
```

---

## Exported Dataset Structure

When you click **DONE & DOWNLOAD ZIP**, your download includes:

```
reddit_dataset.zip
├── images/
│   ├── 0001_abc123.jpg
│   └── 0002_def456.png
├── labels/                # (YOLO format)
│   ├── 0001_abc123.txt
│   └── 0002_def456.txt
├── captions/              # (Stable Diffusion / LoRA txt files)
│   ├── 0001_abc123.txt
│   └── 0002_def456.txt
├── data.yaml              # YOLO configuration
├── classes.txt            # List of bounding box classes
├── dataset.jsonl          # Multimodal dataset
└── manifest.json          # Complete metadata log with source URLs
```

---

## Notes & Tips

- Ignored images are skipped automatically during export so they won't clutter your training folders.
- If Reddit returns a temporary 429 rate limit, the backend waits and retries automatically. Giving it a few seconds between heavy multi-subreddit fetches helps keep queries reliable.
