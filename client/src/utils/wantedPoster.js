// Canvas-rendered western WANTED poster for the local character --
// parchment, blocky mugshot (matching the in-game low-poly look, with
// the equipped hat and body tone), star level, bounty, and the game URL
// as a footer. Downloadable as a PNG straight from the overlay.

const POSTER_W = 600;
const POSTER_H = 800;
const SKIN = '#d7a77c'; // same as the in-game head material

function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// Parchment: warm base, subtle grain, darkened edges + rough corner bites
function drawParchment(ctx) {
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  // Grain: sprinkle translucent darker specks (deterministic-ish is fine)
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * POSTER_W;
    const y = Math.random() * POSTER_H;
    const r = Math.random() * 2.2;
    ctx.fillStyle = `rgba(120, 90, 40, ${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(x, y, r, r);
  }

  // A few coffee-stain blotches
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * POSTER_W;
    const y = Math.random() * POSTER_H;
    const r = 25 + Math.random() * 55;
    const blotch = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    blotch.addColorStop(0, 'rgba(140, 100, 45, 0.05)');
    blotch.addColorStop(1, 'rgba(140, 100, 45, 0)');
    ctx.fillStyle = blotch;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Burnt vignette
  const vignette = ctx.createRadialGradient(
    POSTER_W / 2, POSTER_H / 2, POSTER_H * 0.35,
    POSTER_W / 2, POSTER_H / 2, POSTER_H * 0.72
  );
  vignette.addColorStop(0, 'rgba(80, 50, 15, 0)');
  vignette.addColorStop(1, 'rgba(80, 50, 15, 0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
}

function drawFrame(ctx) {
  ctx.strokeStyle = '#4a3315';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, POSTER_W - 36, POSTER_H - 36);
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, POSTER_W - 68, POSTER_H - 68);
}

// Blocky mugshot mirroring the in-game rig: head cube + shoulders in the
// player's (possibly tone-tinted) faction color, plus the equipped hat.
function drawMugshot(ctx, centerX, topY, bodyColor, hatId) {
  const head = 130; // head cube size in poster pixels
  const headX = centerX - head / 2;
  const headY = topY + 40;

  // Shoulders / torso sliver at the bottom of the "photo"
  ctx.fillStyle = bodyColor;
  ctx.fillRect(centerX - 105, headY + head - 8, 210, 78);

  // Head with a hint of side shading so it reads as a cube
  ctx.fillStyle = SKIN;
  ctx.fillRect(headX, headY, head, head);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.fillRect(headX + head - 22, headY, 22, head);

  // Deadpan face
  ctx.fillStyle = '#2b1d10';
  ctx.fillRect(headX + 30, headY + 46, 16, 16);   // left eye
  ctx.fillRect(headX + head - 46, headY + 46, 16, 16); // right eye
  ctx.fillRect(headX + 38, headY + 95, head - 76, 7);  // flat mouth

  // Equipped hat, blockified
  ctx.fillStyle = '#1b1b1b';
  switch (hatId) {
    case 'cap':
      ctx.fillStyle = '#c62828';
      ctx.fillRect(headX - 4, headY - 26, head + 8, 30);
      ctx.fillRect(headX + head - 20, headY - 2, 60, 12); // brim to the side
      break;
    case 'beanie':
      ctx.fillStyle = '#37474f';
      ctx.fillRect(headX - 4, headY - 28, head + 8, 34);
      ctx.fillRect(headX - 8, headY - 2, head + 16, 12); // fold
      break;
    case 'tophat':
      ctx.fillRect(headX + 15, headY - 78, head - 30, 74);
      ctx.fillRect(headX - 14, headY - 10, head + 28, 12);
      break;
    case 'cowboy':
      ctx.fillStyle = '#795548';
      ctx.fillRect(headX + 22, headY - 44, head - 44, 42);
      ctx.fillRect(headX - 26, headY - 8, head + 52, 12);
      break;
    case 'crown':
      ctx.fillStyle = '#ffc107';
      ctx.fillRect(headX + 10, headY - 30, head - 20, 28);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(headX + 14 + i * ((head - 40) / 3), headY - 48, 12, 20);
      }
      break;
    case 'halo':
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.ellipse(centerX, headY - 28, 52, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      break; // bare head
  }
}

export function renderWantedPoster(canvas, { name, faction, stars, bounty, hatId, bodyColorCss }) {
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');

  drawParchment(ctx);
  drawFrame(ctx);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#3a2810';

  // Headline
  ctx.font = '900 110px Georgia, serif';
  ctx.fillText('WANTED', POSTER_W / 2, 150);
  ctx.font = 'bold 26px Georgia, serif';
  const subtitle = 'D E A D   O R   A L I V E';
  ctx.fillText(subtitle, POSTER_W / 2, 192);

  // Mugshot in a "photo" frame
  const photoTop = 215;
  ctx.strokeStyle = '#4a3315';
  ctx.lineWidth = 4;
  ctx.strokeRect(POSTER_W / 2 - 130, photoTop, 260, 250);
  ctx.save();
  ctx.beginPath();
  ctx.rect(POSTER_W / 2 - 128, photoTop + 2, 256, 246);
  ctx.clip();
  drawMugshot(ctx, POSTER_W / 2, photoTop, bodyColorCss, hatId);
  ctx.restore();

  // Name (shrink to fit the frame width)
  ctx.fillStyle = '#3a2810';
  let nameSize = 54;
  ctx.font = `bold ${nameSize}px Georgia, serif`;
  while (ctx.measureText(name).width > POSTER_W - 120 && nameSize > 24) {
    nameSize -= 4;
    ctx.font = `bold ${nameSize}px Georgia, serif`;
  }
  ctx.fillText(name, POSTER_W / 2, 545);

  ctx.font = '22px Georgia, serif';
  ctx.fillStyle = '#5a4020';
  ctx.fillText(faction === 'Criminal' ? 'NOTORIOUS OUTLAW' : 'ROGUE ENFORCER', POSTER_W / 2, 580);

  // Star level (always 5 slots so the scale is readable)
  ctx.font = '40px Georgia, serif';
  ctx.fillStyle = '#b8860b';
  const starRow = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars));
  ctx.fillText(starRow, POSTER_W / 2, 634);

  // Bounty
  ctx.fillStyle = '#3a2810';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('— REWARD —', POSTER_W / 2, 690);
  ctx.font = '900 58px Georgia, serif';
  ctx.fillText(bounty > 0 ? `$${bounty}` : '$???', POSTER_W / 2, 748);

  // Footer plug
  ctx.font = '16px Georgia, serif';
  ctx.fillStyle = 'rgba(58, 40, 16, 0.6)';
  ctx.fillText('bolo.wuerbo.com', POSTER_W / 2, POSTER_H - 28);
}
