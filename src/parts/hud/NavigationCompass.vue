<script setup lang="ts">
import { computed, ref } from "vue";
import { useClipboard } from "@vueuse/core";
import { useStateStore } from "@/stores/state";
import { compassHeading } from "./navigation";

const state = useStateStore();
const { copy, copied, isSupported } = useClipboard({ legacy: true, copiedDuring: 1500 });
const copyFailed = ref(false);

const headingValue = computed(() => compassHeading(state.displayedHeading));
const compass = computed(() =>
    Array.from({ length: 24 }, (_, i) => {
        const degree = i * 15;
        const delta = ((degree - headingValue.value + 540) % 360) - 180;

        const labels: Record<number, string> = {
            0: "N",
            45: "NE",
            90: "E",
            135: "SE",
            180: "S",
            225: "SW",
            270: "W",
            315: "NW",
        };

        return {
            degree,
            delta,
            label: labels[degree] ?? "",
            major: degree % 45 === 0,
        };
    }).filter((mark) => Math.abs(mark.delta) < 100),
);

const heading = computed(() => String(Math.round(headingValue.value) % 360).padStart(3, "0"));

/** Copies a signed decimal latitude/longitude pair suitable for pasting into map search. */
const copyCoordinates = async (): Promise<void> => {
    copyFailed.value = false;
    try {
        await copy(`${state.coordinates.lat.toFixed(5)}, ${state.coordinates.lon.toFixed(5)}`);
    } catch {
        copyFailed.value = true;
    }
};
</script>
<template>
    <div class="navigation-strip" aria-label="Compass and coordinates">
        <div class="compass-heading">{{ heading }}<span>°</span></div>
        <div class="compass-track">
            <div
                v-for="mark in compass"
                :key="mark.degree"
                class="compass-mark"
                :class="{ major: mark.major, north: mark.degree === 0 }"
                :style="{ left: `calc(50% + ${mark.delta * 2.15}px)` }"
            >
                <span v-if="mark.label">{{ mark.label }}</span
                ><i></i>
            </div>
        </div>
        <div class="compass-pointer"></div>
        <div class="coordinates">
            {{ state.coordinates.lat.toFixed(5) }}° N <span> / </span
            >{{ state.coordinates.lon.toFixed(5) }}° E
            <button v-if="isSupported" class="coordinate-copy" type="button"
                :aria-label="copied ? 'Coordinates copied' : 'Copy coordinates'"
                :title="copyFailed ? 'Unable to copy coordinates. Try again.' : copied ? 'Copied!' : 'Copy coordinates'"
                @pointerdown.stop @keydown.stop @click.stop="copyCoordinates">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path v-if="copied" d="m5 12 4 4L19 6" />
                    <g v-else><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></g>
                </svg>
            </button>
            <span class="sr-only" role="status">{{ copyFailed ? 'Unable to copy coordinates.' : copied ? 'Coordinates copied.' : '' }}</span>
        </div>
    </div>
</template>

<style scoped>
.navigation-strip {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: min(480px, 62vw);
    z-index: 10;
    color: #fff;
    text-align: center;
    pointer-events: none;
    text-shadow: 0 1px 2px #000, 0 2px 5px #000;
    font-family: system-ui, sans-serif;
}
.compass-heading {
    font-size: 10px;
    letter-spacing: 3px;
    color: #fff;
}
.compass-heading span {
    letter-spacing: 0;
}
.compass-track {
    position: relative;
    height: 40px;
    margin-top: 3px;
    overflow: hidden;
    mask-image: linear-gradient(to right, transparent, #000 16%, #000 84%, transparent);
    border-bottom: 1px solid #fff;
    filter: drop-shadow(0 1px 2px #000);
}
.compass-mark {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    height: 31px;
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
    font-size: 12px;
    letter-spacing: 1px;
}
.compass-mark i {
    display: block;
    height: 6px;
    width: 1px;
    background: #fff;
    box-shadow: 0 1px 3px #000;
}
.compass-mark.major i {
    height: 10px;
    background: #fff;
}
.compass-mark.north {
    color: #fff;
}
.compass-pointer {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 6px solid #fff;
    filter: drop-shadow(0 1px 2px #000);
    margin: -2px auto 6px;
}
.coordinates {
    position: relative;
    width: fit-content;
    margin-inline: auto;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 1px;
    color: #fff;
}
.coordinate-copy {
    position: absolute;
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 4px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    padding: 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #fff;
    pointer-events: auto;
    cursor: pointer;
}
.coordinate-copy:hover { background: #ffffff20; }
.coordinate-copy:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.coordinate-copy svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; filter: drop-shadow(0 1px 2px #000); }
.coordinates span {
    padding: 0 8px;
    color: #fff;
}
@media (max-width: 800px) {
    .navigation-strip {
        width: 65vw;
        left: 40%;
        top: 14px;
    }
    .coordinates {
        font-size: 8px;
        letter-spacing: 0;
    }
}
@media (max-width: 420px) {
    .coordinates span {
        padding: 0 3px;
    }
}
.navigation-strip {
    padding: 10px 16px;
}
.compass-heading {
    font-size: 16px;
    color: #fff;
}
.coordinates {
    font-size: 14px;
    color: #fff;
    letter-spacing: 0.3px;
}
.compass-mark {
    font-size: 16px;
}
.compass-track {
    height: 43px;
}
@media (max-width: 800px) {
    .coordinates {
        font-size: 11px;
    }
    .compass-heading {
        font-size: 14px;
    }
    .navigation-strip {
        padding: 8px 10px;
    }
}
</style>
