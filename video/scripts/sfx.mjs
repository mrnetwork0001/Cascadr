// Sound effects via ElevenLabs /v1/sound-generation. Skips files that already exist.
//   node scripts/sfx.mjs                 all missing
//   ONLY=stamp,impact node scripts/sfx.mjs   force regenerate some
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, post, retry } from "./env.mjs";

const SFX = {
  rumble: ["Deep earthquake rumble, low rolling sub bass shaking, distant, building then fading, no music", 4],
  glitch: ["Short broadcast TV glitch, digital static burst, crisp, single", 0.8],
  news_sting: ["Short modern TV news sting, two bright synth stabs, urgent, clean, no voice", 2],
  tick: ["Single crisp clock tick, close, dry, short", 0.5],
  whoosh: ["Soft fast airy whoosh, smooth cinematic transition, no music", 1.0],
  swoosh_up: ["Quick rising digital swoosh, bright and clean, UI transition, no music", 0.9],
  click: ["Soft modern UI click, single, clean, short", 0.5],
  pop: ["Soft bubbly UI pop, single, clean, short, playful", 0.5],
  blip: ["Single soft digital data blip, clean sine tone, short", 0.5],
  typing: ["Fast soft keyboard typing on a laptop, close, dry, a few seconds, no music", 2.5],
  riser: ["Tension riser, rising airy synth swell building to a peak, cinematic, no drums", 3.5],
  impact: ["Deep clean cinematic impact with a warm sub tail, modern, single hit", 2],
  chime: ["Bright clean confirmation chime, two soft ascending notes, modern, short tail", 1.5],
  stamp: ["Firm soft rubber stamp hit on paper, single, close, dry", 0.6],
  pulse: ["Electric pulse travelling along a wire, short zap that fades, clean, modern, no music", 1.2],
};

const dir = join(ROOT, "public/audio/sfx");
mkdirSync(dir, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;

for (const [name, [text, dur]] of Object.entries(SFX)) {
  const f = join(dir, `${name}.mp3`);
  if (only ? !only.includes(name) : existsSync(f)) { console.log(`${name}: skip`); continue; }
  try {
    const buf = await retry(async () => {
      const res = await post("/sound-generation?output_format=mp3_44100_128", { text, duration_seconds: dur, prompt_influence: 0.5 });
      return Buffer.from(await res.arrayBuffer());
    });
    writeFileSync(f, buf);
    console.log(`${name}: ${(buf.length / 1024).toFixed(0)}kb`);
  } catch (e) { console.error(`${name}: FAILED ${e.message}`); }
}
