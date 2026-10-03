import os
import sys
from huggingface_hub import snapshot_download

target_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'model', 'vit-gpt2-image-captioning'))
os.makedirs(target_dir, exist_ok=True)

print(f"Downloading nlpconnect/vit-gpt2-image-captioning into: {target_dir}")
snapshot_download(
    repo_id="nlpconnect/vit-gpt2-image-captioning",
    local_dir=target_dir,
    local_dir_use_symlinks=False,
    ignore_patterns=["*.msgpack", "*.h5"]
)
print("SUCCESS: Model successfully downloaded and verified in model folder!")
