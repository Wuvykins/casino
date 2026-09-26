// The cast. Replace these with your friends and family.
//
// Each character:
//   id        - short, lowercase, no spaces. Used for file names:  assets/img/portraits/<id>.png
//                                                                  assets/voice/<id>/02-fold.mp3, 08-winbig.mp3 ...
//   name      - shown at the table
//   tagline   - shown when choosing opponents (hidden for real people: real: true)
//   color     - placeholder portrait colour until you add a photo
//   persona   - five dials 0..1: skill, tight, aggro, bluff, tilt   (see js/core/ai.js)
//               extras: shove (bluff-shoves), pairLover, station (calls too much), checkRaiser (bets whenever it checks to him),
//               cribSkill (how good they are at cribbage when it differs from their poker skill; Mom is the family shark)
//               plus chatty: how often they talk (1 = normal, 2 = twice as mouthy, 0.5 = quiet)
//   lines     - banter per trigger. Each line is either plain text, or { text, file } where file is a
//               recording in assets/voice/<id>/ — the bubble shows the text while the clip plays, so they
//               always match. When a trigger has any recorded lines, only those are used for it.
//               e.g. fold: [{ text: "Not with that.", file: "02-fold.mp3" }, "Nope."]
//
// Triggers: greet, fold, check, call, raise, allin, winSmall, winBig, lose, badBeat, caughtBluff,
//           hurry, bustOut, rebuy, playerBust, playerWin, idle, taunt (or tauntPoker / tauntBlackjack / tauntCribbage),
//           blackjack: hit, stand, double, split, bust, blackjack, push, dealerBust
//           cribbage: cribGo, cribPeg, cribThirtyOne, cribGoodHand, cribBadHand, cribGoodCrib, cribBadCrib, cribHeels, cribGameWin, cribGameLose, cribSkunked, cribGotSkunked

export const BANKER = {
  id: 'ken', name: 'Ken', color: '#5b6b7a',
  lines: {
    bailout: ['Ken gave you {amount}, go have fun.'],
    bailoutAgain: ['Ken gave you {amount}, go have fun.'],
  },
};

