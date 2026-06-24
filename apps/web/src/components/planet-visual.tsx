/**
 * A planet/moon rendered as a shaded sphere with a specular highlight. There is no image data,
 * so the hue is derived deterministically from the celestial id — stable across renders, distinct
 * per celestial. Moons are desaturated to a grey rock.
 */
function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function PlanetVisual({
  id,
  size = 96,
  isMoon = false,
}: {
  id: string;
  size?: number;
  isMoon?: boolean;
}) {
  const hue = hashHue(id);
  const sat = isMoon ? 6 : 58;
  const background = [
    `radial-gradient(circle at 30% 26%,`,
    `hsl(${hue} ${sat + 12}% 84%) 0%,`,
    `hsl(${hue} ${sat}% 54%) 30%,`,
    `hsl(${hue} ${sat}% 32%) 70%,`,
    `hsl(${hue} ${sat}% 15%) 100%)`,
  ].join(" ");
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background,
        boxShadow: "inset -6px -9px 20px rgba(0,0,0,0.5)",
      }}
    />
  );
}
