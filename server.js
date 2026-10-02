const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const SimpleZip = require('./simple-zip');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Helper to decode XML entities
function decodeXml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

// Fetch RSS feed from Reddit
function fetchRedditRss(subreddit, sort = 'hot', limit = 50) {
  return new Promise((resolve, reject) => {
    // Sanitize subreddit name
    const cleanSub = subreddit.replace(/^r\//, '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!cleanSub) {
      return reject(new Error('Invalid subreddit name'));
    }

    let sortPath = '';
    if (sort === 'new') sortPath = '/new';
    else if (sort === 'top') sortPath = '/top';
    else if (sort === 'rising') sortPath = '/rising';

    const feedUrl = `https://www.reddit.com/r/${cleanSub}${sortPath}.rss?limit=${limit}`;
    const req = https.get(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      }
    }, res => {
      if (res.statusCode >= 400) {
        return reject(new Error(`Reddit returned HTTP ${res.statusCode}. Subreddit may be private, banned, or restricted.`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ data, subreddit: cleanSub }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Request to Reddit timed out'));
    });
  });
}

// Extract images from RSS XML
function parseRssImages(xml, subreddit) {
  const entries = xml.split('<entry>').slice(1);
  const items = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const contentMatch = entry.match(/<content type="html">([\s\S]*?)<\/content>/);
    const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
    const authorMatch = entry.match(/<author><name>([\s\S]*?)<\/name>/);
    const updatedMatch = entry.match(/<updated>([\s\S]*?)<\/updated>/);

    const title = titleMatch ? decodeXml(titleMatch[1].trim()) : `Item ${i + 1}`;
    const content = contentMatch ? contentMatch[1] : '';
    const id = idMatch ? idMatch[1].trim() : `item_${i}`;
    const author = authorMatch ? authorMatch[1].trim() : '';
    const updated = updatedMatch ? updatedMatch[1].trim() : new Date().toISOString();

    // Look for i.redd.it, preview.redd.it, i.imgur.com images
    let imgUrl = null;

    // Pattern 1: standard href/src in HTML
    const patterns = [
      /href="([^"]*?(?:i\.redd\.it|preview\.redd\.it|i\.imgur\.com)[^"]*?)"/i,
      /src="([^"]*?(?:i\.redd\.it|preview\.redd\.it|i\.imgur\.com)[^"]*?)"/i,
      /href=&quot;([^&]*?(?:i\.redd\.it|preview\.redd\.it|i\.imgur\.com)[^&]*?)&quot;/i,
      /src=&quot;([^&]*?(?:i\.redd\.it|preview\.redd\.it|i\.imgur\.com)[^&]*?)&quot;/i,
      /(https:\/\/i\.redd\.it\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))/i,
      /(https:\/\/preview\.redd\.it\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)[^&<\s"]*)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        imgUrl = decodeXml(match[1]);
        break;
      }
    }

    if (imgUrl) {
      // Determine file extension
      let ext = 'jpg';
      if (imgUrl.includes('.png')) ext = 'png';
      else if (imgUrl.includes('.webp')) ext = 'webp';
      else if (imgUrl.includes('.jpeg')) ext = 'jpeg';

      const cleanFilename = `${String(items.length + 1).padStart(4, '0')}_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;

      items.push({
        index: items.length,
        id,
        title,
        author,
        updated,
        subreddit,
        originalUrl: imgUrl,
        proxyUrl: `/api/proxy-image?url=${encodeURIComponent(imgUrl)}`,
        filename: cleanFilename,
        ext
      });
    }
  }

  return items;
}

// Download image buffer from URL with redirect following
function downloadImageBuffer(imageUrl) {
  return new Promise((resolve, reject) => {
    function get(u, redirectsLeft = 3) {
      if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
      const parsed = url.parse(u);
      const client = parsed.protocol === 'http:' ? http : https;
      
      const req = client.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = url.resolve(u, res.headers.location);
          return get(nextUrl, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download image: HTTP ${res.statusCode}`));
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });
    }
    get(imageUrl);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // 1. API: Fetch subreddit images
  if (pathname === '/api/fetch-subreddit') {
    const subreddit = parsedUrl.query.subreddit || 'EarthPorn';
    const sort = parsedUrl.query.sort || 'hot';
    const limit = parseInt(parsedUrl.query.limit, 10) || 50;

    try {
      const { data, subreddit: cleanSub } = await fetchRedditRss(subreddit, sort, limit);
      const images = parseRssImages(data, cleanSub);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        subreddit: cleanSub,
        sort,
        total: images.length,
        images
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }
  }

  // 2. API: Image Proxy (Bypasses Reddit CORS & Hotlink headers)
  if (pathname === '/api/proxy-image') {
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing url parameter');
    }

    try {
      const parsedTarget = url.parse(targetUrl);
      const client = parsedTarget.protocol === 'http:' ? http : https;

      const proxyReq = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Referer': 'https://www.reddit.com/'
        }
      }, proxyRes => {
        const contentType = proxyRes.headers['content-type'] || 'image/jpeg';
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400'
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`Proxy error: ${err.message}`);
      });
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Error: ${err.message}`);
    }
    return;
  }

  // 3. API: Build and Download Dataset ZIP
  if (pathname === '/api/export-dataset' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const {
          subreddit = 'dataset',
          items = [], // [{ filename, originalUrl, annotation: { caption, tags, bboxes, ... } }]
          format = 'yolo', // 'yolo', 'coco', 'jsonl', 'txt'
          classes = []
        } = payload;

        if (!items || items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'No annotated items provided' }));
        }

        const zip = new SimpleZip();
        const dateStr = new Date().toISOString();

        // Metadata manifest
        const manifest = {
          dataset_name: `reddit_${subreddit}_dataset`,
          created_at: dateStr,
          total_images: items.length,
          annotation_format: format,
          classes: classes,
          items: []
        };

        // For COCO format collection
        const cocoData = {
          info: { description: `Reddit r/${subreddit} Dataset`, date_created: dateStr, version: '1.0' },
          images: [],
          annotations: [],
          categories: classes.map((c, idx) => ({ id: idx, name: c, supercategory: 'none' }))
        };

        let cocoAnnotationId = 1;

        // Download and pack images concurrently in batches
        const BATCH_SIZE = 5;
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const chunk = items.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map(async (item, chunkIdx) => {
            const itemIndex = i + chunkIdx;
            const filename = item.filename || `image_${String(itemIndex + 1).padStart(4, '0')}.jpg`;
            const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;

            let imgBuffer = null;
            try {
              imgBuffer = await downloadImageBuffer(item.originalUrl);
              zip.addFile(`images/${filename}`, imgBuffer);
            } catch (dlErr) {
              console.warn(`Failed downloading image ${item.originalUrl}:`, dlErr.message);
              // Add a placeholder 1-pixel or text note
              zip.addFile(`images/${filename}.failed.txt`, `Download error: ${dlErr.message}\nURL: ${item.originalUrl}`);
            }

            const annot = item.annotation || {};
            const caption = annot.caption || '';
            const tags = annot.tags || [];
            const bboxes = annot.bboxes || []; // [{ label, x, y, width, height }] in 0-1 normalized coordinates

            manifest.items.push({
              id: item.id || `img_${itemIndex}`,
              image_file: `images/${filename}`,
              title: item.title || '',
              original_url: item.originalUrl,
              caption: caption,
              tags: tags,
              bounding_boxes: bboxes
            });

            // Format-specific exports
            // 1. Text caption file (.txt) alongside image (standard for Stable Diffusion / LoRA training)
            zip.addFile(`annotations/captions/${baseName}.txt`, caption + (tags.length ? `\nTags: ${tags.join(', ')}` : ''));

            // 2. YOLO format (.txt in labels/)
            const yoloLines = [];
            for (const box of bboxes) {
              const classIdx = classes.indexOf(box.label);
              const cid = classIdx >= 0 ? classIdx : 0;
              // YOLO is: <class_index> <x_center> <y_center> <width> <height>
              const xc = (box.x + box.width / 2).toFixed(6);
              const yc = (box.y + box.height / 2).toFixed(6);
              const w = box.width.toFixed(6);
              const h = box.height.toFixed(6);
              yoloLines.push(`${cid} ${xc} ${yc} ${w} ${h}`);
            }
            zip.addFile(`labels/${baseName}.txt`, yoloLines.join('\n'));

            // 3. COCO structure builder
            cocoData.images.push({
              id: itemIndex + 1,
              file_name: filename,
              width: annot.imageWidth || 1000,
              height: annot.imageHeight || 1000
            });
            for (const box of bboxes) {
              const classIdx = classes.indexOf(box.label);
              const cid = classIdx >= 0 ? classIdx : 0;
              const imgW = annot.imageWidth || 1000;
              const imgH = annot.imageHeight || 1000;
              const absX = box.x * imgW;
              const absY = box.y * imgH;
              const absW = box.width * imgW;
              const absH = box.height * imgH;
              cocoData.annotations.push({
                id: cocoAnnotationId++,
                image_id: itemIndex + 1,
                category_id: cid,
                bbox: [Math.round(absX), Math.round(absY), Math.round(absW), Math.round(absH)],
                area: Math.round(absW * absH),
                iscrowd: 0
              });
            }
          }));
        }

        // Add YOLO classes.txt & data.yaml
        zip.addFile('classes.txt', classes.join('\n'));
        zip.addFile('data.yaml', [
          `# YOLOv8 / YOLOv5 Dataset configuration`,
          `names:`,
          ...classes.map((c, idx) => `  ${idx}: ${c}`),
          `nc: ${classes.length}`,
          `path: .`,
          `train: images/`,
          `val: images/`
        ].join('\n'));

        // Add COCO json
        zip.addFile('annotations/coco_annotations.json', JSON.stringify(cocoData, null, 2));

        // Add JSONL for HuggingFace / Vision-Language tuning (LLaVA, BLIP, ViT)
        const jsonlLines = manifest.items.map(m => JSON.stringify({
          image: m.image_file,
          prompt: "Describe this image in detail.",
          caption: m.caption,
          tags: m.tags,
          metadata: { title: m.title, url: m.original_url }
        })).join('\n');
        zip.addFile('dataset.jsonl', jsonlLines);

        // Add overall manifest.json
        zip.addFile('manifest.json', JSON.stringify(manifest, null, 2));

        // Add a training README
        zip.addFile('README.md', [
          `# ${manifest.dataset_name}`,
          `Generated with **Reddit Vision Annotator** on ${dateStr}.`,
          ``,
          `## Contents`,
          `- Total images: **${items.length}**`,
          `- Classes: \`${classes.join(', ')}\``,
          ``,
          `## Directory Layout`,
          `\`\`\``,
          `├── images/             # Original raw downloaded images`,
          `├── labels/             # YOLO format bounding box annotations (<class> <x_c> <y_c> <w> <h>)`,
          `├── annotations/`,
          `│   ├── captions/       # Text prompts/captions (.txt) for Diffusion / LoRA training`,
          `│   └── coco_annotations.json # Full COCO-format JSON`,
          `├── classes.txt         # Class name definitions`,
          `├── data.yaml           # Ready-to-use YOLO dataset config`,
          `├── dataset.jsonl       # JSONL dataset for Vision-Language fine-tuning (LLaVA / BLIP)`,
          `└── manifest.json       # Master index with full metadata and URLs`,
          `\`\`\``,
          ``,
          `## Ready for AI Training:`,
          `1. **Object Detection**: Train YOLOv8/v11 using \`yolo detect train data=data.yaml model=yolov8n.pt epochs=50\``,
          `2. **Diffusion / LoRA**: Use \`images/\` and \`annotations/captions/\` with Kohya_ss, OneTrainer, or Automatic1111`,
          `3. **Vision-Language**: Load \`dataset.jsonl\` using HuggingFace \`datasets\` library`
        ].join('\n'));

        const zipBuffer = zip.generateBuffer();

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="reddit_${subreddit}_dataset.zip"`,
          'Content-Length': zipBuffer.length
        });
        return res.end(zipBuffer);
      } catch (err) {
        console.error('Error generating dataset zip:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. Static File Server (HTML, CSS, JS)
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const extname = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Reddit Annotator server running at http://localhost:${PORT}`);
});
