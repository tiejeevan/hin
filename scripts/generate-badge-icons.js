const fs = require('fs');
const path = require('path');

const influenceDir = path.join(__dirname, '../apps/web/public/badge-packs/influence');
const creatorDir = path.join(__dirname, '../apps/web/public/badge-packs/creator');

// Ensure directories exist
fs.mkdirSync(influenceDir, { recursive: true });
fs.mkdirSync(creatorDir, { recursive: true });

// Common SVG Wrapper
const wrap = (content) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">\n${content}\n</svg>`;

// Influence & Virality Icons
const influenceIcons = {
  'trendsetter.svg': wrap(`
    <defs>
      <linearGradient id="trendGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF5E62" />
        <stop offset="100%" stop-color="#FF9966" />
      </linearGradient>
    </defs>
    <!-- Stylish glasses -->
    <path d="M12 24H28C29.5 24 30 25 30 26L28 34C27 38 21 38 18 38C14 38 10 35 10 31V26C10 25 10.5 24 12 24Z" fill="url(#trendGrad)" />
    <path d="M52 24H36C34.5 24 34 25 34 26L36 34C37 38 43 38 46 38C50 38 54 35 54 31V26C54 25 53.5 24 52 24Z" fill="url(#trendGrad)" />
    <rect x="28" y="26" width="8" height="4" fill="#FF5E62" />
    <!-- Sparkles -->
    <path d="M48 10L50 14L54 16L50 18L48 22L46 18L42 16L46 14Z" fill="#FFF" />
    <path d="M12 12L13 14L15 15L13 16L12 18L11 16L9 15L11 14Z" fill="#FFF" />
  `),

  'hype-engine.svg': wrap(`
    <defs>
      <linearGradient id="hypeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF3E96" />
        <stop offset="100%" stop-color="#FF8C00" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="24" stroke="url(#hypeGrad)" stroke-width="2.5" stroke-dasharray="8 6" />
    <path d="M28 20L36 32L28 44L44 32L28 20Z" fill="url(#hypeGrad)" />
    <path d="M20 26L26 32L20 38" stroke="#FFF" stroke-width="3" stroke-linecap="round" />
  `),

  'amplified.svg': wrap(`
    <defs>
      <linearGradient id="ampGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00C9FF" />
        <stop offset="100%" stop-color="#92FE9D" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="6" fill="url(#ampGrad)" />
    <circle cx="32" cy="32" r="14" fill="none" stroke="url(#ampGrad)" stroke-width="2" opacity="0.4" />
    <circle cx="32" cy="32" r="22" fill="none" stroke="url(#ampGrad)" stroke-width="3.5" opacity="0.7" />
    <circle cx="32" cy="32" r="28" fill="none" stroke="url(#ampGrad)" stroke-width="1.5" stroke-dasharray="4 4" />
  `),

  'viral-vibe.svg': wrap(`
    <defs>
      <linearGradient id="viralGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#11998E" />
        <stop offset="100%" stop-color="#38EF7D" />
      </linearGradient>
    </defs>
    <path d="M12 32C12 21 21 12 32 12C43 12 52 21 52 32C52 43 43 52 32 52" stroke="url(#viralGrad)" stroke-width="3" stroke-linecap="round" />
    <path d="M20 32C20 25.4 25.4 20 32 20C38.6 20 44 25.4 44 32" stroke="url(#viralGrad)" stroke-width="2" stroke-linecap="round" />
    <circle cx="32" cy="32" r="5" fill="#FFF" />
    <!-- Outer viral arrows -->
    <path d="M52 26V32H46" stroke="url(#viralGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  `),

  'network-hub.svg': wrap(`
    <defs>
      <linearGradient id="netGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#8A2387" />
        <stop offset="50%" stop-color="#E94057" />
        <stop offset="100%" stop-color="#F27121" />
      </linearGradient>
    </defs>
    <line x1="32" y1="32" x2="16" y2="16" stroke="url(#netGrad)" stroke-width="2" />
    <line x1="32" y1="32" x2="48" y2="16" stroke="url(#netGrad)" stroke-width="2" />
    <line x1="32" y1="32" x2="16" y2="48" stroke="url(#netGrad)" stroke-width="2" />
    <line x1="32" y1="32" x2="48" y2="48" stroke="url(#netGrad)" stroke-width="2" />
    <line x1="32" y1="32" x2="32" y2="10" stroke="url(#netGrad)" stroke-width="2" />
    <line x1="32" y1="32" x2="32" y2="54" stroke="url(#netGrad)" stroke-width="2" />
    <circle cx="32" cy="32" r="8" fill="#FFF" stroke="url(#netGrad)" stroke-width="3" />
    <circle cx="16" cy="16" r="4.5" fill="url(#netGrad)" />
    <circle cx="48" cy="16" r="4.5" fill="url(#netGrad)" />
    <circle cx="16" cy="48" r="4.5" fill="url(#netGrad)" />
    <circle cx="48" cy="48" r="4.5" fill="url(#netGrad)" />
    <circle cx="32" cy="10" r="4.5" fill="url(#netGrad)" />
    <circle cx="32" cy="54" r="4.5" fill="url(#netGrad)" />
  `),

  'echo-creator.svg': wrap(`
    <path d="M12 32C12 32 20 20 32 20C44 20 52 32 52 32C52 32 44 44 32 44C20 44 12 32 12 32Z" fill="none" stroke="#667EEA" stroke-width="2" />
    <circle cx="32" cy="32" r="8" fill="#667EEA" />
    <path d="M6 32H10M54 32H58" stroke="#667EEA" stroke-width="3" stroke-linecap="round" />
    <path d="M32 6V10M32 54V58" stroke="#667EEA" stroke-width="3" stroke-linecap="round" />
  `),

  'magnetic-profile.svg': wrap(`
    <defs>
      <linearGradient id="magGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FF416C" />
        <stop offset="100%" stop-color="#FF4B2B" />
      </linearGradient>
    </defs>
    <!-- Horseshoe magnet pointing up -->
    <path d="M20 24V40C20 46.6 25.4 52 32 52C38.6 52 44 46.6 44 40V24H36V40C36 42.2 34.2 44 32 44C29.8 44 28 42.2 28 40V24H20Z" fill="url(#magGrad)" />
    <rect x="20" y="20" width="8" height="4" fill="#BDC3C7" />
    <rect x="36" y="20" width="8" height="4" fill="#BDC3C7" />
    <!-- Magnetic waves and stars -->
    <path d="M32 14L34 18L39 18L35 20L37 25L32 22L27 25L29 20L25 18L30 18Z" fill="#F1C40F" />
    <circle cx="16" cy="12" r="2.5" fill="#F1C40F" />
    <circle cx="48" cy="12" r="2.5" fill="#F1C40F" />
  `),

  'spotlight.svg': wrap(`
    <defs>
      <linearGradient id="spotLight" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFFF80" stop-opacity="0.8" />
        <stop offset="100%" stop-color="#FFFF80" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="M26 6H38L42 12H22L26 6Z" fill="#7F8C8D" />
    <!-- Light cone -->
    <path d="M24 12H40L54 58H10L24 12Z" fill="url(#spotLight)" />
    <circle cx="32" cy="36" r="8" fill="#FFF" />
    <text x="32" y="39.5" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="#D35400" text-anchor="middle">★</text>
  `),

  'rising-star.svg': wrap(`
    <defs>
      <linearGradient id="starTail" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#F27121" stop-opacity="0.1" />
        <stop offset="100%" stop-color="#E94057" />
      </linearGradient>
    </defs>
    <!-- Shooting tail -->
    <path d="M8 52L24 38L32 46L8 52Z" fill="url(#starTail)" />
    <path d="M42 12L45 22L55 22L47 28L50 38L42 32L34 38L37 28L29 22L39 22Z" fill="#F1C40F" stroke="#D35400" stroke-width="1.5" />
    <circle cx="42" cy="22" r="14" stroke="#FFF" stroke-width="1" stroke-dasharray="4 4" opacity="0.3" />
  `),

  'golden-microphone.svg': wrap(`
    <defs>
      <linearGradient id="goldMic" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#FFE066" />
        <stop offset="100%" stop-color="#D35400" />
      </linearGradient>
    </defs>
    <rect x="25" y="8" width="14" height="24" rx="7" fill="url(#goldMic)" stroke="#9C640C" stroke-width="2" />
    <rect x="25" y="18" width="14" height="2" fill="#9C640C" />
    <path d="M20 20C20 28 24 32 32 32C40 32 44 28 44 20" fill="none" stroke="#BDC3C7" stroke-width="3" stroke-linecap="round" />
    <rect x="30" y="32" width="4" height="18" fill="#7F8C8D" />
    <rect x="22" y="50" width="20" height="6" fill="#34495E" rx="2" />
  `),

  'spark-plug.svg': wrap(`
    <defs>
      <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4facfe" />
        <stop offset="100%" stop-color="#00f2fe" />
      </linearGradient>
    </defs>
    <rect x="28" y="10" width="8" height="34" rx="2" fill="#E5E7EB" stroke="#4B5563" stroke-width="2" />
    <rect x="24" y="24" width="16" height="6" fill="url(#sparkGrad)" rx="1" />
    <!-- Lightning sparks -->
    <path d="M14 20L22 28L16 30L26 40" stroke="#00f2fe" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M50 20L42 28L48 30L38 40" stroke="#00f2fe" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
  `),

  'prism.svg': wrap(`
    <polygon points="32,8 52,48 12,48" fill="none" stroke="#BDC3C7" stroke-width="3" />
    <!-- Refracting beam -->
    <line x1="4" y1="36" x2="22" y2="28" stroke="#FFF" stroke-width="3" />
    <!-- Rainbow output -->
    <path d="M40 28L58 20" stroke="#E74C3C" stroke-width="2.5" />
    <path d="M41 30L58 26" stroke="#F1C40F" stroke-width="2.5" />
    <path d="M42 32L58 32" stroke="#2ECC71" stroke-width="2.5" />
    <path d="M41 34L58 38" stroke="#3498DB" stroke-width="2.5" />
    <path d="M40 36L58 44" stroke="#9B59B6" stroke-width="2.5" />
  `),

  'beacon.svg': wrap(`
    <defs>
      <linearGradient id="beaconGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#6B7280" />
        <stop offset="100%" stop-color="#1F2937" />
      </linearGradient>
      <linearGradient id="beamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#A7F3D0" stop-opacity="0.8" />
        <stop offset="100%" stop-color="#A7F3D0" stop-opacity="0" />
      </linearGradient>
    </defs>
    <!-- Tower -->
    <path d="M26 56L29 20H35L38 56H26Z" fill="url(#beaconGrad)" stroke="#111827" stroke-width="2" />
    <circle cx="32" cy="16" r="6" fill="#F59E0B" />
    <!-- Scanning Beam -->
    <path d="M32 16L56 8V24L32 16Z" fill="url(#beamGrad)" />
    <path d="M32 16L8 8V24L32 16Z" fill="url(#beamGrad)" />
  `),

  'vibe-check.svg': wrap(`
    <defs>
      <linearGradient id="vibeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#EC4899" />
        <stop offset="100%" stop-color="#8B5CF6" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="26" fill="url(#vibeGrad)" />
    <!-- Heart outline inside -->
    <path d="M32 44C32 44 20 34 20 26C20 21 24 18 28 20.5C32 23 32 23 32 23C32 23 32 23 36 20.5C40 18 44 21 44 26C44 34 32 44 32 44Z" fill="none" stroke="#FFF" stroke-width="2" opacity="0.4" />
    <!-- Big checkmark -->
    <path d="M22 32L29 38L44 22" fill="none" stroke="#FFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  `),

  'super-fan.svg': wrap(`
    <defs>
      <linearGradient id="fanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F472B6" />
        <stop offset="100%" stop-color="#E11D48" />
      </linearGradient>
    </defs>
    <path d="M32 54C32 54 8 36 8 22C8 12 16 6 24 10C28 12 32 18 32 18C32 18 36 12 40 10C48 6 56 12 56 22C56 36 32 54 32 54Z" fill="url(#fanGrad)" />
    <!-- Nested star -->
    <path d="M32 16L35 22L42 22L37 26L39 32L32 28L25 32L27 26L22 22L29 22Z" fill="#FFF" />
  `),

  'megaphone-neon.svg': wrap(`
    <defs>
      <linearGradient id="neoMega" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#EC4899" />
        <stop offset="100%" stop-color="#3B82F6" />
      </linearGradient>
    </defs>
    <path d="M40 18L18 26H10V38H18L40 46V18Z" fill="url(#neoMega)" stroke="#1E3A8A" stroke-width="2" />
    <path d="M40 24C44 24 48 28 48 32C48 36 44 40 40 40" fill="none" stroke="#FFF" stroke-width="3" stroke-linecap="round" />
    <rect x="14" y="38" width="5" height="12" fill="#1E3A8A" rx="2" />
  `),

  'high-frequency.svg': wrap(`
    <defs>
      <linearGradient id="freqGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#3B82F6" />
        <stop offset="50%" stop-color="#8B5CF6" />
        <stop offset="100%" stop-color="#EC4899" />
      </linearGradient>
    </defs>
    <!-- Sine waves representing frequency -->
    <path d="M6 32C10 12 14 52 18 32C22 12 26 52 30 32C34 12 38 52 42 32C46 12 50 52 54 32C55 24 57 24 58 32" fill="none" stroke="url(#freqGrad)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
  `),

  'social-crown.svg': wrap(`
    <defs>
      <linearGradient id="crownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFE259" />
        <stop offset="100%" stop-color="#FFA751" />
      </linearGradient>
    </defs>
    <path d="M10 46L16 20L28 34L32 14L36 34L48 20L54 46H10Z" fill="url(#crownGrad)" stroke="#E65100" stroke-width="2" stroke-linejoin="round" />
    <rect x="8" y="46" width="48" height="6" fill="#D84315" rx="2" />
    <circle cx="32" cy="14" r="4.5" fill="#FFF" />
  `),

  'diamond-status.svg': wrap(`
    <defs>
      <linearGradient id="diaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7F00FF" />
        <stop offset="100%" stop-color="#E100FF" />
      </linearGradient>
    </defs>
    <polygon points="32,6 56,26 32,58 8,26" fill="url(#diaGrad)" stroke="#FFF" stroke-width="2" />
    <polyline points="8,26 32,32 56,26" fill="none" stroke="#FFF" stroke-width="1.5" />
    <line x1="32" y1="32" x2="32" y2="58" stroke="#FFF" stroke-width="1.5" />
    <line x1="32" y1="6" x2="32" y2="32" stroke="#FFF" stroke-width="1.5" />
  `),

  'key-to-feed.svg': wrap(`
    <defs>
      <linearGradient id="keyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#12c2e9" />
        <stop offset="50%" stop-color="#c471ed" />
        <stop offset="100%" stop-color="#f64f59" />
      </linearGradient>
    </defs>
    <!-- Key loop shaped like hashtag -->
    <path d="M12 24H28M12 36H28M18 12V40M24 12V40" stroke="url(#keyGrad)" stroke-width="4.5" stroke-linecap="round" />
    <rect x="28" y="22" width="26" height="6" fill="url(#keyGrad)" rx="1.5" />
    <rect x="42" y="28" width="5" height="8" fill="url(#keyGrad)" />
    <rect x="49" y="28" width="5" height="8" fill="url(#keyGrad)" />
  `)
};

