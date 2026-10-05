export { cn } from "cn"

/** Slider callbacks report number | number[]; single-thumb sliders want the number. */
export const sliderValue = (v: number | readonly number[]) => (typeof v === 'number' ? v : v[0]);
