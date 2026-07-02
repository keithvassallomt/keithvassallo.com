# keithvassallo.com — task runner. Run `just` to list recipes.

# List available recipes
default:
    @just --list

# Generate per-project OG images (run after adding a project, then commit). --dry-run to preview. Needs ffmpeg
og *args:
    scripts/generate-og-images.sh {{args}}

# Convert dropped-in project images to AVIF (see script header). Needs magick + avifenc
images *args:
    scripts/optimize-images.sh {{args}}

# Start the dev server
dev:
    npm run dev

# Build the static site to dist/
build:
    npm run build

# Preview the production build
preview:
    npm run preview
