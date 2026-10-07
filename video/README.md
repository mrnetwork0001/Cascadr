# Cascadr demo film

A 2:50 film made with [Remotion](https://www.remotion.dev): the problem (a headline names one company, the damage travels to the ones it never names), the evidence, and Cascadr working live.

## What is real

- **The opening event:** the Hualien earthquake of 3 April 2024 and TSMC's evacuation of its fabs. The breaking-news bar is a dramatisation of that real event, read by a second voice.
- **The evidence:** the four points on the chart (+0.36%, −1.03%, −2.00%, −3.29%) and the 42% overnight share are the event study's results in `backend/research/README.md`, with its caveat on screen (7 pairs from 3 events, 5 from one earthquake).
- **The graph:** the TSMC links, their weights and the TSMC → NVIDIA source quote are read from the live API (`src/data.json`, pulled from `/api/graph` and `/api/overview` on 2026-10-07).
- **The app:** recorded from the live site (the "why" clip opens that same decision #2107) (`scripts/capture.mjs`, Chrome at 1600×900, device scale 2) against the production API.
- **The trade call:** live decision #2107 (7 Oct, 13:02 UTC), made by the agent on its own: the LLM read a TechPowerUp headline on SK hynix at shock 0.35 and passed, because the price had already fallen 6.88% in 24 hours, more than the graph implied. Nothing was traded.
- **The order:** the AAPLUSDT short Bitget's demo exchange filled on 7 Oct (54.76 at 335.64), an operator replay labelled `manual` in the app.
- **Narration, music and sound:** ElevenLabs. The narrator is Daniel; the news anchor is Alice; the score was made with ElevenLabs Music.

## Build it

The ElevenLabs key is read at runtime from `/Users/mrnetwork/Syntura/video/.env` and never stored here.

```
npm install
npm run vo && npm run music && npm run sfx && npm run timing   # audio and timing
npm run capture && npm run encode                              # app footage (needs the site on :4010)
npm run studio                                                 # preview
npm run render                                                 # 1920×1080 master
```

`script.json` holds every spoken line; `src/timing.json` (from `scripts/timing.mjs`) places each word on the frame it is spoken, and the scenes animate on those words.
