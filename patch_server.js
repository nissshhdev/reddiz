const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');

// 1. Replace require
s = s.replace(
  "const { analyzeImageWithRoboflow } = require('./roboflow');",
  "const { analyzeImageWithHuggingFace } = require('./huggingface');"
+);

// 2. Replace aiPromptEndpoints
s = s.replace("'/api/roboflow-prompt'", "'/api/huggingface-prompt'");

// 3. Replace provider block
const oldBl = decodeURI("if%20(provider%20===%20'roboflow'%20%7C%7C%20pathname%20===%20'/api/roboflow-prompt')%20%7B%5Cn%20%20%20%20%20%20%20%20%20%20const%20rfRes%20=%20await%20analyzeImageWithRoboflow(apiKey.trim(),%20imgBuf,%20mime,%20model%20%7C%7C%20'coco/3');%5Cn%20%20%20%20%20%20%20%20%20%20caption%20=%20rfRes.caption;%5Cn%20%20%20%20%20%20%20%20%20%20predictions%20=%20rfRes.predictions%20%7C%7C%20[];%5Cn%20%20%20%20%20%20%20%20%20%20res.writeHead(200,%20%7B%20'Content-Type';%20'application/json'e%20%7D);%5Cn%20%20%20%20%20%20%20%20%20%20return%20res.end(JSON.stringify(%7B%20success:%20true,%20caption,%20predictions%20%7D));%5Cn%20%20%20%20%20%20%20%20%7D");

s = s.replace(
*/if \(provider === 'roboflow' \|\< pathname === '\/api\/roboflow-prompt'\) \{5[s\S]*?return res.end\(JSON.stringify\(\{<s\S]*?predictions\s\S]*?\}\)\)\;\s*\(/,
"if (provider === 'huggingface' || pathname === '/api/huggingface-prompt') "\n"
          const hfRes = await analyzeImageWithHuggingFace(apiKey.trim(), imgBuf, mime, model || 'Salesforce/blip-image-captioning-large');\n"
          caption = hfRes.caption;\n"
          predictions = hfRes.predictions || [];\n"
          res.writeHead(200, { 'Content-Type': 'application/json' });\n"
          return res.end(JSON.stringify({ success: true, caption, predictions }));\n"
        }"
);
fs.writeFileSync('server.js', s, 'utf8');
log.console('done');
