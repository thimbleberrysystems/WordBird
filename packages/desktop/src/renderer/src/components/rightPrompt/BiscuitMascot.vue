<template>
  <div
    class="mascot"
    :class="[`mascot--${mood}`, awake ? `mascot--act-${act}` : '', { 'mascot--reduced': reducedMotion }]"
    @click="$emit('react')"
  >
    <svg
      class="mascot__svg"
      viewBox="0 0 100 100"
      role="img"
      :aria-label="ariaLabel"
    >
      <defs>
        <linearGradient
          :id="`${uid}-body`"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0"
            stop-color="#F2C662"
          />
          <stop
            offset="1"
            stop-color="#DDA338"
          />
        </linearGradient>
        <g
          :id="`${uid}-shape`"
          class="mascot__shape"
        >
          <circle
            v-for="(b, i) in bumps"
            :key="`b${i}`"
            :cx="b.x"
            :cy="b.y"
            :r="BUMP_R"
            fill="#E8B24C"
          />
          <rect
            x="15"
            y="27"
            width="70"
            height="46"
            rx="12"
            :fill="`url(#${uid}-body)`"
          />
          <rect
            x="19.5"
            y="31.5"
            width="61"
            height="37"
            rx="9"
            fill="none"
            stroke="#C98A2E"
            stroke-width="1.4"
            opacity="0.55"
          />
          <circle
            v-for="(d, i) in dots"
            :key="`d${i}`"
            :cx="d.x"
            :cy="d.y"
            :r="DOT_R"
            fill="#B4791F"
            opacity="0.7"
          />
        </g>
        <mask :id="`${uid}-bite`">
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill="white"
          />
          <circle
            class="mascot__bite"
            cx="83"
            cy="28"
            r="14"
            fill="black"
          />
        </mask>
        <clipPath :id="`${uid}-half-l`"><rect
          x="0"
          y="0"
          width="50"
          height="100"
        /></clipPath>
        <clipPath :id="`${uid}-half-r`"><rect
          x="50"
          y="0"
          width="50"
          height="100"
        /></clipPath>
        <clipPath :id="`${uid}-body-clip`"><rect
          x="15"
          y="27"
          width="70"
          height="46"
          rx="12"
        /></clipPath>
      </defs>

      <g class="mascot__inner">
        <!-- Fresh-from-the-oven glow (baked). -->
        <ellipse
          class="mascot__glow"
          cx="50"
          cy="50"
          rx="45"
          ry="33"
          fill="#FFD27A"
        />

        <!-- Steam rising off the biscuit itself (baked). -->
        <g class="mascot__bsteam">
          <path
            d="M42 26 Q39 20 42 15 Q45 10 42 5"
            fill="none"
            stroke="#E7D6B4"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <path
            d="M58 26 Q61 20 58 15 Q55 10 58 5"
            fill="none"
            stroke="#E7D6B4"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </g>

        <!-- THE CHARACTER, rigged as one: shape + surface overlays + face all
             live in this group so a body motion moves the whole biscuit
             together — the face never detaches from the body. Props that are
             NOT the biscuit (mugs, book, quill, crumbs, sparkles…) stay
             outside so they don't rotate/dunk with it. -->
        <g class="mascot__char">
          <!-- The biscuit itself (masked so a bite can be taken). -->
          <use
            class="mascot__body"
            :href="`#${uid}-shape`"
            :mask="`url(#${uid}-bite)`"
          />
          <use
            class="mascot__half mascot__half--l"
            :href="`#${uid}-shape`"
            :clip-path="`url(#${uid}-half-l)`"
          />
          <use
            class="mascot__half mascot__half--r"
            :href="`#${uid}-shape`"
            :clip-path="`url(#${uid}-half-r)`"
          />
          <path
            class="mascot__crack"
            d="M50 27 L46 38 L54 50 L47 62 L50 73"
            fill="none"
            stroke="#8A5A22"
            stroke-width="1.6"
            stroke-linecap="round"
          />

          <!-- Overlays on the body (toast darkening, sugar dusting, soak). -->
          <rect
            class="mascot__toast"
            x="15"
            y="27"
            width="70"
            height="46"
            :clip-path="`url(#${uid}-body-clip)`"
            fill="#6E4520"
            opacity="0"
          />
          <rect
            class="mascot__dust"
            x="15"
            y="27"
            width="70"
            height="24"
            :clip-path="`url(#${uid}-body-clip)`"
            fill="#FFFFFF"
            opacity="0"
          />
          <rect
            class="mascot__soak"
            x="15"
            y="58"
            width="70"
            height="15"
            :clip-path="`url(#${uid}-body-clip)`"
            fill="#7A4E22"
            opacity="0"
          />
          <path
            class="mascot__icing"
            d="M25 35 L33 31 L41 35 L49 31 L57 35 L65 31 L73 35"
            fill="none"
            stroke="#F7B8CE"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Embossed face. -->
          <g class="mascot__face">
            <ellipse
              class="mascot__blush"
              cx="36"
              cy="52"
              rx="4"
              ry="2.4"
              fill="#F0A15A"
              opacity="0.55"
            />
            <ellipse
              class="mascot__blush"
              cx="64"
              cy="52"
              rx="4"
              ry="2.4"
              fill="#F0A15A"
              opacity="0.55"
            />
            <g class="mascot__eyes">
              <ellipse
                class="mascot__eye mascot__eye--l"
                cx="42"
                cy="45"
                rx="3"
                ry="4"
                fill="#4A3312"
              />
              <ellipse
                class="mascot__eye mascot__eye--r"
                cx="58"
                cy="45"
                rx="3"
                ry="4"
                fill="#4A3312"
              />
              <circle
                cx="43"
                cy="43.5"
                r="1"
                fill="#FFF3D6"
              />
              <circle
                cx="59"
                cy="43.5"
                r="1"
                fill="#FFF3D6"
              />
            </g>
            <path
              class="mascot__mouth"
              d="M44 55 Q50 61 56 55"
              fill="none"
              stroke="#4A3312"
              stroke-width="2"
              stroke-linecap="round"
            />
          </g>
        </g>
        <!-- /character -->
        <!-- Drink vessels — IN FRONT of the character so the biscuit dunks INTO
             them (the submerged part hides behind the cup; the face stays
             above the surface). Only one shows at a time. -->
        <g class="mascot__coffee">
          <path
            class="mascot__steam"
            d="M45 70 Q42 64 45 58 Q48 52 45 46"
            fill="none"
            stroke="#D8C4A0"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <path
            class="mascot__steam"
            d="M56 70 Q59 64 56 58 Q53 52 56 46"
            fill="none"
            stroke="#D8C4A0"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <path
            d="M34 74 H66 L63 92 Q62 95 59 95 H41 Q38 95 37 92 Z"
            fill="#B57A45"
          />
          <path
            d="M66 77 Q74 77 74 83 Q74 89 66 89"
            fill="none"
            stroke="#B57A45"
            stroke-width="3.4"
          />
          <ellipse
            cx="50"
            cy="74"
            rx="16"
            ry="4.2"
            fill="#4A2E17"
          />
        </g>
        <g class="mascot__milk">
          <path
            d="M34 72 H66 L63 95 Q63 96 61 96 H39 Q37 96 37 95 Z"
            fill="#DCEBF7"
            opacity="0.92"
          />
          <path
            d="M35.5 78 H64.5 L63 92 H37 Z"
            fill="#EDF5FC"
          />
          <ellipse
            cx="50"
            cy="72"
            rx="16"
            ry="4"
            fill="#F4FAFF"
          />
          <path
            d="M34 72 H66 L63 95 Q63 96 61 96 H39 Q37 96 37 95 Z"
            fill="none"
            stroke="#B9D4EA"
            stroke-width="1.3"
          />
        </g>
        <g class="mascot__tea">
          <path
            class="mascot__steam"
            d="M46 72 Q43 66 46 60 Q49 54 46 48"
            fill="none"
            stroke="#D8C4A0"
            stroke-width="2"
            stroke-linecap="round"
          />
          <ellipse
            cx="50"
            cy="93"
            rx="22"
            ry="3.6"
            fill="#D8B98C"
          />
          <path
            d="M35 76 H65 L62 90 Q61 92 59 92 H41 Q39 92 38 90 Z"
            fill="#F0E4CE"
          />
          <path
            d="M65 79 Q72 79 72 84 Q72 89 65 89"
            fill="none"
            stroke="#F0E4CE"
            stroke-width="3"
          />
          <ellipse
            cx="50"
            cy="76"
            rx="14"
            ry="3.4"
            fill="#B07A3E"
          />
          <line
            x1="56"
            y1="76"
            x2="60"
            y2="68"
            stroke="#C9A46A"
            stroke-width="1"
          />
          <rect
            x="58"
            y="63"
            width="5"
            height="5"
            rx="1"
            fill="#D8C09A"
          />
        </g>

        <!-- Sugar sprinkling down from above (sugar). Faint edge so the white
             crystals read against a light background. -->
        <g
          class="mascot__sugar"
          fill="#FFFFFF"
          stroke="#E6D9BE"
          stroke-width="0.35"
        >
          <circle
            cx="30"
            cy="16"
            r="1.9"
          />
          <circle
            cx="38"
            cy="9"
            r="1.5"
          />
          <circle
            cx="46"
            cy="14"
            r="2"
          />
          <circle
            cx="52"
            cy="7"
            r="1.7"
          />
          <circle
            cx="58"
            cy="13"
            r="2.1"
          />
          <circle
            cx="66"
            cy="9"
            r="1.7"
          />
          <circle
            cx="72"
            cy="15"
            r="1.8"
          />
          <circle
            cx="42"
            cy="5"
            r="1.4"
          />
          <circle
            cx="62"
            cy="4"
            r="1.4"
          />
        </g>

        <!-- Crumbs: sprinkle / shower / fly. -->
        <g class="mascot__crumbs">
          <circle
            class="mascot__crumb"
            cx="28"
            cy="70"
            r="1.6"
            fill="#C98A2E"
          />
          <circle
            class="mascot__crumb"
            cx="50"
            cy="76"
            r="2"
            fill="#B4791F"
          />
          <circle
            class="mascot__crumb"
            cx="72"
            cy="69"
            r="1.4"
            fill="#C98A2E"
          />
          <circle
            class="mascot__crumb"
            cx="38"
            cy="74"
            r="1.3"
            fill="#B4791F"
          />
          <circle
            class="mascot__crumb"
            cx="60"
            cy="73"
            r="1.7"
            fill="#C98A2E"
          />
          <circle
            class="mascot__crumb"
            cx="46"
            cy="71"
            r="1.2"
            fill="#B4791F"
          />
        </g>

        <!-- Front-of-biscuit props (one act each). -->
        <g class="mascot__book">
          <path
            d="M34 56 Q50 52 50 56 Q50 52 66 56 L66 71 Q50 67 50 71 Q50 67 34 71 Z"
            fill="#F3E9D2"
            stroke="#B79B6A"
            stroke-width="1"
          />
          <line
            x1="50"
            y1="56"
            x2="50"
            y2="71"
            stroke="#B79B6A"
            stroke-width="1"
          />
          <line
            x1="38"
            y1="60"
            x2="47"
            y2="59"
            stroke="#C7B085"
            stroke-width="0.8"
          />
          <line
            x1="38"
            y1="64"
            x2="47"
            y2="63"
            stroke="#C7B085"
            stroke-width="0.8"
          />
          <path
            class="mascot__page"
            d="M50 56 Q58 55 58 58 L58 70 Q50 69 50 71 Z"
            fill="#FBF5E6"
            stroke="#C7B085"
            stroke-width="0.6"
          />
        </g>
        <g class="mascot__quill">
          <path
            d="M62 54 L84 30 Q87 33 84 39 L66 57 Z"
            fill="#DCE6EE"
            stroke="#9FB2C2"
            stroke-width="0.9"
          />
          <line
            x1="66"
            y1="57"
            x2="60"
            y2="63"
            stroke="#6E5A3C"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            class="mascot__ink"
            d="M38 66 q4 -3 8 0 t8 0 t8 0"
            fill="none"
            stroke="#5B4A8A"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </g>
        <g class="mascot__hearts">
          <path
            class="mascot__heart"
            d="M0 1.6 C0 -0.4 2.6 -0.4 3 1.4 C3.4 -0.4 6 -0.4 6 1.6 C6 3.4 3 5.2 3 5.2 C3 5.2 0 3.4 0 1.6 Z"
            transform="translate(38 42)"
            fill="#E86A82"
          />
          <path
            class="mascot__heart"
            d="M0 1.6 C0 -0.4 2.6 -0.4 3 1.4 C3.4 -0.4 6 -0.4 6 1.6 C6 3.4 3 5.2 3 5.2 C3 5.2 0 3.4 0 1.6 Z"
            transform="translate(56 42)"
            fill="#E86A82"
          />
        </g>
        <g class="mascot__bulb">
          <line
            x1="50"
            y1="4"
            x2="50"
            y2="8"
            stroke="#E7B84a"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <line
            x1="40"
            y1="10"
            x2="43"
            y2="12"
            stroke="#E7B84a"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <line
            x1="60"
            y1="10"
            x2="57"
            y2="12"
            stroke="#E7B84a"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <circle
            cx="50"
            cy="15"
            r="6"
            fill="#FFE9A0"
            stroke="#E7B84a"
            stroke-width="1"
          />
          <rect
            x="47.5"
            y="20"
            width="5"
            height="3"
            rx="1"
            fill="#B79B6A"
          />
        </g>
        <path
          class="mascot__sweat"
          d="M0 0 C-2.4 3.4 -2.4 6 0 6 C2.4 6 2.4 3.4 0 0 Z"
          transform="translate(72 30)"
          fill="#7EC8F0"
        />
        <g class="mascot__sparkles">
          <path
            class="mascot__spark"
            d="M0 -3 L0.8 -0.8 L3 0 L0.8 0.8 L0 3 L-0.8 0.8 L-3 0 L-0.8 -0.8 Z"
            transform="translate(22 32)"
            fill="#FFE9A0"
          />
          <path
            class="mascot__spark"
            d="M0 -3 L0.8 -0.8 L3 0 L0.8 0.8 L0 3 L-0.8 0.8 L-3 0 L-0.8 -0.8 Z"
            transform="translate(78 30)"
            fill="#FFE9A0"
          />
          <path
            class="mascot__spark"
            d="M0 -3 L0.8 -0.8 L3 0 L0.8 0.8 L0 3 L-0.8 0.8 L-3 0 L-0.8 -0.8 Z"
            transform="translate(50 20)"
            fill="#FFE9A0"
          />
        </g>
        <!-- Little letters drifting up — the writing companion at work. -->
        <g
          class="mascot__letters"
          fill="#B4791F"
          text-anchor="middle"
        >
          <text
            class="mascot__lett"
            x="38"
            y="24"
          >a</text>
          <text
            class="mascot__lett"
            x="50"
            y="19"
          >b</text>
          <text
            class="mascot__lett"
            x="62"
            y="25"
          >c</text>
        </g>

        <!-- Sleepy z's while paused. -->
        <text
          class="mascot__zzz"
          x="80"
          y="30"
          fill="#C98A2E"
        >z</text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../i18n'
