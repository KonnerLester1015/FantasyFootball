// Plain-language definitions shown next to every metric. Source text: the
// explanations on the Sheets CURRENT_SEASON tab, shortened. Keep these in step
// with docs/METRICS.md when a metric's meaning changes.

export const DEF = {
  record: 'Win-loss-tie record in regular-season games, with the win percentage in brackets.',
  recordMedian:
    'Win-loss-tie record in regular-season games, with the win percentage in brackets. This league also plays the league median every week, so each week counts as two games: one against your opponent, one against the median score.',
  medianResult:
    'The weekly game against the league median: a win if you outscored at least half the league, a loss if not.',
  pointsFor: 'Total points scored by your starting lineups during the regular season.',
  pointsAgainst: 'Total points scored by your opponents during the regular season.',
  pointDiff:
    'Your total points scored minus points allowed. Positive means you outscored your opponents overall.',
  maxPf: 'The most points your roster could have scored with perfect lineup decisions (Sleeper’s Max PF).',
  benchPoints: 'Max PF minus the points you actually scored: what better lineup calls would have added.',
  efficiency:
    'Points you scored as a share of your Max PF. 100% means you started the best possible lineup every week. Hover a bar to see points scored out of the most possible.',
  allPlay:
    'Imagine playing every other team each week, not just your opponent. This is how much of the league your scores would beat.',
  luck:
    'Your real wins minus the wins your scores “deserved”. Each week, deserved wins = the share of the league you outscored (beat 9 of 11 teams = 0.82 wins). Add those up for the season and compare to your actual head-to-head wins. +1.5 means your opponents handed you 1.5 extra wins; −1.5 means you kept running into hot teams.',
  consistency:
    'How far a typical week lands from your own average score (the standard deviation). 10 means most weeks are within about 10 points of your average; 35 means boom or bust.',
  crowns: 'Number of weeks you finished with the league’s highest score.',
  lastPlace: 'Number of weeks you finished with the league’s lowest score.',
  over150: 'Number of weeks you scored more than 150 points.',
  over200: 'Number of weeks you scored above 200 points.',
  highestLoss: 'Your highest score in a matchup you lost.',
  playoffPct:
    'The share of 5,000 simulated finishes to the season in which the team makes the playoffs. Get in 4,000 times and you show 80%.',
  position: 'Where today’s standings put you: inside the playoff spots, tied at the cutoff, or outside.',
  largestMargin: 'Biggest winner-minus-loser score among all finalized games so far.',
  narrowestWin: 'Smallest winning margin among all finalized games.',
  highScore: 'Highest actual score in the week.',
  seasonHigh: 'Highest single-week score of the regular season so far.',
  seasonLow: 'Lowest single-week score of the regular season so far.',
  streak:
    'Head-to-head wins (W) or losses (L) in a row, counting back from the latest finished game.',
  hottestStreak: 'Longest winning streak still alive. Every team tied for it is listed.',
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
    'Sort the 5,000 simulated seasons by how many more games this team won. Each bar is the share of those seasons in which it still made the playoffs. N/A when fewer than 100 simulated seasons ended that way.',
  recordBook: 'League records set this season, and who held each one before.',
} as const;
