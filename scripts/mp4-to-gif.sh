#!/bin/bash
# Convert all MP4 files in public/img to optimized GIFs
# Usage: ./scripts/mp4-to-gif.sh

set -e

INPUT_DIR="public/img"
OUTPUT_DIR="public/img"

# Check ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is not installed"
    exit 1
fi

# Process each MP4 file
for mp4 in "$INPUT_DIR"/*.mp4; do
    if [ -f "$mp4" ]; then
        filename=$(basename "$mp4" .mp4)
        output="$OUTPUT_DIR/$filename.gif"

        echo "Converting: $mp4 -> $output"

        # Two-pass conversion for better quality/size ratio:
        # 1. Generate optimized palette
        # 2. Use palette to create GIF

        # Settings:
        # - fps=15: reduce framerate for smaller size
        # - scale=480:-1: max width 480px, keep aspect ratio
        # - lanczos: high quality scaling
        # - dither=bayer: better color approximation

        ffmpeg -y -i "$mp4" \
            -vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
            -loop 0 \
            "$output"

        # Show size comparison
        mp4_size=$(du -h "$mp4" | cut -f1)
        gif_size=$(du -h "$output" | cut -f1)
        echo "  $mp4_size -> $gif_size"
        echo ""
    fi
done

echo "Done! All MP4 files converted to GIF."
echo ""
echo "Next steps:"
echo "1. Update code references from .mp4 to .gif"
echo "2. Remove MP4 files: rm public/img/*.mp4"
echo "3. Add *.mp4 to .gitignore"