import type { BiscuitMood } from '../../composables/useBiscuitMood'

const props = withDefaults(defineProps<{ mood?: BiscuitMood; act?: string; reducedMotion?: boolean }>(), {
  mood: 'idle',
  act: 'drift',
  reducedMotion: false
})
defineEmits<{ (e: 'react'): void }>()

// Instance-scoped ids so several mascots on one page never share a mask,
// clip, or gradient (which would corrupt the bite / halves / fill).
const uid = `bm${Math.random().toString(36).slice(2, 9)}`

const BUMP_R = 6.5
const DOT_R = 1.5

const awake = computed(
  () => props.mood === 'idle' || props.mood === 'busy' || props.mood === 'longwait'
)

// Bump + docking-dot rings around a RECTANGLE (landscape). Center 50,50.
const ring = (
  halfW: number,
  halfH: number,
  nx: number,
  ny: number
): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = []
  for (let k = 0; k < nx; k++) out.push({ x: 50 - halfW + (2 * halfW * k) / nx, y: 50 - halfH }) // top
  for (let k = 0; k < ny; k++) out.push({ x: 50 + halfW, y: 50 - halfH + (2 * halfH * k) / ny }) // right
  for (let k = 0; k < nx; k++) out.push({ x: 50 + halfW - (2 * halfW * k) / nx, y: 50 + halfH }) // bottom
  for (let k = 0; k < ny; k++) out.push({ x: 50 - halfW, y: 50 + halfH - (2 * halfH * k) / ny }) // left
  return out
}

