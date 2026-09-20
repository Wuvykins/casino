// Generic table talk, used when a character has no line of their own for a trigger.
// {player} = your name, {name} = the speaker, {amount} = money formatted.
export const GENERIC_LINES = {
  greet: ['Hey {player}.', 'Room for one more?', 'Evening, {player}.', 'Deal me in.'],
  fold: ['Fold.', 'Nah.', 'Not this time.', 'I\'m out.', 'Take it.'],
  check: ['Check.', 'Check it.', 'Go on.'],
  call: ['Call.', 'I\'ll call.', 'Sure.', 'Let\'s see it.'],
  raise: ['Raise.', 'Let\'s bump it.', 'A little more.', 'Raise it up.'],
  allin: ['All in.', 'Everything.', 'I\'m all in.'],
  winSmall: ['Thanks.', 'I\'ll take it.', 'Every little bit.'],
  winBig: ['Yes!', 'Come to papa.', 'Big one!', 'Ship it!'],
  lose: ['Ouch.', 'Nice hand.', 'Well played.', 'Hm.'],
  loseBig: ['Ugh. That one hurt.', 'There goes the rent.', 'Well. That was expensive.'],
  badBeat: ['You have GOT to be kidding.', 'How?! HOW?', 'That\'s poker, I guess.', 'Unreal.'],
  caughtBluff: ['Worth a try.', 'You got me.', 'Hey, gotta keep you honest.'],
  hurry: ['Any day now, {player}.', 'Clock\'s ticking.', 'It\'s not that hard a decision.', 'We\'re getting old here.'],
  bustOut: ['And I\'m broke.', 'That\'s my night.', 'Well. That happened.'],
  rebuy: ['Reloading.', 'I\'m not done yet.', 'Round two.'],
  playerBust: ['Ooh. Tough break, {player}.', 'Better luck next time.', 'Thanks for the donation!'],
  playerWin: ['Nice hand, {player}.', 'Lucky.', 'Enjoy it while it lasts.'],
  idle: ['So... anyone watch the game?', 'Dealer, can we get some music in here?', 'These chips are sticky.'],
  // blackjack
  hit: ['Hit me.', 'One more.', 'Card.', 'Give me one.'],
  stand: ['I\'ll stay.', 'Stand.', 'Good here.', 'I\'m good.'],
  double: ['Double it.', 'Let\'s double.', 'Double down!'],
  split: ['Split \'em.', 'Splitting.', 'Let\'s split those.'],
  bust: ['Bust. Of course.', 'Too many.', 'Ugh, bust.', 'And... bust.'],
  blackjack: ['Blackjack!', 'Twenty-one!', 'Ha! Blackjack.'],
  push: ['Push. Fine.', 'A tie. I\'ll take it.', 'Nobody wins that one.'],
  dealerBust: ['Dealer busts! Yes!', 'Bust! Pay the table!', 'There it is!'],
};

export const TRIGGERS = Object.keys(GENERIC_LINES);

export function formatLine(line, vars) {
  return line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

// A line is either a string or { text, file } where file is a recording in assets/voice/<id>/ (e.g. "fold_1.m4a").
// Returns { text, file } or null. When the character has recorded lines for a trigger, those are preferred.
export function pickLine(character, trigger, vars, rng) {
  const own = character?.lines?.[trigger];
  let pool = own && own.length ? own : GENERIC_LINES[trigger] || [];
  if (!pool.length) return null;
  const recorded = pool.filter((l) => typeof l === 'object' && l.file);
  if (recorded.length) pool = recorded;
  const pick = pool[Math.floor((rng ? rng.next() : Math.random()) * pool.length)];
  const raw = typeof pick === 'string' ? { text: pick, file: null } : pick;
  return { text: formatLine(raw.text || '', { name: character?.name || '', ...vars }), file: raw.file || null };
}
