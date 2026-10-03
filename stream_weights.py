import os
import urllib.request
import sys

target_file = os.path.abspath(os.path.join(os.path.dirname(__file__), 'model', 'vit-gpt2-image-captioning', 'pytorch_model.bin'))
url = "https://huggingface.co/nlpconnect/vit-gpt2-image-captioning/resolve/main/pytorch_model.bin"

def report(block_num, block_size, total_size):
    downloaded = block_num * block_size
    percent = downloaded / total_size * 100 if total_size > 0 else 0
    sys.stdout.write(f"\rDownloading model weights: {downloaded / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB ({percent:.1f}%)")
    sys.stdout.flush()

print(f"Direct stream download: {url} -> {target_file}")
urllib.request.urlretrieve(url, target_file, reporthook=report)
print("\nWeights downloaded successfully!")
