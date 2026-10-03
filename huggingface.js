const https = require('https');

async function analyzeImageWithHuggingFace(apiKey, imageBuffer, mimeType, model = '') {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Hugging Face API token is required. Get one at huggingface.co/settings/tokens');
  }

  const cleanKey = apiKey.trim();
  let cleanModel = (model || '').trim();
  if (!cleanModel || cleanModel === 'default' || cleanModel === 'huggingface') {
    cleanModel = 'Salesforce/blip-image-captioning-large';
  }

  const endpointPath = '/models/' + cleanModel;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-inference.huggingface.co',
      port: 443,
      path: endpointPath,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cleanKey,
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': imageBuffer.length,
        'x-wait-for-model': 'true'
      },
      timeout: 45000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (!data || !data.trim()) {
            return reject(new Error('Hugging Face returned empty response (Status ' + res.statusCode + ')'));
          }

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            return reject(new Error('Non-JSON response from Hugging Face (' + res.statusCode + '): ' + data.slice(0, 150)));
          }

          if (res.statusCode >= 400 || (parsed && parsed.error)) {
            let errMsg = 'Hugging Face API Error (' + res.statusCode + ')';
            if (parsed && parsed.error) {
              errMsg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
            }
            if (parsed && parsed.estimated_time) {
              errMsg += ' (Model is currently loading, please retry in ' + Math.ceil(parsed.estimated_time) + 's)';
            }
            return reject(new Error(errMsg));
          }

          let caption = '';
          let predictions = [];

          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].generated_text) {
            caption = parsed.map(item => item.generated_text).filter(Boolean).join(' ');
          } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].box) {
            predictions = parsed.filter(p => (p.score || 0) >= 0.25).map(p => {
              const b = p.box || {};
              const xmin = b.xmin !== undefined ? b.xmin : 0;
              const ymin = b.ymin !== undefined ? b.ymin : 0;
              const xmax = b.xmax !== undefined ? b.xmax : 1;
              const ymax = b.ymax !== undefined ? b.ymax : 1;
              return {
                x: Math.max(0, Math.min(1, xmin)),
                y: Math.max(0, Math.min(1, ymin)),
                width: Math.max(0.01, Math.min(1, xmax - xmin)),
                height: Math.max(0.01, Math.min(1, ymax - ymin)),
                label: (p.label || 'object').toLowerCase(),
                confidence: p.score || 1.0
              };
            });

            const counts = {};
            predictions.forEach(p => {
              counts[p.label] = (counts[p.label] || 0) + 1;
            });
            const summaryParts = Object.entries(counts).map(([cls, cnt]) => cnt + ' ' + cls + (cnt > 1 ? 's' : ''));
            caption = predictions.length > 0
              ? 'Detected ' + summaryParts.join(', ') + ' via Hugging Face model [' + cleanModel + '].'
              : 'Hugging Face analysis completed: no target objects detected above confidence threshold.';
          } else if (parsed.generated_text) {
            caption = parsed.generated_text;
          } else if (typeof parsed === 'string') {
            caption = parsed;
          } else {
            caption = JSON.stringify(parsed);
          }

          caption = caption.trim();
          if (!caption) {
            caption = 'Hugging Face model analysis completed for [' + cleanModel + '].';
          }

          resolve({ caption, predictions, raw: parsed });
        } catch (e) {
          reject(new Error('Failed to process Hugging Face response: ' + e.message));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Hugging Face request timed out after 45 seconds.'));
    });

    req.on('error', (err) => {
      reject(new Error('Hugging Face network error: ' + err.message));
    });

    req.write(imageBuffer);
    req.end();
  });
}

module.exports = { analyzeImageWithHuggingFace };
