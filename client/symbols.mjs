// Shape expresses ownership; hue expresses team. Dashed edges mean display-only
// revelation, never a normal detection or a valid firing solution.
export function unitIdentity(unit, playerId, myTeam) {
  const relation =
    unit.ownerId === playerId ? "own" : unit.team === myTeam ? "ally" : "enemy";
  return {
    relation,
    shape:
      relation === "own"
        ? "circle"
        : relation === "ally"
          ? "square"
          : "diamond",
    color:
      unit.team === 0
        ? relation === "ally"
          ? "#83c9b8"
          : "#8ddcff"
        : relation === "ally"
          ? "#e0ba8d"
          : "#ffad92",
    displayOnly: unit.displayOnly === true,
  };
}

export function drawUnitSymbol(
  c,
  x,
  y,
  unit,
  identity,
  { radius = 8, selected = false, mini = false } = {},
) {
  c.save();
  c.translate(x, y);
  c.lineWidth = selected ? 2 : 1.3;
  c.strokeStyle = selected ? "#fff0b9" : identity.color;
  c.fillStyle = "#10232bed";
  if (identity.displayOnly) c.setLineDash([2, 2]);
  c.beginPath();
  if (identity.shape === "circle") c.arc(0, 0, radius, 0, Math.PI * 2);
  else if (identity.shape === "square")
    c.rect(-radius, -radius, radius * 2, radius * 2);
  else {
    c.moveTo(0, -radius - 1);
    c.lineTo(radius + 1, 0);
    c.lineTo(0, radius + 1);
    c.lineTo(-radius - 1, 0);
    c.closePath();
  }
  c.fill();
  c.stroke();
  c.setLineDash([]);
  if (mini) {
    c.fillStyle = identity.color;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
    return;
  }
  c.strokeStyle = identity.color;
  c.fillStyle = identity.color;
  c.lineWidth = 1.3;
  c.beginPath();
  const r = radius * 0.47;
  switch (unit.type) {
    case "infantry":
      c.moveTo(-r, -r);
      c.lineTo(r, r);
      c.moveTo(r, -r);
      c.lineTo(-r, r);
      break;
    case "tank":
      c.ellipse(0, 0, r + 1, r * 0.62, 0, 0, Math.PI * 2);
      break;
    case "transport":
      c.moveTo(-r, -r);
      c.lineTo(-r, r);
      c.lineTo(r, r);
      c.lineTo(r, -r);
      break;
    case "recon":
      c.arc(-r * 0.6, 0, r * 0.7, 0, Math.PI * 2);
      c.moveTo(r * 1.3, 0);
      c.arc(r * 0.6, 0, r * 0.7, 0, Math.PI * 2);
      break;
    case "supply":
      c.moveTo(-r, 0);
      c.lineTo(r, 0);
      c.moveTo(0, -r);
      c.lineTo(0, r);
      break;
    case "artillery":
      c.arc(0, 0, 1.5, 0, Math.PI * 2);
      c.fill();
      c.moveTo(-r, r);
      c.lineTo(r, -r);
      break;
    case "aa":
      c.arc(0, r * 0.4, r, Math.PI, Math.PI * 2);
      c.moveTo(0, -r);
      c.lineTo(0, r);
      break;
    case "helicopter":
      c.moveTo(-r - 1, 0);
      c.lineTo(r + 1, 0);
      c.moveTo(0, -r);
      c.lineTo(0, r);
      c.arc(0, 0, 1.3, 0, Math.PI * 2);
      break;
    case "jet":
      c.moveTo(0, -r - 1);
      c.lineTo(r + 1, r);
      c.lineTo(0, r * 0.35);
      c.lineTo(-r - 1, r);
      c.closePath();
      break;
  }
  c.stroke();
  c.restore();
}
