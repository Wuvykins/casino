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
  // farkle
  fkRoll: ['Come on, dice.', 'Here we go.', 'Give me something.', 'Big money.'],
  fkFarkle: ['Farkle. Of course.', 'NO. No no no.', 'Ugh! Nothing!', 'And it\'s gone.'],
  fkHotDice: ['Hot dice!', 'All six! Again!', 'Roll \'em again!'],
  fkBank: ['I\'ll take those.', 'Banking that.', 'Good enough for me.'],
  fkBankBig: ['Now THAT\'S a turn.', 'Look at that pile!', 'Boom. Banked.'],
  fkPush: ['One more roll.', 'I\'m feeling it.', 'Let\'s ride.', 'Don\'t stop now.'],
  fkPlayerFarkle: ['Ooh, farkle!', 'Greedy, {player}.', 'Should have stopped.'],
  tauntFarkle: ['That\'s a farkle, {player}.', 'Greedy, greedy.', 'Should have banked, huh?'],
  tooMuchChecking: ['Too much checking.', 'Fine, I\'ll bet.', 'Somebody has to.'],
  taunt: ['That all you got, {player}?', 'Thanks for playing.', 'Ooh. Rough.', 'Want me to go easier on you?', 'I could do this all night.'],
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
  // cribbage
  cribGo: ['Go.', 'Go on.', 'Can\'t.', 'Nothing.'],
  cribPeg: ['Fifteen two.', 'That\'s a pair.', 'There\'s a run.', 'Pegging along.'],
  cribThirtyOne: ['Thirty-one for two.', 'And that\'s thirty-one.', 'Thirty-one!'],
  cribGoodHand: ['Now that\'s a hand.', 'Count \'em up.', 'Not bad at all.', 'I\'ll take those.'],
  cribBadHand: ['Nineteen.', 'Nothing. Lovely.', 'Well, that\'s a pile of nothing.', 'The cut killed me.'],
  cribGoodCrib: ['Look at that crib!', 'My crib delivers.', 'Thank you for those.'],
  cribBadCrib: ['You gave me nothing.', 'Empty crib. Figures.', 'Stingy.'],
  cribHeels: ['Two for his heels!', 'Jack! Two for me.'],
  cribGameWin: ['Game! Pay up.', 'That\'s the game, {player}.', 'And that\'s how it\'s done.'],
  cribGameLose: ['Good game, {player}.', 'You got me.', 'Rematch?'],
  cribSkunked: ['Skunked! Oh, {player}.', 'That\'s a skunk. Double.', 'Ouch. Skunk.'],
  cribGotSkunked: ['Skunked. Don\'t tell anyone.', 'I got skunked. Unbelievable.'],
};

export const TRIGGERS = Object.keys(GENERIC_LINES);

export function formatLine(line, vars) {
  return line.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

// A line is either a string or { text, file } where file is a recording in assets/voice/<id>/ (e.g. "fold_1.m4a").
// Returns { text, file } or null. When the character has recorded lines for a trigger, those are preferred.
// Game-specific triggers fall back to the general one when a character has no lines for them.
const FALLBACK = { tauntPoker: 'taunt', tauntBlackjack: 'taunt', tauntCribbage: 'taunt', tauntFarkle: 'taunt' };

export function pickLine(character, trigger, vars, rng) {
  const fb = FALLBACK[trigger];
  const own = character?.lines?.[trigger]?.length ? character.lines[trigger] : fb && character?.lines?.[fb]?.length ? character.lines[fb] : null;
  let pool = own || GENERIC_LINES[trigger] || (fb && GENERIC_LINES[fb]) || [];
  if (!pool.length) return null;
  const recorded = pool.filter((l) => typeof l === 'object' && l.file);
  if (recorded.length) pool = recorded;
  const pick = pool[Math.floor((rng ? rng.next() : Math.random()) * pool.length)];
  const raw = typeof pick === 'string' ? { text: pick, file: null } : pick;
  return { text: formatLine(raw.text || '', { name: character?.name || '', ...vars }), file: raw.file || null };
}
