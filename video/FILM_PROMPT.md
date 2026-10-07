# Prompt: build a 2-3 minute demo film like Cascadr's

Copy everything below the line into a new session opened in the new project's folder. Fill in the five placeholders first.

---

Build a 2 to 3 minute demo film for **<PROJECT NAME>** (this folder: `<ABSOLUTE PATH OF THE NEW PROJECT>`), for **<AUDIENCE / EVENT, e.g. the judges of a hackathon>**. The film must show the problem, what <PROJECT NAME> does about it, and what makes it different, using this project's own content, data, brand and product. Make it look like professional motion design, not a screen recording with a voice over it.

Live product URL: **<LIVE URL or local dev URL>**. One-line thesis, if I have one: **<ONE LINE>** (otherwise derive it from the project).

## References: study them, do not copy them

These are finished films I made the same way. Read them to learn the pipeline, structure and craft, then make something new for this project. Do not reuse their script, scenes, branding, colours, footage or copy.

1. `/Users/mrnetwork/Cascadr/video`: the most complete and most recent; start here. 12 scenes, 2:50. It has:
   - `script.json`;
   - `scripts/` holding `voiceover.mjs`, `vofx.mjs`, `timing.mjs`, `music.mjs`, `sfx.mjs`, `capture.mjs`, `cdp.mjs`, `encode.mjs`, `stills.mjs`, `finish.mjs` and `voices.mjs`;
   - `src/ui/` holding `Words`, `Chrome`, `Captions`, `Footage`, `Mark`, `Count`, `Glass` and `Grain`;
   - `src/Film.tsx`, which does crossfades with a frozen first frame, music ducking and word-synced sound effects;
   - `README.md`, with a "What is real" section.
2. `/Users/mrnetwork/Test-It/calmr/video`: where the pipeline came from. It has a recurring motif (a pulse line) that carries the whole film.
3. `/Users/mrnetwork/Scenar/video`, `/Users/mrnetwork/Test-It/surgr/demo/remotion`, `/Users/mrnetwork/Test-It/judr/demo/remotion` and `/Users/mrnetwork/NimSnap/demo/remotion`: other films, with their capture and timing approaches.
4. Style reference: `/Users/mrnetwork/Downloads/sample.MP4` (15 s, 1080p60). Extract frames with ffmpeg and look at them. Take from it:
   - small monospace corner labels with a running timecode;
   - big, tightly kerned kinetic type with one word per line set in an italic serif in the brand colour;
   - cards and objects that pop in;
   - full-bleed brand-colour scenes;
   - a fine grain/halftone texture.

## Tools and materials

