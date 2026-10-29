// Plain-language definitions shown next to every metric. Source text: the
// explanations on the Sheets CURRENT_SEASON tab, shortened. Keep these in step
// with docs/METRICS.md when a metric's meaning changes.

export const DEF = {
  record: 'Your win-loss-tie record in regular-season matchups.',
  winPct: 'Percentage of regular-season matchups you won.',
  pointsFor: 'Total points scored by your starting lineups during the regular season.',
  pointsAgainst: 'Total points scored by your opponents during the regular season.',
  pointDiff:
    'Your total points scored minus points allowed. Positive means you outscored your opponents overall.',
  maxPf: 'The most points your roster could have scored with perfect lineup decisions.',
  benchPoints:
    'Points missed by starting lower-scoring players instead of your best available lineup.',
  efficiency: 'Percentage of your roster’s maximum possible points that you actually scored.',
  allPlay:
    'Imagine playing every other team each week, not just your opponent. This is how much of the league your scores would beat.',
  luck: 'How many wins your actual schedule added or cost compared to an average schedule.',
  consistency: 'How much your weekly scores vary. Lower means more consistent scoring.',
  crowns: 'Number of weeks you finished with the league’s highest score.',
  lastPlace: 'Number of weeks you finished with the league’s lowest score.',
  over150: 'Number of weeks you scored more than 150 points.',
  over200: 'Number of weeks you scored above 200 points.',
  pointsInLosses: 'Total points you scored in matchups you lost.',
  highestLoss: 'Your highest score in a matchup you lost.',
  adds: 'Number of players you added through waivers or free agency.',
  playoffPct:
    'We replay the real remaining schedule 5,000 times using completed weekly scores as examples. Qualify in 4,000 of them and you show 80%.',
  position: 'Where today’s standings put you: inside the top 6 that make the playoffs, or outside.',
  gamesLeft: 'Regular-season games still to play.',
  largestMargin: 'Biggest winner-minus-loser score among all finalized games so far.',
  narrowestWin: 'Smallest winning margin among all finalized games.',
  highScore: 'Highest actual score in the week.',
  lowScore: 'Lowest actual score in the week.',
  margin: 'Your score minus your opponent’s score that week.',
  weekAllPlay: 'Share of the league your score would have beaten that week alone.',
  benchGap: 'Best lineup minus your actual score that week.',
  guaranteeWins:
    'More wins that clinch a playoff spot no matter what else happens. N/A when no number of wins guarantees it yet.',
  lossesToEliminate: 'Losses that would knock you out no matter what else happens.',
  wins80: 'Fewest more wins that got you in at least 80% of the simulated seasons.',
  medianCutoff: 'Typical win total of the last team to make the playoffs in the simulations.',
  scenario:
    'Your playoff chance if you finish with exactly this many more wins, from the simulated seasons that ended that way. N/A when too few did.',
  recordBook: 'League records set this season, and who held each one before.',
} as const;