// Creator & Engagement Icons
const creatorIcons = {
  'night-owl.svg': wrap(`
    <defs>
      <linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFD700" />
        <stop offset="100%" stop-color="#FFA500" />
      </linearGradient>
    </defs>
    <path d="M48 40C38.6 40 30 31.4 30 22C30 16 32.6 11 36.5 8C18 8.6 6 22.8 8 40C9.6 52.8 21.2 60 36 60C45.2 60 52 54.4 56 46.5C52.6 42.6 51 40 48 40Z" fill="url(#moonGrad)" />
    <!-- Owl eyes outline -->
    <circle cx="26" cy="26" r="4.5" fill="#FFF" />
    <circle cx="38" cy="26" r="4.5" fill="#FFF" />
    <polygon points="32,28 30,34 34,34" fill="#E65100" />
  `),

  'content-machine.svg': wrap(`
    <defs>
      <linearGradient id="machineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#43C6AC" />
        <stop offset="100%" stop-color="#191654" />
      </linearGradient>
    </defs>
    <rect x="14" y="10" width="36" height="44" rx="4" fill="url(#machineGrad)" stroke="#191654" stroke-width="2" />
    <rect x="20" y="16" width="24" height="20" fill="#FFF" rx="2" />
    <!-- Pencil -->
    <path d="M22 28L32 18L36 22L26 32L22 28Z" fill="#F1C40F" />
    <!-- Gears -->
    <circle cx="32" cy="44" r="5" fill="none" stroke="#FFF" stroke-width="2.5" stroke-dasharray="4 2" />
  `),

  'deep-thinker.svg': wrap(`
    <defs>
      <linearGradient id="thinkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#a1c4fd" />
        <stop offset="100%" stop-color="#c2e9fb" />
      </linearGradient>
    </defs>
    <path d="M20 54C20 42 24 38 28 32C24 32 20 28 20 22C20 12 28 6 38 8C46 10 50 18 48 26C46 34 42 38 42 54H20Z" fill="none" stroke="#2C3E50" stroke-width="3" />
    <!-- Brain node network -->
    <circle cx="34" cy="20" r="3.5" fill="url(#thinkGrad)" stroke="#2C3E50" stroke-width="1.5" />
    <circle cx="44" cy="22" r="3.5" fill="url(#thinkGrad)" stroke="#2C3E50" stroke-width="1.5" />
    <circle cx="38" cy="30" r="3.5" fill="url(#thinkGrad)" stroke="#2C3E50" stroke-width="1.5" />
    <line x1="34" y1="20" x2="44" y2="22" stroke="#2C3E50" stroke-width="1.5" />
    <line x1="44" y1="22" x2="38" y2="30" stroke="#2C3E50" stroke-width="1.5" />
    <line x1="34" y1="20" x2="38" y2="30" stroke="#2C3E50" stroke-width="1.5" />
  `),

  'streak-master.svg': wrap(`
    <defs>
      <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#E53935" />
        <stop offset="50%" stop-color="#F57C00" />
        <stop offset="100%" stop-color="#FBC02D" />
      </linearGradient>
    </defs>
    <path d="M32 4C32 4 48 20 48 36C48 46.5 39.5 56 32 56C24.5 56 16 46.5 16 36C16 20 32 4Z" fill="url(#fireGrad)" />
    <!-- Crown on fire -->
    <path d="M22 28L26 22L32 26L38 22L42 28H22Z" fill="#FFF" opacity="0.8" />
  `),

  'media-mogul.svg': wrap(`
    <circle cx="32" cy="32" r="26" fill="#2C3E50" stroke="#1A252F" stroke-width="2.5" />
    <circle cx="32" cy="32" r="16" fill="#FFF" />
    <circle cx="32" cy="32" r="10" fill="#2980B9" />
    <circle cx="36" cy="28" r="3" fill="#FFF" opacity="0.6" />
    <!-- Film strips lines -->
    <line x1="12" y1="32" x2="52" y2="32" stroke="#BDC3C7" stroke-width="1.5" stroke-dasharray="4 4" />
  `),

  'icebreaker.svg': wrap(`
    <defs>
      <linearGradient id="iceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E0F7FA" />
        <stop offset="100%" stop-color="#80DEEA" />
      </linearGradient>
    </defs>
    <rect x="14" y="14" width="36" height="36" rx="6" fill="url(#iceGrad)" stroke="#00ACC1" stroke-width="2.5" />
    <!-- Crack paths -->
    <path d="M32 14V32L20 40M32 32L44 42" stroke="#00ACC1" stroke-width="3" stroke-linecap="round" />
    <!-- Inner speech bubble icon -->
    <circle cx="32" cy="24" r="4.5" fill="#FFF" />
  `),

  'bridge-builder.svg': wrap(`
    <defs>
      <linearGradient id="bridgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#83a4d4" />
        <stop offset="100%" stop-color="#b6fbff" />
      </linearGradient>
    </defs>
    <rect x="10" y="38" width="6" height="18" fill="#5D6D7E" />
    <rect x="48" y="38" width="6" height="18" fill="#5D6D7E" />
    <path d="M10 40C20 20 44 20 54 40" fill="none" stroke="url(#bridgeGrad)" stroke-width="5" stroke-linecap="round" />
    <path d="M14 44L50 44" stroke="#FFF" stroke-width="2" stroke-dasharray="3 3" />
  `),

  'lighthouse.svg': wrap(`
    <defs>
      <linearGradient id="lightHouse" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E74C3C" />
        <stop offset="100%" stop-color="#C0392B" />
      </linearGradient>
      <linearGradient id="beamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F9E79F" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#F9E79F" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="M26 56L29 22H35L38 56H26Z" fill="url(#lightHouse)" stroke="#7B241C" stroke-width="2" />
    <rect x="29" y="30" width="6" height="4" fill="#FFF" />
    <rect x="29" y="42" width="6" height="4" fill="#FFF" />
    <rect x="27" y="16" width="10" height="6" fill="#F1C40F" />
    <!-- Guiding beam -->
    <path d="M32 19L58 10V28L32 19Z" fill="url(#beamGrad)" />
  `),

  'mind-map.svg': wrap(`
    <circle cx="32" cy="18" r="6" fill="#E74C3C" />
    <circle cx="18" cy="38" r="5" fill="#3498DB" />
    <circle cx="46" cy="38" r="5" fill="#2ECC71" />
    <circle cx="32" cy="50" r="5" fill="#F1C40F" />
    <line x1="32" y1="24" x2="18" y2="33" stroke="#95A5A6" stroke-width="2" />
    <line x1="32" y1="24" x2="46" y2="33" stroke="#95A5A6" stroke-width="2" />
    <line x1="32" y1="24" x2="32" y2="45" stroke="#95A5A6" stroke-width="2" />
  `),

  'golden-feather.svg': wrap(`
    <defs>
      <linearGradient id="goldFeath" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFE066" />
        <stop offset="100%" stop-color="#D35400" />
      </linearGradient>
    </defs>
    <path d="M12 52L22 46C28 42 34 26 48 10C36 18 22 28 18 36L12 52Z" fill="url(#goldFeath)" stroke="#9C640C" stroke-width="1.5" />
    <line x1="12" y1="52" x2="40" y2="20" stroke="#9C640C" stroke-width="2" />
  `),

  'infinite-scroll.svg': wrap(`
    <defs>
      <linearGradient id="infGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#9b59b6" />
        <stop offset="100%" stop-color="#3498db" />
      </linearGradient>
    </defs>
    <path d="M22 24C16 24 12 28 12 32C12 36 16 40 22 40C28 40 36 24 42 24C48 24 52 28 52 32C52 36 48 40 42 40C36 40 28 24 22 24Z" fill="none" stroke="url(#infGrad)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
  `),

  'hour-glass.svg': wrap(`
    <defs>
      <linearGradient id="glassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFF" />
        <stop offset="100%" stop-color="#E2E8F0" />
      </linearGradient>
    </defs>
    <path d="M16 10H48V16C48 24 38 28 38 28C38 28 48 32 48 40V46H16V40C16 32 26 28 26 28C26 28 16 24 16 16V10Z" fill="none" stroke="#475569" stroke-width="3.5" stroke-linejoin="round" />
    <polygon points="20,14 44,14 32,26" fill="#F59E0B" />
    <circle cx="32" cy="42" r="4" fill="#F59E0B" />
  `),

  'neon-brain.svg': wrap(`
    <defs>
      <linearGradient id="brainNeon" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#EC4899" />
        <stop offset="100%" stop-color="#8B5CF6" />
      </linearGradient>
    </defs>
    <path d="M26 24C20 24 18 28 18 32C18 36 22 38 26 38C26 42 30 46 36 46C42 46 44 42 44 38C48 38 52 36 52 32C52 28 50 24 44 24C44 20 40 16 36 16C32 16 26 20 26 24Z" fill="none" stroke="url(#brainNeon)" stroke-width="3" stroke-linecap="round" />
    <path d="M32 18V44" stroke="url(#brainNeon)" stroke-width="2" stroke-dasharray="3 3" />
  `),

  'catalyst-spark.svg': wrap(`
    <defs>
      <linearGradient id="catGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#E0F2FE" />
        <stop offset="100%" stop-color="#38BDF8" />
      </linearGradient>
    </defs>
    <path d="M24 8H40M28 8V20L14 48C12 52 16 56 22 56H42C48 56 52 52 50 48L36 20V8" stroke="#0284C7" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M19 44C24 40 40 40 45 44" stroke="#FFF" stroke-width="2" fill="none" opacity="0.5" />
    <circle cx="32" cy="36" r="3" fill="#FFF" />
    <circle cx="28" cy="46" r="2" fill="#FFF" />
  `),

  'peace-keeper.svg': wrap(`
    <defs>
      <linearGradient id="peaceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10B981" />
        <stop offset="100%" stop-color="#059669" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="26" fill="url(#peaceGrad)" />
    <!-- Dove outline -->
    <path d="M20 24C24 24 28 28 32 30C36 28 40 24 44 24C44 28 40 34 32 36C24 34 20 28 20 24Z" fill="#FFF" />
    <path d="M32 36V46" stroke="#FFF" stroke-width="2.5" stroke-linecap="round" />
  `),

  'curator.svg': wrap(`
    <defs>
      <linearGradient id="curGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#F59E0B" />
        <stop offset="100%" stop-color="#EF4444" />
      </linearGradient>
    </defs>
    <rect x="12" y="12" width="40" height="40" rx="4" fill="none" stroke="url(#curGrad)" stroke-width="4.5" />
    <path d="M32 40C32 40 22 30 22 24C22 20 25 18 28 20C32 22 32 22 32 22C32 22 32 22 36 20C40 18 43 20 43 24C43 30 32 40 32 40Z" fill="url(#curGrad)" />
  `),

  'early-adopter.svg': wrap(`
    <defs>
      <linearGradient id="circuitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#10B981" />
        <stop offset="100%" stop-color="#3B82F6" />
      </linearGradient>
    </defs>
    <!-- Plant growing from digital plate -->
    <rect x="16" y="48" width="32" height="6" fill="#374151" rx="1" />
    <path d="M32 48V20" stroke="url(#circuitGrad)" stroke-width="3" stroke-linecap="round" />
    <path d="M32 32C32 32 22 26 22 20C22 26 32 32 32 32Z" fill="url(#circuitGrad)" />
    <path d="M32 26C32 26 42 20 42 14C42 20 32 26 32 26Z" fill="url(#circuitGrad)" />
  `),

  'signal-booster.svg': wrap(`
    <defs>
      <linearGradient id="sigGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#EC4899" />
        <stop offset="100%" stop-color="#F43F5E" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="46" r="4" fill="url(#sigGrad)" />
    <path d="M24 38C28 34 36 34 40 38" fill="none" stroke="url(#sigGrad)" stroke-width="2.5" stroke-linecap="round" />
    <path d="M16 30C24 22 40 22 48 30" fill="none" stroke="url(#sigGrad)" stroke-width="2.5" stroke-linecap="round" />
    <path d="M8 22C20 10 44 10 56 22" fill="none" stroke="url(#sigGrad)" stroke-width="2.5" stroke-linecap="round" opacity="0.5" />
  `),

  'book-worm.svg': wrap(`
    <path d="M12 44V14C12 12 14 10 16 10H48C50 10 52 12 52 14V44" fill="none" stroke="#4B5563" stroke-width="3" />
    <path d="M12 44C12 48 16 52 20 52H48" stroke="#4B5563" stroke-width="3.5" fill="none" stroke-linecap="round" />
    <!-- Glowing pages -->
    <path d="M22 18H42M22 26H42M22 34H34" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" />
  `),

  'anchor.svg': wrap(`
    <circle cx="32" cy="14" r="6" fill="none" stroke="#475569" stroke-width="3" />
    <line x1="32" y1="20" x2="32" y2="48" stroke="#475569" stroke-width="4.5" />
    <line x1="20" y1="30" x2="44" y2="30" stroke="#475569" stroke-width="3" />
    <!-- Hooks -->
    <path d="M14 36C14 46 22 52 32 52C42 52 50 46 50 36" fill="none" stroke="#475569" stroke-width="4.5" stroke-linecap="round" />
  `)
};

// Write files
console.log('Writing Influence Icons...');
for (const [filename, content] of Object.entries(influenceIcons)) {
  fs.writeFileSync(path.join(influenceDir, filename), content.trim());
}

console.log('Writing Creator Icons...');
for (const [filename, content] of Object.entries(creatorIcons)) {
  fs.writeFileSync(path.join(creatorDir, filename), content.trim());
}

console.log('Innovative Badge Pack icons successfully generated.');