- **Remotion 4.0.530.** Use `remotion`, `@remotion/cli`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/google-fonts`, `@remotion/paths`, `@remotion/shapes`, `@remotion/transitions` and `@remotion/media-utils`, with React 19 and TypeScript. Copy `package.json`, `tsconfig.json` and `remotion.config.ts` from the Cascadr film as a starting point.
- **ElevenLabs** for everything you hear:
  - narration through `/v1/text-to-speech/{voice}/with-timestamps` (model `eleven_multilingual_v2`), for word timings;
  - the score through `/v1/music`;
  - sound effects through `/v1/sound-generation`, whose minimum duration is 0.5 s.
- **The ElevenLabs key** is in `/Users/mrnetwork/Syntura/video/.env` as `ELEVENLABS_API_KEY`. Read it at runtime the way the reference `scripts/env.mjs` does. Never print it, log it, copy it into this project, or commit it.
- **ffmpeg / ffprobe** for loudness, encoding, frame checks and contact sheets.
- **Headless Google Chrome over the DevTools protocol** (the reference `cdp.mjs`) for recording the real product as screencast frames. `/Applications/Google Chrome.app` is installed.

## Hard rules

- **Real content only.** Every number, name, decision, quote and screen must come from this project or its real sources: its data, API, research or README. Do not invent statistics, users, testimonials or UI states. If something is a replay, simulation or dramatisation, label it on screen and in the README.
- **Real product footage.** Record the actual running product with live data. Do not build fake UI mockups of it; motion-graphic cards may present real data.
- **Leave other projects alone.** Work only inside this project's folder. Do not edit any reference folder.
- **Don't break the app.**
  - Put the film in `video/` inside this project.
  - Exclude `video` from the app's TypeScript `include` and from any deploy (for example a `.vercelignore`), so the app's build never sees it.
  - Gitignore `video/node_modules/`, `video/out/`, `video/.cache/`, `video/public/footage/` and `video/public/stills/`.
  - Never stop or restart a dev server that is already running, and never run a production build that would clobber it.
- **Copy rules.** No em dashes anywhere. Short spoken sentences. Plain words.

## Process

1. **Understand the project.**
   - Read its README and spec, run or open it, and pull the real data it has: counts, results, a real example decision or output.
   - Write down the thesis, the viewer, the three things that make it different (each with a proof point), and a real, concrete moment for the cold open: a real event, user or situation the product exists for.
2. **Write `video/script.json`.**
   - 10 to 13 scenes and about 360 to 420 spoken words, which comes to 2:30 to 2:55 at a natural pace.
   - The arc, adapted to this project:
     - a cold open on a real moment;
     - the problem;
     - the evidence (real numbers);
     - the gap (what people cannot do today);
     - the turn (logo and tagline);
     - one scene per stage of how the product works, over real footage;
     - what makes it different (three claims, each with its proof);
     - the close (logo, tagline, URL, event).
   - Write lines that contain the exact words the visuals will sync to.
3. **Choose voices.**
   - Run a voices listing like `scripts/voices.mjs` and pick a narrator whose voice suits the subject: a lady or a man, whichever fits.
   - Add a second voice only for a diegetic line, such as a news anchor, a user or a doctor. Give that line its own audio treatment, for example the broadcast EQ in the reference `vofx.mjs`.
   - Set per-line performance in `OVERRIDES`.
   - Loudness-normalise each line to -16 LUFS.
4. **Run `node scripts/timing.mjs`** to build `src/timing.json`, which places every word on a frame. Set its frame budget to the target length. Scenes animate on `wordAt(scene, word)`, never on guessed frames.
5. **Make the music** with the ElevenLabs Music API. The prompt must follow the film's own timeline: tension in the open, a riser into the turn, a clean hit and release on the logo, a confident groove under the product, a lift for "what makes it different", and a resolve at the close. No vocals. Duck it under every spoken line, as `Film.tsx` does.
6. **Make the sound effects.** About 12 to 16 short ones that fit this subject (whoosh, pop, click, tick, impact, riser, chime, stamp, glitch, plus subject-specific ones), each placed on a word or event, at low volumes.
7. **Record the footage.**
   - Write `scripts/capture.mjs` on the `cdp.mjs` harness.
   - Use a 1600×900 viewport at device scale 2.
   - Make calm, eased movements, real clicks, and holds before and after each action.
   - Record marks for key moments, and rects for the panels the camera will zoom into.
   - Then `encode.mjs` turns the clips into 30 fps H.264 and writes `src/footage.json`.
   - Take stills too.
   - Check frames from every clip before using it: data loaded, no errors, sharp.
8. **Design the film from this project's brand.**
   - Use its logo (redrawn as an animatable SVG), colour tokens and fonts.
   - Use three tones: light, dark and full-bleed brand colour.
   - Invent **one visual motif unique to this project** that recurs through the film, the way Cascadr uses nodes cascading down a chain and Calmr uses a pulse line.
   - Reuse the craft pieces:
     - kinetic `Words` with an italic serif accent word;
     - corner `Chrome` with the scene tag and timecode;
     - word-lit `Captions` on frosted pills, hidden where big type already carries the words;
     - a `Browser` frame that plays footage and moves the camera to a rect;
     - `Count` for real numbers;
     - a subtle `Grain`;
     - crossfades that hold the incoming scene's first frame (`Freeze`).
9. **Check as you build.**
   - Render stills of every scene by bundling once and rendering frames at half scale (`scripts/stills.mjs`), then tile them with ffmpeg `xstack` and look at them.
   - Fix overlaps, text collisions, empty space and unreadable UI.
   - Then render a half-scale draft and check its loudness with `ebur128` and the scene boundaries.
10. **Make the final versions.**
    - Render a 4K master: `--scale 2 --image-format png --codec h264 --crf 14 --x264-preset slow --pixel-format yuv420p --audio-codec aac --audio-bitrate 320k`.
    - Bring the audio to -14 LUFS with true peak at or below -1 dBTP using two-pass loudnorm, copying the video stream (`scripts/finish.mjs`).
    - Make 1080p by downscaling the 4K master with Lanczos (CRF 16, slow).
    - Render a 1920×1080 thumbnail from a `Poster` still.
    - Check frames from every scene of the final file.

## Deliverables

- `video/out/<project>-demo-4k.mp4`, `video/out/<project>-demo-1080p.mp4` and `video/out/<project>-thumbnail.png`.
- `video/README.md` with "What is real" (where every number, quote, clip and voice came from) and "Build it" (the commands).
- A short YouTube title, and a description with links and chapters taken from the scene start times.
- A note of the final length. Standard X accounts only accept videos up to 2:20.

Work in this order and tell me after the script, after the first stills, after the draft, and after the final. Ask me only if a choice is genuinely mine, such as the narrator's gender or which real example to feature.
