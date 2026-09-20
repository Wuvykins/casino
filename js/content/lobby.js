// Where things are on your casino-floor picture, as percentages of the image (left, top, width, height).
// Only used when assets/img/lobby/floor.(png|jpg) exists. Nudge these until the outlines sit on your signs.
export const LOBBY_HOTSPOTS = {
  holdem:    { x: 1.5, y: 3,  w: 35, h: 35 },
  cashier:   { x: 44,  y: 0,  w: 13, h: 21 },
  slots:     { x: 60,  y: 4,  w: 39, h: 22 },
  blackjack: { x: 60,  y: 26, w: 39, h: 27 },
  cribbage:  { x: 1.5, y: 40, w: 33, h: 41 },
  farkle:    { x: 60,  y: 53, w: 39, h: 29 },
};

// Set to true to see the hotspot boxes clearly while you line them up.
export const SHOW_HOTSPOT_GUIDES = false;
