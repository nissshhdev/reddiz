const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const SimpleZip = require('./simple-zip');
const { analyzeImageWithGemini } = require('./gemini');
const { analyzeImageWithOpenAI } = require('./openai');
const { analyzeImageWithGroq } = require('./groq');
const { analyzeImageWithClaude } = require('./claude');
const { analyzeImageWithHuggingFace } = require('./huggingface');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function decodeXml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

// In-memory response cache to protect against 429 rate limits
const cache = new Map(); // key -> { time, data }
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// Fetch a single subreddit RSS with automatic retry on 429
async function fetchSingleSubredditRss(sub, sort = 'hot', limit = 100, retryCount = 0) {
  const cleanSub = sub.replace(/^r\//, '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleanSub) return '';

  const cacheKey = `${cleanSub}_${sort}_${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.time < CACHE_TTL)) {
    return cached.data;
  }

  let sortPath = '';
  if (sort === 'new') sortPath = '/new';
  else if (sort === 'top') sortPath = '/top';
  else if (sort === 'rising') sortPath = '/rising';

  const feedUrl = `https://www.reddit.com/r/${cleanSub}${sortPath}.rss?limit=${limit}`;

  return new Promise((resolve, reject) => {
    req = https.get(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml,application/atom+xml,text/xml;q=0.9,*/*;q=0.8',
        'Cookie': 'over18=1;'
      }
    }, async res => {
      if (res.statusCode === 429) {
        if (retryCount < 3) {
          const waitMs = (retryCount + 1) * 3500;
          console.log(`[Rate Limit 429] Waiting ${waitMs}ms before retry ${retryCount + 1} for r/${cleanSub}...`);
          await new Promise(r => setTimeout(r, waitMs));
          try {
            const data = await fetchSingleSubredditRss(cleanSub, sort, limit, retryCount + 1);
            return resolve(data);
          } catch (retryErr) {
            return reject(retryErr);
          }
        }
        return reject(new Error(`Reddit is currently rate-limiting queries. Please wait a few seconds and try again.`));
      }

      if (res.statusCode >= 400) {
        return reject(new Error(`Reddit returned HTTP ${res.statusCode} for r/${cleanSub}. It may be private, quarantined, or restricted.`));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        cache.set(cacheKey, { time: Date.now(), data });
        resolve(data);
      });
    });

    req.on('error', reject);
    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching r/${cleanSub}`));
    });
  });
}

// Fetch Multiple Subreddits in parallel with delay spacing
async function fetchMultipleSubreddits(subredditsStr, sort = 'hot', limitPerSub = 100) {
  // Support comma, space, plus, or semicolon separated list
  const subs = subredditsStr
    .split(/[,+;\s]+/)
    .map(s => s.trim().replace(/^r\//, ''))
    .filter(Boolean);

  if (subs.length === 0) {
    throw new Error('Please enter at least one subreddit name.');
  }

  const allItems = [];
  const errors = [];

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    if (i > 0) {
      // Space requests by 1.2 seconds to stay well below Reddit 1 req/sec rate limit
      await new Promise(r => setTimeout(r, 1200));
    }

    try {
      const xml = await fetchSingleSubredditRss(sub, sort, limitPerSub);
      const items = parseRssImages(xml, sub);
      allItems.push(...items);
    } catch (err) {
      console.warn(`Error on r/${sub}:`, err.message);
      errors.push(`r/${sub}: ${err.message}`);
    }
  }

  // Deduplicate items by originalUrl
  const seen = new Set();
  const deduped = [];
  for (const item of allItems) {
    if (!seen.has(item.originalUrl)) {
      seen.add(item.originalUrl);
      item.index = deduped.length;
      deduped.push(item);
    }
  }

  if (deduped.length === 0 && errors.length > 0) {
    throw new Error(errors.join(' | '));
  }

  return { images: deduped, subreddits: subs, errors };
}

function parseRssImages(xml, subreddit) {
  if (!xml) return [];
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

    let imgUrl = null;
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
      // Normalize preview.redd.it thumbnails to full resolution direct i.redd.it links
      if (imgUrl.includes('preview.redd.it')) {
        imgUrl = imgUrl.replace('preview.redd.it', 'i.redd.it').split('?')[0];
      }

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

function downloadImageBuffer(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return Promise.reject(new Error('Invalid image URL'));
  }
  if (imageUrl.startsWith('data:')) {
    const commaIdx = imageUrl.indexOf(',');
    if (commaIdx !== -1) {
      const base64Data = imageUrl.slice(commaIdx + 1);
      return Promise.resolve(Buffer.from(base64Data, 'base64'));
    }
  }
  if (imageUrl.startsWith('/api/proxy-image?url=')) {
    const query = imageUrl.split('url=')[1];
    if (query) {
      return downloadImageBuffer(decodeURIComponent(query));
    }
  }
  return new Promise((resolve, reject) => {
    function get(u, redirectsLeft = 3) {
      if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
      const parsed = url.parse(u);
      const client = parsed.protocol === 'http:' ? http : https;
      
      const req = client.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
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

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // API: Gemini Vision Image Analysis & Prompt Generator
  const aiPromptEndpoints = ['/api/gemini-prompt', '/api/openai-prompt', '/api/claude-prompt', '/api/groq-prompt', '/api/huggingface-prompt'];
  if (aiPromptEndpoints.includes(pathname) && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { apiKey, imageUrl, model, provider } = payload;

        if (!apiKey || !apiKey.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: (provider ? provider.toUpperCase() : 'AI') + ' API key is required.' }));
        }

        if (!imageUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Image URL is required.' }));
        }

        // Fetch image buffer
        let targetUrl = imageUrl;
        if (targetUrl.startsWith('/api/proxy-image?url=')) {
          targetUrl = decodeURIComponent(targetUrl.replace('/api/proxy-image?url=', ''));
        }
        if (targetUrl.includes('preview.redd.it')) {
          targetUrl = targetUrl.replace('preview.redd.it', 'i.redd.it').split('?')[0];
        }

        const imgBuf = await downloadImageBuffer(targetUrl);
        let mime = 'image/jpeg';
        if (targetUrl.includes('.png')) mime = 'image/png';
        else if (targetUrl.includes('.webp')) mime = 'image/webp';

        const detailedPrompt = `You are a world-class computer vision expert and lead AI dataset annotator producing exhaustive, pixel-level ground truth descriptions for state-of-the-art vision models (Flux, Stable Diffusion 3.5, LoRA training, and multimodal vision-language models).

Analyze every visible square inch and pixel cluster of the image with forensic, microscopic precision. Do not generalize, summarize, or omit subtle details. Produce an exhaustive, dense, comma-separated descriptive analysis capturing everything visible with anatomical, photometric, and material fidelity:

1. Microscopic Skin & Epidermal Physics (Pixel-Level Clarity):
   * Micro-texture & Surface Relief: individual skin pores, pore density across T-zone/cheeks/nose, fine epidermal micro-relief lines, microscopic goosebumps (cutis anserina), faint vellus hair (peach fuzz) illuminated by rim/edge light along jawline, temples, and cheeks.
   * Surface Hydration, Specular Reflections & Subsurface Scattering (SSS): exact moisture state (matte velvet, natural dewy glow, high-gloss sheen, sweat beads, glistening perspiration in clavicle hollows, hairline, or chest), localized specular highlight hot-spots (nose tip, cupid's bow, zygomatic arch, forehead center), organic epidermal subsurface scattering with warm reddish/peachy light bleed through ears, nostrils, and finger edges.
   * Natural Skin Irregularities & Unique Micro-Features: exact placement, size, and pigmentation of freckles (ephelides), sun spots, beauty marks, flat and raised moles (nevi), birthmarks, subtle acne blemishes, micro-redness/erythema around nostrils and cheeks, healing scratches, fine lines, laugh lines (nasolabial folds), marionette lines, crow's feet, transverse forehead wrinkles, subtle natural asymmetry between left and right facial halves.
   * Skin Tone & Chromatic Undertones: exact Fitzpatrick scale classification and precise pantone/shade (e.g., porcelain ivory with cool pink undertones, warm golden beige with honey hues, rich olive with subtle greenish-yellow undertones, deep bronze with amber warmth, radiant espresso with mahogany undertones).

2. Forensic Facial Geometry & Micro-Expressions:
   * Anatomical Features: exact face shape (sculpted heart, soft oval, sharp angular square, oblong, diamond), zygomatic cheekbone definition, mandibular jawline sharpness, gonial angle, mental crease, philtrum depth and ridges, cupid's bow contour, upper and lower vermilion border sharpness, lip texture (fine vertical lip fissures, gloss reflections, chapped or satin finish), teeth alignment and incisal translucency if visible.
   * Ocular Optics & Gaze (Macro Zoom): exact iris pigmentation (multi-tonal heterochromia, striated hazel, crystalline emerald green, icy cerulean blue, golden amber, deep liquid obsidian), limbal ring thickness and definition, pupillary dilation, scleral brightness with fine vascular micro-capillaries, wet corneal tear-film reflections and catchlight geometry (softbox rectangle, ring light circle, window pane), upper and lower eyelid folds, canthal tilt (positive/negative), individual lower and upper eyelash strands, eyebrow grooming (laminated, microbladed, natural bushy, individual hair follicles).
   * Micro-Expressions & Muscular Tension: zygomaticus major contraction, frontalis brow elevation, corrugator furrowing, orbicularis oculi crinkling (authentic Duchenne markers), subtle lip compression or parting, nostril flaring, micro-expressions conveying exact psychological state (subtle enigmatic allure, candid euphoria, piercing dominant scrutiny, vulnerable serenity, contemplative introspection).

3. Hair Physics & Fiber Micro-Structure:
   * Strand Resolution & Fiber Dynamics: individual stray flyaway hair strands caught in backlight, hair parting definition (clean scalp line, zigzag, obscured), follicle root volume, hairline shape (widow's peak, straight, rounded, temple baby hairs/edges styled or loose).
   * Hairstyle, Volume & Flow: exact structural style (cascading loose beach waves, ultra-straight glass hair, textured shaggy layers, intricate Dutch/French braids, textured coils, high ponytail with tension lines, curtain bangs framing cheekbones), weight distribution, flow vector and wind interaction.
   * Color Matrix & Optical Reflectance: multi-tonal highlights, lowlights, natural root regrowth, ombre gradients, glossy anisotropic specular highlight band running across hair curvature, warm or cool undertones.

4. Comprehensive Demographic, Ethnic & Regional Characterization:
   * Global Racial & Ethnic Heritage: precise phenotypic indicators (South Asian / Indian Desi, East Asian, Southeast Asian, Caucasian / European, African / Black diaspora, Hispanic / Latinx, Middle Eastern / Levantine, Indigenous, or blended multi-ethnic heritage).
   * Regional Sub-Phenotypes & Cultural Signatures (when applicable): North Indian (Punjabi, Kashmiri, Pahadi, Haryanvi, Gangetic), South Indian (Tamil, Telugu, Malayali, Kannada), East Indian (Bengali, Odia, Assamese), West Indian (Marathi, Gujarati, Rajasthani), or Northeast Indian (Tibeto-Burman / East Asian phenotypic markers).
   * Traditional Adornments & Body Art: bindi geometry and pigment (crimson velvet, teardrop, chandan dot work), vermilion sindoor along parting, maang tikka, nose studs/naths (Maharashtrian moti crescent, North Indian kundan hoop, South Indian diamond mukkuthi), mehendi / henna stain complexity on fingers/palms/forearms, alta dye border on soles and fingertips.

5. Textile, Apparel & Material Weave Resolution:
   * Fabric Science & Tactile Texture: exact textile weaves (heavy raw denim twill, gossamer silk satin with fluid liquid drape, ribbed cotton knit showing yarn ridges, shearling, supple grain leather with micro-creases, translucent chiffon, corduroy wales, delicate Chantilly floral lace).
   * Garment Architecture & Fit: silhouette tailoring, seam stitching, tension folds, draping bunching around waist/elbows/knees, collar construction, neckline plunge or contour, buttonhole and zipper hardware details, transparency and opacity gradient against light sources.
   * Jewelry, Gemstones & Metallics: metallic finish (brushed brass, 24k polished yellow gold, rhodium silver, oxidized antique silver), gemstone cuts, facet reflections, internal refractions, clasp and chain link structure.

6. Kinematic Anatomy, Posture & Body Language:
   * Full-Body Stance & Biomechanics: skeletal orientation, spine curvature, contrapposto weight distribution between feet, shoulder slope, clavicle prominence, jugular notch hollow, abdominal contour, hip tilt.
   * Limb & Digit Articulation: exact placement and micro-gestures of each individual finger, knuckle flex, hand relaxation or grip, arm posture, leg crossing, ankle angle, foot positioning (barefoot arched instep, planted flat, elevated heels).
   * Environmental & Subject Interaction: physical contact pressure against seating, props, railings, or companion subjects with realistic flesh compression and fabric displacement.

7. Camera Optics, Sensor Physics & Perspective:
   * Optical Profile & Shot Framing: exact framing (macro extreme close-up, intimate headshot portrait, medium close-up, waist-up medium shot, cowboy shot, full-body portrait, wide environmental composition), camera angle (eye-level, low-angle power perspective, high-angle downward tilt, canted Dutch angle).
   * Lens Characteristics & Depth of Field: focal length perspective (e.g. 24mm wide angle with gentle peripheral expansion, 50mm true human perspective, 85mm or 105mm portrait focal compression), depth of field falloff (creamy circular bokeh discs in background highlights, laser-sharp focal plane on eyelashes and iris), lens aberrations (subtle chromatic aberration at high-contrast edges, natural vignetting, anamorphic flare streaks).
   * Capture Medium & Artifacts: modern ultra-high-resolution digital sensor clarity, dynamic range latitude, or authentic 35mm / medium format analog film grain texture, natural halide grain dispersion.

8. Photometric Lighting Architecture & Volumetric Atmosphere:
   * Multi-Point Lighting Topology: key light angle, elevation, and source (e.g., golden hour 20-degree sun, 45-degree large octabox, overhead noon sun), fill light ratio, hair/rim kicker light separating subject from background contours, ambient bounce illumination.
   * Light Quality & Specular Behavior: hard directional cast shadows with distinct penumbra vs. ultra-soft feathered diffuse illumination, caustic pool reflections, dappled shadows filtered through foliage, volumetric dust motes or atmospheric haze caught in light shafts.
   * Color Temperature & Chromatic Balance: Kelvin balance (golden warm 3200K, neutral clean 5500K daylight, twilight 6500K-8000K blue hour), cinematic split-toning (warm skin tones preserved against cool cyan/slate shadows).

9. Spatial Environment & Background Architectural Depth:
   * Layered Spatial Staging: distinct foreground framing elements, detailed midground interaction zone, atmospheric deep background perspective.
   * Material Reality of Environment: architectural textures (weathered brick mortar, exposed timber woodgrain, polished reflective marble, distressed plaster, wet tarmac with puddle reflections), foliage species, furnishings, indoor ambient props, outdoor landscape, skyline, and horizon weather conditions.

Provide only the dense, hyper-detailed, pixel-level descriptive prompt without conversational filler or introductory sentences.`;

        let caption = '';
        let predictions = [];
        if (provider === 'huggingface' || pathname === '/api/huggingface-prompt') {
          const hfRes = await analyzeImageWithHuggingFace(apiKey.trim(), imgBuf, mime, model || 'Salesforce/blip-image-captioning-large');
          caption = hfRes.caption;
          predictions = hfRes.predictions || [];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, caption, predictions }));
        } else if (provider === 'claude' || (model && model.includes('claude'))) {
          caption = await analyzeImageWithClaude(apiKey.trim(), imgBuf, mime, detailedPrompt, model || 'claude-3-5-sonnet-20241022');
        } else if (provider === 'groq' || (model && model.includes('llama'))) {
          caption = await analyzeImageWithGroq(apiKey.trim(), imgBuf, mime, detailedPrompt, model || 'llama-3.2-11b-vision-preview');
        } else if (provider === 'openai' || (model && (model.startsWith('gpt-') || model.startsWith('chatgpt')))) {
          caption = await analyzeImageWithOpenAI(apiKey.trim(), imgBuf, mime, detailedPrompt, model || 'gpt-4o');
        } else {
          caption = await analyzeImageWithGemini(apiKey.trim(), imgBuf, mime, detailedPrompt, model || 'gemini-3.8-flash');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, caption }));
      } catch (err) {
        console.error('Gemini prompt error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message || 'Failed to generate prompt with Gemini' }));
      }
    });
    return;
  }

  // 1. API: Fetch subreddit images (Supports single or multiple comma/space/plus-separated subreddits)
  if (pathname === '/api/fetch-subreddit') {
    const subredditQuery = parsedUrl.query.subreddit || '';
    const sort = parsedUrl.query.sort || 'hot';
    const limit = parseInt(parsedUrl.query.limit, 10) || 100;

    if (!subredditQuery.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: 'Please enter a subreddit name to search.'
      }));
    }

    try {
      const { images, subreddits, errors } = await fetchMultipleSubreddits(subredditQuery, sort, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        subreddits,
        sort,
        total: images.length,
        images,
        warnings: errors
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: err.message
      }));
    }
  }

  // 2. API: Image Proxy
  if (pathname === '/api/proxy-image') {
    let targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing url parameter');
    }

    if (targetUrl.includes('preview.redd.it')) {
      targetUrl = targetUrl.replace('preview.redd.it', 'i.redd.it').split('?')[0];
    }

    try {
      const parsedTarget = url.parse(targetUrl);
      const client = parsedTarget.protocol === 'http:' ? http : https;

      const proxyReq = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
          items = [],
          format = 'yolo',
          classes = []
        } = payload;

        if (!items || items.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'No annotated items provided' }));
        }

        const zip = new SimpleZip();
        const dateStr = new Date().toISOString();

        const manifest = {
          dataset_name: `reddit_${subreddit}_dataset`,
          created_at: dateStr,
          total_images: items.length,
          annotation_format: format,
          classes: classes,
          items: []
        };

        const cocoData = {
          info: { description: `Reddit r/${subreddit} Dataset`, date_created: dateStr, version: '1.0' },
          images: [],
          annotations: [],
          categories: classes.map((c, idx) => ({ id: idx, name: c, supercategory: 'none' }))
        };

        let cocoAnnotationId = 1;
        const BATCH_SIZE = 5;

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const chunk = items.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map(async (item, chunkIdx) => {
            const itemIndex = i + chunkIdx;
            const filename = item.filename || `image_${String(itemIndex + 1).padStart(4, '0')}.jpg`;
            const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;

            try {
              let downloadTarget = item.originalUrl || item.proxyUrl || '';
              if (typeof downloadTarget === 'string' && downloadTarget.includes('preview.redd.it')) {
                downloadTarget = downloadTarget.replace('preview.redd.it', 'i.redd.it').split('?')[0];
              }
              const imgBuffer = await downloadImageBuffer(downloadTarget);
              zip.addFile(`images/${filename}`, imgBuffer);
            } catch (dlErr) {
              console.warn(`Failed downloading image ${item.originalUrl}:`, dlErr.message);
              zip.addFile(`images/${filename}.failed.txt`, `Download error: ${dlErr.message}\nURL: ${item.originalUrl}`);
            }

            const annot = item.annotation || {};
            const caption = annot.caption || '';
            const tags = annot.tags || [];
            const bboxes = annot.bboxes || [];

            manifest.items.push({
              id: item.id || `img_${itemIndex}`,
              image_file: `images/${filename}`,
              title: item.title || '',
              subreddit: item.subreddit || subreddit,
              original_url: item.originalUrl,
              caption: caption,
              tags: tags,
              bounding_boxes: bboxes
            });

            zip.addFile(`annotations/captions/${baseName}.txt`, caption + (tags.length ? `\nTags: ${tags.join(', ')}` : ''));

            const yoloLines = [];
            for (const box of bboxes) {
              const classIdx = classes.indexOf(box.label);
              const cid = classIdx >= 0 ? classIdx : 0;
              const xc = (box.x + box.width / 2).toFixed(6);
              const yc = (box.y + box.height / 2).toFixed(6);
              const w = box.width.toFixed(6);
              const h = box.height.toFixed(6);
              yoloLines.push(`${cid} ${xc} ${yc} ${w} ${h}`);
            }
            zip.addFile(`labels/${baseName}.txt`, yoloLines.join('\n'));

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

        zip.addFile('classes.txt', classes.join('\n'));
        zip.addFile('data.yaml', [
          `# YOLOv8 / YOLOv11 Dataset configuration`,
          `names:`,
          ...classes.map((c, idx) => `  ${idx}: ${c}`),
          `nc: ${classes.length}`,
          `path: .`,
          `train: images/`,
          `val: images/`
        ].join('\n'));

        zip.addFile('annotations/coco_annotations.json', JSON.stringify(cocoData, null, 2));

        const jsonlLines = manifest.items.map(m => JSON.stringify({
          image: m.image_file,
          prompt: "Describe this image in detail.",
          caption: m.caption,
          tags: m.tags,
          metadata: { title: m.title, subreddit: m.subreddit, url: m.original_url }
        })).join('\n');
        zip.addFile('dataset.jsonl', jsonlLines);
        zip.addFile('manifest.json', JSON.stringify(manifest, null, 2));

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
          `ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ images/             # Original raw downloaded images`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ labels/             # YOLO format bounding box annotations (<class> <x_c> <y_c> <w> <h>)`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ annotations/`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡   ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ captions/       # Text prompts/captions (.txt) for Diffusion / LoRA training`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬Å¡   ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ coco_annotations.json # Full COCO-format JSON`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ classes.txt         # Class name definitions`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ data.yaml           # Ready-to-use YOLO dataset config`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ dataset.jsonl       # JSONL dataset for Vision-Language fine-tuning (LLaVA / BLIP)`,
          `ÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ manifest.json       # Master index with full metadata and URLs`,
          `\`\`\``
        ].join('\n'));

        const zipBuffer = zip.generateBuffer();

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="reddit_${subreddit.replace(/[^a-zA-Z0-9_-]/g, '_')}_dataset.zip"`,
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

  // 4. Static File Server
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