const bumps = ring(35, 23, 6, 4)
const dots = ring(29, 17, 5, 3)

const ariaLabel = computed(() => {
  switch (props.mood) {
    case 'longwait':
      return t('biscuit.mascot.ariaLongwait')
    case 'paused':
      return t('biscuit.mascot.ariaPaused')
    case 'busy':
    case 'react':
      return t('biscuit.mascot.ariaBusy')
    default:
      return t('biscuit.mascot.ariaIdle')
  }
})
</script>

<style scoped>
.mascot {
  display: inline-flex;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
.mascot__svg {
  width: 72px;
  height: 72px;
  overflow: visible;
}

/* Every animated part transforms about its own box centre. */
.mascot__inner,
.mascot__char,
.mascot__body,
.mascot__eyes,
.mascot__eye,
.mascot__mouth,
.mascot__crumb,
.mascot__bite,
.mascot__half,
.mascot__page,
.mascot__quill,
.mascot__ink,
.mascot__heart,
.mascot__spark,
.mascot__sweat,
.mascot__bulb,
.mascot__lett,
.mascot__zzz {
  transform-box: fill-box;
  transform-origin: center;
}

/* Props hidden until their act calls for them. */
.mascot__glow,
.mascot__bsteam,
.mascot__coffee,
.mascot__milk,
.mascot__tea,
.mascot__crack,
.mascot__icing,
.mascot__sugar,
.mascot__book,
.mascot__quill,
.mascot__hearts,
.mascot__bulb,
.mascot__sweat,
.mascot__sparkles,
.mascot__letters {
  opacity: 0;
}
.mascot__half {
  opacity: 0;
}
.mascot__icing {
  stroke-dasharray: 96;
  stroke-dashoffset: 96;
}
.mascot__ink {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
}
/* No bite by default — the mask hole is scaled away until a chomp/nibble act
   animates it open. Without this it leaves a permanent hole (a "white circle")
   at the top-right of the biscuit. */
.mascot__bite {
  transform: scale(0);
}

/* =================== ACTS =================== */
/* Each act has its OWN duration (non-uniform on purpose) and useBiscuitMood
   holds each for its own dwell time. */

/* -- pure motion -- */
.mascot--act-drift .mascot__char { animation: act-drift 6s ease-in-out infinite; }
.mascot--act-sway .mascot__char { animation: act-sway 4.5s ease-in-out infinite; }
.mascot--act-spin .mascot__char { animation: act-spin 5s ease-in-out infinite; }
.mascot--act-tumble .mascot__char { animation: act-tumble 4.5s ease-in-out infinite; }
.mascot--act-jelly .mascot__char { transform-origin: center bottom; animation: act-jelly 1.6s ease-out infinite; }
.mascot--act-puff .mascot__char { animation: act-puff 3s ease-in-out infinite; }
.mascot--act-faint .mascot__char { transform-origin: 50% 90%; animation: act-faint 5s ease-in-out infinite; }
.mascot--act-dizzy .mascot__char { animation: act-dizzy 3.5s ease-in-out infinite; }
.mascot--act-dizzy .mascot__eyes { animation: act-eyeroll 1.4s linear infinite; }

/* -- tea-time -- */
.mascot--act-dip .mascot__char,
.mascot--act-milk .mascot__char,
.mascot--act-tea .mascot__char { animation: act-dip 3.6s ease-in-out infinite; }
.mascot--act-dip .mascot__coffee,
.mascot--act-milk .mascot__milk,
.mascot--act-tea .mascot__tea { animation: act-fade-in 3.6s ease-in-out infinite; }
.mascot--act-dip .mascot__soak,
.mascot--act-tea .mascot__soak { animation: act-soak 3.6s ease-in-out infinite; }
.mascot--act-dip .mascot__steam,
.mascot--act-tea .mascot__steam { animation: act-steam 1.8s ease-in-out infinite; }
.mascot--act-dip .mascot__eyes,
.mascot--act-milk .mascot__eyes,
.mascot--act-tea .mascot__eyes { animation: none; transform: scaleY(0.55); }

.mascot--act-bite .mascot__char { animation: act-bite 2.6s ease-in-out infinite; }
.mascot--act-bite .mascot__bite { animation: act-chomp 2.6s ease-in-out infinite; }
.mascot--act-bite .mascot__crumb { animation: act-fly 2.6s ease-out infinite; }
.mascot--act-nibble .mascot__char { animation: act-nod 2.2s ease-in-out infinite; }
.mascot--act-nibble .mascot__bite { animation: act-nibble 1.1s ease-in-out infinite; }

.mascot--act-sugar .mascot__char { animation: mascot-breathe 3s ease-in-out infinite; }
.mascot--act-sugar .mascot__sugar { animation: act-sugarfall 2.4s ease-in infinite; }
.mascot--act-icing .mascot__char { animation: mascot-breathe 3s ease-in-out infinite; }
.mascot--act-icing .mascot__icing { animation: act-icing 4s ease-in-out infinite; }

/* -- bakery -- */
.mascot--act-baked .mascot__char { animation: mascot-breathe 3s ease-in-out infinite; }
.mascot--act-baked .mascot__glow { animation: act-glow 2.6s ease-in-out infinite; }
.mascot--act-baked .mascot__bsteam { animation: act-bsteam 2.4s ease-in-out infinite; }
.mascot--act-toast .mascot__char { animation: mascot-breathe 3s ease-in-out infinite; }
.mascot--act-toast .mascot__toast { animation: act-toast 4s ease-in-out infinite; }
.mascot--act-stamp .mascot__char { transform-origin: center bottom; animation: act-stamp 1.4s ease-in-out infinite; }

/* -- destruction -- */
.mascot--act-crumble .mascot__char { animation: act-shiver 0.9s ease-in-out infinite; }
.mascot--act-crumble .mascot__crumb { animation: act-shower 2.8s ease-in infinite; }
.mascot--act-break .mascot__body { opacity: 0; }
.mascot--act-break .mascot__half--l { opacity: 1; animation: act-break-l 2.8s ease-in-out infinite; }
.mascot--act-break .mascot__half--r { opacity: 1; animation: act-break-r 2.8s ease-in-out infinite; }
.mascot--act-break .mascot__crack { animation: act-crack 2.8s ease-in-out infinite; }
.mascot--act-mitosis .mascot__body { opacity: 0; }
.mascot--act-mitosis .mascot__half--l { opacity: 1; animation: act-mitosis-l 3s ease-in-out infinite; }
.mascot--act-mitosis .mascot__half--r { opacity: 1; animation: act-mitosis-r 3s ease-in-out infinite; }

/* -- emotions -- */
.mascot--act-wink .mascot__char { animation: act-winktilt 2.4s ease-in-out infinite; }
.mascot--act-wink .mascot__eye--r { animation: act-wink 2.4s ease-in-out infinite; }
.mascot--act-love .mascot__char { animation: act-bob 1.8s ease-in-out infinite; }
.mascot--act-love .mascot__hearts { opacity: 1; }
.mascot--act-love .mascot__heart { animation: act-hearts 2.6s ease-out infinite; }
.mascot--act-love .mascot__heart:nth-child(2) { animation-delay: 0.9s; }
.mascot--act-love .mascot__mouth { transform: scale(1.3); }
.mascot--act-nervous .mascot__char { animation: act-shiver 0.6s ease-in-out infinite; }
.mascot--act-nervous .mascot__sweat { animation: act-sweat 2.2s ease-in infinite; }
.mascot--act-proud .mascot__char { animation: act-proudbody 2.4s ease-in-out infinite; }
.mascot--act-proud .mascot__sparkles { opacity: 1; }
.mascot--act-proud .mascot__spark { animation: act-sparkle 2s ease-in-out infinite; }
.mascot--act-proud .mascot__spark:nth-child(2) { animation-delay: 0.5s; }
.mascot--act-proud .mascot__spark:nth-child(3) { animation-delay: 1s; }
.mascot--act-idea .mascot__char { animation: act-aha 3s ease-in-out infinite; }
.mascot--act-idea .mascot__bulb { animation: act-bulb 3s ease-in-out infinite; }

/* -- writing companion -- */
.mascot--act-scribble .mascot__char { animation: act-scribtilt 3.4s ease-in-out infinite; }
.mascot--act-scribble .mascot__quill { opacity: 1; animation: act-quill 0.5s ease-in-out infinite; }
.mascot--act-scribble .mascot__ink { opacity: 1; animation: act-drawink 3.4s ease-in-out infinite; }
.mascot--act-read .mascot__char { animation: act-nod 3.5s ease-in-out infinite; }
.mascot--act-read .mascot__book { opacity: 1; }
.mascot--act-read .mascot__page { transform-origin: left center; animation: act-page 2.2s ease-in-out infinite; }
.mascot--act-spell .mascot__char { animation: mascot-breathe 3s ease-in-out infinite; }
.mascot--act-spell .mascot__letters { opacity: 1; }
.mascot--act-spell .mascot__lett { animation: act-rise 3s ease-out infinite; }
.mascot--act-spell .mascot__lett:nth-child(2) { animation-delay: 1s; }
.mascot--act-spell .mascot__lett:nth-child(3) { animation-delay: 2s; }

/* -- non-awake moods -- */
.mascot--paused .mascot__char { animation: mascot-breathe 4s ease-in-out infinite; }
.mascot--react .mascot__char { animation: mascot-react 1.5s ease-in-out; }
.mascot--celebrate .mascot__char { animation: mascot-hop 0.7s ease-in-out 2; }
.mascot--celebrate .mascot__mouth { transform: scaleY(1.5); }

/* -- expressions / crumbs baseline -- */
.mascot__eyes { animation: mascot-blink 4s ease-in-out infinite; }
.mascot--act-sway .mascot__eyes { animation: none; transform: scaleY(0.55); }
.mascot--act-sway .mascot__mouth { transform: scale(1.3); }
.mascot--paused .mascot__eyes { animation: none; transform: scaleY(0.12); }
.mascot--longwait .mascot__mouth { animation: mascot-yawn 5s ease-in-out infinite; }
.mascot__crumb { opacity: 0; }
.mascot--busy .mascot__crumb:nth-child(-n + 3),
.mascot--longwait .mascot__crumb:nth-child(-n + 3) { animation: mascot-crumb 2.8s ease-in infinite; }
.mascot__crumb:nth-child(1) { animation-delay: 0s; }
.mascot__crumb:nth-child(2) { animation-delay: 0.9s; }
.mascot__crumb:nth-child(3) { animation-delay: 1.7s; }
.mascot__crumb:nth-child(4) { animation-delay: 0.4s; }
.mascot__crumb:nth-child(5) { animation-delay: 1.2s; }
.mascot__crumb:nth-child(6) { animation-delay: 2s; }
.mascot--celebrate .mascot__crumb { animation: mascot-burst 0.6s ease-out; animation-delay: 0s; }
.mascot__zzz { opacity: 0; font-size: 12px; font-weight: 700; }
.mascot--paused .mascot__zzz { animation: mascot-zzz 2.6s ease-in-out infinite; }
.mascot__lett { font-size: 11px; font-weight: 700; }

/* =================== keyframes =================== */
/* Floating drift: a lazy figure-of-eight, tilting INTO the direction of travel. */
@keyframes act-drift {
  0%,100% { transform: translate(-9px,0) rotate(-3deg); }
  25% { transform: translate(0,-3px) rotate(0deg); }
  50% { transform: translate(9px,0) rotate(3deg); }
  75% { transform: translate(0,-3px) rotate(0deg); }
}
/* Sway: a weight-shift with a small squash as it settles onto each foot. */
@keyframes act-sway {
  0%,100% { transform: translateX(-5px) rotate(-9deg) scaleY(0.98); }
  15% { transform: translateX(-5px) rotate(-8deg) scaleY(1); }
  50% { transform: translateX(5px) rotate(9deg) scaleY(0.98); }
  65% { transform: translateX(5px) rotate(8deg) scaleY(1); }
}
/* Spin: wind up the opposite way, whip round, overshoot, settle. */
@keyframes act-spin {
  0% { transform: rotate(0); }
  14% { transform: rotate(-28deg); }
  68% { transform: rotate(374deg); }
  82%,100% { transform: rotate(360deg); }
}
/* Tumble: a cartwheel that arcs up and lands with a squash. */
@keyframes act-tumble {
  0% { transform: translate(-11px,0) rotate(0) scale(1,1); }
  25% { transform: translate(-5px,-7px) rotate(120deg) scale(1,1); }
  50% { transform: translate(0,0) rotate(180deg) scale(1.08,0.9); }
  75% { transform: translate(5px,-7px) rotate(300deg) scale(1,1); }
  100% { transform: translate(11px,0) rotate(360deg) scale(1,1); }
}
/* Jelly: a wobble that preserves volume and decays. */
@keyframes act-jelly {
  0%,100% { transform: scale(1,1); }
  18% { transform: scale(1.15,0.85); }
  38% { transform: scale(0.9,1.12); }
  58% { transform: scale(1.07,0.94); }
  78% { transform: scale(0.97,1.03); }
}
/* Puff: dip (anticipation), swell, settle. */
@keyframes act-puff {
  0%,100% { transform: scale(1); }
  16% { transform: scale(0.92,0.9); }
  46% { transform: scale(1.16,1.14); }
  72% { transform: scale(0.99); }
}
/* Faint: wobble, tip over about its base (gravity), lie, struggle up. */
@keyframes act-faint {
  0%,12% { transform: rotate(0); }
  20% { transform: rotate(-9deg); }
  40% { transform: rotate(70deg); }
  46%,64% { transform: rotate(86deg); }
  86% { transform: rotate(-5deg); }
  100% { transform: rotate(0); }
}
/* Dizzy: the head lolls in a small circle. */
@keyframes act-dizzy {
  0%,100% { transform: translate(-2px,0) rotate(-7deg); }
  25% { transform: translate(0,-2px) rotate(0deg); }
  50% { transform: translate(2px,0) rotate(7deg); }
  75% { transform: translate(0,2px) rotate(0deg); }
}
@keyframes act-eyeroll { 0%,100% { transform: translate(1.5px,-1px); } 25% { transform: translate(-1.5px,-1px); } 50% { transform: translate(-1.5px,1.5px); } 75% { transform: translate(1.5px,1.5px); } }
/* Dip: lift (anticipation), plunge, soak, draw back out with a wobble. */
@keyframes act-dip {
  0%,100% { transform: translateY(0) rotate(0); }
  12% { transform: translateY(-3px) rotate(-6deg); }
  38% { transform: translateY(11px) rotate(17deg); }
  60% { transform: translateY(11px) rotate(17deg); }
  80% { transform: translateY(-2px) rotate(4deg); }
}
@keyframes act-soak { 0%,100% { opacity: 0; } 38%,60% { opacity: 0.5; } }
@keyframes act-fade-in { 0%,100% { opacity: 0; } 18%,82% { opacity: 1; } }
@keyframes act-steam { 0% { opacity: 0; transform: translateY(3px); } 40% { opacity: 0.8; } 100% { opacity: 0; transform: translateY(-5px); } }
/* Nod: a gentle head bob (reading / nibbling). */
@keyframes act-nod { 0%,100% { transform: rotate(0); } 40% { transform: rotate(4deg); } }
/* Bite: rear back, chomp forward, recoil. */
@keyframes act-bite {
  0%,100% { transform: translate(0,0) rotate(0); }
  28% { transform: translate(2px,-2px) rotate(-5deg); }
  42% { transform: translate(-1px,2px) rotate(4deg); }
  56% { transform: translate(0,0) rotate(0); }
}
/* Chomp: the bite is taken as the head snaps forward (synced with act-bite). */
@keyframes act-chomp { 0%,36% { transform: scale(0); } 46% { transform: scale(1.12); } 56%,100% { transform: scale(1); } }
@keyframes act-nibble { 0%,100% { transform: scale(0); } 45%,60% { transform: scale(0.5); } }
@keyframes act-fly { 0%,30% { opacity: 0; transform: translate(0,0); } 42% { opacity: 1; } 100% { opacity: 0; transform: translate(10px,-9px); } }
@keyframes act-sugarfall { 0% { opacity: 0; transform: translateY(-4px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(24px); } }
@keyframes act-dust { 0%,100% { opacity: 0; } 60% { opacity: 0.4; } }
@keyframes act-icing { 0%,10% { opacity: 0; stroke-dashoffset: 96; } 20% { opacity: 1; } 70%,100% { opacity: 1; stroke-dashoffset: 0; } }
@keyframes act-glow { 0%,100% { opacity: 0.12; transform: scale(0.94); } 50% { opacity: 0.5; transform: scale(1.06); } }
@keyframes act-bsteam { 0% { opacity: 0; transform: translateY(4px); } 45% { opacity: 0.8; } 100% { opacity: 0; transform: translateY(-6px); } }
@keyframes act-toast { 0%,100% { opacity: 0; } 55% { opacity: 0.55; } }
/* Stamp: lift, press down with a squash, rebound. */
@keyframes act-stamp {
  0%,100% { transform: translateY(0) scale(1,1); }
  22% { transform: translateY(-4px) scale(0.98,1.04); }
  38% { transform: translateY(2px) scale(1.1,0.82); }
  54% { transform: translateY(0) scale(0.96,1.05); }
  70% { transform: translateY(0) scale(1,1); }
}
/* Shiver: an uneven tremble. */
@keyframes act-shiver {
  0%,100% { transform: translate(-1.5px,0) rotate(-2deg); }
  20% { transform: translate(1.6px,0) rotate(2deg); }
  40% { transform: translate(-1px,-0.6px) rotate(-1.4deg); }
  60% { transform: translate(1.3px,0.6px) rotate(1.8deg); }
  80% { transform: translate(-1.5px,0) rotate(-2deg); }
}
@keyframes act-shower { 0% { opacity: 0; transform: translate(0,0); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-3px,20px); } }
/* Break: squeeze, SNAP apart, hold, spring back together. */
@keyframes act-break-l {
  0%,32% { transform: translateX(0) rotate(0); }
  38% { transform: translateX(1.5px) rotate(2deg); }
  46% { transform: translateX(-8px) rotate(-11deg); }
  70% { transform: translateX(-8px) rotate(-11deg); }
  100% { transform: translateX(0) rotate(0); }
}
@keyframes act-break-r {
  0%,32% { transform: translateX(0) rotate(0); }
  38% { transform: translateX(-1.5px) rotate(-2deg); }
  46% { transform: translateX(8px) rotate(11deg); }
  70% { transform: translateX(8px) rotate(11deg); }
  100% { transform: translateX(0) rotate(0); }
}
@keyframes act-crack { 0%,40%,66%,100% { opacity: 0; } 46%,56% { opacity: 0.9; } }
@keyframes act-mitosis-l { 0%,100% { transform: translateX(0) scale(1); } 20% { transform: translateX(0) scale(1.08,0.9); } 55% { transform: translateX(-11px) scale(0.62); } 78% { transform: translateX(-11px) scale(0.62); } }
@keyframes act-mitosis-r { 0%,100% { transform: translateX(0) scale(1); } 20% { transform: translateX(0) scale(1.08,0.9); } 55% { transform: translateX(11px) scale(0.62); } 78% { transform: translateX(11px) scale(0.62); } }
@keyframes act-wink { 0%,78%,100% { transform: scaleY(1); } 85% { transform: scaleY(0.1); } 92% { transform: scaleY(1); } }
/* A cheeky head tilt to accompany the wink. */
@keyframes act-winktilt { 0%,76%,100% { transform: rotate(0); } 85% { transform: rotate(-6deg); } }
@keyframes act-bob { 0%,100% { transform: translateY(1px) scaleY(0.99); } 45% { transform: translateY(-5px) scaleY(1.02); } }
@keyframes act-proudbody { 0%,100% { transform: translateY(0) scale(1); } 40%,72% { transform: translateY(-2px) scale(1.05); } }
@keyframes act-hearts { 0% { opacity: 0; transform: translateY(0) scale(0.5); } 25% { opacity: 1; transform: translateY(-5px) scale(1); } 100% { opacity: 0; transform: translateY(-18px) scale(0.9); } }
@keyframes act-sweat { 0%,15% { opacity: 0; transform: translateY(-2px) scale(0.5); } 32% { opacity: 1; transform: translateY(0) scale(1); } 55% { opacity: 1; transform: translateY(3px) scale(1); } 100% { opacity: 0; transform: translateY(18px) scale(0.8); } }
@keyframes act-sparkle { 0%,100% { opacity: 0; transform: scale(0.3) rotate(-40deg); } 50% { opacity: 1; transform: scale(1) rotate(0deg); } }
/* Aha: still, then a startled pop as the bulb flicks on. */
@keyframes act-aha {
  0%,50% { transform: translateY(0) scale(1); }
  58% { transform: translateY(-5px) scale(1.06,0.95); }
  67% { transform: translateY(0) scale(1.05,0.96); }
  76% { transform: translateY(0) scale(1); }
}
@keyframes act-bulb { 0%,50% { opacity: 0; } 56% { opacity: 1; } 60% { opacity: 0.3; } 66%,100% { opacity: 1; } }
@keyframes act-scribtilt { 0%,100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(-1deg) translateY(1px); } }
@keyframes act-quill { 0%,100% { transform: translate(0,0) rotate(0); } 50% { transform: translate(-1.5px,1px) rotate(-5deg); } }
@keyframes act-drawink { 0%,20% { stroke-dashoffset: 40; } 80%,100% { stroke-dashoffset: 0; } }
/* Page: pages sit, then one flips over from the spine. */
@keyframes act-page { 0%,42% { transform: scaleX(1); } 56% { transform: scaleX(0.08); } 70%,100% { transform: scaleX(1); } }
@keyframes act-rise { 0% { opacity: 0; transform: translateY(6px); } 30% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-12px); } }
/* Breathe: a slow rise-and-fall with a held top of the breath. */
@keyframes mascot-breathe { 0%,100% { transform: translateY(0.4px) scale(1); } 45%,55% { transform: translateY(-0.6px) scale(1.03); } }
/* React (click): a surprised squash-and-stretch that settles. */
@keyframes mascot-react { 0% { transform: scale(1); } 22% { transform: scale(0.88,1.12); } 48% { transform: scale(1.12,0.9); } 70% { transform: scale(0.98,1.03); } 100% { transform: scale(1); } }
/* Hop: crouch (anticipation), launch, land squash, settle. */
@keyframes mascot-hop { 0% { transform: translateY(0) scale(1,1); } 16% { transform: translateY(2px) scale(1.08,0.9); } 44% { transform: translateY(-11px) scale(0.94,1.08); } 68% { transform: translateY(0) scale(1.1,0.86); } 84% { transform: translateY(0) scale(0.98,1.03); } 100% { transform: translateY(0) scale(1,1); } }
@keyframes mascot-blink { 0%,90%,100% { transform: scaleY(1); } 94% { transform: scaleY(0.08); } 97% { transform: scaleY(1); } }
@keyframes mascot-yawn { 0%,70%,100% { transform: scaleY(1); } 85% { transform: scaleY(2.2) translateY(1px); } }
@keyframes mascot-crumb { 0% { opacity: 0; transform: translate(0,0); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-2px,16px); } }
@keyframes mascot-burst { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-12px) scale(0.6); } }
@keyframes mascot-zzz { 0% { opacity: 0; transform: translateY(2px); } 40% { opacity: 1; } 100% { opacity: 0; transform: translateY(-8px); } }