export const CHARACTERS = [
  {
    id: 'nic', real: true, name: 'Nic', tagline: "Doesn't call without the goods", color: '#8a3b2a',
    persona: { skill: 0.9, tight: 0.8, aggro: 0.6, bluff: 0.15, tilt: 0.1 , cribSkill: 0.45},
    lines: {
      fold: ['Not with that.', 'Nope.', 'I\'ll pass.'],
      call: ['I\'ve got enough to see it.', 'Call.'],
      raise: ['Let\'s see where you\'re at.', 'Raise.'],
      winBig: ['Told you I had it.', 'That\'s the one.'],
      caughtBluff: ['Had to try it once.'],
      hurry: ['Take your time. Not that much time.'],
      beSmart: ['Be smart.'],   // heads-up with you, betting, and his hand is going to win (holdemTable.maybeBeSmart)
      brutal: ['That sucks.', 'Brutal.'],   // you bet big and lost at showdown (holdemTable.sympathy)
      hateToSee: ['You hate to see it.'],   // same moment, when Freddy's at the table: Freddy answers 'You really do.'
    },
  },
  {
    id: 'freddy', real: true, name: 'Freddy', tagline: 'Raises first, looks at his cards later', color: '#3a3a3a',
    persona: { skill: 0.45, tight: 0.2, aggro: 0.95, bluff: 0.85, tilt: 0.5, shove: 0.4, chatty: 1.8, checkRaiser: 1 , cribSkill: 0.2},
    lines: {
      raise: ['Raise.', 'Bump it.', 'You scared?', 'More.'],
      allin: ['All of it.', 'Let\'s go. All in.', 'I\'m not here to fold.'],
      caughtBluff: ['Yeah, I had nothing.', 'Had to keep you honest.'],
      winBig: ['That\'s how you do it.', 'Never had it. Don\'t care.'],
      fold: ['Fine.', 'Take it.'],
      playerBust: ['Go see Ken.'],
      taunt: ['That\'s it? That\'s the whole play?', 'Folding already, {player}?', 'Don\'t hurt yourself.', 'I\'ve seen better from Kurtis.'],
      tooMuchChecking: ['Too much checking.', 'Nobody wants it? I\'ll take it.', 'Y\'all are boring. Bet.', 'Somebody has to bet.'],
      playerWin: ['Enjoy it. It\'s a loan.', 'Lucky river, {player}.'],
      hurry: ['We\'re not getting younger, {player}.', 'Tick tock.'],
      reallyDo: ['You really do.'],   // answering Nic's 'You hate to see it.'
    },
  },
  {
    id: 'kurtis', real: true, name: 'Kurtis', tagline: 'Will call. Will not raise. Ever.', color: '#4a5a6a',
    persona: { skill: 0.15, tight: 0.15, aggro: 0.05, bluff: 0.02, tilt: 0.2 , cribSkill: 0.12},
    lines: {
      call: ['Sure, I\'ll call.', 'Yeah, okay.', 'Call, I guess.', 'Why not.'],
      check: ['Check.', 'I\'m good.'],
      winBig: ['Oh nice, I had that?', 'Cool.'],
      winSmall: ['Hey, look at that.'],
      lose: ['Dang.', 'I thought I had something.'],
      fold: ['Alright, fine.'],
    },
  },
  {
    id: 'nathaniel', real: true, name: 'Nathaniel', tagline: 'A pair is a pair. He\'s calling.', color: '#5a4636',
    persona: { skill: 0.4, tight: 0.75, aggro: 0.3, bluff: 0, tilt: 0.2, pairLover: 0.75 , cribSkill: 0.45},
    lines: {
      call: ['I\'ve got a pair.', 'I\'ll see it.', 'Call.', 'I mean... I have something.'],
      fold: ['Not this one.', 'Nah.', 'I\'ll wait for a real hand.'],
      check: ['Check.'],
      lose: ['Well, I had a pair.', 'Figured that might happen.'],
      winBig: ['See? The pair held.', 'Patience.'],
      raise: ['Okay, I actually have it this time.'],
    },
  },
  {
    id: 'mom', name: 'Mom', real: true, tagline: 'Happy to be here', color: '#a8506a',
    persona: { skill: 0.5, tight: 0.5, aggro: 0.55, bluff: 0.2, tilt: 0.15 , cribSkill: 0.85},
    lines: {
      greet: ['Hi honey!', 'Oh good, you\'re here!', 'Sit, sit!'],
      call: ['Sure, why not!', 'I\'ll play along.', 'Okay!'],
      check: ['Check!', 'Let\'s see one.'],
      raise: ['Ooh, let\'s make it interesting.', 'A little more!', 'I feel good about this one.'],
      allin: ['Oh what the heck. All in!', 'Here goes nothing!'],
      fold: ['Not for me, thanks.', 'You can have that one.', 'Nope! Have fun.'],
      winSmall: ['Oh, how nice!', 'Look at that!'],
      winBig: ['Well would you look at that!', 'Ha! I\'ll take it!', 'Oh my goodness!'],
      lose: ['Oh well!', 'That\'s alright.', 'Good hand, sweetie.', 'You got me!'],
      loseBig: ['Damnit.'],
      badBeat: ['Damnit.'],
      caughtBluff: ['Oh, you caught me!', 'Worth a try!'],
      hurry: ['Take your time, honey.', 'No rush!'],
      playerWin: ['Good for you!', 'Nice one!'],
      playerBust: ['Oh no! Go see Ken, honey.'],
      bustOut: ['Oh well. Damnit.'],
      rebuy: ['One more time!'],
      idle: ['Anyone want a snack?', 'Isn\'t this fun?'],
    },
  },
  {
    id: 'courtney', real: true, name: 'Courtney', tagline: 'Calls. Sees what happens.', color: '#6a4a8a',
    persona: { skill: 0.35, tight: 0.3, aggro: 0.4, bluff: 0.15, tilt: 0.3, station: 1.6, chatty: 1.1 , cribSkill: 0.2},
    lines: {
      greet: [{ text: 'Hey y\'all!', file: '01-greet.mp3' }],
      fold: [{ text: '*sigh* I fold.', file: '02-fold.mp3' }],
      check: [{ text: 'Check.', file: '03-check.mp3' }],
      call: [{ text: 'I call.', file: '04-call.mp3' }],
      raise: [{ text: 'I raise.', file: '05-raise.mp3' }],
      allin: [{ text: 'All in, baby!', file: '06-allin.mp3' }],
      winSmall: [{ text: 'Nice.', file: '07-winsmall.mp3' }],
      winBig: [{ text: 'Hell yeah!', file: '08-winbig.mp3' }],
      lose: [{ text: 'Uhuuhh.', file: '09-lose.mp3' }],
      loseBig: [{ text: 'NO!', file: '10-losebig.mp3' }],
      badBeat: [{ text: 'Damn…', file: '11-badbeat.mp3' }],
      caughtBluff: [{ text: 'Ya got me.', file: '12-caughtbluff.mp3' }],
      hurry: [{ text: 'It is not that serious.', file: '13-hurry.mp3' }],
      rebuy: [{ text: 'Better call my bank.', file: '14-rebuy.mp3' }],
      hit: [{ text: 'Hit.', file: '16-hit.mp3' }],
      stand: [{ text: 'Stand.', file: '17-stand.mp3' }],
      double: [{ text: 'Double down.', file: '18-double.mp3' }],
      split: [{ text: 'Split.', file: '19-split.mp3' }],
      bust: [{ text: 'Ouch.', file: '20-bust.mp3' }],
      blackjack: [{ text: '21!', file: '21-blackjack.mp3' }],
      push: [{ text: '*sigh* Oh well.', file: '22-push.mp3' }],
      dealerBust: [{ text: 'Haha, sucka!', file: '23-dealerbust.mp3' }],
      tauntPoker: [{ text: 'Hmm, can\'t take the heat?', file: '34-poker-taunt.mp3' }],
      tauntBlackjack: [{ text: 'No!', file: '35-blackjack-taunt.mp3' }],
    },
  },
  {
    id: 'marty', name: 'Marty', tagline: 'Never met a hand he didn\'t like', color: '#e0653a',
    persona: { skill: 0.35, tight: 0.1, aggro: 0.9, bluff: 0.65, tilt: 0.7 },
    lines: {
      raise: ['Let\'s make this interesting.', 'Pump it up!', 'Raise. Obviously.'],
      allin: ['ALL IN, BABY!', 'Push it all! Let\'s go!'],
      fold: ['Ugh. Fine.', 'Yeah, yeah, take it.'],
      winBig: ['THAT\'S what I\'m talking about!', 'Read \'em and weep!'],
      lose: ['Rigged. This game is rigged.', 'Every. Single. Time.'],
    },
  },
  {
    id: 'dot', name: 'Dot', tagline: 'Plays about four hands an hour, wins three of them', color: '#7a5ea8',
    persona: { skill: 0.75, tight: 0.95, aggro: 0.5, bluff: 0.05, tilt: 0.1 },
    lines: {
      fold: ['No thank you.', 'Not this one.', 'I\'ll wait.'],
      raise: ['I\'ll raise.', 'A little more, I think.'],
      winBig: ['Patience, dear.', 'That\'s why I wait.'],
      check: ['Check.'],
    },
  },
  {
    id: 'rico', name: 'Rico', tagline: 'Has a story for every bet he makes', color: '#2e9e6b',
    persona: { skill: 0.6, tight: 0.45, aggro: 0.75, bluff: 0.85, tilt: 0.4 },
    lines: {
      raise: ['I got it this time. Promise.', 'You don\'t want any of this.', 'Raise. Don\'t look at me like that.'],
      caughtBluff: ['...okay, you got me.', 'Worth a shot!', 'I had outs! Sort of.'],
      winBig: ['Never bluffing. Never.', 'Told you I had it.'],
    },
  },
  {
    id: 'vee', name: 'Vee', tagline: 'Quiet. Dangerous.', color: '#3a7bd5',
    persona: { skill: 0.95, tight: 0.7, aggro: 0.75, bluff: 0.35, tilt: 0.05 },
    lines: {
      raise: ['Raise.', 'More.'],
      winBig: ['Thank you.', 'GG.'],
      fold: ['Fold.'],
    },
  },
];

export function characterById(id) { return CHARACTERS.find((c) => c.id === id); }
