# Design System: ว.TACTICAL (ระบบฝึกปฏิบัติการรหัสวิทยุสื่อสาร)

## 1. Visual Direction & Scene
**Scene**: A radio operator studying and drilling Thai ว. codes at a command desk by day or inside a patrol unit at night: crisp field-manual typography, hairline tabular grids, tactile Push-To-Talk (PTT) feedback, and zero visual clutter.
**Color Strategy**: Restrained Product Palette anchored on **Brand Seed 176** (`oklch(0.300 0.071 120.0)`, deep tactical field olive) against a pure white surface (`oklch(1.000 0.000 0)`) in Day Mode and deep carbon slate (`oklch(0.115 0.008 125.0)`) in Night Mode, with Signal Amber-Orange (`oklch(0.550 0.175 42.0)`) reserved strictly for active transmission (TX), countdown urgency, and primary interactive triggers.

## 2. Color Palette (OKLCH Only)
All colors are defined strictly in OKLCH (no hex values):

### Day Mode (Default: Field Manual & Command Desk)
- `--bg`: `oklch(1.000 0.000 0)` (Pure white)
- `--surface`: `oklch(0.968 0.005 120.0)` (Tactical instrument panel tint)
- `--surface-raised`: `oklch(0.942 0.008 120.0)` (Active row / control well)
- `--ink`: `oklch(0.165 0.015 120.0)` (Deep charcoal-olive ink, contrast > 14:1 vs bg)
- `--muted`: `oklch(0.400 0.018 120.0)` (Secondary technical text, contrast > 6.0:1 vs bg)
- `--border`: `oklch(0.865 0.010 120.0)` (1px structural hairline)
- `--border-strong`: `oklch(0.720 0.018 120.0)` (Emphasized grid divider)
- `--primary`: `oklch(0.300 0.071 120.0)` (Seed-176 Deep Tactical Olive, takes white text `oklch(1.000 0.000 0)`)
- `--primary-subtle`: `oklch(0.935 0.025 120.0)` (Pale olive tag fill, takes `--ink` text)
- `--accent`: `oklch(0.550 0.175 42.0)` (Signal TX Orange, takes white text `oklch(1.000 0.000 0)`)
- `--success`: `oklch(0.450 0.130 148.0)` (Confirmed / RX Clear, takes white text)
- `--warning`: `oklch(0.480 0.135 75.0)` (Caution / Standby, takes white text)
- `--danger`: `oklch(0.480 0.180 25.0)` (Emergency / Incorrect, takes white text)

### Night Mode (`[data-theme="night"]`: Night Watch / Low Light)
- `--bg`: `oklch(0.115 0.008 125.0)`
- `--surface`: `oklch(0.155 0.010 125.0)`
- `--surface-raised`: `oklch(0.200 0.014 125.0)`
- `--ink`: `oklch(0.945 0.008 120.0)`
- `--muted`: `oklch(0.690 0.015 120.0)`
- `--border`: `oklch(0.245 0.012 125.0)`
- `--border-strong`: `oklch(0.360 0.020 125.0)`
- `--primary`: `oklch(0.440 0.095 125.0)` (Takes white text `oklch(1.000 0.000 0)`)
- `--primary-subtle`: `oklch(0.220 0.035 125.0)`
- `--accent`: `oklch(0.580 0.180 42.0)` (Takes white text `oklch(1.000 0.000 0)`)

## 3. Typography
- **Primary UI & Thai Prose**: `'Bai Jamjuree'`, `'Sarabun'`, system-ui sans-serif for crisp Thai and Latin legibility.
- **Technical Readouts, Codes & Timers**: `'JetBrains Mono'`, monospace with `font-variant-numeric: tabular-nums` so `ว.00` to `ว.621`, frequencies (`152.450 MHz`), and millisecond timers (`03.84s`) never jitter.
- **Fixed Product Type Scale**:
  - `--text-xs`: `0.75rem` (12px)
  - `--text-sm`: `0.875rem` (14px)
  - `--text-base`: `1rem` (16px)
  - `--text-lg`: `1.125rem` (18px)
  - `--text-xl`: `1.3125rem` (21px)
  - `--text-2xl`: `1.625rem` (26px)
  - `--text-3xl`: `2.125rem` (34px)

## 4. Layout & Structural Architecture
- **Top Transceiver Header**: Fixed instrument header displaying active channel frequency (`CH-01 · 152.450 MHz`), TX/RX signal LED indicator, Audio Squelch toggle, Night-Watch toggle, and primary navigation tabs on Desktop.
- **Mobile Bottom Navigation Bar**: Sticky 4-tab bar on screens `< 768px` with `env(safe-area-inset-bottom)` support and 56px touch targets.
- **Hairline Structural Grids**: Instead of bloated drop-shadow cards or banned `border-left` stripes, lists and directories use `1px solid var(--border)` tabular rows with crisp hover/selection states and inline detail expansion.
