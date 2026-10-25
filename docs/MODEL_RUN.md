# Real model run

This is not the extractive fallback. It is a live transformers.js inference on the bundled Big Buck Bunny captions.

## Hardware probe

- `navigator.gpu`: missing
- WebGPU adapter: no
- Gemma 2 2B via WebLLM: did not run. Headless Chromium in this VM has no WebGPU adapter, even with `--enable-unsafe-webgpu` and SwiftShader. MLC has no shader path to compile.

Command risk one-liners use the same engine order: Gemma via WebLLM, then DistilBART, then the heuristic sentence in `src/lib/risk.ts`. The heuristic always owns the tier and the hold. This VM still cannot start Gemma, so a live command rewrite would be DistilBART or the heuristic. Unit tests force the heuristic path.

## What ran

- Engine: DistilBART-CNN-6-6 (`Xenova/distilbart-cnn-6-6`)
- Library: `@huggingface/transformers`
- Device: CPU
- Load: 4867 ms
- Inference: 572 ms
- Gap: 3s to 16s of the Big Buck Bunny trailer captions

## Summary text

Blender Foundation presents a Peach open movie in a forest. Three small birds share a branch. Two flying squirrels steal an apple and knock the rabbit flat for sport.

## Input captions

Blender Foundation presents a Peach open movie. Dawn in a forest. Three small birds share a branch. A huge rabbit, Big Buck Bunny, wakes and stretches in the grass. The birds flutter off. Two flying squirrels drop into the clearing. The rodents steal an apple and knock the rabbit flat for sport.
