import os
from PIL import Image

def analyze_and_process():
    img_path = "/Users/chronicles/.gemini/antigravity/scratch/coverme/mobile/assets/images/icon.png"
    if not os.path.exists(img_path):
        print(f"Error: {img_path} does not exist.")
        return

    img = Image.open(img_path).convert("RGBA")
    width, height = img.size
    
    # We want to identify non-background pixels
    # Background color is approximately (37, 99, 235)
    bg_color = (37, 99, 235)
    
    # Let's find the bounding box of non-background pixels
    min_x, min_y = width, height
    max_x, max_y = 0, 0
    
    pixels = img.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # If the pixel is not close to the background color
            dist = (r - bg_color[0])**2 + (g - bg_color[1])**2 + (b - bg_color[2])**2
            if dist > 100:  # Threshold for color difference
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
                
    logo_w = max_x - min_x + 1
    logo_h = max_y - min_y + 1
    print(f"Logo Bounding Box: ({min_x}, {min_y}) to ({max_x}, {max_y})")
    print(f"Logo Size: {logo_w}x{logo_h}")
    print(f"Relative width: {logo_w/width:.2%}, Relative height: {logo_h/height:.2%}")

if __name__ == "__main__":
    analyze_and_process()
