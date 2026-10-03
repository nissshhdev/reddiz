const https = require('https');

/**
 * Call Roboflow Inference API with an image buffer
 * Supports object detection, instance segmentation, and classification models.
 * Model endpoint formats:
 * - "project/version" (e.g., "coco-128/1")
 * - "workspace/project/version" (e.g., "my-workspace/my-dataset/2")
 * - URL or default
 */
async function analyzeImageWithRoboflow(apiKey, imageBuffer, mimeType, model = '') {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Roboflow API key is required.');
  }

  const cleanKey = apiKey.trim();
  let cleanModel = (model || '').trim();

  // If user left model empty or typed default, provide a helpful default or prompt
  if (!cleanModel || cleanModel === 'default' || cleanModel === 'roboflow') {
    cleanModel = 'coco/3';
  }

  // If the model path contains leading slash or full URL, strip it
  cleanModel = cleanModel.replace(/^https?:\/\/detect\.roboflow\.com\//, '').replace(/^\/+/, '');

  // Roboflow detect API takes project/version or workspace/project/version
  const endpointUrl = 'https://detect.roboflow.com/' + cleanModel + '?api_key=' + encodeURIComponent(cleanKey) + '&confidence=40&overlap=30&format=json';

  const base64Data = imageBuffer.toString('base64');

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(endpointUrl);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(base64Data)
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (res.statusCode >= 400 || parsed.error) {
            let errDetail = '';
            if (parsed.error) {
              errDetail = typeof parsed.error === 'object' ? (parsed.error.message || JSON.stringify(parsed.error)) : String(parsed.error);
            } else {
              errDetail = 'Roboflow API returned status ' + res.statusCode;
            }
            return reject(new Error(errDetail));
          }

          const predictions = Array.isArray(parsed.predictions) ? parsed.predictions : [];
          const imgWidth = (parsed.image && parsed.image.width) ? parsed.image.width : 1;
          const imgHeight = (parsed.image && parsed.image.height) ? parsed.image.height : 1;

          // Normalize bounding boxes to 0..1 coordinates (x, y, width, height where x, y is top-left)
          // Roboflow (x, y) is the CENTER of the bounding box!
          const normalizedBoxes = predictions.map(p => {
            const w = p.width / imgWidth;
            const h = p.height / imgHeight;
            const x = (p.x - p.width / 2) / imgWidth;
            const y = (p.y - p.height / 2) / imgHeight;
            return {
              x: Math.max(0, Math.min(1, x)),
              y: Math.max(0, Math.min(1, y)),
              width: Math.max(0.01, Math.min(1, w)),
              height: Math.max(0.01, Math.min(1, h)),
              label: (p.class || 'object').toLowerCase(),
              confidence: p.confidence || 1.0
            };
          });

          // Generate summary description / caption for dataset training
          let caption = '';
          if (predictions.length === 0) {
            caption = 'Roboflow analysis completed: no target objects detected above confidence threshold.';
          } else {
            const counts = {};
            predictions.forEach(p => {
              const cls = (p.class || 'object').toLowerCase();
              counts[cls] = (counts[cls] || 0) + 1;
            });
            const summaryParts = Object.entries(counts).map(([cls, cnt]) => cnt + ' ' + cls + (cnt > 1 ? 's' : ''));
            caption = 'Detected ' + summaryParts.join(', ') + ' via Roboflow model [' + cleanModel + ']. Bounding boxes auto-aligned.';
          }

          resolve({
            caption,
            predictions: normalizedBoxes,
            raw: parsed
          });
        } catch (e) {
          reject(new Error('Failed to parse Roboflow API response: ' + e.message));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Roboflow request timed out after 30 seconds.'));
    });

    req.on('error', (err) => {
      reject(new Error('Roboflow connection error: ' + err.message));
    });

    req.write(base64Data);
    req.end();
  });
}

module.exports = { analyzeImageWithRoboflow };