/* Respect reduced-motion: hold a calm static pose, no loops, no props. */
.mascot--reduced .mascot__char,
.mascot--reduced .mascot__body,
.mascot--reduced .mascot__eyes,
.mascot--reduced .mascot__eye,
.mascot--reduced .mascot__mouth,
.mascot--reduced .mascot__crumb,
.mascot--reduced .mascot__bite,
.mascot--reduced .mascot__half,
.mascot--reduced .mascot__page,
.mascot--reduced .mascot__quill,
.mascot--reduced .mascot__ink,
.mascot--reduced .mascot__hearts,
.mascot--reduced .mascot__sparkles,
.mascot--reduced .mascot__sweat,
.mascot--reduced .mascot__bulb,
.mascot--reduced .mascot__glow,
.mascot--reduced .mascot__bsteam,
.mascot--reduced .mascot__coffee,
.mascot--reduced .mascot__milk,
.mascot--reduced .mascot__tea,
.mascot--reduced .mascot__crack,
.mascot--reduced .mascot__icing,
.mascot--reduced .mascot__sugar,
.mascot--reduced .mascot__toast,
.mascot--reduced .mascot__dust,
.mascot--reduced .mascot__soak,
.mascot--reduced .mascot__book,
.mascot--reduced .mascot__letters,
.mascot--reduced .mascot__zzz {
  animation: none !important;
}
.mascot--reduced .mascot__char {
  transform: none !important;
}
.mascot--reduced .mascot__body {
  opacity: 1;
}
.mascot--reduced .mascot__half,
.mascot--reduced .mascot__glow,
.mascot--reduced .mascot__bsteam,
.mascot--reduced .mascot__coffee,
.mascot--reduced .mascot__milk,
.mascot--reduced .mascot__tea,
.mascot--reduced .mascot__crack,
.mascot--reduced .mascot__icing,
.mascot--reduced .mascot__sugar,
.mascot--reduced .mascot__book,
.mascot--reduced .mascot__quill,
.mascot--reduced .mascot__hearts,
.mascot--reduced .mascot__bulb,
.mascot--reduced .mascot__sweat,
.mascot--reduced .mascot__sparkles,
.mascot--reduced .mascot__letters,
.mascot--reduced .mascot__crumb,
.mascot--reduced .mascot__zzz {
  opacity: 0;
}
.mascot--reduced.mascot--paused .mascot__eyes {
  transform: scaleY(0.12);
}
</style>
