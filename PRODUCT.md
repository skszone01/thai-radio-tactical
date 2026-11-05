# Product

## Register

product

## Users
Thai radio operators, police/border patrol officers (ตชด./ตร.), rescue volunteers (กู้ภัย/กู้ชีพ), security personnel, amateur radio trainees, and civil defense cadets who need to memorize, practice, and respond fluently with Thai "รหัส ว." (Wo Radio Codes) on both desktop computers and mobile phones in the field.

## Product Purpose
An interactive tactical training and reference web application for Thai radio communication codes (รหัส ว. วิทยุสื่อสาร). It provides a fast, searchable code directory (หน้าแรกรวมคำสั่งวอ), realistic step-by-step radio transmission scenarios with synthesized audio (หน้าตัวอย่างการใช้วอสื่อสาร), progressive multi-level training drills (หน้าแบบฝึกหัดวอหลายระดับ), and a high-pressure timed reflex trainer (แบบฝึกจับเวลาในการตอบรหัสวอ). Hosted statically on GitHub Pages with full offline-ready state persistence.

## Brand Personality
Precise, field-ready, uncluttered (แม่นยำ ปฏิบัติการจริง เรียบคม). Inspired by Braun/Dieter Rams field instruments, Swiss civil defense manuals, and Rohde & Schwarz tactical radio hardware interfaces.

## Anti-references
- Generic AI SaaS landing pages with warm cream/beige backgrounds, floating glassmorphism cards, or purple/cyan gradients.
- Fake sci-fi movie HUDs with spinning radar rings, decorative corner crosshairs on every box, neon-green matrix text, or unreadable low-contrast labels.
- Identical 3-column icon-card grids, `border-left` colored side stripes, gradient text, or repetitive uppercase tracked eyebrows above every heading.

## Design Principles
1. **Instrument Clarity Over Decoration**: Every visual element functions like a physical radio transceiver control or field manual table. High contrast, tabular numerals (`tabular-nums`), and hairline structural grids replace decorative cards.
2. **Zero-Latency Field Utility**: Search, category filtering, level switching, and timed response buttons respond instantaneously on both desktop keyboards (`1-4`, `Space`, `/`) and mobile thumbs (≥48px touch targets).
3. **Authentic Radio Protocol**: Scenarios and drills teach real Thai radio etiquette (นามเรียกขาน, การเช็กสัญญาณ ว.2 / ว.16, การเดินทาง ว.21-ว.25, การรักษาความลับ ว.5 / ว.60) rather than isolated word matching alone.
4. **Daylight & Night-Watch Adaptability**: Crisp pure-white high-contrast daylight mode by default, paired with an instant low-glare tactical slate mode for night-shift duty.

## Accessibility & Inclusion
- WCAG AAA contrast (≥7:1) for primary body and code readouts; ≥4.5:1 for secondary metadata.
- Full `@media (prefers-reduced-motion: reduce)` support with instant state transitions.
- Keyboard navigable across all modules and quiz choices (`1`–`4`, `Enter`, `Escape`, `/`), plus clear screen-reader labels and mobile safe-area support.
