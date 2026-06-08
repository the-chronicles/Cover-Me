import os
from PIL import Image, ImageOps

def generate():
    images_dir = "/Users/chronicles/.gemini/antigravity/scratch/coverme/mobile/assets/images"
    icon_path = os.path.join(images_dir, "icon.png")
    
    if not os.path.exists(icon_path):
        print(f"Error: {icon_path} not found.")
        return

    print("Opening source icon.png...")
    img = Image.open(icon_path).convert("RGBA")
    width, height = img.size
    
    # 1. Bounding box of non-background pixels
    bg_color = (37, 99, 235)  # #2563EB
    min_x, min_y = width, height
    max_x, max_y = 0, 0
    
    pixels = img.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            dist = (r - bg_color[0])**2 + (g - bg_color[1])**2 + (b - bg_color[2])**2
            if dist > 100:
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
                
    logo_w = max_x - min_x + 1
    logo_h = max_y - min_y + 1
    print(f"Extracted logo bounding box: ({min_x}, {min_y}) to ({max_x}, {max_y}), size {logo_w}x{logo_h}")
    
    # Crop the logo
    logo = img.crop((min_x, min_y, max_x + 1, max_y + 1))
    
    # Make background pixels of the logo transparent (anything close to bg_color)
    logo_pixels = logo.load()
    for y in range(logo.height):
        for x in range(logo.width):
            r, g, b, a = logo_pixels[x, y]
            dist = (r - bg_color[0])**2 + (g - bg_color[1])**2 + (b - bg_color[2])**2
            if dist < 150:  # slightly higher threshold for blending edges
                logo_pixels[x, y] = (0, 0, 0, 0)
                
    # 2. Generate android-icon-foreground.png (512x512 transparent, logo fits in 338x338 safe zone)
    foreground = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    # Scale logo to fit in 338x338
    scale = min(338 / logo_w, 338 / logo_h)
    new_w = int(logo_w * scale)
    new_h = int(logo_h * scale)
    scaled_logo = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Paste centered
    offset_x = (512 - new_w) // 2
    offset_y = (512 - new_h) // 2
    foreground.paste(scaled_logo, (offset_x, offset_y), scaled_logo)
    foreground.save(os.path.join(images_dir, "android-icon-foreground.png"))
    print("Saved android-icon-foreground.png")
    
    # 3. Generate android-icon-background.png (512x512 solid #2563EB)
    background = Image.new("RGBA", (512, 512), (37, 99, 235, 255))
    background.save(os.path.join(images_dir, "android-icon-background.png"))
    print("Saved android-icon-background.png")
    
    # 4. Generate android-icon-monochrome.png (432x432 transparent, white logo fits in 285x285 safe zone)
    monochrome = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    scale_mono = min(285 / logo_w, 285 / logo_h)
    new_mono_w = int(logo_w * scale_mono)
    new_mono_h = int(logo_h * scale_mono)
    scaled_logo_mono = logo.resize((new_mono_w, new_mono_h), Image.Resampling.LANCZOS)
    
    # Convert scaled logo to solid white (keep transparency)
    mono_pixels = scaled_logo_mono.load()
    for y in range(scaled_logo_mono.height):
        for x in range(scaled_logo_mono.width):
            r, g, b, a = mono_pixels[x, y]
            if a > 10:  # If pixel is not transparent
                mono_pixels[x, y] = (255, 255, 255, a)
                
    offset_mono_x = (432 - new_mono_w) // 2
    offset_mono_y = (432 - new_mono_h) // 2
    monochrome.paste(scaled_logo_mono, (offset_mono_x, offset_mono_y), scaled_logo_mono)
    monochrome.save(os.path.join(images_dir, "android-icon-monochrome.png"))
    print("Saved android-icon-monochrome.png")
    
    # 5. Generate splash-icon.png (scaled to 512x512 transparent for cleaner splash scaling)
    # The default was 228x213. Let's make it 512x512, with the logo scaled to fit nicely.
    splash = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    scale_splash = min(380 / logo_w, 380 / logo_h)
    new_splash_w = int(logo_w * scale_splash)
    new_splash_h = int(logo_h * scale_splash)
    scaled_logo_splash = logo.resize((new_splash_w, new_splash_h), Image.Resampling.LANCZOS)
    
    offset_splash_x = (512 - new_splash_w) // 2
    offset_splash_y = (512 - new_splash_h) // 2
    splash.paste(scaled_logo_splash, (offset_splash_x, offset_splash_y), scaled_logo_splash)
    splash.save(os.path.join(images_dir, "splash-icon.png"))
    print("Saved splash-icon.png")
    
    # 6. Generate favicon.png (48x48 scaled version of icon.png)
    favicon = img.resize((48, 48), Image.Resampling.LANCZOS)
    favicon.save(os.path.join(images_dir, "favicon.png"))
    print("Saved favicon.png")
    
    # Cleanup temp BMP
    bmp_path = os.path.join(images_dir, "icon.bmp")
    if os.path.exists(bmp_path):
        os.remove(bmp_path)
        print("Removed temporary icon.bmp")

if __name__ == "__main__":
    generate()
