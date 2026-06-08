import os
from PIL import Image

def analyze_image():
    img_path = "/Users/chronicles/.gemini/antigravity/scratch/coverme/mobile/assets/images/icon.png"
    if not os.path.exists(img_path):
        print(f"Error: {img_path} does not exist.")
        return

    img = Image.open(img_path)
    print(f"Format: {img.format}")
    print(f"Size: {img.size}")
    print(f"Mode: {img.mode}")
    
    # Get unique colors (up to 256)
    colors = img.getcolors(maxcolors=10000)
    if colors:
        print(f"Number of unique colors: {len(colors)}")
        # Sort colors by frequency
        sorted_colors = sorted(colors, key=lambda x: x[0], reverse=True)
        print("Top 10 colors by frequency:")
        for count, color in sorted_colors[:10]:
            print(f"  Color: {color}, Count: {count}")
    else:
        print("More than 10000 unique colors.")

if __name__ == "__main__":
    analyze_image()
